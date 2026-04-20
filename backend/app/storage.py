
from datetime import datetime, timedelta, timezone
import re
from typing import Dict, List, Any, Optional
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


USERS_BY_ID: Dict[str, Dict[str, Any]] = {}
USERS_BY_EMAIL: Dict[str, Dict[str, Any]] = {}
USERS_BY_USERNAME: Dict[str, Dict[str, Any]] = {}

DOCUMENTS_BY_ID: Dict[str, Dict[str, Any]] = {}
DOCUMENT_PERMISSIONS: Dict[str, Dict[str, str]] = {}
DOCUMENT_VERSIONS: Dict[str, List[Dict[str, Any]]] = {}
DOCUMENT_OPERATION_HISTORY: Dict[str, List[Dict[str, Any]]] = {}
AI_LOGS: Dict[str, List[Dict[str, Any]]] = {}
SHARE_LINKS_BY_TOKEN: Dict[str, Dict[str, Any]] = {}
REFRESH_TOKENS_BY_TOKEN: Dict[str, Dict[str, Any]] = {}
INVITATIONS_BY_ID: Dict[str, Dict[str, Any]] = {}

ROLE_PRIORITY = {
    "viewer": 0,
    "editor": 1,
    "owner": 2,
}


def slugify_username_seed(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "user"


def generate_unique_username(name: str, email: str) -> str:
    email_local_part = email.split("@", 1)[0]
    base_username = slugify_username_seed(name) or slugify_username_seed(email_local_part)
    candidate = base_username
    suffix = 2

    while candidate in USERS_BY_USERNAME:
        candidate = f"{base_username}-{suffix}"
        suffix += 1

    return candidate


def create_user(name: str, email: str, password_hash: str) -> Dict[str, Any]:
    username = generate_unique_username(name, email)
    user = {
        "user_id": new_id(),
        "name": name,
        "email": email,
        "username": username,
        "password_hash": password_hash,
        "created_at": now_iso(),
    }
    USERS_BY_ID[user["user_id"]] = user
    USERS_BY_EMAIL[email.lower()] = user
    USERS_BY_USERNAME[username.lower()] = user
    return user


def create_document(owner_id: str, title: str) -> Dict[str, Any]:
    doc = {
        "document_id": new_id(),
        "title": title,
        "content": "",
        "owner_id": owner_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "version": 1,
    }
    DOCUMENTS_BY_ID[doc["document_id"]] = doc
    DOCUMENT_PERMISSIONS[doc["document_id"]] = {owner_id: "owner"}
    DOCUMENT_VERSIONS[doc["document_id"]] = [
        {
            "version": 1,
            "title": title,
            "content": "",
            "saved_at": now_iso(),
        }
    ]
    DOCUMENT_OPERATION_HISTORY[doc["document_id"]] = []
    return doc


def create_refresh_token(user_id: str, expires_in_days: int) -> Dict[str, Any]:
    refresh_token = {
        "token": new_id(),
        "user_id": user_id,
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=expires_in_days)).isoformat(),
        "revoked_at": None,
    }
    REFRESH_TOKENS_BY_TOKEN[refresh_token["token"]] = refresh_token
    return refresh_token


def refresh_token_is_active(refresh_token: Dict[str, Any]) -> bool:
    if refresh_token.get("revoked_at"):
        return False

    expires_at = refresh_token.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
        return False

    return True


def get_active_refresh_token(token: str) -> Optional[Dict[str, Any]]:
    refresh_token = REFRESH_TOKENS_BY_TOKEN.get(token)
    if not refresh_token or not refresh_token_is_active(refresh_token):
        return None
    return refresh_token


def revoke_refresh_token(token: str) -> Optional[Dict[str, Any]]:
    refresh_token = REFRESH_TOKENS_BY_TOKEN.get(token)
    if not refresh_token:
        return None

    if not refresh_token.get("revoked_at"):
        refresh_token["revoked_at"] = now_iso()

    return refresh_token


def create_ai_interaction(
    document_id: str,
    user_id: str,
    action: str,
    selected_text: str,
    prompt: str,
    model: str,
    *,
    tone: Optional[str] = None,
    target_language: Optional[str] = None,
) -> Dict[str, Any]:
    interaction = {
        "interaction_id": new_id(),
        "document_id": document_id,
        "user_id": user_id,
        "action": action,
        "status": "pending",
        "selected_text": selected_text,
        "prompt": prompt,
        "model": model,
        "response_text": "",
        "reviewed_text": None,
        "tone": tone,
        "target_language": target_language,
        "error_message": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    AI_LOGS.setdefault(document_id, []).append(interaction)
    return interaction


def list_ai_interactions(document_id: str) -> List[Dict[str, Any]]:
    return AI_LOGS.get(document_id, [])


def get_ai_interaction(document_id: str, interaction_id: str) -> Optional[Dict[str, Any]]:
    return next(
        (
            interaction
            for interaction in AI_LOGS.get(document_id, [])
            if interaction["interaction_id"] == interaction_id
        ),
        None,
    )


def finalize_ai_interaction(
    document_id: str,
    interaction_id: str,
    *,
    response_text: str,
    status: str = "pending",
    error_message: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    interaction = get_ai_interaction(document_id, interaction_id)
    if not interaction:
        return None

    interaction["response_text"] = response_text
    interaction["status"] = status
    interaction["error_message"] = error_message
    interaction["updated_at"] = now_iso()
    return interaction


def update_ai_interaction_status(
    document_id: str,
    interaction_id: str,
    *,
    status: str,
    reviewed_text: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    interaction = get_ai_interaction(document_id, interaction_id)
    if not interaction:
        return None

    interaction["status"] = status
    if reviewed_text is not None:
        interaction["reviewed_text"] = reviewed_text
    interaction["updated_at"] = now_iso()
    return interaction


def create_invitation(document_id: str, sender_user_id: str, recipient_user_id: str, role: str) -> Dict[str, Any]:
    invitation = {
        "invitation_id": new_id(),
        "document_id": document_id,
        "sender_user_id": sender_user_id,
        "recipient_user_id": recipient_user_id,
        "role": role,
        "created_at": now_iso(),
        "seen_at": None,
    }
    INVITATIONS_BY_ID[invitation["invitation_id"]] = invitation
    return invitation


def list_user_invitations(user_id: str) -> List[Dict[str, Any]]:
    return [
        invitation
        for invitation in INVITATIONS_BY_ID.values()
        if invitation["recipient_user_id"] == user_id
    ]


def get_invitation(invitation_id: str) -> Optional[Dict[str, Any]]:
    return INVITATIONS_BY_ID.get(invitation_id)


def mark_invitation_seen(invitation_id: str) -> Optional[Dict[str, Any]]:
    invitation = INVITATIONS_BY_ID.get(invitation_id)
    if not invitation:
        return None

    if not invitation.get("seen_at"):
        invitation["seen_at"] = now_iso()

    return invitation


def delete_document(document_id: str) -> Optional[Dict[str, Any]]:
    document = DOCUMENTS_BY_ID.pop(document_id, None)
    if not document:
        return None

    DOCUMENT_PERMISSIONS.pop(document_id, None)
    DOCUMENT_VERSIONS.pop(document_id, None)
    DOCUMENT_OPERATION_HISTORY.pop(document_id, None)
    AI_LOGS.pop(document_id, None)

    tokens_to_remove = [
        token
        for token, share_link in SHARE_LINKS_BY_TOKEN.items()
        if share_link["document_id"] == document_id
    ]
    for token in tokens_to_remove:
        SHARE_LINKS_BY_TOKEN.pop(token, None)

    invitations_to_remove = [
        invitation_id
        for invitation_id, invitation in INVITATIONS_BY_ID.items()
        if invitation["document_id"] == document_id
    ]
    for invitation_id in invitations_to_remove:
        INVITATIONS_BY_ID.pop(invitation_id, None)

    return document


def save_document_version(document_id: str) -> None:
    doc = DOCUMENTS_BY_ID[document_id]
    DOCUMENT_VERSIONS[document_id].append(
        {
            "version": doc["version"],
            "title": doc["title"],
            "content": doc["content"],
            "saved_at": now_iso(),
        }
    )


def grant_document_access(document_id: str, user_id: str, role: str) -> str:
    current_role = DOCUMENT_PERMISSIONS.setdefault(document_id, {}).get(user_id)

    if current_role and ROLE_PRIORITY.get(current_role, -1) >= ROLE_PRIORITY.get(role, -1):
        return current_role

    DOCUMENT_PERMISSIONS[document_id][user_id] = role
    return role


def create_share_link(
    document_id: str,
    created_by: str,
    role: str,
    expires_in_hours: Optional[int] = None,
) -> Dict[str, Any]:
    token = new_id()
    expires_at = None

    if expires_in_hours:
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)).isoformat()

    share_link = {
        "token": token,
        "document_id": document_id,
        "created_by": created_by,
        "role": role,
        "created_at": now_iso(),
        "expires_at": expires_at,
        "revoked_at": None,
        "redeemed_by": [],
    }

    SHARE_LINKS_BY_TOKEN[token] = share_link
    return share_link


def list_document_share_links(document_id: str) -> List[Dict[str, Any]]:
    return [
        link
        for link in SHARE_LINKS_BY_TOKEN.values()
        if link["document_id"] == document_id
    ]


def revoke_share_link(token: str) -> Optional[Dict[str, Any]]:
    share_link = SHARE_LINKS_BY_TOKEN.get(token)
    if not share_link:
        return None

    share_link["revoked_at"] = now_iso()
    return share_link


def share_link_is_active(share_link: Dict[str, Any]) -> bool:
    if share_link.get("revoked_at"):
        return False

    expires_at = share_link.get("expires_at")
    if expires_at and datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
        return False

    return True
