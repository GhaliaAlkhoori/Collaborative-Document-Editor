import { useEffect, useState } from "react";
import api from "../api/client";

function ShareLinkPage() {
  const token = window.location.pathname.split("/").pop();
  const authToken = localStorage.getItem("access_token") || "";
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Checking link...");

  useEffect(() => {
    let active = true;

    const loadPreview = async () => {
      try {
        const response = await api.get(`/api/v1/share-links/${token}`);
        if (!active) {
          return;
        }

        setPreview(response.data);
        setError("");

        if (!authToken) {
          localStorage.setItem("pending_share_token", token);
          setStatus("Sign in to redeem this share link.");
          return;
        }

        setStatus("Redeeming share link...");
        const redeemResponse = await api.post(
          `/api/v1/share-links/${token}/redeem`,
          {},
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        );

        if (!active) {
          return;
        }

        localStorage.removeItem("pending_share_token");
        setStatus("Access granted. Opening document...");
        window.location.replace(`/documents/${redeemResponse.data.document_id}`);
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err?.response?.data?.detail || "This share link could not be opened.");
        setStatus("Share link unavailable");
      }
    };

    loadPreview();

    return () => {
      active = false;
    };
  }, [authToken, token]);

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-badge">Share link</div>
        <h1>{preview?.title || "Join shared document"}</h1>
        <p className="auth-subtitle">
          {preview
            ? `This link grants ${preview.role} access${preview.is_active ? "" : ", but it is no longer active"}.`
            : "We are checking the link details for you."}
        </p>

        {error ? <div className="message error">{error}</div> : null}
        {!error ? <div className="message success">{status}</div> : null}

        {!authToken ? (
          <div className="inline-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                localStorage.setItem("pending_share_token", token);
                window.location.href = "/login";
              }}
            >
              Sign in to continue
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                localStorage.setItem("pending_share_token", token);
                window.location.href = "/register";
              }}
            >
              Create account
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ShareLinkPage;
