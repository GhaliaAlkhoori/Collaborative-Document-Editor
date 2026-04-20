import json

import pytest
from starlette.websockets import WebSocketDisconnect

from app.storage import DOCUMENTS_BY_ID


def _receive_until_type(websocket, expected_type: str) -> dict:
    """Read websocket messages until the requested message type arrives."""
    while True:
        payload = websocket.receive_json()
        if payload.get("type") == expected_type:
            return payload


def test_websocket_rejects_connections_without_a_token(client):
    """Verify websocket auth rejects anonymous clients by refusing connections that omit the token query."""
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/v1/ws/documents/non-existent"):
            pass


def test_authenticated_editor_receives_init_and_can_exchange_messages(client, register_and_login):
    """Verify the realtime socket supports init, ping/pong, and document operations for an authenticated editor."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Realtime Draft"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    with client.websocket_connect(
        f"/api/v1/ws/documents/{document_id}?token={owner['token']}"
    ) as websocket:
        init_payload = _receive_until_type(websocket, "init")
        presence_payload = _receive_until_type(websocket, "presence_snapshot")

        websocket.send_json({"type": "ping"})
        pong_payload = _receive_until_type(websocket, "pong")

        websocket.send_json(
            {
                "type": "operation",
                "client_op_id": "op-1",
                "base_version": init_payload["document"]["version"],
                "operation": [{"type": "insert", "text": "Hello realtime"}],
            }
        )
        operation_payload = _receive_until_type(websocket, "operation_applied")

    assert init_payload["document"]["document_id"] == document_id
    assert init_payload["operation_history"] == []
    assert len(presence_payload["participants"]) == 1
    assert presence_payload["participants"][0]["activity_status"] == "active"
    assert pong_payload == {"type": "pong"}
    assert operation_payload["version"] == 2
    assert operation_payload["participants"][0]["is_typing"] is True
    assert operation_payload["participants"][0]["activity_status"] == "typing"
    assert DOCUMENTS_BY_ID[document_id]["content"] == "Hello realtime"


def test_reconnecting_clients_receive_operation_history_in_init(client, register_and_login):
    """Verify websocket reconnects include the document operation history so offline clients can rebase queued edits."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Reconnect Draft"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    with client.websocket_connect(
        f"/api/v1/ws/documents/{document_id}?token={owner['token']}"
    ) as websocket:
        init_payload = _receive_until_type(websocket, "init")
        _receive_until_type(websocket, "presence_snapshot")
        websocket.send_json(
            {
                "type": "operation",
                "client_op_id": "offline-op-seed",
                "base_version": init_payload["document"]["version"],
                "operation": [{"type": "insert", "text": "Seed edit"}],
            }
        )
        _receive_until_type(websocket, "operation_applied")

    with client.websocket_connect(
        f"/api/v1/ws/documents/{document_id}?token={owner['token']}"
    ) as reconnect_socket:
        reconnect_payload = _receive_until_type(reconnect_socket, "init")

    assert len(reconnect_payload["operation_history"]) == 1
    assert reconnect_payload["operation_history"][0]["client_op_id"] == "offline-op-seed"


def test_viewers_receive_an_error_when_they_try_to_edit_over_websocket(client, register_and_login):
    """Verify websocket permission checks block viewer edit attempts even when the socket is already connected."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    viewer = register_and_login(name="Viewer", email="viewer@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Read Only Socket"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    client.post(
        f"/api/v1/documents/{document_id}/share",
        json={
            "user_email": viewer["email"],
            "role": "viewer",
        },
        headers=owner["headers"],
    )

    with client.websocket_connect(
        f"/api/v1/ws/documents/{document_id}?token={viewer['token']}"
    ) as websocket:
        _receive_until_type(websocket, "init")
        _receive_until_type(websocket, "presence_snapshot")
        websocket.send_text(
            json.dumps(
                {
                    "type": "operation",
                    "client_op_id": "blocked-op",
                    "base_version": 1,
                    "operation": [{"type": "insert", "text": "Should fail"}],
                }
            )
        )
        error_payload = _receive_until_type(websocket, "error")

    assert error_payload["detail"] == "You do not have edit access"
