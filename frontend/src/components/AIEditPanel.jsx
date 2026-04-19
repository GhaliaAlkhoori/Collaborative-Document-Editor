import { useEffect, useState } from "react";
import api from "../api/client";
import {
  buildSuggestionBlocks,
  composeSuggestionText,
  countReviewChanges,
} from "../lib/aiReview";

function toggleAllBlocks(blocks, accepted) {
  return blocks.map((block) =>
    block.type === "change"
      ? {
          ...block,
          accepted,
        }
      : block
  );
}

function AIEditPanel({
  authToken,
  documentText,
  selectedText,
  readOnly = false,
  onApplySuggestion,
}) {
  const [inputText, setInputText] = useState(selectedText || documentText || "");
  const [action, setAction] = useState("rewrite");
  const [tone, setTone] = useState("formal");
  const [targetLanguage, setTargetLanguage] = useState("Arabic");
  const [suggestion, setSuggestion] = useState("");
  const [reviewBlocks, setReviewBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");

  const selectedWordCount = selectedText?.trim()
    ? selectedText.trim().split(/\s+/).length
    : 0;
  const documentWordCount = documentText?.trim()
    ? documentText.trim().split(/\s+/).length
    : 0;
  const inputWordCount = inputText?.trim() ? inputText.trim().split(/\s+/).length : 0;
  const usingSelection = Boolean(selectedText?.trim()) && inputText === selectedText;
  const usingFullDocument = Boolean(documentText?.trim()) && inputText === documentText;
  const previewText = loading
    ? streamingText || "Streaming response..."
    : composeSuggestionText(reviewBlocks) || suggestion || "No suggestion yet.";
  const changeCount = countReviewChanges(reviewBlocks);

  useEffect(() => {
    if (!selectedText?.trim()) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setInputText(selectedText);
      setSuggestion("");
      setReviewBlocks([]);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [selectedText]);

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setError("Please enter or paste selected text first.");
      return;
    }

    setLoading(true);
    setError("");
    setSuggestion("");
    setReviewBlocks([]);
    setStreamingText("");

    try {
      const response = await fetch(`${api.defaults.baseURL}/api/v1/ai/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          selected_text: inputText,
          action,
          options: {
            tone,
            target_language: action === "translate" ? targetLanguage : null,
          },
        }),
      });

      if (!response.ok || !response.body) {
        let message = "AI request failed.";

        try {
          const data = await response.json();
          message = data?.detail || data?.error?.message || message;
        } catch {
          const fallback = await response.text();
          message = fallback || message;
        }

        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let nextSuggestion = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        nextSuggestion += chunk;
        setStreamingText(nextSuggestion);
      }

      setSuggestion(nextSuggestion);
      setReviewBlocks(buildSuggestionBlocks(inputText, nextSuggestion));
      setLoading(false);
    } catch (err) {
      setLoading(false);
      setError(err?.message || "AI request failed. Check backend integration.");
    }
  };

  const finalSuggestion = composeSuggestionText(reviewBlocks) || suggestion;

  return (
    <div className="panel-card ai-panel">
      <div className="panel-header ai-panel-header">
        <div>
          <div className="eyebrow">Writer&apos;s Room</div>
          <h3>AI Assistant</h3>
          <p className="ai-panel-subtitle">
            Generate a suggestion first, then accept or reject each change block
            individually before anything touches the draft.
          </p>
        </div>

        <div className="ai-panel-badge-wrap">
          <span className="badge">Partial accept</span>
          <span className={`ai-live-pill ${loading ? "active" : ""}`}>
            {loading ? "Generating" : "Ready"}
          </span>
        </div>
      </div>

      <div className="ai-source-card">
        <div className="ai-source-header">
          <div>
            <label className="field-label">Source text</label>
            <p className="ai-helper-text">
              {selectedWordCount
                ? `${selectedWordCount} selected words ready to transform`
                : "No active selection yet. You can still use the full document."}
            </p>
          </div>
          <div className="ai-source-meta">{inputWordCount} words</div>
        </div>

        <div className="ai-source-switcher">
          <button
            className={`pill-toggle ${usingSelection ? "active" : ""}`}
            type="button"
            disabled={!selectedText?.trim()}
            onClick={() => {
              setInputText(selectedText);
              setSuggestion("");
              setReviewBlocks([]);
            }}
          >
            Use selection
          </button>
          <button
            className={`pill-toggle ${usingFullDocument ? "active" : ""}`}
            type="button"
            disabled={!documentText?.trim()}
            onClick={() => {
              setInputText(documentText);
              setSuggestion("");
              setReviewBlocks([]);
            }}
          >
            Use full document
          </button>
        </div>

        <textarea
          className="textarea ai-source-textarea"
          rows={7}
          placeholder="Paste text here or use the current document selection."
          value={inputText}
          onChange={(event) => {
            setInputText(event.target.value);
            setSuggestion("");
            setReviewBlocks([]);
          }}
        />

        <div className="ai-source-footer">
          <span>{documentWordCount} words available in the document</span>
          <span>Nothing gets applied until you click Apply reviewed version</span>
        </div>
      </div>

      <div className="ai-controls-grid">
        <div className="ai-control-card">
          <label className="field-label">Action</label>
          <select
            className="input"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="rewrite">Rewrite</option>
            <option value="summarize">Summarize</option>
            <option value="translate">Translate</option>
          </select>
          <p className="ai-helper-text">
            Choose whether the assistant should polish, compress, or translate.
          </p>
        </div>

        <div className="ai-control-card">
          {action === "translate" ? (
            <>
              <label className="field-label">Target Language</label>
              <input
                className="input"
                value={targetLanguage}
                onChange={(event) => setTargetLanguage(event.target.value)}
                placeholder="Arabic"
              />
              <p className="ai-helper-text">
                Use any language name, for example Arabic, French, or Hindi.
              </p>
            </>
          ) : (
            <>
              <label className="field-label">Tone</label>
              <select
                className="input"
                value={tone}
                onChange={(event) => setTone(event.target.value)}
              >
                <option value="formal">Formal</option>
                <option value="concise">Concise</option>
                <option value="friendly">Friendly</option>
              </select>
              <p className="ai-helper-text">
                Guide the voice of the output without changing the core meaning.
              </p>
            </>
          )}
        </div>
      </div>

      <button
        className="primary-button full-width ai-generate-button"
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? "Generating..." : "Generate Suggestion"}
      </button>

      {error ? <div className="message error">{error}</div> : null}

      <div className="ai-preview-card">
        <div className="ai-preview-header">
          <div>
            <label className="field-label">Suggestion preview</label>
            <p className="ai-helper-text">
              Review the merged result that will be inserted if you apply it.
            </p>
          </div>
          <div className={`ai-preview-state ${loading ? "active" : ""}`}>
            {loading ? "Live stream" : suggestion ? "Ready to review" : "Waiting"}
          </div>
        </div>

        <div className={`suggestion-box ai-suggestion-box ${loading ? "streaming" : ""}`}>
          {previewText}
        </div>
      </div>

      {changeCount ? (
        <div className="ai-review-card">
          <div className="ai-review-header">
            <div>
              <label className="field-label">Review change blocks</label>
              <p className="ai-helper-text">
                Keep or discard individual edits before applying the final version.
              </p>
            </div>
            <div className="inline-actions ai-review-actions">
              <button
                type="button"
                className="secondary-button small-button"
                onClick={() => setReviewBlocks((current) => toggleAllBlocks(current, true))}
              >
                Accept all
              </button>
              <button
                type="button"
                className="ghost-button small-button"
                onClick={() => setReviewBlocks((current) => toggleAllBlocks(current, false))}
              >
                Reject all
              </button>
            </div>
          </div>

          <div className="ai-review-list">
            {reviewBlocks
              .filter((block) => block.type === "change")
              .map((block, index) => (
                <div
                  key={block.id}
                  className={`ai-review-item ${block.accepted ? "accepted" : "rejected"}`}
                >
                  <div className="ai-review-item-top">
                    <strong>Change {index + 1}</strong>
                    <span className={`ai-review-pill ${block.accepted ? "accepted" : "rejected"}`}>
                      {block.accepted ? "Using AI text" : "Keeping original"}
                    </span>
                  </div>

                  <div className="ai-review-diff-grid">
                    <div>
                      <div className="ai-review-label">Original</div>
                      <pre className="ai-review-text before">{block.before || "Nothing here"}</pre>
                    </div>
                    <div>
                      <div className="ai-review-label">AI suggestion</div>
                      <pre className="ai-review-text after">{block.after || "Nothing here"}</pre>
                    </div>
                  </div>

                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button small-button"
                      onClick={() =>
                        setReviewBlocks((current) =>
                          current.map((candidate) =>
                            candidate.id === block.id
                              ? {
                                  ...candidate,
                                  accepted: true,
                                }
                              : candidate
                          )
                        )
                      }
                    >
                      Accept this change
                    </button>
                    <button
                      type="button"
                      className="ghost-button small-button"
                      onClick={() =>
                        setReviewBlocks((current) =>
                          current.map((candidate) =>
                            candidate.id === block.id
                              ? {
                                  ...candidate,
                                  accepted: false,
                                }
                              : candidate
                          )
                        )
                      }
                    >
                      Keep original
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}

      <div className="inline-actions ai-apply-actions">
        <button
          className="secondary-button"
          disabled={!suggestion || readOnly}
          onClick={() =>
            onApplySuggestion({
              suggestion: finalSuggestion,
              sourceText: inputText,
            })
          }
        >
          {readOnly ? "View only" : "Apply reviewed version"}
        </button>
        <button
          className="ghost-button"
          disabled={!suggestion && !streamingText}
          onClick={() => {
            setSuggestion("");
            setReviewBlocks([]);
            setStreamingText("");
            setError("");
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default AIEditPanel;
