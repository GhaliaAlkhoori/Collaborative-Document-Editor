def test_shared_documents_create_dashboard_invitations_that_can_be_marked_seen(client, register_and_login):
    """Verify sharing a document creates an invitation for the recipient and that they can mark it as seen."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    editor = register_and_login(name="Editor User", email="editor@example.com")

    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Invite Me"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    share_response = client.post(
        f"/api/v1/documents/{document_id}/share",
        json={
            "username": editor["username"],
            "role": "editor",
        },
        headers=owner["headers"],
    )
    invitations_response = client.get(
        "/api/v1/invitations",
        headers=editor["headers"],
    )

    assert share_response.status_code == 200
    assert invitations_response.status_code == 200
    assert len(invitations_response.json()["invitations"]) == 1

    invitation = invitations_response.json()["invitations"][0]
    assert invitation["document_id"] == document_id
    assert invitation["title"] == "Invite Me"
    assert invitation["sender_username"] == owner["username"]
    assert invitation["seen_at"] is None

    seen_response = client.patch(
        f"/api/v1/invitations/{invitation['invitation_id']}/seen",
        headers=editor["headers"],
    )

    assert seen_response.status_code == 200
    assert seen_response.json()["seen_at"] is not None
