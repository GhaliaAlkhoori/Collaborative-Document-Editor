
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return uuid.uuid4().hex


USERS_BY_ID: Dict[str, Dict[str, Any]] = {}
USERS_BY_EMAIL: Dict[str, Dict[str, Any]] = {}

DOCUMENTS_BY_ID: Dict[str, Dict[str, Any]] = {}
DOCUMENT_PERMISSIONS: Dict[str, Dict[str, str]] = {}
DOCUMENT_VERSIONS: Dict[str, List[Dict[str, Any]]] = {}
DOCUMENT_OPERATION_HISTORY: Dict[str, List[Dict[str, Any]]] = {}
AI_LOGS: Dict[str, List[Dict[str, Any]]] = {}
SHARE_LINKS_BY_TOKEN: Dict[str, Dict[str, Any]] = {}

ROLE_PRIORITY = {
    "viewer": 0,
    "editor": 1,
    "owner": 2,
}


def create_user(name: str, email: str, password_hash: str) -> Dict[str, Any]:
    user = {
        "user_id": new_id(),
        "name": name,
        "email": email,
        "password_hash": password_hash,
        "created_at": now_iso(),
    }
    USERS_BY_ID[user["user_id"]] = user
    USERS_BY_EMAIL[email.lower()] = user
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
