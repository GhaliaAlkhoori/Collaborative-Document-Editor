import { useEffect, useRef, useState } from "react";
import api, { ensureValidAccessToken } from "../api/client";
import AIEditPanel from "../components/AIEditPanel";
import CollaborativeTextarea from "../components/CollaborativeTextarea";
import RichTextEditor from "../components/RichTextEditor";
import { getStoredAccessToken, getStoredRefreshToken, getStoredUser } from "../lib/session";
import {
  applyTextOperation,
  diffToOperation,
  normalizeOperation,
  operationHasChanges,
  transformIndex,
  transformOperation,
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

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value || "");
}

function toRichTextContent(value) {
  const rawValue = value || "";
  if (!rawValue.trim()) {
    return "<p></p>";
  }

  if (looksLikeHtml(rawValue)) {
    return rawValue;
  }

  return rawValue
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function previewText(text, maxLength = 140) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "No text recorded.";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function formatInteractionStatus(status) {
  const label = status || "pending";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatParticipantActivity(participant) {
  if (participant?.is_typing || participant?.activity_status === "typing") {
    return "typing";
  }

  if (participant?.activity_status === "active") {
    return "active";
  }

  return "idle";
}

function formatCollaboratorMeta(collaborator) {
  const values = [collaborator?.email];

  if (collaborator?.username) {
    values.push(`@${collaborator.username}`);
  }

  if (!values.filter(Boolean).length) {
    return collaborator?.user_id || "Unknown collaborator";
  }

  return values.filter(Boolean).join(" • ");
}

function EditorPage() {
  const documentId = window.location.pathname.split("/").pop();

  const textareaRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const cursorTimerRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const shouldReconnectRef = useRef(true);
  const pendingOpsRef = useRef([]);
  const currentContentRef = useRef("");
  const lastSavedSnapshotRef = useRef({ title: "", content: "" });
  const snapshotDirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const hasLoadedDocumentRef = useRef(false);
  const lastAiChangeRef = useRef(null);
  const localSelectionRef = useRef({ start: 0, end: 0 });
  const richSelectionRef = useRef({ start: 1, end: 1, text: "" });
  const localClientIdRef = useRef("");
  const editorModeRef = useRef("rich");
  const serverVersionRef = useRef(1);

  const [title, setTitle] = useState("Untitled Document");
  const [content, setContent] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [richSelection, setRichSelection] = useState({ start: 1, end: 1, text: "" });
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
  const [aiHistory, setAiHistory] = useState([]);
  const [aiHistoryError, setAiHistoryError] = useState("");
  const [editorMode, setEditorMode] = useState("rich");
  const [canUndoAiChange, setCanUndoAiChange] = useState(false);

  const authHeader = () => ({
    Authorization: `Bearer ${getStoredAccessToken()}`,
  });

  const readOnly = currentRole === "viewer";
  const richTextValue = toRichTextContent(content);
  const activeSelectedText =
    editorMode === "rich" ? richSelection.text : content.slice(selection.start, selection.end);
  const currentUser = getStoredUser();

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

  const loadAiHistory = async () => {
    try {
      const response = await api.get(`/api/v1/ai/documents/${documentId}/history`, {
        headers: authHeader(),
      });
      setAiHistory(response.data.interactions || []);
      setAiHistoryError("");
    } catch {
      setAiHistory([]);
      setAiHistoryError("Failed to load AI history.");
    }
  };

  const loadDocument = async () => {
    try {
      const response = await api.get(`/api/v1/documents/${documentId}`, {
        headers: authHeader(),
      });

      const document = response.data;
      const serverTitle = document.title;
      const serverContent = document.content || "";
      const hasLocalTitleDraft =
        hasLoadedDocumentRef.current && title !== lastSavedSnapshotRef.current.title;
      const hasLocalContentDraft =
        pendingOpsRef.current.length > 0 ||
        (hasLoadedDocumentRef.current &&
          currentContentRef.current !== lastSavedSnapshotRef.current.content);

      setTitle(hasLocalTitleDraft ? title : serverTitle);
      setContent(hasLocalContentDraft ? currentContentRef.current : serverContent);
      setDocumentVersion(document.version || 1);
      setUpdatedAt(document.updated_at || "");
      setCurrentRole(document.current_role || "viewer");
      setCollaborators(document.collaborators || []);
      serverVersionRef.current = document.version || 1;
      lastSavedSnapshotRef.current = {
        title: serverTitle,
        content: serverContent,
      };
      snapshotDirtyRef.current = hasLocalTitleDraft || hasLocalContentDraft;
      if (!hasLocalContentDraft) {
        currentContentRef.current = serverContent;
      }
      richSelectionRef.current = { start: 1, end: 1, text: "" };
      setRichSelection({ start: 1, end: 1, text: "" });
      hasLoadedDocumentRef.current = true;
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

    const activeMode = editorModeRef.current;
    const nextSourceSelection = localSelectionRef.current;
    const nextRichSelection = richSelectionRef.current;
    const sourceSelectionText = currentContentRef.current.slice(
      nextSourceSelection.start,
      nextSourceSelection.end
    );

    socket.send(
      JSON.stringify({
        type: "cursor",
        selection_mode: activeMode,
        selection_start:
          activeMode === "rich" ? nextRichSelection.start : nextSourceSelection.start,
        selection_end: activeMode === "rich" ? nextRichSelection.end : nextSourceSelection.end,
        selection_text: activeMode === "rich" ? nextRichSelection.text : sourceSelectionText,
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

  const rebasePendingOperations = (serverContent, operationHistory, previousClientId) => {
    let nextContent = serverContent;
    const rebasedPending = [];

    for (const pendingOperation of pendingOpsRef.current) {
      let rebasedOperation = normalizeOperation(pendingOperation.operation);

      for (const historicalEntry of operationHistory || []) {
        if (historicalEntry.version <= pendingOperation.baseVersion) {
          continue;
        }

        const pendingClientId =
          pendingOperation.originClientId || previousClientId || localClientIdRef.current || "";
        const side =
          String(pendingClientId) < String(historicalEntry.client_id || "") ? "left" : "right";
        rebasedOperation = transformOperation(
          rebasedOperation,
          historicalEntry.operation || [],
          side
        );
      }

      rebasedOperation = normalizeOperation(rebasedOperation);
      if (!operationHasChanges(rebasedOperation)) {
        continue;
      }

      nextContent = applyTextOperation(nextContent, rebasedOperation);
      rebasedPending.push({
        ...pendingOperation,
        operation: rebasedOperation,
        sent: false,
      });
    }

    pendingOpsRef.current = rebasedPending;
    return nextContent;
  };

  const connectRealtime = async () => {
    if (!getStoredAccessToken() && !getStoredRefreshToken()) {
      return;
    }

    window.clearTimeout(reconnectTimerRef.current);
    shouldReconnectRef.current = true;

    let authToken = "";
    try {
      authToken = await ensureValidAccessToken();
    } catch {
      setConnectionState("disconnected");
      setStatus("Session expired. Please sign in again.");
      window.location.href = "/login";
      return;
    }

    if (!authToken) {
      return;
    }

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
        const previousClientId = localClientIdRef.current;
        localClientIdRef.current = message.client_id;
        setLocalClientId(message.client_id);
        const document = message.document || {};
        const serverTitle = document.title || "Untitled Document";
        const serverContent = document.content || "";
        let nextContent = serverContent;

        if (pendingOpsRef.current.length) {
          nextContent = rebasePendingOperations(
            serverContent,
            message.operation_history || [],
            previousClientId
          );
        }

        currentContentRef.current = nextContent;
        serverVersionRef.current = document.version || 1;
        setContent(nextContent);
        if (title === lastSavedSnapshotRef.current.title) {
          setTitle(serverTitle);
        }
        setDocumentVersion(document.version || 1);
        setUpdatedAt(document.updated_at || "");
        setCurrentRole(document.role || "viewer");
        setRemoteParticipants(decorateParticipants(message.participants || []));
        lastSavedSnapshotRef.current = {
          title: serverTitle,
          content: serverContent,
        };

        const nextSelection = {
          start: Math.min(localSelectionRef.current.start, nextContent.length),
          end: Math.min(localSelectionRef.current.end, nextContent.length),
        };
        localSelectionRef.current = nextSelection;
        setSelection(nextSelection);
        richSelectionRef.current = { start: 1, end: 1, text: "" };
        setRichSelection({ start: 1, end: 1, text: "" });

        if (pendingOpsRef.current.length) {
          setStatus("Reconnected. Syncing offline edits...");
          sendNextPendingOperation();
        } else {
          setStatus(document.role === "viewer" ? "Connected in view mode" : "Connected");
        }
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
      setStatus(
        pendingOpsRef.current.length || snapshotDirtyRef.current
          ? "Offline mode. Changes will sync when reconnected."
          : "Live collaboration disconnected. Reconnecting..."
      );

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
      loadAiHistory();
    }, 0);

    return () => {
      shouldReconnectRef.current = false;
      window.clearTimeout(timeoutId);
      window.clearTimeout(reconnectTimerRef.current);
      window.clearTimeout(cursorTimerRef.current);
      window.clearTimeout(autoSaveTimerRef.current);
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
  }, [documentId, error]);

  useEffect(() => {
    editorModeRef.current = editorMode;
    queueCursorUpdate();
  }, [editorMode]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadShareLinks();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentRole]);

  const saveSnapshot = async (
    nextTitle,
    nextContent,
    {
      successStatus = "Snapshot saved",
      blockedStatus = "Reconnect before saving a snapshot",
    } = {}
  ) => {
    if (currentRole === "viewer") {
      setStatus("Viewers cannot save snapshots");
      return false;
    }

    if (connectionState !== "connected") {
      setStatus(blockedStatus);
      return false;
    }

    if (saveInFlightRef.current) {
      return false;
    }

    saveInFlightRef.current = true;
    window.clearTimeout(autoSaveTimerRef.current);

    const startedAt = Date.now();
    while (pendingOpsRef.current.length && Date.now() - startedAt < 4000) {
      await wait(60);
    }

    if (pendingOpsRef.current.length) {
      saveInFlightRef.current = false;
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
      lastSavedSnapshotRef.current = {
        title: nextTitle,
        content: nextContent,
      };
      snapshotDirtyRef.current = false;
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
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const clearLastAiUndo = () => {
    lastAiChangeRef.current = null;
    setCanUndoAiChange(false);
  };

  const handleTitleChange = (event) => {
    const nextTitle = event.target.value;
    snapshotDirtyRef.current = true;
    setTitle(nextTitle);
    setStatus(
      connectionState === "connected"
        ? "Changes queued for auto-save..."
        : "Offline mode. Title changes will sync when reconnected."
    );
  };

  const handleSelectionChange = (nextSelection) => {
    localSelectionRef.current = nextSelection;
    setSelection(nextSelection);
    queueCursorUpdate();
  };

  const handleRichTextSelectionChange = (nextSelection) => {
    const normalizedSelection = {
      start: nextSelection?.start ?? 1,
      end: nextSelection?.end ?? 1,
      text: nextSelection?.text || "",
    };

    richSelectionRef.current = normalizedSelection;
    setRichSelection(normalizedSelection);
    queueCursorUpdate();
  };

  const handleContentChange = (nextContent, nextSelection, { source = "manual" } = {}) => {
    const previousContent = currentContentRef.current;
    currentContentRef.current = nextContent;
    setContent(nextContent);
    localSelectionRef.current = nextSelection;
    setSelection(nextSelection);
    snapshotDirtyRef.current = true;

    if (source !== "ai-apply" && source !== "ai-undo") {
      clearLastAiUndo();
    }

    const operation = diffToOperation(previousContent, nextContent);
    if (!operationHasChanges(operation)) {
      setStatus(
        connectionState === "connected"
          ? "Changes queued for auto-save..."
          : "Offline mode. Changes will sync when reconnected."
      );
      queueCursorUpdate();
      return;
    }

    pendingOpsRef.current.push({
      clientOpId: buildClientId(),
      operation,
      sent: false,
      baseVersion: serverVersionRef.current,
      originClientId: localClientIdRef.current,
    });

    setStatus(
      connectionState === "connected"
        ? "Syncing edits..."
        : "Offline mode. Changes will sync when reconnected."
    );
    sendNextPendingOperation();
    queueCursorUpdate();
  };

  const handleRichTextChange = (nextContent) => {
    const normalizedContent = nextContent === "<p></p>" ? "" : nextContent;
    const nextSelection = {
      start: normalizedContent.length,
      end: normalizedContent.length,
    };

    handleContentChange(normalizedContent, nextSelection);
  };

  const handleApplySuggestion = async ({ suggestion, sourceText }) => {
    const previousContent = content;
    const previousSelection = selection;
    let nextContent = suggestion;

    if (
      editorMode === "source" &&
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

    lastAiChangeRef.current = {
      previousContent,
      previousSelection,
      nextContent,
      nextSelection,
    };
    setCanUndoAiChange(true);

    handleContentChange(nextContent, nextSelection, { source: "ai-apply" });
    const saved = await saveSnapshot(title, nextContent, {
      successStatus: "AI changes applied and saved",
      blockedStatus: "AI changes applied locally. Reconnect to save the snapshot.",
    });
    if (!saved) {
      setStatus("AI changes applied locally");
    }
  };

  const handleUndoAiChange = async () => {
    const lastAiChange = lastAiChangeRef.current;
    if (!lastAiChange) {
      return;
    }

    if (currentContentRef.current !== lastAiChange.nextContent) {
      clearLastAiUndo();
      setStatus("Undo unavailable because the draft changed after the AI apply.");
      return;
    }

    handleContentChange(lastAiChange.previousContent, lastAiChange.previousSelection, {
      source: "ai-undo",
    });
    clearLastAiUndo();

    const saved = await saveSnapshot(title, lastAiChange.previousContent, {
      successStatus: "AI change undone and saved",
      blockedStatus: "AI change undone locally. Reconnect to save the snapshot.",
    });

    if (!saved) {
      setStatus("AI change undone locally");
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
      snapshotDirtyRef.current = false;
      clearLastAiUndo();
      await loadDocument();
      await loadVersions();
      setStatus("Version restored");
    } catch {
      setStatus("Restore failed");
    }
  };

  const handleShare = () => {
    const trimmedTarget = shareEmail.trim();
    if (!trimmedTarget) {
      setShareMessage("");
      setShareError("Enter an email address first.");
      return;
    }

    if (!trimmedTarget.includes("@")) {
      setShareMessage("");
      setShareError("Enter an email address to open an email draft.");
      return;
    }

    setShareMessage("");
    setShareError("");

    const subject = encodeURIComponent(`Shared document: ${title || "Untitled Document"}`);
    const body = encodeURIComponent(
      [
        "Hi,",
        "",
        "Here is the document link:",
        `${window.location.origin}/documents/${documentId}`,
        "",
        `Document: ${title || "Untitled Document"}`,
        "",
        "You may need to sign in before opening it.",
      ].join("\n")
    );

    window.location.href = `mailto:${encodeURIComponent(trimmedTarget)}?subject=${subject}&body=${body}`;
    setShareMessage("Email draft opened.");
  };

  const handleGrantAccess = async () => {
    const trimmedTarget = shareEmail.trim();
    if (!trimmedTarget) {
      setShareMessage("");
      setShareError("Enter an email address or username first.");
      return;
    }

    setShareMessage("");
    setShareError("");

    try {
      const response = await api.post(
        `/api/v1/documents/${documentId}/share`,
        trimmedTarget.includes("@")
          ? {
              user_email: trimmedTarget,
              role: shareRole,
            }
          : {
              username: trimmedTarget,
              role: shareRole,
            },
        {
          headers: authHeader(),
        }
      );

      await loadDocument();
      setShareMessage(`Access granted as ${response.data.role}.`);
      setShareEmail("");
    } catch (err) {
      setShareError(err?.response?.data?.detail || "Failed to share document access.");
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

  useEffect(() => {
    window.clearTimeout(autoSaveTimerRef.current);

    if (!hasLoadedDocumentRef.current || currentRole === "viewer") {
      return undefined;
    }

    if (!snapshotDirtyRef.current) {
      return undefined;
    }

    if (connectionState !== "connected") {
      setStatus("Offline mode. Changes will sync when reconnected.");
      return undefined;
    }

    if (pendingOpsRef.current.length || saveInFlightRef.current) {
      return undefined;
    }

    setStatus("Changes queued for auto-save...");
    autoSaveTimerRef.current = window.setTimeout(() => {
      saveSnapshot(title, currentContentRef.current, {
        successStatus: "All changes auto-saved",
        blockedStatus: "Offline mode. Changes will sync when reconnected.",
      });
    }, 1200);

    return () => {
      window.clearTimeout(autoSaveTimerRef.current);
    };
  }, [connectionState, currentRole, title, content, documentVersion]);

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
              onChange={handleTitleChange}
            />
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>Draft</h3>
                <p className="muted-text">
                  Rich text formatting is available in the formatted editor, while source mode keeps
                  live OT collaboration and remote cursors visible on the underlying document markup.
                </p>
              </div>
            </div>

            <div className="ai-source-switcher">
              <button
                className={`pill-toggle ${editorMode === "rich" ? "active" : ""}`}
                type="button"
                onClick={() => setEditorMode("rich")}
              >
                Rich text
              </button>
              <button
                className={`pill-toggle ${editorMode === "source" ? "active" : ""}`}
                type="button"
                onClick={() => setEditorMode("source")}
              >
                Source collaboration
              </button>
            </div>

            {editorMode === "rich" ? (
              <div className="editor-card">
                <RichTextEditor
                  value={richTextValue}
                  onChange={handleRichTextChange}
                  onSelectionChange={handleRichTextSelectionChange}
                  readOnly={readOnly}
                  remoteParticipants={remoteParticipants.filter(
                    (participant) => participant.client_id !== localClientId
                  )}
                />
                <p className="muted-text compact-text rich-editor-note">
                  Use headings, bold, italic, lists, and code blocks here. Switch to source
                  collaboration when you need live cursor tracking on the document markup.
                </p>
              </div>
            ) : (
              <>
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
                <p className="muted-text compact-text rich-editor-note">
                  Source collaboration shows the stored document markup so OT and remote selections
                  stay exact.
                </p>
              </>
            )}

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
                      : participant.name || participant.username || participant.email || "Collaborator"}
                  </span>
                  <span className="presence-role">{participant.role}</span>
                  <span className="presence-role">{formatParticipantActivity(participant)}</span>
                </div>
              ))}
            </div>
          </div>

          <AIEditPanel
            documentId={documentId}
            documentText={content}
            selectedText={activeSelectedText}
            readOnly={currentRole === "viewer"}
            canUndoLastApply={canUndoAiChange}
            onHistoryChanged={loadAiHistory}
            onApplySuggestion={handleApplySuggestion}
            onUndoLastApply={handleUndoAiChange}
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
                      <strong>
                        {collaborator.name || collaborator.username || collaborator.email || collaborator.user_id}
                      </strong>
                      {collaborator.username ? (
                        <div className="username-pill compact-pill">@{collaborator.username}</div>
                      ) : null}
                      <p className="muted-text compact-text">{formatCollaboratorMeta(collaborator)}</p>
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
                  Grant access by email or username, and create revocable share links when you need
                  a broader handoff.
                </p>
                {currentUser?.username ? (
                  <div className="username-banner">Your username is @{currentUser.username}</div>
                ) : null}
              </div>
            </div>

            {currentRole === "owner" ? (
              <>
                <div className="stack-list">
                  <div className="stack-item stack-item-form">
                    <label className="field-label">Share with a collaborator</label>
                    <input
                      type="text"
                      className="input"
                      value={shareEmail}
                      onChange={(event) => setShareEmail(event.target.value)}
                      placeholder="name@example.com or username"
                    />
                    <select
                      className="input"
                      value={shareRole}
                      onChange={(event) => setShareRole(event.target.value)}
                    >
                      <option value="viewer">Viewer access</option>
                      <option value="editor">Editor access</option>
                    </select>
                    <div className="inline-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={handleGrantAccess}
                      >
                        Grant access
                      </button>
                      <button className="ghost-button" type="button" onClick={handleShare}>
                        Email link
                      </button>
                    </div>
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

          <div className="panel-card">
            <div className="panel-header">
              <div>
                <h3>AI history</h3>
                <p className="muted-text">
                  Every AI suggestion is logged with its prompt, output, and review status.
                </p>
              </div>
            </div>

            {aiHistoryError ? <div className="message error">{aiHistoryError}</div> : null}

            <div className="stack-list">
              {aiHistory.length ? (
                aiHistory.map((interaction) => (
                  <div key={interaction.interaction_id} className="stack-item">
                    <div>
                      <strong>
                        {interaction.action} · {formatInteractionStatus(interaction.status)}
                      </strong>
                      <p className="muted-text compact-text">
                        {formatDateTime(interaction.created_at)} · model {interaction.model}
                      </p>
                      <p className="muted-text compact-text">
                        Source: {previewText(interaction.selected_text)}
                      </p>
                      <p className="muted-text compact-text">
                        Response: {previewText(interaction.reviewed_text || interaction.response_text)}
                      </p>
                    </div>
                    <span className="badge role">{formatInteractionStatus(interaction.status)}</span>
                  </div>
                ))
              ) : (
                <p className="muted-text">No AI interactions for this document yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditorPage;
