import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color } from "@tiptap/extension-color";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { TextAlign } from "@tiptap/extension-text-align";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import DOMPurify from "dompurify";
import { documentoAHtml } from "./documentContent";
import { DocumentFormattingToolbar } from "./DocumentRichEditor";

export default function PayGuidePage({ guideId, edit, isAdmin, content, getBrandStyles, Header }) {
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } } }),
      TextStyle, Color, FontFamily, FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: false }), Highlight.configure({ multicolor: true }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: { attributes: { "aria-label": "Contenido de la guía Orbital Pay" } },
  });

  useEffect(() => {
    let active = true;
    fetch("/api/pay/guias", { cache: "no-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar la guía.");
      const list = await response.json();
      const found = (Array.isArray(list) ? list : []).find((item) => String(item.id) === guideId);
      if (!found) throw new Error("No se encontró el documento solicitado.");
      if (!active) return;
      setGuide(found);
      if (editor && edit) editor.commands.setContent(documentoAHtml(found.content || ""), false);
    }).catch((error) => { if (active) setStatus(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [guideId, edit, editor]);

  const save = async (event) => {
    event.preventDefault();
    if (!isAdmin || !guide || !editor) return;
    setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/pay/guias", { cache: "no-cache" });
      if (!response.ok) throw new Error("No se pudo leer la lista compartida de guías.");
      const guides = await response.json();
      const updated = guides.map((item) => item.id === guide.id ? { ...item, title: guide.title.trim() || item.title, content: DOMPurify.sanitize(editor.getHTML()), updatedAt: new Date().toISOString() } : item);
      const result = await fetch("/api/pay/guias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
      if (!result.ok) throw new Error((await result.json()).error || "No se pudo guardar el documento.");
      setGuide(updated.find((item) => item.id === guide.id));
      setStatus("Documento guardado.");
    } catch (error) { setStatus(error.message); }
    finally { setSaving(false); }
  };

  const backHref = isAdmin ? "/admin/pay#documentacion" : "/orbital-pay#documentacion";
  return <div className="app" style={getBrandStyles(content)}>
    <Header content={content} />
    <main className="pay-guide-page">
      <nav className="pay-guide-page-nav"><a href={backHref}>← Volver a Guías de Orbital Pay</a>{edit && <a href={`/orbital-pay/guia/${encodeURIComponent(guideId)}`}>Ver vista previa ↗</a>}</nav>
      {loading ? <p className="pay-guide-page-status">Cargando documento…</p> : !guide ? <p className="pay-guide-page-status" role="alert">{status || "No se encontró el documento."}</p> : edit ? (
        <form className="pay-guide-editor-page" onSubmit={save}>
          <div className="pay-guide-page-heading"><span className="pay-kicker">{guide.kind}</span><h1>Editar {guide.title}</h1><p>Aplicá formato, tipografías, colores e imágenes al documento integrado.</p><button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar documento"}</button></div>
          <label className="pay-guide-editor-title">Título<input value={guide.title} onChange={(event) => setGuide((current) => ({ ...current, title: event.target.value }))} required /></label>
          <div className="pay-guide-editor-label">Contenido del documento</div>
          <DocumentFormattingToolbar editor={editor} applyFontToAllWhenSelectionEmpty />
          <div className="pay-guide-editor-surface"><EditorContent editor={editor} /></div>
          {guide.sourceUrl && <a className="pay-guide-attachment" href={guide.sourceUrl} target="_blank" rel="noreferrer">↗ Ver fuente original</a>}
          {guide.attachment && <a className="pay-guide-attachment" href={guide.attachment.url} target="_blank" rel="noreferrer">📎 Abrir documento importado · {guide.attachment.name}</a>}
          {status && <p className="pay-guide-page-status" role="status">{status}</p>}
        </form>
      ) : (
        <article className="pay-guide-reader">
          <header className="pay-guide-page-heading"><span className="pay-kicker">{guide.kind}</span><h1>{guide.title}</h1>{guide.description && <p>{guide.description}</p>}
            {isAdmin && <a className="pay-guide-edit-link" href={`/orbital-pay/guia/${encodeURIComponent(guideId)}/editar`}>Modificar documento</a>}
          </header>
          {guide.content ? <div className="pay-guide-reader-content" dangerouslySetInnerHTML={{ __html: documentoAHtml(guide.content) }} /> : <p>Esta guía todavía no tiene contenido.</p>}
          {guide.steps?.length > 0 && <ol className="pay-guide-reader-steps">{guide.steps.map((step, index) => <li key={`${guide.id}-${index}`}>{step}</li>)}</ol>}
          {guide.sourceUrl && <a className="pay-guide-attachment" href={guide.sourceUrl} target="_blank" rel="noreferrer">↗ Ver fuente original</a>}
          {guide.attachment && <a className="pay-guide-attachment" href={guide.attachment.url} target="_blank" rel="noreferrer">📎 Abrir documento importado · {guide.attachment.name}</a>}
        </article>
      )}
    </main>
  </div>;
}
