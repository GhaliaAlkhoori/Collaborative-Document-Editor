
from fastapi import APIRouter, HTTPException, Depends

from app.auth import get_current_user
from app.models import (
    CreateDocumentRequest,
    CreateDocumentResponse,
    DeleteDocumentResponse,
    GetDocumentResponse,
    UpdateDocumentRequest,
    UpdateDocumentResponse,
    ListDocumentsResponse,
    DocumentListItem,
    CollaboratorEntry,
    ShareDocumentRequest,
    ShareDocumentResponse,
    ShareLinkCreateRequest,
    CreateShareLinkResponse,
    ListShareLinksResponse,
    ShareLinkEntry,
    ListVersionsResponse,
    VersionEntry,
    RestoreVersionResponse,
)
from app.storage import (
    DOCUMENTS_BY_ID,
    DOCUMENT_PERMISSIONS,
    DOCUMENT_VERSIONS,
    USERS_BY_ID,
    USERS_BY_EMAIL,
    USERS_BY_USERNAME,
    create_invitation,
    create_document,
    create_share_link,
    delete_document,
    grant_document_access,
    list_document_share_links,
    now_iso,
    revoke_share_link,
    save_document_version,
    share_link_is_active,
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


def require_owner_access(document_id: str, user_id: str):
    doc, role = require_document_access(document_id, user_id)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only owner can manage this document")
    return doc


def serialize_share_link(share_link: dict) -> ShareLinkEntry:
    return ShareLinkEntry(
        token=share_link["token"],
        role=share_link["role"],
        created_at=share_link["created_at"],
        expires_at=share_link.get("expires_at"),
        revoked_at=share_link.get("revoked_at"),
        redeemed_count=len(share_link.get("redeemed_by", [])),
        is_active=share_link_is_active(share_link),
    )


def resolve_share_target(payload: ShareDocumentRequest) -> dict:
    if payload.user_email:
        return USERS_BY_EMAIL.get(payload.user_email.lower())

    if payload.username:
        return USERS_BY_USERNAME.get(payload.username.lower())

    raise HTTPException(status_code=400, detail="Provide an email or username to share this document")


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


@router.delete("/{document_id}", response_model=DeleteDocumentResponse)
def delete_document_route(document_id: str, current_user=Depends(get_current_user)):
    _doc = require_owner_access(document_id, current_user["user_id"])
    deleted = delete_document(document_id)

    return DeleteDocumentResponse(
        document_id=document_id,
        deleted_at=now_iso(),
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

    results.sort(key=lambda item: item.updated_at, reverse=True)
    return ListDocumentsResponse(documents=results)


@router.get("/{document_id}", response_model=GetDocumentResponse)
def get_document(document_id: str, current_user=Depends(get_current_user)):
    doc, role = require_document_access(document_id, current_user["user_id"])

    collaborators = [
        CollaboratorEntry(
            user_id=user_id,
            role=permission_role,
            name=USERS_BY_ID.get(user_id, {}).get("name"),
            username=USERS_BY_ID.get(user_id, {}).get("username"),
            email=USERS_BY_ID.get(user_id, {}).get("email"),
        )
        for user_id, permission_role in DOCUMENT_PERMISSIONS.get(document_id, {}).items()
    ]

    return GetDocumentResponse(
        document_id=doc["document_id"],
        title=doc["title"],
        content=doc["content"],
        owner_id=doc["owner_id"],
        current_role=role,
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

    if payload.base_version is not None and payload.base_version != doc["version"]:
        raise HTTPException(
            status_code=409,
            detail="Document changed since your last synced version. Refresh and try saving again.",
        )

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
    _doc = require_owner_access(document_id, current_user["user_id"])

    target_user = resolve_share_target(payload)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    granted_role = grant_document_access(document_id, target_user["user_id"], payload.role)
    if target_user["user_id"] != current_user["user_id"]:
        create_invitation(
            document_id=document_id,
            sender_user_id=current_user["user_id"],
            recipient_user_id=target_user["user_id"],
            role=granted_role,
        )

    return ShareDocumentResponse(
        document_id=document_id,
        user_id=target_user["user_id"],
        username=target_user.get("username"),
        role=granted_role,
        granted_at=now_iso(),
    )


@router.post("/{document_id}/share-links", response_model=CreateShareLinkResponse)
def create_document_share_link(
    document_id: str,
    payload: ShareLinkCreateRequest,
    current_user=Depends(get_current_user),
):
    _doc = require_owner_access(document_id, current_user["user_id"])
    share_link = create_share_link(
        document_id=document_id,
        created_by=current_user["user_id"],
        role=payload.role,
        expires_in_hours=payload.expires_in_hours,
    )

    return CreateShareLinkResponse(
        document_id=document_id,
        **serialize_share_link(share_link).model_dump(),
    )


@router.get("/{document_id}/share-links", response_model=ListShareLinksResponse)
def list_document_links(document_id: str, current_user=Depends(get_current_user)):
    _doc = require_owner_access(document_id, current_user["user_id"])
    links = [
        serialize_share_link(link)
        for link in sorted(
            list_document_share_links(document_id),
            key=lambda item: item["created_at"],
            reverse=True,
        )
    ]
    return ListShareLinksResponse(links=links)


@router.delete("/{document_id}/share-links/{token}", response_model=ShareLinkEntry)
def revoke_document_link(document_id: str, token: str, current_user=Depends(get_current_user)):
    _doc = require_owner_access(document_id, current_user["user_id"])
    share_link = revoke_share_link(token)

    if not share_link or share_link["document_id"] != document_id:
        raise HTTPException(status_code=404, detail="Share link not found")

    return serialize_share_link(share_link)


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
