from fastapi import HTTPException

from app.auth import (
    create_access_token,
    decode_access_token,
    get_bearer_token,
    hash_password,
    verify_password,
)


def test_hash_password_obscures_plaintext_and_verifies_correctly():
    """Verify password hashing never stores plaintext and still validates the original secret."""
    raw_password = "collab-pass-123"

    password_hash = hash_password(raw_password)

    assert password_hash != raw_password
    assert verify_password(raw_password, password_hash) is True


def test_decode_access_token_returns_the_original_user_id():
    """Confirm access-token helpers round-trip the subject so authenticated routes can recover the user."""
    token = create_access_token("user-123")

    assert decode_access_token(token) == "user-123"


def test_get_bearer_token_rejects_missing_authorization_headers():
    """Ensure auth parsing fails fast when the Authorization header is completely absent."""
    try:
        get_bearer_token(None)
    except HTTPException as exc:
        assert exc.status_code == 401
        assert exc.detail == "Missing Authorization header"
    else:
        raise AssertionError("Expected an HTTPException for a missing Authorization header")


def test_get_bearer_token_rejects_non_bearer_headers():
    """Ensure malformed auth headers are rejected before protected handlers are executed."""
    try:
        get_bearer_token("Token abc123")
    except HTTPException as exc:
        assert exc.status_code == 401
        assert exc.detail == "Invalid Authorization header"
    else:
        raise AssertionError("Expected an HTTPException for an invalid Authorization header")
