from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.models import ShareLinkPreviewResponse, RedeemShareLinkResponse
from app.storage import (
    DOCUMENTS_BY_ID,
    SHARE_LINKS_BY_TOKEN,
    grant_document_access,
    now_iso,
    share_link_is_active,
)


router = APIRouter(prefix="/api/v1/share-links", tags=["Share Links"])


def get_share_link_or_404(token: str) -> dict:
    share_link = SHARE_LINKS_BY_TOKEN.get(token)
    if not share_link:
        raise HTTPException(status_code=404, detail="Share link not found")
    return share_link


@router.get("/{token}", response_model=ShareLinkPreviewResponse)
def get_share_link_preview(token: str):
    share_link = get_share_link_or_404(token)
    document = DOCUMENTS_BY_ID.get(share_link["document_id"])
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return ShareLinkPreviewResponse(
        token=token,
        document_id=document["document_id"],
        title=document["title"],
        role=share_link["role"],
        expires_at=share_link.get("expires_at"),
        revoked_at=share_link.get("revoked_at"),
        is_active=share_link_is_active(share_link),
    )


@router.post("/{token}/redeem", response_model=RedeemShareLinkResponse)
def redeem_share_link(token: str, current_user=Depends(get_current_user)):
    share_link = get_share_link_or_404(token)
    document = DOCUMENTS_BY_ID.get(share_link["document_id"])

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    if not share_link_is_active(share_link):
        raise HTTPException(status_code=410, detail="Share link is no longer active")

    granted_role = grant_document_access(document["document_id"], current_user["user_id"], share_link["role"])

    redeemed_by = share_link.setdefault("redeemed_by", [])
    if current_user["user_id"] not in redeemed_by:
        redeemed_by.append(current_user["user_id"])

    return RedeemShareLinkResponse(
        document_id=document["document_id"],
        title=document["title"],
        role=granted_role,
        redeemed_at=now_iso(),
    )
