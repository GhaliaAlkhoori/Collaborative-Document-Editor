
import { useState } from "react";
import api from "../api/client";

function AIEditPanel({ documentId, onApplySuggestion }) {
  const [selectedText, setSelectedText] = useState("");
  const [action, setAction] = useState("rewrite");
  const [tone, setTone] = useState("formal");
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!selectedText.trim()) {
      setError("Please enter or paste selected text first.");
      return;
    }

    setLoading(true);
    setError("");
    setSuggestion("");
    setStreamingText("");

    try {
      const response = await api.post(`/api/v1/documents/${documentId}/ai/invoke`, {
        selected_text: selectedText,
        action,
        options: {
          tone,
          target_language: action === "translate" ? "Arabic" : null,
        },
      });

      const suggestionText =
        response?.data?.suggestion ||
        response?.data?.output ||
        response?.data?.message ||
        "AI response received.";

      let index = 0;
      const interval = setInterval(() => {
        index += 1;
        setStreamingText(suggestionText.slice(0, index));
        if (index >= suggestionText.length) {
          clearInterval(interval);
          setSuggestion(suggestionText);
          setLoading(false);
        }
      }, 20);
    } catch (err) {
      setLoading(false);
      setError(
        err?.response?.data?.error?.message ||
          "AI request failed. Check backend integration."
      );
    }
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <h3>AI Assistant</h3>
        <span className="badge">Preview-first</span>
      </div>

      <label className="field-label">Selected text</label>
      <textarea
        className="textarea"
        rows={6}
        placeholder="Paste the selected text here..."
        value={selectedText}
        onChange={(e) => setSelectedText(e.target.value)}
      />

      <div className="grid-two">
        <div>
          <label className="field-label">Action</label>
          <select
            className="input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="rewrite">Rewrite</option>
            <option value="summarize">Summarize</option>
            <option value="translate">Translate</option>
          </select>
        </div>

        <div>
          <label className="field-label">Tone</label>
          <select
            className="input"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            <option value="formal">Formal</option>
            <option value="concise">Concise</option>
            <option value="friendly">Friendly</option>
          </select>
        </div>
      </div>

      <button className="primary-button full-width" onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating..." : "Generate Suggestion"}
      </button>

      {error ? <div className="message error">{error}</div> : null}

      <label className="field-label" style={{ marginTop: 16 }}>
        Suggestion preview
      </label>
      <div className="suggestion-box">
        {loading ? streamingText || "Streaming response..." : suggestion || "No suggestion yet."}
      </div>

      <div className="inline-actions">
        <button
          className="secondary-button"
          disabled={!suggestion}
          onClick={() => onApplySuggestion(suggestion)}
        >
          Accept
        </button>
        <button
          className="ghost-button"
          disabled={!suggestion && !streamingText}
          onClick={() => {
            setSuggestion("");
            setStreamingText("");
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default AIEditPanel;