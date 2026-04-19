import { useEffect, useRef, useState } from "react";

function buildIndexMap(text, columns) {
  const positions = Array(text.length + 1);
  let row = 0;
  let column = 0;
  positions[0] = { row, column };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === "\n") {
      row += 1;
      column = 0;
      positions[index + 1] = { row, column };
      continue;
    }

    column += 1;
    if (column > columns) {
      row += 1;
      column = 1;
    }

    positions[index + 1] = { row, column };
  }

  return positions;
}

function buildSelectionRects(text, positions, start, end) {
  const safeStart = Math.max(0, Math.min(text.length, start));
  const safeEnd = Math.max(0, Math.min(text.length, end));
  if (safeStart >= safeEnd) {
    return [];
  }

  const segments = [];
  let currentSegment = null;

  for (let index = safeStart; index < safeEnd; index += 1) {
    if (text[index] === "\n") {
      currentSegment = null;
      continue;
    }

    const position = positions[index] || positions[positions.length - 1];
    if (
      currentSegment &&
      currentSegment.row === position.row &&
      currentSegment.endColumn === position.column
    ) {
      currentSegment.endColumn += 1;
      continue;
    }

    currentSegment = {
      row: position.row,
      startColumn: position.column,
      endColumn: position.column + 1,
    };
    segments.push(currentSegment);
  }

  return segments;
}

function getCaretPosition(positions, index) {
  return positions[Math.max(0, Math.min(index, positions.length - 1))] || { row: 0, column: 0 };
}

function captureSelection(target) {
  return {
    start: target.selectionStart ?? 0,
    end: target.selectionEnd ?? 0,
  };
}

function CollaborativeTextarea({
  value,
  selection,
  localClientId,
  remoteParticipants,
  readOnly,
  textareaRef,
  onTextChange,
  onSelectionChange,
}) {
  const measureRef = useRef(null);
  const [metrics, setMetrics] = useState({
    charWidth: 9,
    lineHeight: 24,
    paddingLeft: 20,
    paddingTop: 18,
    columns: 1,
  });
  const [scrollState, setScrollState] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const textarea = textareaRef.current;
    const measureNode = measureRef.current;
    if (!textarea || !measureNode) {
      return undefined;
    }

    const updateMetrics = () => {
      const styles = window.getComputedStyle(textarea);
      const paddingLeft = Number.parseFloat(styles.paddingLeft || "20");
      const paddingRight = Number.parseFloat(styles.paddingRight || "20");
      const paddingTop = Number.parseFloat(styles.paddingTop || "18");
      const lineHeight = Number.parseFloat(styles.lineHeight || "24");

      measureNode.style.font = styles.font;
      measureNode.style.letterSpacing = styles.letterSpacing;

      const sampleWidth = measureNode.getBoundingClientRect().width || 90;
      const charWidth = sampleWidth / 10;
      const availableWidth = Math.max(1, textarea.clientWidth - paddingLeft - paddingRight);
      const columns = Math.max(1, Math.floor(availableWidth / Math.max(charWidth, 1)));

      setMetrics({
        charWidth,
        lineHeight,
        paddingLeft,
        paddingTop,
        columns,
      });
    };

    updateMetrics();

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });

    resizeObserver.observe(textarea);
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, [textareaRef]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const nextStart = selection?.start ?? 0;
    const nextEnd = selection?.end ?? 0;

    if (textarea.selectionStart !== nextStart || textarea.selectionEnd !== nextEnd) {
      textarea.setSelectionRange(nextStart, nextEnd);
    }
  }, [selection, textareaRef, value]);

  const positions = buildIndexMap(value, metrics.columns);
  const visibleParticipants = (remoteParticipants || []).filter(
    (participant) => participant.client_id !== localClientId
  );

  return (
    <div className="editor-surface-card">
      <div className="editor-overlay-shell">
        <textarea
          ref={textareaRef}
          className="collab-textarea"
          value={value}
          readOnly={readOnly}
          onChange={(event) => {
            onTextChange(event.target.value, captureSelection(event.target));
          }}
          onSelect={(event) => {
            onSelectionChange(captureSelection(event.target));
          }}
          onKeyUp={(event) => {
            onSelectionChange(captureSelection(event.target));
          }}
          onMouseUp={(event) => {
            onSelectionChange(captureSelection(event.target));
          }}
          onClick={(event) => {
            onSelectionChange(captureSelection(event.target));
          }}
          onScroll={(event) => {
            setScrollState({
              top: event.target.scrollTop,
              left: event.target.scrollLeft,
            });
          }}
          placeholder="Start writing here..."
          spellCheck
        />

        <div className="remote-layer" aria-hidden="true">
          {visibleParticipants.map((participant) => {
            const start = participant.selection_start ?? 0;
            const end = participant.selection_end ?? 0;
            const safeStart = Math.max(0, Math.min(start, end));
            const safeEnd = Math.max(0, Math.max(start, end));
            const color = participant.color || "#0ea5e9";
            const label = participant.name || "Collaborator";
            const segments = buildSelectionRects(value, positions, safeStart, safeEnd);
            const anchor = getCaretPosition(positions, safeStart);
            const caret = getCaretPosition(positions, safeEnd);

            return (
              <div key={participant.client_id} className="remote-participant-layer">
                {segments.map((segment) => (
                  <div
                    key={`${participant.client_id}-${segment.row}-${segment.startColumn}`}
                    className="remote-selection-block"
                    style={{
                      backgroundColor: `${color}33`,
                      left:
                        metrics.paddingLeft +
                        segment.startColumn * metrics.charWidth -
                        scrollState.left,
                      top:
                        metrics.paddingTop + segment.row * metrics.lineHeight - scrollState.top,
                      width: Math.max(
                        metrics.charWidth,
                        (segment.endColumn - segment.startColumn) * metrics.charWidth
                      ),
                      height: metrics.lineHeight,
                    }}
                  />
                ))}

                <div
                  className="remote-caret"
                  style={{
                    backgroundColor: color,
                    left: metrics.paddingLeft + caret.column * metrics.charWidth - scrollState.left,
                    top: metrics.paddingTop + caret.row * metrics.lineHeight - scrollState.top,
                    height: metrics.lineHeight,
                  }}
                />

                <div
                  className="remote-label"
                  style={{
                    backgroundColor: color,
                    left: metrics.paddingLeft + anchor.column * metrics.charWidth - scrollState.left,
                    top:
                      metrics.paddingTop +
                      anchor.row * metrics.lineHeight -
                      scrollState.top -
                      28,
                  }}
                >
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        <span ref={measureRef} className="textarea-measure">
          MMMMMMMMMM
        </span>
      </div>
    </div>
  );
}

export default CollaborativeTextarea;
