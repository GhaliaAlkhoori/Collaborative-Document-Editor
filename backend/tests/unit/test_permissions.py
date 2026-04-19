from datetime import datetime, timedelta, timezone

from app import storage


def test_grant_document_access_keeps_the_highest_existing_role():
    """Verify permission upgrades are monotonic by preserving the highest role already granted."""
    owner = storage.create_user("Owner", "owner@example.com", "hash")
    collaborator = storage.create_user("Editor", "editor@example.com", "hash")
    document = storage.create_document(owner["user_id"], "Shared Draft")

    first_grant = storage.grant_document_access(document["document_id"], collaborator["user_id"], "editor")
    second_grant = storage.grant_document_access(document["document_id"], collaborator["user_id"], "viewer")

    assert first_grant == "editor"
    assert second_grant == "editor"
    assert storage.DOCUMENT_PERMISSIONS[document["document_id"]][collaborator["user_id"]] == "editor"


def test_share_link_is_inactive_after_revocation():
    """Confirm revoked share links can no longer be redeemed by checking their active-state helper."""
    link = {
        "token": "link-1",
        "document_id": "doc-1",
        "role": "viewer",
        "created_at": storage.now_iso(),
        "expires_at": None,
        "revoked_at": storage.now_iso(),
    }

    assert storage.share_link_is_active(link) is False


def test_share_link_is_inactive_after_its_expiry_time():
    """Confirm expired links stop granting access by comparing the stored expiry timestamp to the current time."""
    expired_link = {
        "token": "link-2",
        "document_id": "doc-1",
        "role": "viewer",
        "created_at": storage.now_iso(),
        "expires_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "revoked_at": None,
    }

    assert storage.share_link_is_active(expired_link) is False
