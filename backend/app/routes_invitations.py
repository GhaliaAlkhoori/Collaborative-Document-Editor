from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.models import InvitationEntry, ListInvitationsResponse
from app.storage import (
    DOCUMENTS_BY_ID,
    USERS_BY_ID,
    get_invitation,
    list_user_invitations,
    mark_invitation_seen,
)

router = APIRouter(prefix="/api/v1/invitations", tags=["Invitations"])


def serialize_invitation(invitation: dict) -> InvitationEntry | None:
    document = DOCUMENTS_BY_ID.get(invitation["document_id"])
    if not document:
        return None

    sender = USERS_BY_ID.get(invitation["sender_user_id"], {})
    return InvitationEntry(
        invitation_id=invitation["invitation_id"],
        document_id=invitation["document_id"],
        title=document["title"],
        role=invitation["role"],
        sender_user_id=invitation["sender_user_id"],
        sender_name=sender.get("name"),
        sender_username=sender.get("username"),
        created_at=invitation["created_at"],
        seen_at=invitation.get("seen_at"),
    )


@router.get("", response_model=ListInvitationsResponse)
def list_invitations(current_user=Depends(get_current_user)):
    invitations = []

    for invitation in list_user_invitations(current_user["user_id"]):
        serialized = serialize_invitation(invitation)
        if serialized:
            invitations.append(serialized)

    invitations.sort(key=lambda item: (item.seen_at is not None, item.created_at), reverse=False)
    return ListInvitationsResponse(invitations=invitations)


@router.patch("/{invitation_id}/seen", response_model=InvitationEntry)
def mark_seen(invitation_id: str, current_user=Depends(get_current_user)):
    invitation = get_invitation(invitation_id)
    if not invitation or invitation["recipient_user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=404, detail="Invitation not found")

    updated = mark_invitation_seen(invitation_id)
    serialized = serialize_invitation(updated)
    if not serialized:
        raise HTTPException(status_code=404, detail="Invitation not found")

    return serialized
