from app import routes_ai


def test_ai_generate_streams_mock_output_for_authenticated_users(client, register_and_login, monkeypatch):
    """Verify AI invocation streams chunked text by mocking the backend generator through mock mode."""
    user = register_and_login(name="Writer", email="writer@example.com")
    monkeypatch.setattr(
        routes_ai,
        "build_mock_text",
        lambda payload: "Chunk one. Chunk two.",
    )

    with client.stream(
        "POST",
        "/api/v1/ai/generate",
        json={
            "selected_text": "Original text",
            "action": "rewrite",
            "options": {"tone": "formal"},
        },
        headers=user["headers"],
    ) as response:
        streamed_text = "".join(response.iter_text())

    assert response.status_code == 200
    assert streamed_text == "Chunk one. Chunk two."


def test_ai_endpoints_require_authentication(client):
    """Verify anonymous callers cannot invoke AI generation through the protected API route."""
    response = client.post(
        "/api/v1/ai/generate",
        json={
            "selected_text": "Original text",
            "action": "rewrite",
            "options": {"tone": "formal"},
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Authorization header"
