from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.auth import get_user_from_token
from app.storage import (
    DOCUMENTS_BY_ID,
    DOCUMENT_OPERATION_HISTORY,
    DOCUMENT_PERMISSIONS,
    USERS_BY_ID,
    now_iso,
)
from app.text_ops import (
    apply_operation,
    normalize_operation,
    operation_has_changes,
    transform_index,
    transform_operation,
)


router = APIRouter(tags=["Realtime Collaboration"])

ACTIVE_DOCUMENT_SESSIONS: Dict[str, Dict[str, dict]] = {}
TYPING_WINDOW_SECONDS = 4
ACTIVE_WINDOW_SECONDS = 30


def get_document_role(document_id: str, user_id: str) -> str | None:
    return DOCUMENT_PERMISSIONS.get(document_id, {}).get(user_id)


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def derive_activity_status(session: dict) -> tuple[bool, str]:
    current_time = datetime.now(timezone.utc)
    typing_until = parse_timestamp(session.get("typing_until"))
    if typing_until and typing_until > current_time:
        return True, "typing"

    last_activity_at = parse_timestamp(session.get("last_activity_at"))
    if last_activity_at and current_time - last_activity_at <= timedelta(seconds=ACTIVE_WINDOW_SECONDS):
        return False, "active"

    return False, "idle"


def mark_session_activity(session: dict, *, typing: bool = False) -> None:
    current_time = datetime.now(timezone.utc)
    session["last_activity_at"] = current_time.isoformat()
    if typing:
        session["typing_until"] = (current_time + timedelta(seconds=TYPING_WINDOW_SECONDS)).isoformat()


def build_participants_payload(document_id: str) -> list[dict]:
    participants = []

    for session in ACTIVE_DOCUMENT_SESSIONS.get(document_id, {}).values():
        user = USERS_BY_ID.get(session["user_id"], {})
        is_typing, activity_status = derive_activity_status(session)
        participants.append(
            {
                "client_id": session["client_id"],
                "user_id": session["user_id"],
                "name": user.get("name", "Collaborator"),
                "username": user.get("username", ""),
                "email": user.get("email", ""),
                "role": session["role"],
                "selection_start": session["selection_start"],
                "selection_end": session["selection_end"],
                "selection_mode": session.get("selection_mode", "source"),
                "selection_text": session.get("selection_text", ""),
                "last_activity_at": session.get("last_activity_at"),
                "is_typing": is_typing,
                "activity_status": activity_status,
            }
        )

    participants.sort(key=lambda item: (item["name"].lower(), item["client_id"]))
    return participants


async def send_json_safe(websocket: WebSocket, payload: dict) -> bool:
    try:
        await websocket.send_json(payload)
        return True
    except Exception:
        return False


async def broadcast_snapshot(document_id: str, message_type: str) -> None:
    participants = build_participants_payload(document_id)
    sessions = ACTIVE_DOCUMENT_SESSIONS.get(document_id, {})
    disconnected_client_ids = []

    for client_id, session in sessions.items():
        delivered = await send_json_safe(
            session["websocket"],
            {
                "type": message_type,
                "participants": participants,
            },
        )
        if not delivered:
            disconnected_client_ids.append(client_id)

    for client_id in disconnected_client_ids:
        sessions.pop(client_id, None)


def clamp_selection(content: str, start: int, end: int) -> tuple[int, int]:
    length = len(content)
    start = max(0, min(length, int(start)))
    end = max(0, min(length, int(end)))
    if start <= end:
        return start, end
    return end, start


def clamp_rich_selection(start: int, end: int) -> tuple[int, int]:
    safe_start = max(1, int(start))
    safe_end = max(1, int(end))
    if safe_start <= safe_end:
        return safe_start, safe_end
    return safe_end, safe_start


@router.websocket("/api/v1/ws/documents/{document_id}")
async def collaborate(document_id: str, websocket: WebSocket):
    token = websocket.query_params.get("token", "")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing auth token")
        return

    try:
        user = get_user_from_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid auth token")
        return

    document = DOCUMENTS_BY_ID.get(document_id)
    if not document:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Document not found")
        return

    role = get_document_role(document_id, user["user_id"])
    if not role:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Access denied")
        return

    await websocket.accept()

    client_id = f"{user['user_id']}-{now_iso()}"
    session = {
        "client_id": client_id,
        "user_id": user["user_id"],
        "role": role,
        "websocket": websocket,
        "selection_start": 0,
        "selection_end": 0,
        "selection_mode": "source",
        "selection_text": "",
        "last_activity_at": now_iso(),
        "typing_until": None,
    }

    ACTIVE_DOCUMENT_SESSIONS.setdefault(document_id, {})[client_id] = session
    DOCUMENT_OPERATION_HISTORY.setdefault(document_id, [])

    await send_json_safe(
        websocket,
        {
            "type": "init",
            "client_id": client_id,
            "document": {
                "document_id": document["document_id"],
                "title": document["title"],
                "content": document["content"],
                "version": document["version"],
                "updated_at": document["updated_at"],
                "role": role,
            },
            "operation_history": DOCUMENT_OPERATION_HISTORY.get(document_id, []),
            "participants": build_participants_payload(document_id),
        },
    )
    await broadcast_snapshot(document_id, "presence_snapshot")

    try:
        while True:
            message = await websocket.receive_json()
            message_type = str(message.get("type", "")).strip()

            if message_type == "ping":
                mark_session_activity(session)
                await send_json_safe(websocket, {"type": "pong"})
                continue

            if message_type == "cursor":
                selection_mode = str(message.get("selection_mode", "source") or "source")
                if selection_mode == "rich":
                    selection_start, selection_end = clamp_rich_selection(
                        message.get("selection_start", 1),
                        message.get("selection_end", 1),
                    )
                else:
                    selection_start, selection_end = clamp_selection(
                        document["content"],
                        message.get("selection_start", 0),
                        message.get("selection_end", 0),
                    )
                session["selection_start"] = selection_start
                session["selection_end"] = selection_end
                session["selection_mode"] = selection_mode
                session["selection_text"] = str(message.get("selection_text", "") or "")
                mark_session_activity(session)
                await broadcast_snapshot(document_id, "cursor_snapshot")
                continue

            if message_type != "operation":
                await send_json_safe(websocket, {"type": "error", "detail": "Unknown realtime message"})
                continue

            if role not in {"owner", "editor"}:
                await send_json_safe(websocket, {"type": "error", "detail": "You do not have edit access"})
                continue

            operation = normalize_operation(message.get("operation"))
            if not operation_has_changes(operation):
                continue

            mark_session_activity(session, typing=True)

            try:
                base_version = int(message.get("base_version", document["version"]))
            except (TypeError, ValueError):
                base_version = document["version"]

            transformed_operation = operation
            for historical_entry in DOCUMENT_OPERATION_HISTORY[document_id]:
                if historical_entry["version"] <= base_version:
                    continue
                side = "left" if client_id < historical_entry["client_id"] else "right"
                transformed_operation = transform_operation(
                    transformed_operation,
                    historical_entry["operation"],
                    side,
                )

            document["content"] = apply_operation(document["content"], transformed_operation)
            document["version"] += 1
            document["updated_at"] = now_iso()

            DOCUMENT_OPERATION_HISTORY[document_id].append(
                {
                    "version": document["version"],
                    "client_id": client_id,
                    "client_op_id": str(message.get("client_op_id", "")),
                    "operation": transformed_operation,
                }
            )

            for active_session in ACTIVE_DOCUMENT_SESSIONS.get(document_id, {}).values():
                start_stick = "right" if active_session["client_id"] == client_id else "left"
                active_session["selection_start"] = transform_index(
                    active_session["selection_start"],
                    transformed_operation,
                    start_stick,
                )
                active_session["selection_end"] = transform_index(
                    active_session["selection_end"],
                    transformed_operation,
                    "right",
                )

            await broadcast_snapshot(document_id, "cursor_snapshot")

            participants = build_participants_payload(document_id)
            disconnected_client_ids = []
            payload = {
                "type": "operation_applied",
                "client_id": client_id,
                "client_op_id": str(message.get("client_op_id", "")),
                "version": document["version"],
                "updated_at": document["updated_at"],
                "operation": transformed_operation,
                "participants": participants,
            }

            for active_client_id, active_session in ACTIVE_DOCUMENT_SESSIONS.get(document_id, {}).items():
                delivered = await send_json_safe(active_session["websocket"], payload)
                if not delivered:
                    disconnected_client_ids.append(active_client_id)

            for disconnected_client_id in disconnected_client_ids:
                ACTIVE_DOCUMENT_SESSIONS.get(document_id, {}).pop(disconnected_client_id, None)

    except WebSocketDisconnect:
        pass
    finally:
        ACTIVE_DOCUMENT_SESSIONS.get(document_id, {}).pop(client_id, None)
        if not ACTIVE_DOCUMENT_SESSIONS.get(document_id):
            ACTIVE_DOCUMENT_SESSIONS.pop(document_id, None)
        await broadcast_snapshot(document_id, "presence_snapshot")
