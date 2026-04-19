import { useEffect, useRef, useState } from "react";
import api from "../api/client";
import AIEditPanel from "../components/AIEditPanel";
import CollaborativeTextarea from "../components/CollaborativeTextarea";
import {
  applyTextOperation,
  diffToOperation,
  normalizeOperation,
  operationHasChanges,
  transformIndex,
  transformPair,
} from "../lib/textOperation";

const PRESENCE_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#c2410c",
  "#be123c",
  "#047857",
  "#b45309",
  "#4338ca",
];

function formatDateTime(value) {
  if (!value) {
    return "Just now";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function buildClientId() {
  return `op-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function colorForKey(key) {
  const text = key || "anonymous";
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

function decorateParticipants(participants) {
  return (participants || []).map((participant) => ({
    ...participant,
    color: colorForKey(participant.user_id || participant.client_id),
  }));
}

function getShareUrl(token) {
  return `${window.location.origin}/share/${token}`;
}

function wait(delay) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delay);
  });
}

function EditorPage() {
  const documentId = window.location.pathname.split("/").pop();
  const authToken = localStorage.getItem("access_token") || "";

  const textareaRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const cursorTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const pendingOpsRef = useRef([]);
  const currentContentRef = useRef("");
  const localSelectionRef = useRef({ start: 0, end: 0 });
  const localClientIdRef = useRef("");
  const serverVersionRef = useRef(1);

  const [title, setTitle] = useState("Untitled Document");
  const [content, setContent] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [documentVersion, setDocumentVersion] = useState(1);
  const [updatedAt, setUpdatedAt] = useState("");
  const [currentRole, setCurrentRole] = useState("viewer");
  const [localClientId, setLocalClientId] = useState("");
  const [collaborators, setCollaborators] = useState([]);
  const [remoteParticipants, setRemoteParticipants] = useState([]);
  const [status, setStatus] = useState("Connecting...");
  const [connectionState, setConnectionState] = useState("connecting");
  const [error, setError] = useState("");
  const [versions, setVersions] = useState([]);
  const [versionError, setVersionError] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareLinks, setShareLinks] = useState([]);
  const [shareLinkRole, setShareLinkRole] = useState("viewer");
  const [shareLinkExpiry, setShareLinkExpiry] = useState("24");

  const authHeader = () => ({
    Authorization: `Bearer ${authToken}`,
  });

  const readOnly = currentRole === "viewer" || connectionState !== "connected";

  const loadVersions = async () => {
    try {
      const response = await api.get(`/api/v1/documents/${documentId}/versions`, {
        headers: authHeader(),
      });
      setVersions(response.data.versions || []);
      setVersionError("");
    } catch {
      setVersionError("Failed to load versions.");
    }
  };

  const loadShareLinks = async () => {
    if (currentRole !== "owner") {
      return;
    }

    try {
      const response = await api.get(`/api/v1/documents/${documentId}/share-links`, {
        headers: authHeader(),
      });
      setShareLinks(response.data.links || []);
    } catch {
      setShareLinks([]);
    }
  };

  const loadDocument = async () => {
    try {
      const response = await api.get(`/api/v1/documents/${documentId}`, {
        headers: authHeader(),
      });

      const document = response.data;
      setTitle(document.title);
      setContent(document.content || "");
      setDocumentVersion(document.version || 1);
      setUpdatedAt(document.updated_at || "");
      setCurrentRole(document.current_role || "viewer");
      setCollaborators(document.collaborators || []);
      currentContentRef.current = document.content || "";
      serverVersionRef.current = document.version || 1;
      setError("");
    } catch {
      setError("Failed to load document.");
    }
  };

  const flushCursorUpdate = () => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "cursor",
        selection_start: localSelectionRef.current.start,
        selection_end: localSelectionRef.current.end,
      })
    );
  };

  const queueCursorUpdate = () => {
    window.clearTimeout(cursorTimerRef.current);
    cursorTimerRef.current = window.setTimeout(() => {
      flushCursorUpdate();
    }, 50);
  };

  const sendNextPendingOperation = () => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const nextPending = pendingOpsRef.current[0];
    if (!nextPending || nextPending.sent) {
      return;
    }

    nextPending.sent = true;
    nextPending.baseVersion = serverVersionRef.current;

    socket.send(
      JSON.stringify({
        type: "operation",
        client_op_id: nextPending.clientOpId,
        base_version: nextPending.baseVersion,
        operation: nextPending.operation,
      })
    );
  };

  const connectRealtime = () => {
    if (!authToken) {
      return;
    }

    window.clearTimeout(reconnectTimerRef.current);
    shouldReconnectRef.current = true;

    const baseUrl = api.defaults.baseURL.replace(/^http/, "ws");
    const socket = new WebSocket(
      `${baseUrl}/api/v1/ws/documents/${documentId}?token=${encodeURIComponent(authToken)}`
    );

    wsRef.current = socket;
    setConnectionState("connecting");
    setStatus("Connecting to live collaboration...");

    socket.onopen = () => {
      setConnectionState("connected");
      setStatus(readOnly ? "Connected in read-only mode" : "Connected");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "init") {
        localClientIdRef.current = message.client_id;
        setLocalClientId(message.client_id);
        pendingOpsRef.current = [];
        const document = message.document || {};
        const nextContent = document.content || "";
        currentContentRef.current = nextContent;
        serverVersionRef.current = document.version || 1;
        setContent(nextContent);
        setTitle(document.title || "Untitled Document");
        setDocumentVersion(document.version || 1);
        setUpdatedAt(document.updated_at || "");
        setCurrentRole(document.role || "viewer");
        setRemoteParticipants(decorateParticipants(message.participants || []));
        setStatus(document.role === "viewer" ? "Connected in view mode" : "Connected");
        return;
      }

      if (message.type === "presence_snapshot" || message.type === "cursor_snapshot") {
        setRemoteParticipants(decorateParticipants(message.participants || []));
        return;
      }

      if (message.type === "operation_applied") {
        setRemoteParticipants(decorateParticipants(message.participants || []));
        setDocumentVersion(message.version || serverVersionRef.current);
        setUpdatedAt(message.updated_at || "");
        serverVersionRef.current = message.version || serverVersionRef.current;

        const firstPending = pendingOpsRef.current[0];
        if (
          message.client_id === localClientIdRef.current &&
          firstPending &&
          firstPending.clientOpId === message.client_op_id
        ) {
          pendingOpsRef.current.shift();
          setStatus(pendingOpsRef.current.length ? "Syncing edits..." : "All edits synced");
          sendNextPendingOperation();
          return;
        }

        let transformedRemote = normalizeOperation(message.operation || []);
        pendingOpsRef.current = pendingOpsRef.current.map((pendingOperation) => {
          const [nextRemote, nextLocal] = transformPair(
            transformedRemote,
            pendingOperation.operation,
            String(message.client_id || "") < String(localClientIdRef.current || "")
          );
          transformedRemote = nextRemote;
          return {
            ...pendingOperation,
            operation: nextLocal,
          };
        });

        const nextContent = applyTextOperation(currentContentRef.current, transformedRemote);
        currentContentRef.current = nextContent;
        setContent(nextContent);

        const nextSelection = {
          start: transformIndex(localSelectionRef.current.start, transformedRemote, "left"),
          end: transformIndex(localSelectionRef.current.end, transformedRemote, "right"),
        };
        localSelectionRef.current = nextSelection;
        setSelection(nextSelection);
        setStatus(
          message.client_id === localClientIdRef.current ? "All edits synced" : "Live update received"
        );
        queueCursorUpdate();
        return;
      }

      if (message.type === "error") {
        setError(message.detail || "Realtime collaboration reported an error.");
      }
    };

    socket.onclose = () => {
      wsRef.current = null;
      if (!shouldReconnectRef.current) {
        return;
      }
      setConnectionState("disconnected");
      setStatus("Live collaboration disconnected. Reconnecting...");

      reconnectTimerRef.current = window.setTimeout(() => {
        connectRealtime();
      }, 1500);
    };
  };

  useEffect(() => {
    shouldReconnectRef.current = true;
    const timeoutId = window.setTimeout(() => {
      loadDocument();
      loadVersions();
    }, 0);

    return () => {
      shouldReconnectRef.current = false;
      window.clearTimeout(timeoutId);
      window.clearTimeout(reconnectTimerRef.current);
      window.clearTimeout(cursorTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [documentId]);

  useEffect(() => {
    if (!error) {
      const timeoutId = window.setTimeout(() => {
        connectRealtime();
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
    return undefined;
  }, [documentId, authToken, error]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadShareLinks();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentRole]);

  const saveSnapshot = async (nextTitle, nextContent, successStatus = "Snapshot saved") => {
    if (currentRole === "viewer") {
      setStatus("Viewers cannot save snapshots");
      return false;
    }

    if (connectionState !== "connected") {
      setStatus("Reconnect before saving a snapshot");
      return false;
    }

    const startedAt = Date.now();
    while (pendingOpsRef.current.length && Date.now() - startedAt < 4000) {
      await wait(60);
    }

    if (pendingOpsRef.current.length) {
      setStatus("Live edits are still syncing. Try saving again in a moment.");
      return false;
    }

    try {
      setStatus("Saving snapshot...");
      const response = await api.patch(
        `/api/v1/documents/${documentId}`,
        {
          title: nextTitle,
          content: nextContent,
          base_version: serverVersionRef.current,
        },
        {
          headers: authHeader(),
        }
      );

      setDocumentVersion(response.data.version);
      setUpdatedAt(response.data.updated_at);
      serverVersionRef.current = response.data.version;
      await loadVersions();
      setStatus(successStatus);
      return true;
    } catch (err) {
      if (err?.response?.status === 409) {
        setStatus("Save blocked by a newer remote change");
      } else {
        setStatus("Snapshot save failed");
      }
      return false;
    }
  };

  const handleSelectionChange = (nextSelection) => {
    localSelectionRef.current = nextSelection;
    setSelection(nextSelection);
    queueCursorUpdate();
  };

  const handleContentChange = (nextContent, nextSelection) => {
    const previousContent = currentContentRef.current;
    currentContentRef.current = nextContent;
    setContent(nextContent);
    localSelectionRef.current = nextSelection;
    setSelection(nextSelection);

    const operation = diffToOperation(previousContent, nextContent);
    if (!operationHasChanges(operation)) {
      queueCursorUpdate();
      return;
    }

    pendingOpsRef.current.push({
      clientOpId: buildClientId(),
      operation,
      sent: false,
      baseVersion: serverVersionRef.current,
    });

    setStatus("Syncing edits...");
    sendNextPendingOperation();
    queueCursorUpdate();
  };

  const handleApplySuggestion = async ({ suggestion, sourceText }) => {
    let nextContent = suggestion;

    if (
      selection.start !== selection.end &&
      sourceText === content.slice(selection.start, selection.end)
    ) {
      nextContent = [
        content.slice(0, selection.start),
        suggestion,
        content.slice(selection.end),
      ].join("");
    } else if (sourceText === content) {
      nextContent = suggestion;
    } else if (sourceText && content.includes(sourceText)) {
      nextContent = content.replace(sourceText, suggestion);
    } else {
      nextContent = `${content}\n\n${suggestion}`.trim();
    }

    const nextSelection = {
      start: nextContent.length,
      end: nextContent.length,
    };

    handleContentChange(nextContent, nextSelection);
    const saved = await saveSnapshot(title, nextContent, "AI changes applied and saved");
    if (!saved) {
      setStatus("AI changes applied locally");
    }
  };

  const handleSave = async () => {
    await saveSnapshot(title, currentContentRef.current);
  };

  const handleRestoreVersion = async (versionNumber) => {
    try {
      setStatus("Restoring version...");
      await api.post(
        `/api/v1/documents/${documentId}/versions/${versionNumber}/restore`,
        {},
        {
          headers: authHeader(),
        }
      );

      pendingOpsRef.current = [];
      await loadDocument();
      await loadVersions();
      setStatus("Version restored");
    } catch {
      setStatus("Restore failed");
    }
  };

  const handleShare = async () => {
    if (!shareEmail.trim()) {
      return;
    }

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
      await loadDocument();
    } catch (err) {
      setShareError(err?.response?.data?.detail || "Sharing failed.");
    }
  };

  const handleCreateShareLink = async () => {
    setShareMessage("");
    setShareError("");

    try {
      await api.post(
        `/api/v1/documents/${documentId}/share-links`,
        {
          role: shareLinkRole,
          expires_in_hours: shareLinkExpiry ? Number(shareLinkExpiry) : null,
        },
        {
          headers: authHeader(),
        }
      );

      setShareMessage("Share link created.");
      await loadShareLinks();
    } catch (err) {
      setShareError(err?.response?.data?.detail || "Failed to create share link.");
    }
  };

  const handleRevokeShareLink = async (token) => {
    try {
      await api.delete(`/api/v1/documents/${documentId}/share-links/${token}`, {
        headers: authHeader(),
      });
      setShareMessage("Share link revoked.");
      await loadShareLinks();
    } catch (err) {
      setShareError(err?.response?.data?.detail || "Failed to revoke share link.");
    }
  };

  const copyShareLink = async (token) => {
    const url = getShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Share link copied.");
    } catch {
      setShareMessage(url);
    }
  };

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <div className="eyebrow">Live Collaborative Draft</div>
          <h1 className="workspace-title">Document Editor</h1>
          <p className="workspace-subtitle">
            Character-level conflict resolution, live cursors, share links, and
            granular AI suggestion review are all active here.
          </p>
        </div>

        <div className="page-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
          >
            Back
          </button>
          <button className="primary-button" type="button" onClick={handleSave}>
            Save snapshot
          </button>
        </div>
      </div>

      {error ? <div className="message error">{error}</div> : null}

      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-meta-card">
            <div className="panel-header">
              <div>
                <h3>Document settings</h3>
                <p className="muted-text">
                  Snapshot saves are conflict-checked so they do not overwrite newer live edits.
                </p>
              </div>
              <span className="badge role">{currentRole}</span>
            </div>

            <div className="meta-grid">
              <div className="meta-item">
                <span className="meta-label">Sync status</span>
                <span className="meta-value">{status}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Connection</span>
                <span className="meta-value">{connectionState}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Version</span>
                <span className="meta-value">v{documentVersion}</span>
              </div>
            </div>

            <div className="meta-grid single-row-grid">
              <div className="meta-item">
                <span className="meta-label">Last update</span>
                <span className="meta-value">{formatDateTime(updatedAt)}</span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Active collaborators</span>
                <span className="meta-value">
                  {remoteParticipants.filter((participant) => participant.client_id !== localClientId).length}
                </span>
              </div>
              <div className="meta-item">
                <span className="meta-label">Your role</span>
                <span className="meta-value">{currentRole}</span>
              </div>
            </div>

            <label className="field-label">Document title</label>
            <input
              className="input title-input"
              value={title}
              disabled={currentRole === "viewer"}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Draft</h3>
                <p className="muted-text">
                  Live edits use OT over websockets, and collaborator cursors stay visible in real time.
                </p>
              </div>
            </div>

            <CollaborativeTextarea
              value={content}
              selection={selection}
              localClientId={localClientId}
              remoteParticipants={remoteParticipants}
              readOnly={readOnly}
              textareaRef={textareaRef}
              onTextChange={handleContentChange}
              onSelectionChange={handleSelectionChange}
            />

            <div className="presence-list">
              {(remoteParticipants || []).map((participant) => (
                <div key={participant.client_id} className="presence-chip">
                  <span
                    className="presence-dot"
                    style={{ backgroundColor: participant.color }}
                  />
                  <span>
                    {participant.client_id === localClientId
                      ? "You"
                      : participant.name || participant.email || "Collaborator"}
                  </span>
                  <span className="presence-role">{participant.role}</span>
                </div>
              ))}
            </div>
          </div>

          <AIEditPanel
            authToken={authToken}
            documentText={content}
            selectedText={content.slice(selection.start, selection.end)}
            readOnly={currentRole === "viewer"}
            onApplySuggestion={handleApplySuggestion}
          />
        </div>

        <div className="editor-side">
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Collaborators</h3>
                <p className="muted-text">People with access to this document right now.</p>
              </div>
            </div>

            <div className="stack-list">
              {collaborators.length ? (
                collaborators.map((collaborator) => (
                  <div key={collaborator.user_id} className="stack-item">
                    <div>
                      <strong>{collaborator.name || collaborator.email || collaborator.user_id}</strong>
                      <p className="muted-text compact-text">{collaborator.email || collaborator.user_id}</p>
                    </div>
                    <span className="badge role">{collaborator.role}</span>
                  </div>
                ))
              ) : (
                <p className="muted-text">No collaborators yet.</p>
              )}
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Sharing</h3>
                <p className="muted-text">
                  Email sharing stays available, and owners can also create revocable share links.
                </p>
              </div>
            </div>

            {currentRole === "owner" ? (
              <>
                <div className="stack-list">
                  <div className="stack-item stack-item-form">
                    <label className="field-label">Share by email</label>
                    <input
                      className="input"
                      value={shareEmail}
                      onChange={(event) => setShareEmail(event.target.value)}
                      placeholder="Collaborator email"
                    />
                    <select
                      className="input"
                      value={shareRole}
                      onChange={(event) => setShareRole(event.target.value)}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="owner">Owner</option>
                    </select>
                    <button className="secondary-button" type="button" onClick={handleShare}>
                      Share by email
                    </button>
                  </div>

                  <div className="stack-item stack-item-form">
                    <label className="field-label">Create share link</label>
                    <select
                      className="input"
                      value={shareLinkRole}
                      onChange={(event) => setShareLinkRole(event.target.value)}
                    >
                      <option value="viewer">Viewer link</option>
                      <option value="editor">Editor link</option>
                    </select>
                    <select
                      className="input"
                      value={shareLinkExpiry}
                      onChange={(event) => setShareLinkExpiry(event.target.value)}
                    >
                      <option value="24">24 hours</option>
                      <option value="72">72 hours</option>
                      <option value="168">7 days</option>
                    </select>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleCreateShareLink}
                    >
                      Create link
                    </button>
                  </div>
                </div>

                {shareMessage ? <div className="message success">{shareMessage}</div> : null}
                {shareError ? <div className="message error">{shareError}</div> : null}

                <div className="stack-list link-list">
                  {shareLinks.length ? (
                    shareLinks.map((link) => (
                      <div key={link.token} className="stack-item stack-item-form">
                        <div>
                          <strong>{link.role} link</strong>
                          <p className="muted-text compact-text">
                            {link.is_active ? "Active" : "Inactive"} • expires{" "}
                            {link.expires_at ? formatDateTime(link.expires_at) : "never"}
                          </p>
                          <code className="share-link-code">{getShareUrl(link.token)}</code>
                        </div>
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="secondary-button small-button"
                            onClick={() => copyShareLink(link.token)}
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            className="ghost-button small-button"
                            onClick={() => handleRevokeShareLink(link.token)}
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted-text">No share links created yet.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="muted-text">Only the owner can manage sharing options.</p>
            )}
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Version history</h3>
                <p className="muted-text">Restore earlier snapshots when needed.</p>
              </div>
            </div>

            {versionError ? <div className="message error">{versionError}</div> : null}

            <div className="stack-list">
              {versions.length ? (
                [...versions].reverse().map((version) => (
                  <div key={version.version} className="stack-item">
                    <div>
                      <strong>Version {version.version}</strong>
                      <p className="muted-text compact-text">
                        Saved at {formatDateTime(version.saved_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button small-button"
                      onClick={() => handleRestoreVersion(version.version)}
                      disabled={currentRole === "viewer"}
                    >
                      Restore
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted-text">No saved snapshots yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditorPage;
