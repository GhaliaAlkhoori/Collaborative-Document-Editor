def test_owner_can_create_list_update_and_restore_documents(client, register_and_login):
    """Verify the document API supports create, list, update, version history, and restore for an owner."""
    owner = register_and_login(name="Owner", email="owner@example.com")

    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Project Plan"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    list_response = client.get("/api/v1/documents", headers=owner["headers"])
    update_response = client.patch(
        f"/api/v1/documents/{document_id}",
        json={
            "title": "Project Plan v2",
            "content": "Updated draft content",
            "base_version": 1,
        },
        headers=owner["headers"],
    )
    versions_response = client.get(
        f"/api/v1/documents/{document_id}/versions",
        headers=owner["headers"],
    )
    restore_response = client.post(
        f"/api/v1/documents/{document_id}/versions/1/restore",
        json={},
        headers=owner["headers"],
    )

    assert create_response.status_code == 200
    assert list_response.status_code == 200
    assert update_response.status_code == 200
    assert versions_response.status_code == 200
    assert restore_response.status_code == 200
    assert list_response.json()["documents"][0]["title"] == "Project Plan"
    assert update_response.json()["title"] == "Project Plan v2"
    assert len(versions_response.json()["versions"]) == 2
    assert restore_response.json()["version"] == 3


def test_owner_can_delete_documents_and_cleanup_related_state(client, register_and_login):
    """Verify owners can delete a document and that its versions, permissions, and share links are removed."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    collaborator = register_and_login(name="Editor", email="editor@example.com")

    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Delete Me"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    client.post(
        f"/api/v1/documents/{document_id}/share",
        json={
            "user_email": collaborator["email"],
            "role": "editor",
        },
        headers=owner["headers"],
    )
    client.post(
        f"/api/v1/documents/{document_id}/share-links",
        json={
            "role": "viewer",
            "expires_in_hours": 24,
        },
        headers=owner["headers"],
    )

    delete_response = client.delete(
        f"/api/v1/documents/{document_id}",
        headers=owner["headers"],
    )
    owner_list_response = client.get("/api/v1/documents", headers=owner["headers"])
    collaborator_list_response = client.get("/api/v1/documents", headers=collaborator["headers"])
    missing_document_response = client.get(
        f"/api/v1/documents/{document_id}",
        headers=owner["headers"],
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["document_id"] == document_id
    assert owner_list_response.json()["documents"] == []
    assert collaborator_list_response.json()["documents"] == []
    assert missing_document_response.status_code == 404


def test_non_owners_cannot_delete_documents(client, register_and_login):
    """Verify editors cannot delete a shared document even if they know the document identifier."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    editor = register_and_login(name="Editor", email="editor@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Protected Draft"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    client.post(
        f"/api/v1/documents/{document_id}/share",
        json={
            "user_email": editor["email"],
            "role": "editor",
        },
        headers=owner["headers"],
    )
    delete_response = client.delete(
        f"/api/v1/documents/{document_id}",
        headers=editor["headers"],
    )

    assert delete_response.status_code == 403
    assert delete_response.json()["detail"] == "Only owner can manage this document"


def test_shared_editor_can_update_a_document(client, register_and_login):
    """Verify server-side permissions allow editors to modify shared documents through the real API."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    editor = register_and_login(name="Editor", email="editor@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Team Draft"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    share_response = client.post(
        f"/api/v1/documents/{document_id}/share",
        json={
            "user_email": editor["email"],
            "role": "editor",
        },
        headers=owner["headers"],
    )
    update_response = client.patch(
        f"/api/v1/documents/{document_id}",
        json={
            "content": "Editor updated content",
            "base_version": 1,
        },
        headers=editor["headers"],
    )

    assert share_response.status_code == 200
    assert update_response.status_code == 200
    assert update_response.json()["version"] == 2


def test_owner_can_share_a_document_by_username(client, register_and_login):
    """Verify owners can grant access using a collaborator username instead of an email address."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    editor = register_and_login(name="Editor User", email="editor@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Team Draft"},
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
    document_response = client.get(
        f"/api/v1/documents/{document_id}",
        headers=owner["headers"],
    )

    assert share_response.status_code == 200
    assert share_response.json()["username"] == editor["username"]
    assert any(
        collaborator["username"] == editor["username"] and collaborator["role"] == "editor"
        for collaborator in document_response.json()["collaborators"]
    )


def test_viewers_are_blocked_from_document_updates(client, register_and_login):
    """Verify crafted viewer requests still fail on the backend even when the caller knows the document ID."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    viewer = register_and_login(name="Viewer", email="viewer@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Read Only Draft"},
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
    update_response = client.patch(
        f"/api/v1/documents/{document_id}",
        json={
            "content": "Unauthorized change",
            "base_version": 1,
        },
        headers=viewer["headers"],
    )

    assert update_response.status_code == 403
    assert update_response.json()["detail"] == "You do not have edit access"


def test_owner_can_create_and_revoke_share_links(client, register_and_login):
    """Verify owners can manage revocable share links end to end through the document API."""
    owner = register_and_login(name="Owner", email="owner@example.com")
    create_response = client.post(
        "/api/v1/documents",
        json={"title": "Shared Link Draft"},
        headers=owner["headers"],
    )
    document_id = create_response.json()["document_id"]

    link_response = client.post(
        f"/api/v1/documents/{document_id}/share-links",
        json={
            "role": "viewer",
            "expires_in_hours": 24,
        },
        headers=owner["headers"],
    )
    token = link_response.json()["token"]
    list_response = client.get(
        f"/api/v1/documents/{document_id}/share-links",
        headers=owner["headers"],
    )
    revoke_response = client.delete(
        f"/api/v1/documents/{document_id}/share-links/{token}",
        headers=owner["headers"],
    )

    assert link_response.status_code == 200
    assert list_response.status_code == 200
    assert revoke_response.status_code == 200
    assert list_response.json()["links"][0]["token"] == token
    assert revoke_response.json()["is_active"] is False
