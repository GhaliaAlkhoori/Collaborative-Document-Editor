
from fastapi import APIRouter, HTTPException, Depends

from app.auth import get_current_user
from app.models import (
    CreateDocumentRequest,
    CreateDocumentResponse,
    GetDocumentResponse,
    UpdateDocumentRequest,
    UpdateDocumentResponse,
    ListDocumentsResponse,
    DocumentListItem,
    CollaboratorEntry,
    ShareDocumentRequest,
    ShareDocumentResponse,
    ListVersionsResponse,
    VersionEntry,
    RestoreVersionResponse,
)
from app.storage import (
    DOCUMENTS_BY_ID,
    DOCUMENT_PERMISSIONS,
    DOCUMENT_VERSIONS,
    USERS_BY_EMAIL,
    create_document,
    now_iso,
    save_document_version,
)

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])


def get_user_role(document_id: str, user_id: str):
    return DOCUMENT_PERMISSIONS.get(document_id, {}).get(user_id)


def require_document_access(document_id: str, user_id: str):
    doc = DOCUMENTS_BY_ID.get(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    role = get_user_role(document_id, user_id)
    if not role:
        raise HTTPException(status_code=403, detail="Access denied")

    return doc, role


@router.post("", response_model=CreateDocumentResponse)
def create_document_route(payload: CreateDocumentRequest, current_user=Depends(get_current_user)):
    doc = create_document(current_user["user_id"], payload.title)

    return CreateDocumentResponse(
        document_id=doc["document_id"],
        title=doc["title"],
        owner_id=doc["owner_id"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        version=doc["version"],
    )


@router.get("", response_model=ListDocumentsResponse)
def list_documents(current_user=Depends(get_current_user)):
    results = []

    for document_id, permissions in DOCUMENT_PERMISSIONS.items():
        role = permissions.get(current_user["user_id"])
        if role:
            doc = DOCUMENTS_BY_ID[document_id]
            results.append(
                DocumentListItem(
                    document_id=doc["document_id"],
                    title=doc["title"],
                    role=role,
                    updated_at=doc["updated_at"],
                )
            )

    return ListDocumentsResponse(documents=results)


@router.get("/{document_id}", response_model=GetDocumentResponse)
def get_document(document_id: str, current_user=Depends(get_current_user)):
    doc, _role = require_document_access(document_id, current_user["user_id"])

    collaborators = [
        CollaboratorEntry(user_id=user_id, role=role)
        for user_id, role in DOCUMENT_PERMISSIONS.get(document_id, {}).items()
    ]

    return GetDocumentResponse(
        document_id=doc["document_id"],
        title=doc["title"],
        content=doc["content"],
        owner_id=doc["owner_id"],
        version=doc["version"],
        updated_at=doc["updated_at"],
        collaborators=collaborators,
    )


@router.patch("/{document_id}", response_model=UpdateDocumentResponse)
def update_document(
    document_id: str,
    payload: UpdateDocumentRequest,
    current_user=Depends(get_current_user),
):
    doc, role = require_document_access(document_id, current_user["user_id"])

    if role not in ["owner", "editor"]:
        raise HTTPException(status_code=403, detail="You do not have edit access")

    if payload.title is not None:
        doc["title"] = payload.title

    if payload.content is not None:
        doc["content"] = payload.content

    doc["version"] += 1
    doc["updated_at"] = now_iso()
    save_document_version(document_id)

    return UpdateDocumentResponse(
        document_id=doc["document_id"],
        title=doc["title"],
        version=doc["version"],
        updated_at=doc["updated_at"],
    )


@router.post("/{document_id}/share", response_model=ShareDocumentResponse)
def share_document(
    document_id: str,
    payload: ShareDocumentRequest,
    current_user=Depends(get_current_user),
):
    doc, role = require_document_access(document_id, current_user["user_id"])

    if role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can share document")

    target_user = USERS_BY_EMAIL.get(payload.user_email.lower())
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    DOCUMENT_PERMISSIONS[document_id][target_user["user_id"]] = payload.role

    return ShareDocumentResponse(
        document_id=document_id,
        user_id=target_user["user_id"],
        role=payload.role,
        granted_at=now_iso(),
    )


@router.get("/{document_id}/versions", response_model=ListVersionsResponse)
def list_versions(document_id: str, current_user=Depends(get_current_user)):
    _doc, _role = require_document_access(document_id, current_user["user_id"])

    versions = [
        VersionEntry(
            version=v["version"],
            title=v["title"],
            content=v["content"],
            saved_at=v["saved_at"],
        )
        for v in DOCUMENT_VERSIONS.get(document_id, [])
    ]

    return ListVersionsResponse(versions=versions)


@router.post("/{document_id}/versions/{version}/restore", response_model=RestoreVersionResponse)
def restore_version(document_id: str, version: int, current_user=Depends(get_current_user)):
    doc, role = require_document_access(document_id, current_user["user_id"])

    if role not in ["owner", "editor"]:
        raise HTTPException(status_code=403, detail="You do not have edit access")

    versions = DOCUMENT_VERSIONS.get(document_id, [])
    selected = next((v for v in versions if v["version"] == version), None)

    if not selected:
        raise HTTPException(status_code=404, detail="Version not found")

    doc["title"] = selected["title"]
    doc["content"] = selected["content"]
    doc["version"] += 1
    doc["updated_at"] = now_iso()
    save_document_version(document_id)

    return RestoreVersionResponse(
        document_id=document_id,
        version=doc["version"],
        updated_at=doc["updated_at"],
    )