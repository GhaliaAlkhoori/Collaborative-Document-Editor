def test_register_and_login_return_a_bearer_access_token(client):
    """Verify the auth API creates a user and returns a bearer token that the frontend can persist."""
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Alice",
            "email": "alice@example.com",
            "password": "secret-pass-123",
        },
    )

    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "alice@example.com",
            "password": "secret-pass-123",
        },
    )

    assert register_response.status_code == 200
    assert login_response.status_code == 200
    assert login_response.json()["token_type"] == "bearer"
    assert login_response.json()["access_token"]
    assert login_response.json()["refresh_token"]


def test_refresh_rotates_tokens_and_rejects_reuse(client):
    """Verify the refresh endpoint rotates refresh tokens so expired access tokens can be replaced silently."""
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Alice",
            "email": "alice@example.com",
            "password": "secret-pass-123",
        },
    )

    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "alice@example.com",
            "password": "secret-pass-123",
        },
    )
    original_refresh_token = login_response.json()["refresh_token"]

    refresh_response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": original_refresh_token,
        },
    )
    reuse_response = client.post(
        "/api/v1/auth/refresh",
        json={
            "refresh_token": original_refresh_token,
        },
    )

    assert refresh_response.status_code == 200
    assert refresh_response.json()["access_token"]
    assert refresh_response.json()["refresh_token"] != original_refresh_token
    assert reuse_response.status_code == 401
    assert reuse_response.json()["detail"] == "Invalid or expired refresh token"


def test_invalid_login_attempts_are_rejected(client):
    """Verify incorrect passwords never produce tokens by exercising the real login endpoint."""
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Alice",
            "email": "alice@example.com",
            "password": "secret-pass-123",
        },
    )

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "alice@example.com",
            "password": "wrong-pass-123",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_protected_document_endpoints_require_authentication(client):
    """Verify protected document routes refuse anonymous requests before any document logic runs."""
    response = client.get("/api/v1/documents")

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Authorization header"
