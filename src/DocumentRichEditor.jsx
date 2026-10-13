import { useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import DOMPurify from "dompurify";
import { documentoAHtml } from "./documentContent";

function fileFromClipboardDataUrl(source, index) {
  const match = source.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/i);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0));
  const extension = match[1].split("/")[1].replace("jpeg", "jpg");
  return new File([bytes], `captura-${index}.${extension}`, { type: match[1] });
}

async function uploadClipboardImage(file) {
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("La captura no puede superar los 12 MB.");
  }

  const response = await fetch("/api/documentos/imagen", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo guardar la captura.");
  return result.url;
}

export function DocumentFormattingToolbar({ editor, applyFontToAllWhenSelectionEmpty = false }) {
  if (!editor) return null;

  const applyFontFamily = (fontFamily) => {
    const chain = editor.chain().focus();
    if (applyFontToAllWhenSelectionEmpty && editor.state.selection.empty && editor.getText().trim()) {
      chain.selectAll();
    }
    chain.setFontFamily(fontFamily).run();
  };

  const applyLink = () => {
    const href = window.prompt("Dirección del enlace:");
    if (/^(https:\/\/|mailto:|\/document-assets\/)/i.test(href || "")) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
  };

  const insertImage = () => {
    const src = window.prompt("URL de la imagen o ruta local /document-assets/:");
    if (/^(https:\/\/|\/document-assets\/)/i.test(src || "")) {
      editor.chain().focus().setImage({ src, alt: "Imagen del documento" }).run();
    }
  };

  const formatButton = (label, title, command, active = false) => (
    <button
      className={`document-format-button${active ? " is-active" : ""}`}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={() => command()}
    >
      {label}
    </button>
  );

  return (
    <div className="document-format-toolbar" role="toolbar" aria-label="Formato del documento">
      {formatButton("↶", "Deshacer", () => editor.chain().focus().undo().run())}
      {formatButton("↷", "Rehacer", () => editor.chain().focus().redo().run())}
      <span className="document-format-divider" />
      <select aria-label="Fuente" title="Fuente" defaultValue="" onChange={(event) => event.target.value && applyFontFamily(event.target.value)}>
        <option value="" disabled>Fuente</option>
        <option value="Lexend" style={{ fontFamily: "Lexend, sans-serif" }}>Lexend</option>
        <option value="Arial">Arial</option>
        <option value="Georgia">Georgia</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Verdana">Verdana</option>
        <option value="monospace">Monoespaciada</option>
      </select>
      <select aria-label="Tamaño de fuente" title="Tamaño de fuente" defaultValue="" onChange={(event) => event.target.value && editor.chain().focus().setFontSize(event.target.value).run()}>
        <option value="" disabled>Tamaño</option>
        {["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px"].map((size) => <option key={size} value={size}>{size.replace("px", "")}</option>)}
      </select>
      <span className="document-format-divider" />
      {formatButton("B", "Negrita", () => editor.chain().focus().toggleBold().run(), editor.isActive("bold"))}
      {formatButton("I", "Cursiva", () => editor.chain().focus().toggleItalic().run(), editor.isActive("italic"))}
      {formatButton("U", "Subrayado", () => editor.chain().focus().toggleUnderline().run(), editor.isActive("underline"))}
      {formatButton("S", "Tachado", () => editor.chain().focus().toggleStrike().run(), editor.isActive("strike"))}
      <select aria-label="Paleta de color del texto" title="Paleta de color del texto" defaultValue="" onChange={(event) => event.target.value && editor.chain().focus().setColor(event.target.value).run()}>
        <option value="" disabled>Color</option>
        <option value="#172b4d">Azul oscuro</option>
        <option value="#c91021">Rojo</option>
        <option value="#176b45">Verde</option>
        <option value="#111111">Negro</option>
      </select>
      <label className="document-format-color" title="Color del texto">
        A<input type="color" aria-label="Color personalizado del texto" onChange={(event) => editor.chain().focus().setColor(event.target.value).run()} />
      </label>
      <select aria-label="Paleta de resaltado" title="Paleta de resaltado" defaultValue="" onChange={(event) => event.target.value && editor.chain().focus().toggleHighlight({ color: event.target.value }).run()}>
        <option value="" disabled>Resaltar</option>
        <option value="#fff2a8">Amarillo</option>
        <option value="#cdebd6">Verde claro</option>
        <option value="#d9eaff">Azul claro</option>
        <option value="#ffd9dd">Rosa claro</option>
      </select>
      <label className="document-format-color document-format-highlight" title="Resaltar texto">
        ▰<input type="color" aria-label="Color personalizado de resaltado" onChange={(event) => editor.chain().focus().toggleHighlight({ color: event.target.value }).run()} />
      </label>
      <span className="document-format-divider" />
      {formatButton("H1", "Título 1", () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive("heading", { level: 1 }))}
      {formatButton("H2", "Título 2", () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive("heading", { level: 2 }))}
      {formatButton("¶", "Párrafo", () => editor.chain().focus().setParagraph().run(), editor.isActive("paragraph"))}
      {formatButton("≡", "Alinear a la izquierda", () => editor.chain().focus().setTextAlign("left").run(), editor.isActive({ textAlign: "left" }))}
      {formatButton("☷", "Centrar", () => editor.chain().focus().setTextAlign("center").run(), editor.isActive({ textAlign: "center" }))}
      {formatButton("☰", "Alinear a la derecha", () => editor.chain().focus().setTextAlign("right").run(), editor.isActive({ textAlign: "right" }))}
      {formatButton("• Lista", "Lista con viñetas", () => editor.chain().focus().toggleBulletList().run(), editor.isActive("bulletList"))}
      {formatButton("1. Lista", "Lista numerada", () => editor.chain().focus().toggleOrderedList().run(), editor.isActive("orderedList"))}
      {formatButton("↗", "Insertar enlace", applyLink)}
      {formatButton("▧", "Insertar imagen", insertImage)}
    </div>
  );
}

export default function DocumentRichEditor({ document, category, content, getBrandStyles, getDocumentRoute, Header, NavigationLinks, slugifyDocumentTitle }) {
  const [draft, setDraft] = useState(() => ({ ...document, content: documentoAHtml(document.content) }));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
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
    content: draft.content,
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Contenido completo del documento" },
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const parsedHtml = new DOMParser().parseFromString(clipboard.getData("text/html") || "", "text/html");
        const inlineImages = [...parsedHtml.body.querySelectorAll("img[src^='data:image/']")];
        const clipboardFiles = inlineImages.length
          ? []
          : [...new Set([
            ...[...(clipboard.items || [])]
              .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
              .map((item) => item.getAsFile()),
            ...[...(clipboard.files || [])],
          ].filter(Boolean))];
        if (!inlineImages.length && !clipboardFiles.length) return false;

        event.preventDefault();
        const plainText = clipboard.getData("text/plain");
        if (!parsedHtml.body.childNodes.length && plainText) {
          const paragraph = parsedHtml.createElement("p");
          paragraph.textContent = plainText;
          parsedHtml.body.append(paragraph);
        }
        setStatus("Guardando captura pegada...");

        void (async () => {
          if (inlineImages.length) {
            for (const [index, image] of inlineImages.entries()) {
              const file = fileFromClipboardDataUrl(image.getAttribute("src") || "", index + 1);
              if (file) image.setAttribute("src", await uploadClipboardImage(file));
            }
          } else {
            const htmlImages = [...parsedHtml.body.querySelectorAll("img")];
            for (const [index, file] of clipboardFiles.entries()) {
              const imageUrl = await uploadClipboardImage(file);
              const image = htmlImages[index];
              if (image) {
                image.setAttribute("src", imageUrl);
                if (!image.getAttribute("alt")) image.setAttribute("alt", `Captura pegada ${index + 1}`);
              } else {
                const pastedImage = parsedHtml.createElement("img");
                pastedImage.setAttribute("src", imageUrl);
                pastedImage.setAttribute("alt", `Captura pegada ${index + 1}`);
                parsedHtml.body.append(pastedImage);
              }
            }
          }

          if (!view.isDestroyed) {
            const safeHtml = DOMPurify.sanitize(parsedHtml.body.innerHTML);
            const sanitizedDocument = new DOMParser().parseFromString(safeHtml, "text/html");
            const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(sanitizedDocument.body);
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            setStatus("Captura pegada. Guardá el documento para conservarla.");
          }
        })().catch((error) => setStatus(error.message || "No se pudo pegar la captura."));
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => setDraft((current) => ({ ...current, content: currentEditor.getHTML() })),
  });

  const saveDocument = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const updatedContent = {
        ...content,
        categories: content.categories.map((item) => item.target !== category.target
          ? item
          : {
            ...item,
            documents: item.documents.map((itemDocument) => slugifyDocumentTitle(itemDocument.title) === slugifyDocumentTitle(document.title)
              ? { ...draft, content: DOMPurify.sanitize(editor?.getHTML() || draft.content) }
              : itemDocument),
          }),
      };
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedContent),
      });
      if (!response.ok) throw new Error("No se pudo guardar el documento.");
      setStatus("Cambios guardados.");
    } catch (error) {
      setStatus(error.message || "No se pudo guardar el documento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} />
      <main className="admin-page">
        <div className="admin-form admin-document-editor-page">
          <NavigationLinks admin backHref="/admin/contenido" />
          <div className="admin-document-editor-heading">
            <div>
              <small>{category.title}</small>
              <h1>Editar {draft.title}</h1>
              <p>Aplicá formato, tipografía, colores e imágenes al documento integrado.</p>
            </div>
            <a className="document-preview-return" href={getDocumentRoute(category, draft)} target="_blank" rel="noopener noreferrer">
              Ver vista previa ↗
            </a>
          </div>
          <form className="admin-document-editor-form" onSubmit={saveDocument}>
            <div className="admin-document-editor-actions">
              {status && <p role="status">{status}</p>}
              <button type="submit" disabled={saving || !editor}>{saving ? "Guardando..." : "Guardar documento"}</button>
            </div>
            <div className="admin-document-metadata">
              <label>
                Icono
                <input value={draft.icon || ""} onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))} />
              </label>
              <label>
                Título
                <input value={draft.title || ""} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required />
              </label>
              <label>
                Enlace original
                <input type="url" value={draft.url || ""} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
              </label>
            </div>
            <div className="admin-document-markdown-field">
              <label>Contenido del documento</label>
              <DocumentFormattingToolbar editor={editor} />
              <div className="document-rich-editor"><EditorContent editor={editor} /></div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
