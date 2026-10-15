import { useEffect, useRef, useState } from "react";

export default function AdminStudioPage({ content, getBrandStyles, Header, onSaveContent }) {
  const frameRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sendOptions = () => frameRef.current?.contentWindow?.postMessage({
      type: "orbital-studio-options",
      categories: (content.categories || []).map(({ target, title }) => ({ target, title })),
    }, "*");
    const receive = async (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data || {};
      if (data.type === "orbital-studio-ready" || data.type === "orbital-studio-request-options") {
        sendOptions();
        return;
      }
      if (data.type === "orbital-studio-import-url") {
        if (busy) return;
        setBusy(true);
        try {
          const response = await fetch("/api/pay/guia-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: data.url }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "No se pudo importar esa URL.");
          frameRef.current?.contentWindow?.postMessage({ type: "orbital-studio-url-result", ok: true, ...result }, "*");
        } catch (error) {
          frameRef.current?.contentWindow?.postMessage({ type: "orbital-studio-url-result", ok: false, message: error.message || "No se pudo importar esa URL." }, "*");
        } finally { setBusy(false); }
        return;
      }
      if (data.type !== "orbital-studio-publish" || busy) return;
      setBusy(true);
      try {
        const html = await uploadInlineImages(String(data.html || ""));
        const contentHtml = await uploadInlineImages(String(data.content || ""), true);
        if (!String(data.title || "").trim()) throw new Error("Ingresá el nombre del documento.");
        if (data.destination === "wallet") {
          const imported = await fetch("/api/documentos/importar-individual", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: data.title, categoryTarget: data.categoryTarget, fileName: "orbital-studio.html", content: html, config: content }),
          });
          const result = await imported.json();
          if (!imported.ok) throw new Error(result.error || "No se pudo publicar el documento en Wallet.");
          await onSaveContent(result.config);
          frameRef.current?.contentWindow?.postMessage({ type: "orbital-studio-publish-result", ok: true, message: `“${data.title}” se agregó a Wallet · ${result.category}.` }, "*");
        } else if (data.destination === "pay") {
          const listed = await fetch("/api/pay/guias", { cache: "no-cache" });
          if (!listed.ok) throw new Error("No se pudo cargar la lista de guías de Pay.");
          const guides = await listed.json();
          const guide = { id: crypto.randomUUID(), title: String(data.title).trim(), kind: String(data.kind || "Documentación"), description: String(data.description || ""), steps: [], content: contentHtml, updatedAt: new Date().toISOString() };
          const saved = await fetch("/api/pay/guias", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify([...guides, guide]) });
          const result = await saved.json();
          if (!saved.ok) throw new Error(result.error || "No se pudo publicar la guía en Pay.");
          frameRef.current?.contentWindow?.postMessage({ type: "orbital-studio-publish-result", ok: true, message: `“${data.title}” se agregó a Orbital Pay.` }, "*");
        } else throw new Error("Elegí Orbital Wallet o Orbital Pay como destino.");
      } catch (error) {
        frameRef.current?.contentWindow?.postMessage({ type: "orbital-studio-publish-result", ok: false, message: error.message || "No se pudo publicar el documento." }, "*");
      } finally { setBusy(false); }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [content, onSaveContent, busy]);

  return (
    <div className="app admin-studio-app" style={getBrandStyles(content)}>
      <Header content={{ ...content, headerSubtitle: "Orbital Studio · Constructor de guías" }} />
      <main className="admin-studio-page">
        <nav className="pay-nav wallet-module-nav">
          <a className="module-switch-link" href="/admin">
            <span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span>
            <span>Volver al selector de módulos</span>
          </a>
          <span>ADMINISTRACIÓN / ORBITAL STUDIO</span>
        </nav>
        <iframe
          ref={frameRef}
          className="admin-studio-frame"
          title="Orbital Studio · Constructor de guías"
          src="/orbital-studio.html"
          onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "orbital-studio-options", categories: (content.categories || []).map(({ target, title }) => ({ target, title })) }, "*")}
          sandbox="allow-scripts allow-forms allow-downloads allow-modals"
        />
        {busy && <div className="admin-studio-saving" role="status">Publicando documento en el módulo elegido…</div>}
      </main>
    </div>
  );
}

async function uploadInlineImages(html, fragment = false) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const image of parsed.querySelectorAll("img[src^='data:image/']")) {
    const response = await fetch(image.src);
    const file = await response.blob();
    if (file.size > 12 * 1024 * 1024) throw new Error(`La imagen ${image.alt || "sin nombre"} supera 12 MB.`);
    const uploaded = await fetch("/api/documentos/imagen", { method: "POST", headers: { "Content-Type": file.type }, body: file });
    const result = await uploaded.json();
    if (!uploaded.ok) throw new Error(result.error || "No se pudo guardar una imagen.");
    image.src = result.url;
  }
  return fragment ? parsed.body.innerHTML : `<!doctype html>\n${parsed.documentElement.outerHTML}`;
}
