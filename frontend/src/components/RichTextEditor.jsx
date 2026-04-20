
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

const remotePresencePluginKey = new PluginKey("remotePresence");

function clampDocPosition(value, docSize) {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 1;
  const safeDocSize = Math.max(1, docSize);
  return Math.max(1, Math.min(numericValue, safeDocSize));
}

const RemotePresenceExtension = Extension.create({
  name: "remotePresence",

  addStorage() {
    return {
      participants: [],
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: remotePresencePluginKey,
        props: {
          decorations(state) {
            const participants = extension.storage.participants || [];
            const docSize = state.doc.content.size;
            const decorations = [];

            participants.forEach((participant) => {
              if (participant.selection_mode !== "rich") {
                return;
              }

              const color = participant.color || "#0ea5e9";
              const label =
                participant.name ||
                participant.username ||
                participant.email ||
                "Collaborator";
              const start = clampDocPosition(participant.selection_start, docSize);
              const end = clampDocPosition(participant.selection_end, docSize);
              const from = Math.min(start, end);
              const to = Math.max(start, end);

              if (from !== to) {
                decorations.push(
                  Decoration.inline(from, to, {
                    class: "remote-rich-selection",
                    style: `background-color: ${color}22; box-shadow: inset 0 -2px 0 ${color};`,
                  })
                );
              }

              decorations.push(
                Decoration.widget(
                  to,
                  () => {
                    const wrapper = document.createElement("span");
                    wrapper.className = "remote-rich-caret";
                    wrapper.style.setProperty("--remote-caret-color", color);

                    const caretLine = document.createElement("span");
                    caretLine.className = "remote-rich-caret-line";
                    wrapper.appendChild(caretLine);

                    const labelNode = document.createElement("span");
                    labelNode.className = "remote-rich-label";
                    labelNode.textContent = label;
                    labelNode.style.backgroundColor = color;
                    wrapper.appendChild(labelNode);

                    return wrapper;
                  },
                  {
                    side: 1,
                  }
                )
              );
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

function ToolbarButton({ onClick, active, label, disabled = false }) {
  return (
    <button
      type="button"
      className={`toolbar-button ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function RichTextEditor({
  value,
  onChange,
  onSelectionChange,
  readOnly = false,
  remoteParticipants = [],
}) {
  const emitSelectionChange = (editorInstance) => {
    const { from, to } = editorInstance.state.selection;
    onSelectionChange?.({
      start: from,
      end: to,
      text: editorInstance.state.doc.textBetween(from, to, "\n"),
      mode: "rich",
    });
  };

  const editor = useEditor({
    extensions: [StarterKit, RemotePresenceExtension],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "editor-content",
      },
    },
    onCreate: ({ editor: editorInstance }) => {
      emitSelectionChange(editorInstance);
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onSelectionUpdate: ({ editor: editorInstance }) => {
      emitSelectionChange(editorInstance);
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "<p></p>", false);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.storage.remotePresence.participants = remoteParticipants;
    editor.view.dispatch(editor.state.tr.setMeta("remotePresenceRefresh", Date.now()));
  }, [editor, remoteParticipants]);

  if (!editor) {
    return null;
  }

  return (
    <div className="editor-card">
      <div className="toolbar">
        <ToolbarButton
          label="H1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={readOnly}
        />
        <ToolbarButton
          label="H2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={readOnly}
        />
        <ToolbarButton
          label="B"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={readOnly}
        />
        <ToolbarButton
          label="I"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={readOnly}
        />
        <ToolbarButton
          label="List"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={readOnly}
        />
        <ToolbarButton
          label="Code"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={readOnly}
        />
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextEditor;
