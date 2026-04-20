from __future__ import annotations

from collections.abc import Callable, Generator
from itertools import count

import pytest
from fastapi.testclient import TestClient

from app import routes_ai, storage
from app.main import app


@pytest.fixture(autouse=True)
def reset_in_memory_state() -> Generator[None, None, None]:
    """Reset every in-memory store so backend tests stay isolated from one another."""
    storage.USERS_BY_ID.clear()
    storage.USERS_BY_EMAIL.clear()
    storage.USERS_BY_USERNAME.clear()
    storage.DOCUMENTS_BY_ID.clear()
    storage.DOCUMENT_PERMISSIONS.clear()
    storage.DOCUMENT_VERSIONS.clear()
    storage.DOCUMENT_OPERATION_HISTORY.clear()
    storage.AI_LOGS.clear()
    storage.SHARE_LINKS_BY_TOKEN.clear()
    storage.REFRESH_TOKENS_BY_TOKEN.clear()
    storage.INVITATIONS_BY_ID.clear()
    app.dependency_overrides.clear()

    previous_mock_mode = routes_ai.AI_MOCK_MODE
    routes_ai.AI_MOCK_MODE = True

    yield

    routes_ai.AI_MOCK_MODE = previous_mock_mode
    app.dependency_overrides.clear()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient for HTTP and websocket integration tests."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def register_and_login(client: TestClient) -> Callable[..., dict]:
    """Create users through the real auth API and return their auth headers for follow-up requests."""
    counter = count(1)

    def _register_and_login(
        *,
        name: str = "Test User",
        email: str | None = None,
        password: str = "secret-pass-123",
    ) -> dict:
        email_value = email or f"user-{next(counter)}@example.com"
        register_response = client.post(
            "/api/v1/auth/register",
            json={
                "name": name,
                "email": email_value,
                "password": password,
            },
        )
        assert register_response.status_code == 200

        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": email_value,
                "password": password,
            },
        )
        assert login_response.status_code == 200

        payload = login_response.json()
        token = payload["access_token"]

        return {
            "email": email_value,
            "password": password,
            "token": token,
            "refresh_token": payload["refresh_token"],
            "username": payload["username"],
            "headers": {
                "Authorization": f"Bearer {token}",
            },
            "login_payload": payload,
            "register_payload": register_response.json(),
        }

    return _register_and_login
