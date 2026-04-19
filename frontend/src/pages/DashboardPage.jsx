
import { useEffect, useState } from "react";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

function DashboardPage() {
  const { logout } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState("");

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

  const loadDocuments = async () => {
    try {
      const res = await api.get("/api/v1/documents", {
        headers: authHeader(),
      });
      setDocuments(res.data.documents || []);
    } catch {
      setError("Failed to load documents.");
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadDocuments();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const createDocument = async () => {
    if (!newTitle.trim()) return;

    try {
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
              window.location.href = `/documents/${doc.document_id}`;
            }}
          >
            <h3 style={{ margin: 0 }}>{doc.title}</h3>
            <p style={{ color: "#6d6272", marginTop: "8px" }}>
              Role: {doc.role}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DashboardPage;
