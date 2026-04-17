
import { useEffect, useState } from "react";
import api from "../api/client";

function EditorPage() {
  const documentId = window.location.pathname.split("/").pop();

  const [title, setTitle] = useState("Untitled Document");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");

  const [aiSuggestion, setAiSuggestion] = useState("");

  const [versions, setVersions] = useState([]);
  const [versionError, setVersionError] = useState("");

  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");

  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

  const loadDocument = async () => {
    try {
      const res = await api.get(`/api/v1/documents/${documentId}`, {
        headers: authHeader(),
      });

      setTitle(res.data.title);
      setContent(res.data.content || "");
    } catch (err) {
      setError("Failed to load document.");
    }
  };

  const loadVersions = async () => {
    try {
      const res = await api.get(`/api/v1/documents/${documentId}/versions`, {
        headers: authHeader(),
      });
      setVersions(res.data.versions || []);
    } catch (err) {
      setVersionError("Failed to load versions.");
    }
  };

  useEffect(() => {
    loadDocument();
    loadVersions();
  }, []);

  const handleSave = async () => {
    try {
      setStatus("Saving...");
      await api.patch(
        `/api/v1/documents/${documentId}`,
        { title, content },
        { headers: authHeader() }
      );
      await loadVersions();
      setStatus("Saved");
    } catch (err) {
      setStatus("Save failed");
    }
  };

  const handleRestoreVersion = async (versionNumber) => {
    try {
      setStatus("Restoring version...");
      await api.post(
        `/api/v1/documents/${documentId}/versions/${versionNumber}/restore`,
        {},
        { headers: authHeader() }
      );
      await loadDocument();
      await loadVersions();
      setStatus("Version restored");
    } catch (err) {
      setStatus("Restore failed");
    }
  };

  const handleAIRewrite = async () => {
    if (!content.trim()) return;

    setStatus("AI generating...");
    setAiSuggestion("");

    try {
      const response = await fetch("http://127.0.0.1:8001/api/v1/ai/rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
        body: JSON.stringify({ text: content }),
      });

      if (!response.ok || !response.body) {
        throw new Error("AI request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let streamedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamedText += chunk;
        setAiSuggestion(streamedText);
      }

      setStatus("AI suggestion ready");
    } catch (err) {
      setStatus("AI failed");
      console.error(err);
    }
  };

  const handleShare = async () => {
    if (!shareEmail.trim()) return;

    setShareMessage("");
    setShareError("");

    try {
      await api.post(
        `/api/v1/documents/${documentId}/share`,
        {
          user_email: shareEmail,
          role: shareRole,
        },
        {
          headers: authHeader(),
        }
      );

      setShareMessage(`Shared successfully as ${shareRole}.`);
      setShareEmail("");
    } catch (err) {
      setShareError(err?.response?.data?.detail || "Sharing failed.");
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
          marginBottom: "24px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "36px", margin: 0 }}>Editor</h1>
          <p style={{ color: "#6d6272", marginTop: "8px" }}>
            Edit your document and test AI writing suggestions.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => (window.location.href = "/dashboard")}
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            Back
          </button>

          <button
            onClick={handleSave}
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
            Save
          </button>
        </div>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <div
        style={{
          background: "white",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          marginBottom: "24px",
        }}
      >
        <label style={{ fontWeight: "600" }}>Document Title</label>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "12px",
            border: "1px solid #ddd",
            marginTop: "8px",
            marginBottom: "18px",
          }}
        />

        <label style={{ fontWeight: "600" }}>Content</label>

        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setStatus("Typing...");
            clearTimeout(window.saveTimer);

            window.saveTimer = setTimeout(() => {
              setStatus("Saving...");
              setTimeout(() => {
                setStatus("Saved");
              }, 600);
            }, 1000);
          }}
          placeholder="Start writing here..."
          style={{
            width: "100%",
            minHeight: "300px",
            padding: "16px",
            borderRadius: "14px",
            border: "1px solid #ddd",
            resize: "vertical",
            marginTop: "8px",
            marginBottom: "16px",
            fontSize: "15px",
            lineHeight: "1.6",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <span style={{ color: "#6d6272", fontWeight: "500" }}>
            Status: {status}
          </span>

          <button
            onClick={handleAIRewrite}
            style={{
              padding: "12px 18px",
              borderRadius: "12px",
              border: "none",
              background: "#ede7ff",
              color: "#5b3fd1",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            AI Rewrite
          </button>
        </div>
      </div>

      {aiSuggestion && (
        <div
          style={{
            background: "white",
            borderRadius: "20px",
            padding: "20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
            marginBottom: "24px",
          }}
        >
          <h3>AI Suggestion</h3>

          <div
            style={{
              border: "1px solid #ddd",
              padding: "12px",
              borderRadius: "12px",
              marginBottom: "12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {aiSuggestion}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => {
                setContent(aiSuggestion);
                setAiSuggestion("");
                setStatus("Suggestion accepted");
              }}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                background: "#5b3fd1",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Accept
            </button>

            <button
              onClick={() => {
                setAiSuggestion("");
                setStatus("Suggestion rejected");
              }}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
              }}
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          background: "white",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
          marginBottom: "24px",
        }}
      >
        <h3>Share Document</h3>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
            marginTop: "12px",
          }}
        >
          <input
            value={shareEmail}
            onChange={(e) => setShareEmail(e.target.value)}
            placeholder="Collaborator email"
            style={{
              flex: 1,
              minWidth: "220px",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #ddd",
            }}
          />

          <select
            value={shareRole}
            onChange={(e) => setShareRole(e.target.value)}
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #ddd",
              background: "white",
            }}
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
          </select>

          <button
            onClick={handleShare}
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
            Share
          </button>
        </div>

        {shareMessage && (
          <p style={{ color: "green", marginTop: "12px" }}>{shareMessage}</p>
        )}
        {shareError && (
          <p style={{ color: "red", marginTop: "12px" }}>{shareError}</p>
        )}
      </div>

      <div
        style={{
          background: "white",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
        }}
      >
        <h3>Version History</h3>

        {versionError && <p style={{ color: "red" }}>{versionError}</p>}

        {versions.length === 0 ? (
          <p style={{ color: "#6d6272" }}>No versions yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {versions.map((v) => (
              <div
                key={v.version}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: "1px solid #ddd",
                  borderRadius: "12px",
                  padding: "12px",
                }}
              >
                <div>
                  <strong>Version {v.version}</strong>
                  <div style={{ color: "#6d6272", fontSize: "14px" }}>
                    {v.saved_at}
                  </div>
                </div>

                <button
                  onClick={() => handleRestoreVersion(v.version)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "none",
                    background: "#5b3fd1",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default EditorPage;