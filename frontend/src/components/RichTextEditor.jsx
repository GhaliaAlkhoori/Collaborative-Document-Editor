
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

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

function RichTextEditor({ value, onChange, readOnly = false }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
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
