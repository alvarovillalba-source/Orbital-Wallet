import { useEffect, useMemo, useRef, useState } from "react";

function editableHtml(source) {
  let cleaned = String(source || "")
    .replace(/<a\b(?=[^>]*>)[^>]*>[\s\S]*?\b(?:editar|edit)\b[\s\S]*?<\/a\s*>/gi, "")
    .replace(/<(button|input|textarea|select)\b[^>]*>[\s\S]*?\b(?:editar|edit)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<button\b[^>]*>(?:(?!<\/button>)[\s\S]){0,1000}?(?:guardar(?:\s+una)?\s+copia|imprimir(?:\s*\/\s*pdf)?|save\s+copy|print)(?:(?!<\/button>)[\s\S]){0,1000}?<\/button>/gi, "")
    .replace(/\scontenteditable(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .replace(/Podés editar los textos directamente desde el navegador\./gi, "Podés editar el contenido desde este panel.");
  if (!/<html\b/i.test(cleaned)) cleaned = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;line-height:1.6;padding:24px;max-width:1200px;margin:auto}img{max-width:100%;height:auto}</style></head><body>${cleaned}</body></html>`;
  const editorScript = `<script id="orbital-admin-editor">
(function(){
  var activeImage=null, lastEditable=null, savedRange=null, timer, imageDrag=null;
  var editorStyle=document.createElement('style');editorStyle.id='orbital-admin-editor-style';editorStyle.textContent='[contenteditable="true"]:hover{outline:1px dashed #ed1b2f;outline-offset:2px;cursor:text}img:hover{outline:2px solid #ed1b2f;outline-offset:2px;cursor:grab}.orbital-image-moving{cursor:grabbing!important}';document.head.appendChild(editorStyle);
  document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,figcaption,td,th,.note,aside,.intro .eyebrow,label,summary,blockquote,dt,dd,caption,pre').forEach(function(node){node.setAttribute('contenteditable','true');});
  function rememberSelection(){var selection=window.getSelection();if(selection&&selection.rangeCount&&lastEditable&&lastEditable.contains(selection.anchorNode))savedRange=selection.getRangeAt(0).cloneRange();}
  function report(){parent.postMessage({type:'orbital-html-changed',html:'<!doctype html>\\n'+document.documentElement.outerHTML},'*');}
  function getImageOffset(image){var parts=(image.style.translate||'').trim().split(/\\s+/);return{x:parseFloat(parts[0])||0,y:parseFloat(parts[1]||parts[0])||0};}
  function reportImage(){if(!activeImage)return;var style=getComputedStyle(activeImage),parentWidth=activeImage.parentElement&&activeImage.parentElement.getBoundingClientRect().width||activeImage.getBoundingClientRect().width,offset=getImageOffset(activeImage);parent.postMessage({type:'orbital-image-selected',src:activeImage.getAttribute('src')||'',alt:activeImage.getAttribute('alt')||'',width:Math.max(5,Math.min(100,Math.round(activeImage.getBoundingClientRect().width/parentWidth*100))),layout:style.float==='left'?'left':style.float==='right'?'right':style.display==='inline'?'inline':'center',xOffset:offset.x,yOffset:offset.y},'*');}
  document.addEventListener('pointerdown',function(event){if(event.button!==0||event.pointerType==='touch')return;var image=event.target.closest('img');if(!image)return;activeImage=image;var offset=getImageOffset(image);imageDrag={image:image,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:offset.x,y:offset.y,moved:false};try{image.setPointerCapture(event.pointerId);}catch(error){}},true);
  document.addEventListener('pointermove',function(event){if(!imageDrag||event.pointerId!==imageDrag.pointerId)return;var dx=event.clientX-imageDrag.startX,dy=event.clientY-imageDrag.startY;if(!imageDrag.moved&&Math.hypot(dx,dy)<4)return;imageDrag.moved=true;event.preventDefault();imageDrag.image.classList.add('orbital-image-moving');imageDrag.image.style.translate=(imageDrag.x+dx)+'px '+(imageDrag.y+dy)+'px';},{capture:true,passive:false});
  document.addEventListener('pointerup',function(event){if(!imageDrag||event.pointerId!==imageDrag.pointerId)return;var moved=imageDrag.moved;imageDrag.image.classList.remove('orbital-image-moving');imageDrag=null;if(moved){reportImage();report();}},true);
  document.addEventListener('focusin',function(event){if(event.target.isContentEditable){lastEditable=event.target;activeImage=null;parent.postMessage({type:'orbital-image-selected',src:'',alt:''},'*');}},true);
  document.addEventListener('mouseup',rememberSelection,true);document.addEventListener('keyup',rememberSelection,true);document.addEventListener('selectionchange',rememberSelection);
  document.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(report,500);},true);
  document.addEventListener('click',function(event){
    var image=event.target.closest('img');
    if(image){event.preventDefault();event.stopPropagation();activeImage=image;reportImage();return;}
    if(event.target.isContentEditable){activeImage=null;lastEditable=event.target;parent.postMessage({type:'orbital-image-selected',src:'',alt:''},'*');}
    if(event.target.closest('a'))event.preventDefault();
  },true);
  window.addEventListener('message',function(event){
    var data=event.data||{};
    if(data.type==='orbital-format-text'&&lastEditable){lastEditable.focus();var selection=window.getSelection();selection.removeAllRanges();if(savedRange)selection.addRange(savedRange);if(data.command==='lineHeight'){var lineBlock=selection.anchorNode&&selection.anchorNode.parentElement&&selection.anchorNode.parentElement.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,div');if(lineBlock)lineBlock.style.lineHeight=data.value;}else{document.execCommand('styleWithCSS',false,true);if(data.command==='formatBlock')document.execCommand('formatBlock',false,data.value);else if(data.command==='createLink'){if(data.value)document.execCommand('createLink',false,data.value);}else document.execCommand(data.command,false,data.value||null);}rememberSelection();report();}
    if(data.type==='orbital-image-style'&&activeImage){if(data.width)activeImage.style.width=data.width+'%';var offset=getImageOffset(activeImage);if(typeof data.xOffset==='number')offset.x=data.xOffset;if(typeof data.yOffset==='number')offset.y=data.yOffset;if(typeof data.xOffset==='number'||typeof data.yOffset==='number')activeImage.style.translate=offset.x+'px '+offset.y+'px';if(data.layout){activeImage.style.float='';activeImage.style.verticalAlign='';if(data.layout==='left'){activeImage.style.display='block';activeImage.style.float='left';activeImage.style.margin='12px 18px 12px 0';}else if(data.layout==='right'){activeImage.style.display='block';activeImage.style.float='right';activeImage.style.margin='12px 0 12px 18px';}else if(data.layout==='inline'){activeImage.style.display='inline-block';activeImage.style.float='none';activeImage.style.verticalAlign='middle';activeImage.style.margin='0 6px';}else{activeImage.style.display='block';activeImage.style.float='none';activeImage.style.margin='12px auto';}}reportImage();report();}
    if(data.type==='orbital-image-move'&&activeImage){var item=activeImage.closest('figure')||activeImage;var sibling=data.direction<0?item.previousElementSibling:item.nextElementSibling;if(sibling){if(data.direction<0)item.parentNode.insertBefore(item,sibling);else item.parentNode.insertBefore(item,sibling.nextElementSibling);report();}}
    if(data.type==='orbital-replace-image'&&activeImage){activeImage.src=data.src;activeImage.alt=data.alt||activeImage.alt||'Imagen del documento';reportImage();report();}
    if(data.type==='orbital-insert-image'){
      var figure=document.createElement('figure');figure.className='shot';
      var image=document.createElement('img');image.src=data.src;image.alt=data.alt||'Imagen del documento';figure.appendChild(image);
      var target=lastEditable;
      if(target&&target.parentNode)target.parentNode.insertBefore(figure,target.nextSibling);
      else (document.querySelector('.wrap')||document.querySelector('main')||document.body).appendChild(figure);
      activeImage=image;reportImage();report();
    }
    if(data.type==='orbital-delete-image'&&activeImage){var parentNode=activeImage.closest('figure')||activeImage;parentNode.remove();activeImage=null;parent.postMessage({type:'orbital-image-selected',src:'',alt:''},'*');report();}
  });
})();
</script>`;
  if (/<\/body\s*>/i.test(cleaned)) return cleaned.replace(/<\/body\s*>/i, `${editorScript}</body>`);
  return `${cleaned}${editorScript}`;
}

function htmlWithoutEditorTools(html) {
  return String(html || "")
    .replace(/<script\s+id=["']orbital-admin-editor["'][^>]*>[\s\S]*?<\/script>/i, "")
    .replace(/<style\s+id=["']orbital-admin-editor-style["'][^>]*>[\s\S]*?<\/style>/i, "")
    .replace(/<button\b[^>]*>(?:(?!<\/button>)[\s\S]){0,1000}?(?:guardar(?:\s+una)?\s+copia|imprimir(?:\s*\/\s*pdf)?|save\s+copy|print)(?:(?!<\/button>)[\s\S]){0,1000}?<\/button>/gi, "")
    .replace(/\scontenteditable(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "");
}

async function uploadImage(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error("La imagen no puede superar los 12 MB.");
  const response = await fetch("/api/documentos/imagen", { method: "POST", headers: { "Content-Type": file.type }, body: file });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "No se pudo guardar la imagen.");
  return result.url;
}

export default function HtmlDocumentEditor({ document, category, content, getBrandStyles, getDocumentRoute, Header, NavigationLinks, slugifyDocumentTitle, onSaveContent }) {
  const [draft, setDraft] = useState(() => ({ ...document }));
  const [sourceHtml, setSourceHtml] = useState(document.content || "");
  const [htmlDraft, setHtmlDraft] = useState(document.content || "");
  const [selectedImage, setSelectedImage] = useState({ src: "", alt: "" });
  const [imageWidth, setImageWidth] = useState(100);
  const [imageLayout, setImageLayout] = useState("center");
  const [imageXOffset, setImageXOffset] = useState(0);
  const [imageYOffset, setImageYOffset] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(!/<html\b/i.test(document.content || "") && Boolean(document.originalHtmlUrl));
  const [status, setStatus] = useState("");
  const [imageUploadMode, setImageUploadMode] = useState("add");
  const frameRef = useRef(null);
  const fileRef = useRef(null);
  const htmlRef = useRef(document.content || "");
  const preview = useMemo(() => editableHtml(sourceHtml), [sourceHtml]);

  useEffect(() => {
    if (/<html\b/i.test(document.content || "") || !document.originalHtmlUrl) return;
    let active = true;
    fetch(document.originalHtmlUrl).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar la vista original del documento.");
      return response.text();
    }).then((html) => {
      if (!active) return;
      setSourceHtml(html);
      setHtmlDraft(html);
      htmlRef.current = html;
      setSourceLoading(false);
    }).catch((error) => { setStatus(error.message); setSourceLoading(false); });
    return () => { active = false; };
  }, [document.content, document.originalHtmlUrl]);

  useEffect(() => {
    const receive = (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "orbital-html-changed") {
        htmlRef.current = event.data.html;
        setHtmlDraft(event.data.html);
      }
      if (event.data?.type === "orbital-image-selected") {
        setSelectedImage({ src: event.data.src, alt: event.data.alt });
        setImageUrl(event.data.src);
        if (event.data.width) setImageWidth(event.data.width);
        if (event.data.layout) setImageLayout(event.data.layout);
        setImageXOffset(event.data.xOffset || 0);
        setImageYOffset(event.data.yOffset || 0);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const sendToFrame = (message) => frameRef.current?.contentWindow?.postMessage(message, "*");
  const formatText = (command, value) => sendToFrame({ type: "orbital-format-text", command, value });

  const uploadAndApplyImage = async (file, insert = false) => {
    if (!file) return;
    try {
      setStatus("Subiendo imagen…");
      const src = await uploadImage(file);
      if (insert) sendToFrame({ type: "orbital-insert-image", src, alt: file.name.replace(/\.[^.]+$/, "") });
      else {
        setSelectedImage((current) => ({ ...current, src }));
        setImageUrl(src);
        sendToFrame({ type: "orbital-replace-image", src, alt: selectedImage.alt });
      }
      setStatus("Imagen lista. Guardá el documento para publicar los cambios.");
    } catch (error) {
      setStatus(error.message || "No se pudo cargar la imagen.");
    }
  };

  const saveDocument = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 550));
      const html = htmlWithoutEditorTools(htmlRef.current || htmlDraft || document.content);
      const uploaded = await fetch("/api/documentos/guardar-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryTarget: category.target, title: draft.title, html }),
      });
      const result = await uploaded.json();
      if (!uploaded.ok) throw new Error(result.error || "No se pudo guardar el HTML.");
      const updatedContent = {
        ...content,
        categories: content.categories.map((item) => item.target !== category.target ? item : {
          ...item,
          documents: item.documents.map((itemDocument) => slugifyDocumentTitle(itemDocument.title) === slugifyDocumentTitle(document.title)
            ? { ...draft, content: html, originalHtmlUrl: result.originalHtmlUrl }
            : itemDocument),
        }),
      };
      await onSaveContent(updatedContent);
      setDraft((current) => ({ ...current, content: html, originalHtmlUrl: result.originalHtmlUrl }));
      setSourceHtml(html);
      htmlRef.current = html;
      setHtmlDraft(html);
      setStatus("Documento guardado y publicado.");
    } catch (error) {
      setStatus(error.message || "No se pudo guardar el documento.");
    } finally {
      setSaving(false);
    }
  };

  const applyImageUrl = () => {
    if (!/^(https:\/\/|\/document-assets\/)/i.test(imageUrl)) {
      setStatus("Usá una URL HTTPS o una imagen cargada en el sitio.");
      return;
    }
    setSelectedImage((current) => ({ ...current, src: imageUrl }));
    sendToFrame({ type: "orbital-replace-image", src: imageUrl, alt: selectedImage.alt });
  };

  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} />
      <main className="admin-page html-admin-page">
        <div className="admin-form admin-document-editor-page html-document-editor-page">
          <NavigationLinks admin backHref="/admin/contenido" />
          <div className="admin-document-editor-heading">
            <div><small>{category.title}</small><h1>Editar {draft.title}</h1><p>Esta es la vista del agente. Seleccioná un texto para editarlo o una imagen para reemplazarla.</p></div>
            <a className="document-preview-return" href={getDocumentRoute(category, draft)} target="_blank" rel="noopener noreferrer">Vista de agente ↗</a>
          </div>
          <form className="admin-document-editor-form" onSubmit={saveDocument}>
            <div className="admin-document-editor-actions html-document-actions">
              {status && <p role="status">{status}</p>}
              <button type="submit" disabled={saving || sourceLoading}>{sourceLoading ? "Cargando documento…" : saving ? "Guardando…" : "Guardar documento"}</button>
            </div>
            <div className="admin-document-metadata">
              <label>Icono<input value={draft.icon || ""} onChange={(event) => setDraft((current) => ({ ...current, icon: event.target.value }))} /></label>
              <label>Título<input value={draft.title || ""} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required /></label>
              <label>Enlace original<input type="url" value={draft.url || ""} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} /></label>
            </div>
            {selectedImage.src ? (
              <section className="html-editor-toolbar html-editor-image-toolbar" aria-label="Formato de imagen">
                <strong>Imagen seleccionada</strong>
                <label className="html-toolbar-size">Tamaño <input type="range" min="5" max="100" value={imageWidth} onChange={(event) => { const width = Number(event.target.value); setImageWidth(width); sendToFrame({ type: "orbital-image-style", width }); }} /><output>{imageWidth}%</output></label>
                <label>Posición <select value={imageLayout} onChange={(event) => { setImageLayout(event.target.value); sendToFrame({ type: "orbital-image-style", layout: event.target.value }); }}><option value="inline">En línea con el texto</option><option value="left">Ajustar a la izquierda</option><option value="center">Centrada</option><option value="right">Ajustar a la derecha</option></select></label>
                <span className="html-image-position-hint">Arrastrá la imagen en la vista o ajustá sus coordenadas:</span>
                <label>Horizontal <input type="number" min="-10000" max="10000" step="1" value={imageXOffset} onChange={(event) => { const xOffset = Number(event.target.value); setImageXOffset(xOffset); sendToFrame({ type: "orbital-image-style", xOffset }); }} /> px</label>
                <label>Vertical <input type="number" min="-10000" max="10000" step="1" value={imageYOffset} onChange={(event) => { const yOffset = Number(event.target.value); setImageYOffset(yOffset); sendToFrame({ type: "orbital-image-style", yOffset }); }} /> px</label>
                <button type="button" onClick={() => sendToFrame({ type: "orbital-image-move", direction: -1 })}>↑ Mover antes</button>
                <button type="button" onClick={() => sendToFrame({ type: "orbital-image-move", direction: 1 })}>↓ Mover después</button>
              </section>
            ) : (
              <section className="html-editor-toolbar html-editor-text-toolbar" aria-label="Formato de texto">
                <button type="button" title="Deshacer" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("undo")}>↶</button>
                <button type="button" title="Rehacer" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("redo")}>↷</button>
                <span className="html-toolbar-divider" />
                <label>Estilo <select defaultValue="p" onChange={(event) => formatText("formatBlock", event.target.value)}><option value="p">Texto normal</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option><option value="blockquote">Cita</option></select></label>
                <label>Fuente <select defaultValue="Arial" onChange={(event) => formatText("fontName", event.target.value)}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Tahoma</option><option>Trebuchet MS</option><option>Courier New</option><option>Times New Roman</option></select></label>
                <label>Tamaño <select defaultValue="3" onChange={(event) => formatText("fontSize", event.target.value)}><option value="1">8 pt</option><option value="2">10 pt</option><option value="3">12 pt</option><option value="4">14 pt</option><option value="5">18 pt</option><option value="6">24 pt</option><option value="7">36 pt</option></select></label>
                <button type="button" title="Negrita" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("bold")}><b>B</b></button>
                <button type="button" title="Cursiva" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("italic")}><i>I</i></button>
                <button type="button" title="Subrayado" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("underline")}><u>U</u></button>
                <button type="button" title="Tachado" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("strikeThrough")}><s>S</s></button>
                <button type="button" title="Superíndice" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("superscript")}>x²</button>
                <button type="button" title="Subíndice" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("subscript")}>x₂</button>
                <label className="html-toolbar-color" title="Color de texto">A <input type="color" defaultValue="#172b4d" onChange={(event) => formatText("foreColor", event.target.value)} /></label>
                <label className="html-toolbar-color" title="Resaltar texto">▰ <input type="color" defaultValue="#fff176" onChange={(event) => formatText("hiliteColor", event.target.value)} /></label>
                <span className="html-toolbar-divider" />
                <button type="button" title="Alinear a la izquierda" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("justifyLeft")}>☰←</button>
                <button type="button" title="Centrar" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("justifyCenter")}>☰</button>
                <button type="button" title="Alinear a la derecha" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("justifyRight")}>→☰</button>
                <button type="button" title="Lista con viñetas" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("insertUnorderedList")}>• Lista</button>
                <button type="button" title="Lista numerada" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("insertOrderedList")}>1. Lista</button>
                <button type="button" title="Aumentar sangría" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("indent")}>→│</button>
                <button type="button" title="Reducir sangría" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("outdent")}>←│</button>
                <label>Espaciado <select defaultValue="1.5" onChange={(event) => formatText("lineHeight", event.target.value)}><option value="1">Sencillo</option><option value="1.15">1,15</option><option value="1.5">1,5</option><option value="2">Doble</option></select></label>
                <button type="button" title="Insertar enlace" onMouseDown={(event) => event.preventDefault()} onClick={() => { const url = window.prompt("URL del enlace:", "https://"); if (url) formatText("createLink", url); }}>🔗</button>
                <button type="button" title="Quitar formato" onMouseDown={(event) => event.preventDefault()} onClick={() => formatText("removeFormat")}>Tx</button>
              </section>
            )}
            <section className="html-image-tools" aria-label="Editar imágenes del documento">
              <div><strong>{selectedImage.src ? "Imagen seleccionada" : "Imágenes"}</strong><small>{selectedImage.src ? selectedImage.alt || selectedImage.src : "Seleccioná una imagen en la página o agregá una nueva."}</small></div>
              <button type="button" onClick={() => { if (selectedImage.src) { setImageUploadMode("replace"); fileRef.current?.click(); } else setStatus("Primero seleccioná una imagen en la vista."); }}>Reemplazar imagen</button>
              <button type="button" onClick={() => { setImageUploadMode("add"); fileRef.current?.click(); }}>＋ Agregar imagen</button>
              {selectedImage.src && <button className="html-image-delete" type="button" onClick={() => sendToFrame({ type: "orbital-delete-image" })}>Eliminar imagen</button>}
              <input ref={fileRef} className="html-image-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; void uploadAndApplyImage(file, imageUploadMode === "add"); event.target.value = ""; }} />
              {selectedImage.src && <label>URL de imagen<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://… o /document-assets/…" /></label>}
              {selectedImage.src && <label>Texto alternativo<input value={selectedImage.alt} onChange={(event) => setSelectedImage((current) => ({ ...current, alt: event.target.value }))} /></label>}
              {selectedImage.src && <button type="button" onClick={applyImageUrl}>Aplicar URL y texto alternativo</button>}
            </section>
            <div className="html-document-preview-heading"><strong>Vista editable de la página</strong><small>Los cambios se publican al guardar el documento.</small></div>
            <iframe ref={frameRef} className="html-document-edit-frame" title={`Vista editable: ${draft.title}`} srcDoc={preview} sandbox="allow-scripts allow-forms allow-downloads allow-modals" />
          </form>
        </div>
      </main>
    </div>
  );
}
