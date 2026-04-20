from app import routes_ai


def test_ai_generate_streams_mock_output_for_authenticated_users(client, register_and_login, monkeypatch):
    """Verify AI invocation streams chunked text by mocking the backend generator through mock mode."""
    user = register_and_login(name="Writer", email="writer@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "AI Draft"},
        headers=user["headers"],
    )
    document_id = create_response.json()["document_id"]
    monkeypatch.setattr(
        routes_ai,
        "build_mock_text",
        lambda payload: "Chunk one. Chunk two.",
    )

    with client.stream(
        "POST",
        "/api/v1/ai/generate",
        json={
            "document_id": document_id,
            "selected_text": "Original text",
            "action": "rewrite",
            "options": {"tone": "formal"},
        },
        headers=user["headers"],
    ) as response:
        streamed_text = "".join(response.iter_text())

    assert response.status_code == 200
    assert streamed_text == "Chunk one. Chunk two."


def test_ai_history_records_generated_output_and_review_status(client, register_and_login, monkeypatch):
    """Verify AI generation creates a history record and later review actions can mark it accepted with the reviewed result."""
    user = register_and_login(name="Writer", email="writer@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "AI History Draft"},
        headers=user["headers"],
    )
    document_id = create_response.json()["document_id"]
    monkeypatch.setattr(
        routes_ai,
        "build_mock_text",
        lambda payload: "Logged AI response text.",
    )

    with client.stream(
        "POST",
        "/api/v1/ai/generate",
        json={
            "document_id": document_id,
            "selected_text": "Original text",
            "action": "rewrite",
            "options": {"tone": "formal"},
        },
        headers=user["headers"],
    ) as response:
        streamed_text = "".join(response.iter_text())
        interaction_id = response.headers["x-ai-interaction-id"]

    history_response = client.get(
        f"/api/v1/ai/documents/{document_id}/history",
        headers=user["headers"],
    )

    assert response.status_code == 200
    assert streamed_text == "Logged AI response text."
    assert history_response.status_code == 200
    assert history_response.json()["interactions"][0]["interaction_id"] == interaction_id
    assert history_response.json()["interactions"][0]["response_text"] == "Logged AI response text."
    assert history_response.json()["interactions"][0]["status"] == "pending"

    update_response = client.patch(
        f"/api/v1/ai/history/{interaction_id}",
        json={
            "document_id": document_id,
            "status": "accepted",
            "reviewed_text": "Reviewed final text.",
        },
        headers=user["headers"],
    )

    assert update_response.status_code == 200
    assert update_response.json()["status"] == "accepted"
    assert update_response.json()["reviewed_text"] == "Reviewed final text."


def test_ai_endpoints_require_authentication(client):
    """Verify anonymous callers cannot invoke AI generation through the protected API route."""
    response = client.post(
        "/api/v1/ai/generate",
        json={
            "document_id": "doc-123",
            "selected_text": "Original text",
            "action": "rewrite",
            "options": {"tone": "formal"},
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Missing Authorization header"


def test_viewers_are_blocked_from_ai_generation(client, register_and_login):
    """Verify viewers cannot invoke AI for a document even if they craft the request manually."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    viewer = register_and_login(name="Viewer", email="viewer@example.com")

    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Protected AI Draft"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    client.post(
        f"/api/v1/documents/{document_id}/share",
        json={
          "user_email": viewer["email"],
          "role": "viewer",
        },
        headers=owner["headers"],
    )
    response = client.post(
        "/api/v1/ai/generate",
        json={
            "document_id": document_id,
            "selected_text": "Original text",
            "action": "rewrite",
            "options": {"tone": "formal"},
        },
        headers=viewer["headers"],
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "You do not have AI access for this document"
