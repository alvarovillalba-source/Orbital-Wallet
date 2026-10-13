import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import DOMPurify from "dompurify";
import { DocumentFormattingToolbar } from "./DocumentRichEditor";

export default function CommunicationEditor({ onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: false }),
      Highlight.configure({ multicolor: true }),
    ],
    content: "<p></p>",
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": "Texto del comunicado" } },
    onUpdate: ({ editor: updatedEditor }) => onChange(DOMPurify.sanitize(updatedEditor.getHTML())),
  });

  return (
    <div className="communication-editor">
      <DocumentFormattingToolbar editor={editor} applyFontToAllWhenSelectionEmpty />
      <div className="document-rich-editor communication-rich-editor">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
