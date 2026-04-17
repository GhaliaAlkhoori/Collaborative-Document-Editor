
from datetime import datetime, timezone
from typing import Dict, List, Any
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
AI_LOGS: Dict[str, List[Dict[str, Any]]] = {}


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