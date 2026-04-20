
import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

function DashboardPage() {
  const { logout, user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

  const loadDocuments = async () => {
    try {
      const res = await api.get("/api/v1/documents", {
        headers: authHeader(),
      });
      setDocuments(res.data.documents || []);
      setError("");
    } catch {
      setError("Failed to load documents.");
    }
  };

  const loadInvitations = async () => {
    try {
      const res = await api.get("/api/v1/invitations", {
        headers: authHeader(),
      });
      setInvitations(res.data.invitations || []);
    } catch {
      setInvitations([]);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadDocuments();
      loadInvitations();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const createDocument = async () => {
    if (!newTitle.trim()) return;

    try {
      setError("");
      setMessage("");
      const res = await api.post(
        "/api/v1/documents",
        { title: newTitle },
        { headers: authHeader() }
      );

      setNewTitle("");
      window.location.href = `/documents/${res.data.document_id}`;
    } catch {
      setError("Failed to create document.");
    }
  };

  const deleteDocument = async (documentId) => {
    try {
      setError("");
      setMessage("");
      await api.delete(`/api/v1/documents/${documentId}`, {
        headers: authHeader(),
      });
      setDocuments((currentDocuments) =>
        currentDocuments.filter((document) => document.document_id !== documentId)
      );
      setMessage("Document deleted.");
    } catch {
      setError("Failed to delete document.");
    }
  };

  const openDocument = async (documentId, invitationId = null) => {
    if (invitationId) {
      try {
        await api.patch(
          `/api/v1/invitations/${invitationId}/seen`,
          {},
          {
            headers: authHeader(),
          }
        );
        setInvitations((currentInvitations) =>
          currentInvitations.map((invitation) =>
            invitation.invitation_id === invitationId
              ? { ...invitation, seen_at: new Date().toISOString() }
              : invitation
          )
        );
      } catch {
        // Keep opening the document even if the invite indicator fails to clear.
      }
    }

    window.location.href = `/documents/${documentId}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f4f7",
        padding: "40px",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "40px", marginBottom: "10px" }}>Dashboard</h1>
          <p style={{ color: "#6d6272", marginBottom: "30px" }}>
            Manage your documents and start editing.
          </p>
          {user?.username ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                borderRadius: "999px",
                background: "#efe9ff",
                border: "1px solid #d9ccff",
                color: "#4328b3",
                fontWeight: "700",
              }}
            >
              Your username
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "#5b3fd1",
                  color: "#fff",
                  fontWeight: "800",
                  letterSpacing: "0.01em",
                }}
              >
                @{user.username}
              </span>
            </div>
          ) : null}
        </div>

        <button
          onClick={logout}
          style={{
            padding: "12px 18px",
            borderRadius: "12px",
            border: "none",
            background: "#111",
            color: "white",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {message && <p style={{ color: "green" }}>{message}</p>}

      <div
        style={{
          background: "white",
          padding: "24px",
          borderRadius: "20px",
          marginBottom: "30px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
        }}
      >
        <h3>Create Document</h3>

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Document title"
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #ddd",
            }}
          />

          <button
            onClick={createDocument}
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              border: "none",
              background: "#5b3fd1",
              color: "white",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Create
          </button>
        </div>
      </div>

      {invitations.length ? (
        <div
          style={{
            background: "white",
            padding: "24px",
            borderRadius: "20px",
            marginBottom: "30px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <h3 style={{ margin: "0 0 8px" }}>Recent invites</h3>
              <p style={{ margin: 0, color: "#6d6272" }}>
                Documents that were just shared with you show up here first.
              </p>
            </div>
            <span
              style={{
                alignSelf: "flex-start",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "#efe9ff",
                color: "#5b3fd1",
                fontWeight: "700",
              }}
            >
              {invitations.filter((invitation) => !invitation.seen_at).length} new
            </span>
          </div>

          <div style={{ display: "grid", gap: "14px", marginTop: "18px" }}>
            {invitations.map((invitation) => (
              <div
                key={invitation.invitation_id}
                style={{
                  border: "1px solid #ebe3ef",
                  borderRadius: "16px",
                  padding: "16px",
                  background: invitation.seen_at ? "#fbf9fc" : "#fff7f3",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <strong>{invitation.title}</strong>
                    <p style={{ color: "#6d6272", margin: "8px 0 0" }}>
                      Shared by {invitation.sender_name || invitation.sender_username || "a collaborator"}{" "}
                      {invitation.sender_username ? `(@${invitation.sender_username})` : ""} as{" "}
                      {invitation.role}.
                    </p>
                  </div>
                  {!invitation.seen_at ? (
                    <span
                      style={{
                        padding: "6px 10px",
                        borderRadius: "999px",
                        background: "#5b3fd1",
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: "0.85rem",
                      }}
                    >
                      New invite
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => openDocument(invitation.document_id, invitation.invitation_id)}
                  style={{
                    marginTop: "14px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#5b3fd1",
                    color: "white",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Open invited document
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: "16px" }}>
        {documents.map((doc) => (
          <div
            key={doc.document_id}
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "16px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
              cursor: "pointer",
            }}
            onClick={() => {
              openDocument(doc.document_id);
            }}
          >
            <h3 style={{ margin: 0 }}>{doc.title}</h3>
            <p style={{ color: "#6d6272", marginTop: "8px" }}>
              Role: {doc.role}
            </p>
            {doc.role !== "owner" ? (
              <div
                style={{
                  display: "inline-flex",
                  marginTop: "10px",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "#efe9ff",
                  color: "#5b3fd1",
                  fontWeight: "700",
                  fontSize: "0.85rem",
                }}
              >
                Shared with you
              </div>
            ) : null}
            {doc.role === "owner" ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteDocument(doc.document_id);
                }}
                style={{
                  marginTop: "12px",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ead2d2",
                  background: "#fff6f6",
                  color: "#9f1239",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DashboardPage;
