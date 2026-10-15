import { useEffect, useRef, useState } from "react";
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

function ImportedHtmlPreview({ html, title }) {
  const frameRef = useRef(null);
  const applyTheme = () => {
    try {
      const document = frameRef.current?.contentDocument;
      if (!document) return;
      const light = window.parent.document.documentElement.dataset.theme === "light";
      document.documentElement.dataset.orbitalTheme = light ? "light" : "dark";
      let themeStyle = document.getElementById("orbital-imported-theme-overrides");
      if (!themeStyle) {
        themeStyle = document.createElement("style");
        themeStyle.id = "orbital-imported-theme-overrides";
        document.head.appendChild(themeStyle);
      }
      const widthStyles = `.wrap{width:100%!important;max-width:none!important;padding-left:clamp(20px,3vw,64px)!important;padding-right:clamp(20px,3vw,64px)!important}.content{width:100%!important;max-width:none!important;padding-left:clamp(20px,3vw,64px)!important;padding-right:clamp(20px,3vw,64px)!important}`;
      themeStyle.textContent = widthStyles + (light ? `:root[data-orbital-theme="light"]{color-scheme:light;--bg:#f0ede7;--panel:#fbfaf7;--panel2:#ece8e1;--line:#d8d1c7;--text:#25364a;--muted:#667589;--soft:#f2e5e7}body{background:#f0ede7!important;color:#25364a!important}.sidebar,aside{background:linear-gradient(180deg,#f7f4ef,#eae5dd)!important;border-color:#d8d1c7!important}.sidebar a{color:#344860!important}.sidebar a:hover,.sidebar a.active{background:#eadfe1!important;color:#922d43!important}.topbar,header.topbar{background:#fbfaf7f2!important;border-color:#d8d1c7!important;color:#52647a!important}.intro,.topic,article,.card,.side-note,.shot,.content-card,section.topic{background:#fff!important;border-color:#d8d1c7!important;color:#25364a!important;box-shadow:0 8px 24px #53473512!important}.intro h1,.topic h1,.topic h2,.topic h3,.topic h4,.content-card h1,.content-card h2,.content-card h3{color:#25364a!important}.intro p,.topic p,.topic li,.content-card,.side-note,footer,figcaption{color:#42546b!important}.note{background:#f7e9e8!important;border-color:#c73350!important;color:#4a3540!important}.toolbar button,.topbar button{background:#fff!important;border-color:#d2c8bd!important;color:#344860!important}.toolbar button.primary,.topbar button.primary{background:#c73350!important;border-color:#c73350!important;color:#fff!important}.content-card th,.content-card td{border-color:#d8d1c7!important}.shot img,.topic img{background:#f1eee8!important}a{color:#a9274c}` : "");
    } catch { /* La vista conserva el documento si el navegador no permite acceder al iframe. */ }
  };
  const sanitizedHtml = String(html || "")
    .replace(/<a\b[^>]*>[\s\S]*?\b(?:editar|edit)\b[\s\S]*?<\/a\s*>/gi, "")
    .replace(/<(button|input|textarea|select)\b[^>]*>[\s\S]*?\b(?:editar|edit)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<button\b[^>]*>(?:(?!<\/button>)[\s\S]){0,1000}?(?:guardar(?:\s+una)?\s+copia|imprimir(?:\s*\/\s*pdf)?|save\s+copy|print)(?:(?!<\/button>)[\s\S]){0,1000}?<\/button>/gi, "")
    .replace(/\scontenteditable(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
  // Preserve <html>/<head>/<style>: DOMPurify's body-fragment mode drops the
  // imported document's head stylesheet, leaving the iframe in browser defaults.
  const readerHtml = DOMPurify.sanitize(sanitizedHtml, { WHOLE_DOCUMENT: true });
  const handleLoad = (event) => {
    const frame = event.currentTarget;
    try {
      const document = frame.contentDocument;
      if (!document) return;
      applyTheme();
      const updateHeight = () => {
        frame.style.height = `${Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, 720)}px`;
      };
      updateHeight();
      const observer = new ResizeObserver(updateHeight);
      observer.observe(document.documentElement);
      frame._heightObserver?.disconnect();
      frame._heightObserver = observer;
    } catch { /* El documento permanece navegable con su propia barra de desplazamiento. */ }
  };

  useEffect(() => {
    const observer = new MutationObserver(applyTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
      frameRef.current?._heightObserver?.disconnect();
    };
  }, []);
  return <div className="pay-guide-html-frame"><iframe ref={frameRef} title={`Documento HTML: ${title}`} sandbox="allow-same-origin" srcDoc={readerHtml} onLoad={handleLoad} /></div>;
}

function findWalletHtmlDocument(siteContent, title) {
  const normalizedTitle = String(title || "").trim().toLocaleLowerCase();
  if (!normalizedTitle) return "";
  const documents = (siteContent?.categories || []).flatMap((category) => category.documents || []);
  return documents.find((document) => String(document.title || "").trim().toLocaleLowerCase() === normalizedTitle && /<!doctype\s+html|<html\b/i.test(document.content || ""))?.content || "";
}

function mergeTopicsIntoHtmlDocument(template, content) {
  const source = new DOMParser().parseFromString(template, "text/html");
  const container = source.querySelector(".wrap");
  const existingTopics = [...(container?.querySelectorAll(":scope > .topic") || [])];
  if (!container || !existingTopics.length) return DOMPurify.sanitize(template);
  existingTopics.forEach((topic) => topic.remove());

  const edited = new DOMParser().parseFromString(`<body>${DOMPurify.sanitize(content)}</body>`, "text/html");
  const topics = [];
  let currentTopic = null;
  for (const node of [...edited.body.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE && /^H[12]$/.test(node.tagName)) {
      currentTopic = source.createElement("section");
      currentTopic.className = "topic";
      currentTopic.id = `sec${topics.length}`;
      topics.push(currentTopic);
    }
    if (!currentTopic) {
      currentTopic = source.createElement("section");
      currentTopic.className = "topic";
      currentTopic.id = `sec${topics.length}`;
      topics.push(currentTopic);
    }
    currentTopic.append(source.importNode(node, true));
  }

  const footer = container.querySelector(":scope > footer");
  topics.forEach((topic) => container.insertBefore(topic, footer));
  return DOMPurify.sanitize(`<!doctype html>${source.documentElement.outerHTML}`, { WHOLE_DOCUMENT: true });
}

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
      const fullHtmlDocument = found.htmlDocument || findWalletHtmlDocument(content, found.title);
      setGuide(fullHtmlDocument ? { ...found, htmlDocument: fullHtmlDocument } : found);
      if (editor && edit) editor.commands.setContent(documentoAHtml(found.content || ""), false);
    }).catch((error) => { if (active) setStatus(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [guideId, edit, create, editor, content]);
  useSharedPolling(async () => {
    const response = await fetch("/api/pay/guias", { cache: "no-cache" });
    if (!response.ok) return;
    const list = await response.json();
    const latest = (Array.isArray(list) ? list : []).find((item) => String(item.id) === guideId);
    if (latest) setGuide((current) => {
      const fullHtmlDocument = latest.htmlDocument || current?.htmlDocument || findWalletHtmlDocument(content, latest.title);
      return fullHtmlDocument ? { ...latest, htmlDocument: fullHtmlDocument } : latest;
    });
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
      const htmlTemplate = savedGuide.htmlDocument || findWalletHtmlDocument(content, savedGuide.title);
      if (htmlTemplate) {
        savedGuide.htmlDocument = mergeTopicsIntoHtmlDocument(htmlTemplate, savedGuide.content);
      }
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
      setGuide((current) => ({ ...current, title: imported.title || current.title, kind: imported.kind || current.kind, description: imported.description || current.description, steps: imported.steps || [], sourceUrl: imported.sourceUrl || url, htmlDocument: imported.htmlDocument || "" }));
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
        setGuide((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ""), attachment, sourceUrl: undefined, htmlDocument: ["html", "htm"].includes(extension) && source.length <= 2 * 1024 * 1024 ? DOMPurify.sanitize(source, { WHOLE_DOCUMENT: true }) : "" }));
        setStatus("Contenido importado al editor y archivo original adjuntado. Revisalo y guardá la guía.");
      } else {
        setGuide((current) => ({ ...current, title: current.title || file.name.replace(/\.[^.]+$/, ""), attachment }));
        setStatus("Archivo adjuntado. Podés completar el contenido editable de la guía antes de guardarla.");
      }
    } catch (error) { setStatus(error.message); }
    finally { setSaving(false); event.target.value = ""; }
  };

  const guideBase = isAdmin ? "/admin/pay/guia" : "/orbital-pay/guia";
  const walletHtmlDocument = guide && findWalletHtmlDocument(content, guide.title);
  const fullHtmlDocument = guide?.htmlDocument || walletHtmlDocument;
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
          {fullHtmlDocument ? <ImportedHtmlPreview html={fullHtmlDocument} title={guide.title} /> : guide.content ? <div className="pay-guide-reader-content" dangerouslySetInnerHTML={{ __html: documentoAHtml(guide.content) }} /> : <p>Esta guía todavía no tiene contenido.</p>}
          {guide.steps?.length > 0 && <ol className="pay-guide-reader-steps">{guide.steps.map((step, index) => <li key={`${guide.id}-${index}`}>{step}</li>)}</ol>}
          {guide.sourceUrl && <a className="pay-guide-attachment" href={guide.sourceUrl} target="_blank" rel="noreferrer">↗ Ver fuente original</a>}
          {guide.attachment && <a className="pay-guide-attachment" href={guide.attachment.url} target="_blank" rel="noreferrer">📎 Abrir documento importado · {guide.attachment.name}</a>}
        </article>
      )}
    </main>
  </div>;
}
