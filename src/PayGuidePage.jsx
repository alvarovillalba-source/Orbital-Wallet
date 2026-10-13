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
import { useSharedPolling } from "./useSharedPolling";

export default function PayGuidePage({ guideId, edit, create = false, isAdmin, content, getBrandStyles, Header }) {
  const [guide, setGuide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [importUrlValue, setImportUrlValue] = useState("");
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
    if (create) {
      const id = globalThis.crypto?.randomUUID?.() || `guia-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setGuide({ id, title: "", kind: "Documentación", description: "", steps: [], content: "" });
      if (editor) editor.commands.clearContent(false);
      setLoading(false);
      return;
    }
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
  }, [guideId, edit, create, editor]);
  useSharedPolling(async () => {
    const response = await fetch("/api/pay/guias", { cache: "no-cache" });
    if (!response.ok) return;
    const list = await response.json();
    const latest = (Array.isArray(list) ? list : []).find((item) => String(item.id) === guideId);
    if (latest) setGuide(latest);
  }, !edit, 15000);

  const save = async (event) => {
    event.preventDefault();
    if (!isAdmin || !guide || !editor) return;
    setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/pay/guias", { cache: "no-cache" });
      if (!response.ok) throw new Error("No se pudo leer la lista compartida de guías.");
      const guides = await response.json();
      const savedGuide = { ...guide, title: guide.title.trim(), kind: guide.kind.trim() || "Documentación", description: guide.description.trim(), content: DOMPurify.sanitize(editor.getHTML()), updatedAt: new Date().toISOString() };
      const updated = create ? [...guides.filter((item) => item.id !== guide.id), savedGuide] : guides.map((item) => item.id === guide.id ? savedGuide : item);
      const result = await fetch("/api/pay/guias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
      if (!result.ok) throw new Error((await result.json()).error || "No se pudo guardar el documento.");
      setGuide(savedGuide);
      setStatus(create ? "Guía creada y publicada para todo el equipo." : "Documento guardado.");
      if (create) window.location.assign(`/admin/pay/guia/${encodeURIComponent(guide.id)}/editar`);
    } catch (error) { setStatus(error.message); }
    finally { setSaving(false); }
  };

  const importUrl = async () => {
    const url = importUrlValue.trim();
    if (!url || !isAdmin) return;
    setSaving(true); setStatus("Importando documento desde la URL…");
    try {
      const response = await fetch("/api/pay/guia-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const imported = await response.json();
      if (!response.ok) throw new Error(imported.error || "No se pudo importar la URL.");
      setGuide((current) => ({ ...current, title: imported.title || current.title, kind: imported.kind || current.kind, description: imported.description || current.description, steps: imported.steps || [], sourceUrl: imported.sourceUrl || url }));
      editor?.commands.setContent(DOMPurify.sanitize(imported.content || ""), false);
      setStatus(`Contenido importado${imported.imageCount ? ` · ${imported.imageCount} imágenes` : ""}. Revisalo y guardá la guía.`);
    } catch (error) { setStatus(error.message); }
    finally { setSaving(false); }
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !isAdmin) return;
    setSaving(true); setStatus("Importando archivo…");
    try {
      const response = await fetch("/api/pay/guia-archivo", { method: "POST", headers: { "X-File-Name": encodeURIComponent(file.name) }, body: file });
      const attachment = await response.json();
      if (!response.ok) throw new Error(attachment.error || "No se pudo importar el archivo.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (["txt", "md", "html", "htm"].includes(extension)) {
        const source = await file.text();
        const importedContent = ["html", "htm"].includes(extension) ? DOMPurify.sanitize(source) : `<p>${source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("</p><p>")}</p>`;
        editor?.commands.setContent(importedContent, false);
        setGuide((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ""), attachment, sourceUrl: undefined }));
        setStatus("Contenido importado al editor y archivo original adjuntado. Revisalo y guardá la guía.");
      } else {
        setGuide((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ""), attachment }));
        setStatus("Archivo adjuntado. Podés completar el contenido editable de la guía antes de guardarla.");
      }
    } catch (error) { setStatus(error.message); }
    finally { setSaving(false); event.target.value = ""; }
  };

  const guideBase = isAdmin ? "/admin/pay/guia" : "/orbital-pay/guia";
  const backHref = isAdmin ? "/admin/pay/reportes#documentacion" : "/orbital-pay#documentacion";
  return <div className="app" style={getBrandStyles(content)}>
    <Header content={content} />
    <main className="pay-guide-page">
      <nav className="pay-guide-page-nav"><a className="pay-guide-back-link" href={backHref}><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span>Volver a Guías de Orbital Pay</a>{edit && !create && <a href={`${guideBase}/${encodeURIComponent(guideId)}`}>Ver vista previa <span aria-hidden="true">↗</span></a>}</nav>
      {loading ? <p className="pay-guide-page-status">Cargando documento…</p> : !guide ? <p className="pay-guide-page-status" role="alert">{status || "No se encontró el documento."}</p> : edit ? (
        <form className="pay-guide-editor-page" onSubmit={save}>
          <div className="pay-guide-page-heading"><span className="pay-kicker">{guide.kind}</span><h1>{create ? "Crear guía" : `Editar ${guide.title}`}</h1><p>Aplicá formato, tipografías, colores e imágenes al documento integrado.</p><button type="submit" disabled={saving}>{saving ? "Guardando…" : create ? "Crear y publicar guía" : "Guardar documento"}</button></div>
          <label className="pay-guide-editor-title">Título<input value={guide.title} onChange={(event) => setGuide((current) => ({ ...current, title: event.target.value }))} required /></label>
          <div className="pay-guide-metadata-grid"><label>Tipo de documento<select value={guide.kind} onChange={(event) => setGuide((current) => ({ ...current, kind: event.target.value }))}>{["Documentación", "Manual", "Procedimiento", "Proceso", "Política", "Plantilla"].map((kind) => <option key={kind}>{kind}</option>)}</select></label><label>Descripción<textarea rows="2" maxLength="5000" value={guide.description} onChange={(event) => setGuide((current) => ({ ...current, description: event.target.value }))} placeholder="Resumen breve para mostrar en el listado de guías" /></label></div>
          {create && <section className="pay-guide-import-panel"><div><strong>Importar documento</strong><p>Traé contenido desde una página pública o adjuntá un archivo. Los archivos de texto y HTML se cargan también en el editor.</p></div><div className="pay-guide-import-url"><label>URL del documento<input name="guide-url" type="url" value={importUrlValue} onChange={(event) => setImportUrlValue(event.target.value)} placeholder="https://…" /></label><button type="button" onClick={importUrl} disabled={saving}>Importar URL</button></div><label className="pay-guide-import-file">O seleccionar archivo<input type="file" accept=".pdf,.doc,.docx,.txt,.md,.html,.htm" onChange={importFile} disabled={saving} /><small>PDF, Word, TXT, Markdown o HTML · máximo 20 MB</small></label></section>}
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
            {isAdmin && <a className="pay-guide-edit-link" href={`${guideBase}/${encodeURIComponent(guideId)}/editar`}>Modificar documento</a>}
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
