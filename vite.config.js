import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import TurndownService from 'turndown'

const comunicadosFile = path.resolve(process.cwd(), 'data/comunicados.json')
const configFile = path.resolve(process.cwd(), 'data/site-config.json')
const usuariosFile = path.resolve(process.cwd(), 'data/usuarios.json')
const payCasinosFile = path.resolve(process.cwd(), 'data/pay-casinos.json')
const payCasesFile = path.resolve(process.cwd(), 'data/pay-cases.json')
const deletedPayCasesFile = path.resolve(process.cwd(), 'data/pay-casos-eliminados.json')
const payCaseChangeRequestsFile = path.resolve(process.cwd(), 'data/pay-casos-solicitudes.json')
const payGuidesFile = path.resolve(process.cwd(), 'data/pay-guides.json')
const portalsFile = path.resolve(process.cwd(), 'data/portales.json')
const authSessions = new Map()

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const [salt, expectedHex] = String(storedHash || '').split(':')
  if (!salt || !expectedHex) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const actual = scryptSync(password, salt, expected.length)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function readUsers() {
  const users = JSON.parse(fs.readFileSync(usuariosFile, 'utf8'))
  let changed = false
  for (const user of users) {
    if (user.password) {
      user.passwordHash = hashPassword(user.password)
      delete user.password
      changed = true
    }
    user.failedAttempts = Number.isInteger(user.failedAttempts) ? user.failedAttempts : 0
    user.locked = Boolean(user.locked)
    user.blockedByAdmin = Boolean(user.blockedByAdmin)
    if (!Array.isArray(user.projects)) {
      user.projects = ['wallet', 'pay']
      changed = true
    } else {
      const projects = user.projects.filter((project) => ['wallet', 'pay'].includes(project))
      if (projects.length !== user.projects.length) changed = true
      user.projects = projects
    }
    if (user.role === 'administrador' && !user.blockedByAdmin && (user.failedAttempts !== 0 || user.locked)) {
      user.failedAttempts = 0
      user.locked = false
      changed = true
    }
  }
  if (changed) fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
  return users
}

function safeUser(user) {
  const publicUser = { ...user }
  delete publicUser.password
  delete publicUser.passwordHash
  return publicUser
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch (error) { reject(error) }
    })
    request.on('error', reject)
  })
}

function currentSessionUser(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)orbital_admin_session=([^;]+)/)?.[1]
  const session = token && authSessions.get(token)
  if (!session || session.expiresAt <= Date.now()) {
    if (token) authSessions.delete(token)
    return null
  }
  const user = readUsers().find((item) => item.username === session.username)
  if (!user || user.locked) {
    authSessions.delete(token)
    return null
  }
  return { ...user, sessionToken: token }
}

function sendJson(response, status, data) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(data))
}

function slugifyDocumentTitle(title) {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function monedaSegunCasino(name) {
  const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('paraguay')) return 'PYG'
  if (normalized.includes('argentina')) return 'ARS'
  return ''
}

function htmlSoloLectura(html) {
  return String(html || '')
    .replace(/<a\b(?=[^>]*>)[^>]*>[\s\S]*?\b(?:editar|edit)\b[\s\S]*?<\/a\s*>/gi, '')
    .replace(/<(button|input|textarea|select)\b[^>]*>[\s\S]*?\b(?:editar|edit)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<button\b[^>]*>(?:(?!<\/button>)[\s\S]){0,1000}?(?:guardar(?:\s+una)?\s+copia|imprimir(?:\s*\/\s*pdf)?|save\s+copy|print)(?:(?!<\/button>)[\s\S]){0,1000}?<\/button>/gi, '')
    .replace(/\scontenteditable(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
    .replace(/<\/head>/i, '<style>@media print{html,body{display:none!important}}</style></head>')
}

function documentoHtmlCompleto(content, title) {
  const source = String(content || '')
  if (/<html\b/i.test(source)) return source
  const safeTitle = String(title || 'Documento').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{margin:0;background:#100d13;color:#f5edf1;font-family:Arial,sans-serif;line-height:1.65}.orbital-import-wrap{max-width:1120px;margin:0 auto;padding:36px 28px 72px}h1,h2,h3{line-height:1.3}img{max-width:100%;height:auto;object-fit:contain}a{color:#ff748a}table{max-width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #594452}@media(max-width:700px){.orbital-import-wrap{padding:22px 16px 48px}}</style></head><body><main class="orbital-import-wrap">${source}</main></body></html>`
}

function guardarHtmlImportado(categoryTarget, title, html) {
  const safeFileKey = createHash('sha256').update(`${categoryTarget}:${title}:${html}`).digest('hex').slice(0, 24)
  const importDirectory = path.resolve(process.cwd(), 'public', 'document-assets', 'importados')
  fs.mkdirSync(importDirectory, { recursive: true })
  fs.writeFileSync(path.join(importDirectory, `${safeFileKey}.html`), htmlSoloLectura(html))
  return `/document-assets/importados/${safeFileKey}.html`
}

function limpiarCapturasSinReferencia(config) {
  const assetRoot = path.resolve(process.cwd(), 'public', 'document-assets')
  if (!fs.existsSync(assetRoot)) return

  const markdown = [
    config.faqContent || '',
    ...(config.categories || []).flatMap((category) => (category.documents || []).map((document) => document.content || '')),
  ].join('\n')
  const referencedAssets = [
    ...[...markdown.matchAll(/\/document-assets\/[^)\s"'<>]+/g)].map(([source]) => source),
    ...(config.categories || []).flatMap((category) => (category.documents || []).map((document) => document.originalHtmlUrl || '')),
  ]
  const references = new Set(referencedAssets.map((source) => (
    path.resolve(process.cwd(), 'public', source.slice(1))
  )))

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
      } else if (!references.has(fullPath)) {
        fs.unlinkSync(fullPath)
      }
    }
  }
  visit(assetRoot)
}

async function importarTextoDocumento(url, title) {
  const source = new URL(url)
  const sourceHost = source.hostname
  if (source.protocol !== 'https:') {
    throw new Error('El enlace debe usar HTTPS.')
  }

  let fetchUrl = url
  if (source.hostname === 'docs.google.com') {
    const documentId = source.pathname.match(/^\/document\/d\/([^/]+)/)?.[1]
    if (!documentId) {
      throw new Error('El enlace no corresponde a un Google Doc.')
    }
    fetchUrl = `https://docs.google.com/document/d/${documentId}/export?format=html`
  } else if (!source.hostname.endsWith('.p.clickup-attachments.com')) {
    throw new Error('Solo se importan enlaces de Google Docs o adjuntos ClickUp.')
  }

  const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(60000) })
  const sourceText = await response.text()
  if (!response.ok) {
    throw new Error(`El origen respondió ${response.status}.`)
  }
  if (!sourceText.trim()) {
    throw new Error('El documento está vacío o no se pudo exportar.')
  }
  if (sourceText.includes('Accede a tu cuenta de Google') || sourceText.includes('Debes acceder para ver este contenido')) {
    throw new Error('El documento requiere iniciar sesión en Google.')
  }

  const slug = slugifyDocumentTitle(title)
  const imageDirectory = path.resolve(process.cwd(), 'public', 'document-assets', slug)
  if (sourceHost.endsWith('.p.clickup-attachments.com') && /<\s*html\b/i.test(sourceText)) {
    fs.mkdirSync(imageDirectory, { recursive: true })
    fs.writeFileSync(path.join(imageDirectory, 'original.html'), sourceText)
  }
  const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })
  turndown.remove(['script', 'style', 'svg', 'button', 'nav'])
  turndown.addRule('removeEmbeddedImageLinks', {
    filter(node) {
      return node.nodeName === 'A' && /^data:image\//i.test(node.getAttribute('href') || '')
    },
    replacement(content) {
      return content
    },
  })
  turndown.addRule('localImages', {
    filter: 'img',
    replacement(content, node) {
      const source = node.getAttribute('src') || ''
      const className = node.getAttribute('class') || ''
      const altText = node.getAttribute('alt') || ''
      const styleHeight = Number(node.getAttribute('style')?.match(/height\s*:\s*([\d.]+)px/i)?.[1] || 0)
      if (className.split(/\s+/).some((name) => name === 'absolute' || name.includes('logo')) || /logo|orbital/i.test(altText)) {
        return ''
      }
      if (sourceHost === 'docs.google.com' && styleHeight > 0 && styleHeight <= 100) {
        return ''
      }

      const dataImage = source.match(/^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/i)
      if (dataImage) {
        const extension = dataImage[1].toLowerCase().replace('jpeg', 'jpg')
        const imageBytes = Buffer.from(dataImage[2], 'base64')
        if (!imageBytes.length) return ''

        const hash = createHash('sha256').update(imageBytes).digest('hex').slice(0, 16)
        const filename = `${hash}.${extension}`
        fs.mkdirSync(imageDirectory, { recursive: true })
        fs.writeFileSync(path.join(imageDirectory, filename), imageBytes)
        const alt = node.getAttribute('alt') || content || `Captura de ${title}`
        return `![${alt}](/document-assets/${slug}/${filename})\n`
      }

      if (/^https:\/\//i.test(source)) {
        const alt = node.getAttribute('alt') || content || `Captura de ${title}`
        return `![${alt}](${source})\n`
      }
      return ''
    },
  })
  const markdown = turndown.turndown(sourceText).trim()
  const textWithoutImages = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[\s#*_`>|-]/g, '')
  if (textWithoutImages.length < 50) {
    throw new Error('El enlace no contiene texto ni capturas de pasos para integrar.')
  }
  return markdown
}

function esDireccionPublica(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)))
  }
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) return esDireccionPublica(normalized.slice(7))
  return !(['::', '::1'].includes(normalized) || normalized.startsWith('fc') || normalized.startsWith('fd')
    || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')
    || normalized.startsWith('ff') || normalized.startsWith('2001:db8:'))
}

async function validarUrlImportable(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('Ingresá una URL válida.') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('La URL debe ser pública, usar HTTPS y no incluir credenciales.')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('La dirección no está disponible para importar.')
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true }).catch(() => [])
  if (!addresses.length || addresses.some(({ address }) => !esDireccionPublica(address))) throw new Error('La URL debe apuntar a un sitio público.')
  return url
}

function guardarImagenGuia(bytes, contentType, slug) {
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[contentType.split(';')[0].toLowerCase()]
  if (!extension || !bytes.length || bytes.length > 5 * 1024 * 1024) return ''
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20)
  const directory = path.resolve(process.cwd(), 'public', 'document-assets', 'pay-guides', slug)
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, `${hash}.${extension}`), bytes)
  return `/document-assets/pay-guides/${slug}/${hash}.${extension}`
}

async function descargarImagenGuia(value, slug) {
  let url = await validarUrlImportable(value)
  let response
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' } })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location || redirect === 4) return ''
    url = await validarUrlImportable(new URL(location, url).toString())
  }
  if (!response?.ok || !/^image\/(png|jpeg|webp|gif)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return ''
  if (Number(response.headers.get('content-length') || 0) > 5 * 1024 * 1024) return ''
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 5 * 1024 * 1024) {
      await reader.cancel()
      return ''
    }
    chunks.push(Buffer.from(value))
  }
  return guardarImagenGuia(Buffer.concat(chunks), response.headers.get('content-type') || '', slug)
}

async function importarGuiaDesdeUrl(value) {
  let url = await validarUrlImportable(value)
  const originalUrl = url.toString()
  let googleDocumentId = ''
  let urlsToTry = [url]
  if (url.hostname === 'docs.google.com') {
    googleDocumentId = url.pathname.match(/^\/document\/d\/([^/]+)/)?.[1] || ''
    if (!googleDocumentId) throw new Error('El enlace de Google Docs no corresponde a un documento.')
    const exportUrl = await validarUrlImportable(`https://docs.google.com/document/d/${googleDocumentId}/export?format=html`)
    const mobileUrl = await validarUrlImportable(`https://docs.google.com/document/d/${googleDocumentId}/mobilebasic`)
    const publishedUrl = await validarUrlImportable(`https://docs.google.com/document/d/${googleDocumentId}/pub?embedded=true`)
    urlsToTry = /\/pub(?:\/|$)/.test(url.pathname) ? [url, mobileUrl, exportUrl] : [exportUrl, mobileUrl, publishedUrl]
  }

  let response
  for (let candidateIndex = 0; candidateIndex < urlsToTry.length; candidateIndex += 1) {
    url = urlsToTry[candidateIndex]
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(25000), headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' } })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location || redirect === 5) throw new Error('El enlace tiene demasiadas redirecciones o no se pudo abrir.')
      url = await validarUrlImportable(new URL(location, url).toString())
    }
    if (![401, 403, 404].includes(response.status) || candidateIndex === urlsToTry.length - 1) break
  }
  if (!response?.ok) {
    if (googleDocumentId && [401, 403, 404].includes(response.status)) throw new Error('Google no permitió leer el documento. Debe estar disponible sin iniciar sesión (Compartir → Acceso general → Cualquier persona con el enlace, como lector) o publicado en la web.')
    throw new Error(`No se pudo abrir el enlace (respuesta ${response?.status || 'desconocida'}).`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!/text\/(html|plain)|application\/(xhtml\+xml|pdf)/i.test(contentType)) throw new Error('El enlace no contiene una página o documento de texto compatible. Probá con una página pública o Google Docs compartido.')
  const declaredSize = Number(response.headers.get('content-length') || 0)
  if (declaredSize > 50 * 1024 * 1024) throw new Error('La página supera el límite de 50 MB.')
  if (/application\/pdf/i.test(contentType)) throw new Error('Este enlace apunta a un PDF. Para extraer su contenido, importá el archivo PDF desde el formulario.')
  const chunks = []
  let totalSize = 0
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No se pudo leer el contenido del documento.')
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalSize += value.byteLength
    if (totalSize > 50 * 1024 * 1024) {
      await reader.cancel()
      throw new Error('La página supera el límite de 50 MB.')
    }
    chunks.push(Buffer.from(value))
  }
  const sourceText = Buffer.concat(chunks).toString('utf8')
  if (!sourceText.trim()) throw new Error('El documento no contiene información para importar.')
  if (sourceText.length > 50 * 1024 * 1024) throw new Error('La página supera el límite de 50 MB.')
  if (/Accede a tu cuenta de Google|Debes acceder para ver este contenido|Sign in to continue/i.test(sourceText)) throw new Error('El documento requiere iniciar sesión para poder leerlo.')

  const title = sourceText.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || sourceText.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || 'Documento importado').replace(/[-_]/g, ' ')
  const cleanText = (value) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim()
  const cleanTitle = cleanText(title).slice(0, 200)
  const description = cleanText(sourceText.match(/<meta\s+(?:name|property)=["'](?:description|og:description)["']\s+content=["']([^"']*)/i)?.[1]
    || sourceText.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]).slice(0, 600)
  const documentSlug = slugifyDocumentTitle(cleanTitle).slice(0, 100) || createHash('sha256').update(originalUrl).digest('hex').slice(0, 16)
  const imageSources = [...sourceText.matchAll(/<img\b[^>]*>/gi)].map(([tag]) => tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&')).filter(Boolean)
  const imageUrls = [...new Set(imageSources.filter((image) => !image.startsWith('data:')).map((image) => {
    try { return new URL(image, url).toString() } catch { return '' }
  }).filter(Boolean))]
  const importedImages = new Map()
  for (const image of imageSources.filter((source) => source.startsWith('data:'))) {
    const dataImage = image.match(/^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/i)
    if (dataImage) {
      const type = `image/${dataImage[1].toLowerCase().replace('jpeg', 'jpg').replace('jpg', 'jpeg')}`
      const localImage = guardarImagenGuia(Buffer.from(dataImage[2], 'base64'), type, documentSlug)
      if (localImage) importedImages.set(image, localImage)
    }
  }
  let nextImage = 0
  const workers = Array.from({ length: Math.min(4, imageUrls.length) }, async () => {
    while (nextImage < imageUrls.length) {
      const imageUrl = imageUrls[nextImage++]
      try {
        const imported = await descargarImagenGuia(imageUrl, documentSlug)
        if (imported) importedImages.set(imageUrl, imported)
      } catch { /* Se conserva el enlace remoto de la imagen si el sitio bloquea su descarga. */ }
    }
  })
  await Promise.all(workers)
  let content
  if (contentType.includes('text/plain')) {
    content = `<p>${sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('</p><p>')}</p>`
  } else {
    const body = sourceText.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || sourceText
    content = body
      .replace(/<(script|style|svg|button|nav|noscript|header|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(?:iframe|object|embed)\b[^>]*>[\s\S]*?<\/(?:iframe|object)\s*>/gi, '')
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const source = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&') || ''
        if (!source) return ''
        let imageKey = source
        if (!source.startsWith('data:')) {
          try { imageKey = new URL(source, url).toString() } catch { return '' }
        }
        const imageUrl = importedImages.get(imageKey) || imageKey
        return tag.replace(/\bsrc\s*=\s*(["']).*?\1/i, `src="${imageUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      })
  }
  content = content.trim().slice(0, 100000)
  const excerpt = cleanText(content.replace(/<img\b[^>]*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')).slice(0, 600)
  if (excerpt.length < 30) throw new Error('No se encontró suficiente texto visible para reconocer el documento.')
  const searchable = `${cleanTitle} ${description} ${excerpt}`.toLowerCase()
  const kind = /pol[ií]tic|policy|normativa/.test(searchable) ? 'Política'
    : /manual|handbook/.test(searchable) ? 'Manual'
      : /procedimiento|procedure|instructivo|paso a paso/.test(searchable) ? 'Procedimiento'
        : /proceso|workflow|flujo/.test(searchable) ? 'Proceso' : 'Documentación'
  const steps = []
  const imageCount = (content.match(/<img\b/gi) || []).length
  const htmlDocument = sourceText.length <= 2 * 1024 * 1024
    ? sourceText
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const source = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]?.replace(/&amp;/gi, '&') || ''
        if (!source) return ''
        let resolved = source
        if (!source.startsWith('data:')) {
          try { resolved = new URL(source, url).toString() } catch { return '' }
        }
        const localImage = importedImages.get(resolved) || importedImages.get(source)
        const safeSource = localImage || resolved
        return tag.replace(/\bsrc\s*=\s*(["']).*?\1/i, `src="${safeSource.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
      })
    : ''
  return { title: cleanTitle, kind, description: description || excerpt, steps, content, htmlDocument, imageCount, sourceUrl: originalUrl }
}

function comunicadosApi() {
  return {
    name: 'comunicados-api',
    configureServer(server) {
      server.middlewares.use('/api/health', (request, response, next) => {
        if (request.method !== 'GET') return next()
        return sendJson(response, 200, { status: 'ok' })
      })

      server.middlewares.use('/api/config', (request, response, next) => {
        if (request.method === 'GET') {
          const configText = fs.readFileSync(configFile, 'utf8')
          const etag = `"${createHash('sha256').update(configText).digest('hex')}"`
          response.setHeader('ETag', etag)
          if (request.headers['if-none-match'] === etag) {
            response.statusCode = 304
            response.end()
            return
          }
          response.setHeader('Content-Type', 'application/json')
          response.end(configText)
          return
        }

        if (request.method === 'POST') {
          if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { ok: false, error: 'Acceso denegado.' })
          let body = ''
          request.on('data', (chunk) => {
            body += chunk
          })
          request.on('end', () => {
            try {
              const config = JSON.parse(body)
              fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ ok: true }))
            } catch {
              response.statusCode = 400
              response.end(JSON.stringify({ ok: false }))
            }
          })
          return
        }

        next()
      })

      const canUsePay = (request) => {
        const user = currentSessionUser(request)
        return user && (user.role === 'administrador' || user.projects?.includes('pay'))
      }

      server.middlewares.use('/api/pay/guia-url', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede importar guías.' })
        try {
          const { url } = await readRequestBody(request)
          if (typeof url !== 'string' || !url.trim() || url.length > 4000) return sendJson(response, 400, { error: 'Ingresá una URL válida de hasta 4000 caracteres.' })
          const guide = await importarGuiaDesdeUrl(url.trim())
          return sendJson(response, 200, guide)
        } catch (error) {
          return sendJson(response, 400, { error: error.message || 'No se pudo extraer el documento desde esa URL.' })
        }
      })

      server.middlewares.use('/api/pay/guia-archivo', (request, response, next) => {
        const actor = currentSessionUser(request)
        if (!actor || (actor.role !== 'administrador' && !actor.projects?.includes('pay'))) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        if (request.method === 'GET') {
          const fileName = String(request.url || '').split('?')[0].replace(/^\//, '')
          if (!/^[a-f0-9]{48}\.(pdf|docx?|txt|md|html?)$/.test(fileName)) return sendJson(response, 404, { error: 'Documento no encontrado.' })
          const directory = path.resolve(process.cwd(), 'data', 'pay-guide-documents')
          const filePath = path.resolve(directory, fileName)
          if (!filePath.startsWith(directory + path.sep) || !fs.existsSync(filePath)) return sendJson(response, 404, { error: 'Documento no encontrado.' })
          const extension = path.extname(fileName).toLowerCase()
          const mimeTypes = { '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.htm': 'text/plain; charset=utf-8', '.html': 'text/plain; charset=utf-8' }
          const requestedName = new URL(request.url, 'http://localhost').searchParams.get('name') || fileName
          response.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream')
          const disposition = ['.pdf', '.txt', '.md'].includes(extension) ? 'inline' : 'attachment'
          response.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(requestedName).replace(/[\r\n"\\]/g, '_').slice(0, 150)}"`)
          return fs.createReadStream(filePath).pipe(response)
        }
        if (request.method !== 'POST') return next()
        if (actor.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede importar documentos.' })
        const originalName = path.basename(decodeURIComponent(String(request.headers['x-file-name'] || 'documento').slice(0, 180)))
        const extension = path.extname(originalName).toLowerCase()
        if (!['.pdf', '.doc', '.docx', '.txt', '.md', '.html', '.htm'].includes(extension)) return sendJson(response, 415, { error: 'Formato no permitido. Usá PDF, DOC, DOCX, TXT, MD o HTML.' })
        const chunks = []
        let size = 0
        let tooLarge = false
        request.on('data', (chunk) => { size += chunk.length; if (size > 20 * 1024 * 1024) { tooLarge = true; chunks.length = 0 } else if (!tooLarge) chunks.push(chunk) })
        request.on('end', () => {
          if (tooLarge) return sendJson(response, 413, { error: 'El documento no puede superar los 20 MB.' })
          if (!size) return sendJson(response, 400, { error: 'El documento está vacío.' })
          const directory = path.resolve(process.cwd(), 'data', 'pay-guide-documents')
          fs.mkdirSync(directory, { recursive: true })
          const fileName = `${createHash('sha256').update(Buffer.concat(chunks)).digest('hex').slice(0, 48)}${extension}`
          fs.writeFileSync(path.join(directory, fileName), Buffer.concat(chunks))
          return sendJson(response, 200, { url: `/api/pay/guia-archivo/${fileName}?name=${encodeURIComponent(originalName)}`, name: originalName, size })
        })
      })

      server.middlewares.use('/api/pay/guias', async (request, response, next) => {
        if (!['GET', 'PUT'].includes(request.method)) return next()
        const actor = currentSessionUser(request)
        if (!actor || (actor.role !== 'administrador' && !actor.projects?.includes('pay'))) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        if (!fs.existsSync(payGuidesFile)) fs.writeFileSync(payGuidesFile, '[]')
        if (request.method === 'GET') return sendJson(response, 200, JSON.parse(fs.readFileSync(payGuidesFile, 'utf8')))
        if (actor.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede modificar las guías.' })
        try {
          const guides = await readRequestBody(request)
          if (!Array.isArray(guides) || guides.length > 500 || guides.some((guide) => !guide || typeof guide.id !== 'string' || typeof guide.title !== 'string' || !guide.title.trim() || guide.title.length > 200 || typeof guide.kind !== 'string' || typeof guide.description !== 'string' || guide.description.length > 5000 || !Array.isArray(guide.steps) || guide.steps.length > 100 || guide.steps.some((step) => typeof step !== 'string' || step.length > 2000) || typeof (guide.content || '') !== 'string' || (guide.content || '').length > 100000 || (guide.htmlDocument && (typeof guide.htmlDocument !== 'string' || guide.htmlDocument.length > 2 * 1024 * 1024)) || (guide.sourceUrl && (typeof guide.sourceUrl !== 'string' || guide.sourceUrl.length > 4000 || !/^https:\/\//i.test(guide.sourceUrl))) || (guide.attachment && typeof guide.attachment.url !== 'string'))) return sendJson(response, 400, { error: 'Revisá los campos de las guías antes de guardar.' })
          fs.writeFileSync(payGuidesFile, JSON.stringify(guides, null, 2))
          return sendJson(response, 200, { ok: true })
        } catch { return sendJson(response, 400, { error: 'No se pudieron guardar las guías.' }) }
      })

      server.middlewares.use('/api/portales', async (request, response, next) => {
        if (!['GET', 'PUT'].includes(request.method)) return next()
        const user = currentSessionUser(request)
        if (!user || (user.role !== 'administrador' && !user.projects?.some((project) => ['wallet', 'pay'].includes(project)))) return sendJson(response, 403, { error: 'No tenés acceso a los portales.' })
        if (!fs.existsSync(portalsFile)) fs.writeFileSync(portalsFile, '[]')
        if (request.method === 'GET') {
          const portals = JSON.parse(fs.readFileSync(portalsFile, 'utf8'))
          return sendJson(response, 200, user.role === 'administrador' ? portals : portals.filter((portal) => user.projects?.includes(portal.project)))
        }
        if (user.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede modificar los portales.' })
        try {
          const portals = await readRequestBody(request)
          if (!Array.isArray(portals) || portals.some((portal) => !portal || typeof portal.id !== 'string' || typeof portal.name !== 'string' || typeof portal.url !== 'string' || !['wallet', 'pay'].includes(portal.project) || !/^https?:\/\//i.test(portal.url))) return sendJson(response, 400, { error: 'Revisá los datos y la dirección de cada portal.' })
          fs.writeFileSync(portalsFile, JSON.stringify(portals, null, 2))
          return sendJson(response, 200, { ok: true })
        } catch { return sendJson(response, 400, { error: 'No se pudieron guardar los portales.' }) }
      })

      server.middlewares.use('/api/pay/casinos', async (request, response, next) => {
        if (!['GET', 'PUT'].includes(request.method)) return next()
        if (!canUsePay(request)) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        if (!fs.existsSync(payCasinosFile)) fs.writeFileSync(payCasinosFile, '[]')
        if (request.method === 'GET') return sendJson(response, 200, JSON.parse(fs.readFileSync(payCasinosFile, 'utf8')))
        if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede modificar casinos y métodos de pago.' })
        try {
          const casinos = await readRequestBody(request)
          if (!Array.isArray(casinos) || casinos.length > 500 || casinos.some((casino) => !casino || (typeof casino.id !== 'string' && typeof casino.id !== 'number') || typeof casino.name !== 'string' || !casino.name.trim() || casino.name.length > 200 || !['Activo', 'En revisión', 'Inactivo'].includes(casino.status) || !Array.isArray(casino.paymentMethods || []) || (casino.paymentMethods || []).length > 50 || (casino.paymentMethods || []).some((method) => typeof method !== 'string' || !method.trim() || method.length > 100))) return sendJson(response, 400, { error: 'Revisá los datos de casinos y métodos de pago.' })
          fs.writeFileSync(payCasinosFile, JSON.stringify(casinos, null, 2))
          return sendJson(response, 200, { ok: true })
        } catch {
          return sendJson(response, 400, { error: 'No se pudieron guardar los casinos.' })
        }
      })

      server.middlewares.use('/api/pay/reportes', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        const actor = currentSessionUser(request)
        if (!actor || (actor.role !== 'administrador' && !actor.projects?.includes('pay'))) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        try {
          const input = await readRequestBody(request)
          const textFields = ['account', 'analysis', 'manualReply']
          if (!input || typeof input !== 'object' || typeof input.casinoId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || textFields.some((field) => typeof (input[field] || '') !== 'string' || (input[field] || '').length > 20000) || !input.counts || Object.values(input.counts).some((value) => typeof value !== 'string' || (value && (!/^\d+$/.test(value) || Number(value) > 100000000)))) return sendJson(response, 400, { error: 'Revisá la fecha, los totales y el análisis antes de guardar.' })
          if (input.attachment && (typeof input.attachment.url !== 'string' || !input.attachment.url.startsWith(`/api/pay/documento/${input.casinoId}/`) || typeof input.attachment.name !== 'string')) return sendJson(response, 400, { error: 'El documento adjunto no es válido.' })
          const casinos = JSON.parse(fs.readFileSync(payCasinosFile, 'utf8'))
          const casino = casinos.find((item) => String(item.id) === input.casinoId && item.status === 'Activo')
          if (!casino) return sendJson(response, 404, { error: 'No se encontró un casino activo para guardar el reporte.' })
          const report = { id: randomBytes(16).toString('hex'), title: String(input.title || 'Reporte').slice(0, 200), date: input.date, account: String(input.account || ''), counts: input.counts, analysis: String(input.analysis || ''), manualReply: String(input.manualReply || ''), attachment: input.attachment || null, createdAt: new Date().toISOString(), author: String(actor.displayName || actor.name || actor.username || 'Equipo').slice(0, 120) }
          casino.reports = Array.isArray(casino.reports) ? casino.reports : []
          casino.reports.push(report)
          fs.writeFileSync(payCasinosFile, JSON.stringify(casinos, null, 2))
          return sendJson(response, 201, { report, casino })
        } catch { return sendJson(response, 400, { error: 'No se pudo guardar el reporte.' }) }
      })

      server.middlewares.use('/api/pay/casos-eliminados', (request, response, next) => {
        const actor = currentSessionUser(request)
        if (!actor || actor.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede consultar los registros eliminados.' })
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'El archivo de registros eliminados es de solo lectura.' })
        if (!fs.existsSync(deletedPayCasesFile)) fs.writeFileSync(deletedPayCasesFile, '[]')
        return sendJson(response, 200, JSON.parse(fs.readFileSync(deletedPayCasesFile, 'utf8')))
      })

      server.middlewares.use('/api/pay/casos-solicitudes', async (request, response, next) => {
        const actor = currentSessionUser(request)
        if (!actor || (actor.role !== 'administrador' && !actor.projects?.includes('pay'))) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        if (request.method === 'GET') {
          const requests = fs.existsSync(payCaseChangeRequestsFile) ? JSON.parse(fs.readFileSync(payCaseChangeRequestsFile, 'utf8')) : []
          const visibleRequests = actor.role === 'administrador' ? requests : requests.filter((item) => item.requestedByUsername === actor.username && item.status === 'Pendiente')
          return sendJson(response, 200, visibleRequests.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)))
        }
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Método no permitido.' })
        if (actor.role === 'administrador') return sendJson(response, 403, { error: 'Las solicitudes deben ser enviadas por el agente responsable del caso.' })
        try {
          const input = await readRequestBody(request)
          const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
          if (!input.caseId || !reason || reason.length > 1000 || !input.changes || typeof input.changes !== 'object') return sendJson(response, 400, { error: 'Indicá el motivo y los cambios solicitados.' })
          const cases = JSON.parse(fs.readFileSync(payCasesFile, 'utf8'))
          const record = cases.find((item) => String(item.id) === String(input.caseId))
          if (!record || record.createdByUsername !== actor.username) return sendJson(response, 403, { error: 'Solo podés solicitar cambios para un caso que registraste.' })
          const pending = fs.existsSync(payCaseChangeRequestsFile) ? JSON.parse(fs.readFileSync(payCaseChangeRequestsFile, 'utf8')) : []
          if (pending.some((item) => item.caseId === record.id && item.status === 'Pendiente')) return sendJson(response, 409, { error: 'Este caso ya tiene una solicitud pendiente de revisión.' })
          const casinos = JSON.parse(fs.readFileSync(payCasinosFile, 'utf8'))
          const change = input.changes
          const casino = casinos.find((item) => String(item.id) === String(change.casinoId) && item.status === 'Activo')
          const paymentMethod = casino?.paymentMethods?.find((item) => item === change.paymentMethod)
          const amount = Number(change.amount)
          const currency = monedaSegunCasino(casino?.name) || change.currency
          const validAmount = Number.isFinite(amount) && amount > 0 && amount <= 100000000000000 && (currency === 'PYG' ? Number.isInteger(amount) : currency === 'ARS' && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7)
          const registrationType = change.registrationType || 'Normal'
          const manualReason = typeof change.manualReason === 'string' ? change.manualReason.trim() : ''
          const externalOrderId = typeof change.externalOrderId === 'string' ? change.externalOrderId.trim() : ''
          if (!casino || !paymentMethod || !validAmount || !['Normal', 'Manual'].includes(registrationType) || !['Depósito', 'Retiro'].includes(change.operation) || typeof change.playerId !== 'string' || !change.playerId.trim() || change.playerId.length > 120 || typeof change.transactionId !== 'string' || !change.transactionId.trim() || change.transactionId.length > 160 || externalOrderId.length > 160 || (registrationType === 'Normal' && !externalOrderId) || (registrationType === 'Manual' && (!manualReason || manualReason.length > 1000))) return sendJson(response, 400, { error: 'Revisá los datos del caso antes de enviar la solicitud.' })
          const normalizedChanges = { casinoId: String(casino.id), casino: casino.name, paymentMethod, registrationType, manualReason: registrationType === 'Manual' ? manualReason : '', playerId: change.playerId.trim(), transactionId: change.transactionId.trim(), externalOrderId, amount, currency, operation: change.operation }
          const changeRequest = { id: randomBytes(16).toString('hex'), caseId: record.id, requestedBy: String(actor.displayName || actor.name || actor.username), requestedByUsername: actor.username, requestedAt: new Date().toISOString(), reason, changes: normalizedChanges, originalRecord: { ...record }, previousValues: Object.fromEntries(Object.keys(normalizedChanges).map((key) => [key, record[key]])), status: 'Pendiente' }
          pending.push(changeRequest)
          fs.writeFileSync(payCaseChangeRequestsFile, JSON.stringify(pending, null, 2))
          return sendJson(response, 201, changeRequest)
        } catch { return sendJson(response, 400, { error: 'No se pudo guardar la solicitud de cambio.' }) }
      })

      server.middlewares.use('/api/admin/pay/casos-solicitudes-resolver', async (request, response, next) => {
        const actor = currentSessionUser(request)
        if (!actor || actor.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede revisar solicitudes.' })
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Método no permitido.' })
        try {
          const input = await readRequestBody(request)
          if (!['Aprobada', 'Rechazada'].includes(input.decision)) return sendJson(response, 400, { error: 'Elegí una decisión válida.' })
          if (input.decision === 'Aprobada' && !verifyPassword(String(input.password || ''), actor.passwordHash)) return sendJson(response, 401, { error: 'La contraseña del administrador no es correcta.' })
          const requests = fs.existsSync(payCaseChangeRequestsFile) ? JSON.parse(fs.readFileSync(payCaseChangeRequestsFile, 'utf8')) : []
          const changeRequest = requests.find((item) => item.id === input.requestId && item.status === 'Pendiente')
          if (!changeRequest) return sendJson(response, 404, { error: 'La solicitud ya no está pendiente o no existe.' })
          if (input.decision === 'Aprobada') {
            const cases = JSON.parse(fs.readFileSync(payCasesFile, 'utf8'))
            const record = cases.find((item) => item.id === changeRequest.caseId)
            if (!record) return sendJson(response, 404, { error: 'El caso ya no está activo y no se puede modificar.' })
            Object.assign(record, changeRequest.changes, { modifiedAt: new Date().toISOString(), modifiedBy: String(actor.displayName || actor.name || actor.username) })
            fs.writeFileSync(payCasesFile, JSON.stringify(cases, null, 2))
          }
          changeRequest.status = input.decision
          changeRequest.reviewedAt = new Date().toISOString()
          changeRequest.reviewedBy = String(actor.displayName || actor.name || actor.username)
          fs.writeFileSync(payCaseChangeRequestsFile, JSON.stringify(requests, null, 2))
          return sendJson(response, 200, { ok: true, request: changeRequest })
        } catch { return sendJson(response, 400, { error: 'No se pudo resolver la solicitud.' }) }
      })

      server.middlewares.use('/api/pay/casos', async (request, response, next) => {
        if (!['GET', 'POST', 'DELETE'].includes(request.method)) return next()
        const actor = currentSessionUser(request)
        if (!actor || (actor.role !== 'administrador' && !actor.projects?.includes('pay'))) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        if (!fs.existsSync(payCasesFile)) fs.writeFileSync(payCasesFile, '[]')
        if (request.method === 'GET') {
          const cases = JSON.parse(fs.readFileSync(payCasesFile, 'utf8'))
          let changed = false
          const agents = readUsers().filter((item) => item.role === 'agente')
          for (const record of cases) {
            if (record.createdByUsername) continue
            const matches = agents.filter((user) => [user.displayName, user.name, user.username].filter(Boolean).some((name) => name === (record.agentName || record.author)))
            if (matches.length === 1) { record.createdByUsername = matches[0].username; changed = true }
          }
          if (changed) fs.writeFileSync(payCasesFile, JSON.stringify(cases, null, 2))
          return sendJson(response, 200, cases)
        }
        if (request.method === 'DELETE') {
          if (actor.role !== 'administrador') return sendJson(response, 403, { error: 'Solo administración puede eliminar registros.' })
          let input
          try { input = await readRequestBody(request) } catch { return sendJson(response, 400, { error: 'No se recibieron los datos de confirmación.' }) }
          const caseId = input.caseId
          const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
          if (!reason || reason.length > 1000) return sendJson(response, 400, { error: 'El motivo de eliminación es obligatorio (máximo 1000 caracteres).' })
          if (!verifyPassword(String(input.password || ''), actor.passwordHash)) return sendJson(response, 401, { error: 'La contraseña del administrador no es correcta.' })
          if (!caseId) return sendJson(response, 400, { error: 'Falta el identificador del registro.' })
          const cases = JSON.parse(fs.readFileSync(payCasesFile, 'utf8'))
          const recordIndex = cases.findIndex((item) => String(item.id) === caseId)
          if (recordIndex < 0) return sendJson(response, 404, { error: 'No se encontró el registro.' })
          const [record] = cases.splice(recordIndex, 1)
          const deletedCases = fs.existsSync(deletedPayCasesFile) ? JSON.parse(fs.readFileSync(deletedPayCasesFile, 'utf8')) : []
          const changeRequests = fs.existsSync(payCaseChangeRequestsFile) ? JSON.parse(fs.readFileSync(payCaseChangeRequestsFile, 'utf8')) : []
          changeRequests.forEach((item) => { if (item.caseId === record.id && item.status === 'Pendiente') { item.status = 'Cancelada'; item.reviewedAt = new Date().toISOString(); item.reviewedBy = 'Sistema'; item.reviewNote = 'El caso fue eliminado mientras la solicitud estaba pendiente.' } })
          deletedCases.push({ ...record, deletedAt: new Date().toISOString(), deletedBy: String(actor.displayName || actor.name || actor.username || 'Administrador').trim(), deletedByUsername: actor.username, deletionReason: reason })
          fs.writeFileSync(deletedPayCasesFile, JSON.stringify(deletedCases, null, 2))
          fs.writeFileSync(payCasesFile, JSON.stringify(cases, null, 2))
          fs.writeFileSync(payCaseChangeRequestsFile, JSON.stringify(changeRequests, null, 2))
          return sendJson(response, 200, { ok: true, record })
        }
        try {
          const input = await readRequestBody(request)
          const validAmount = Boolean(input && typeof input === 'object' && typeof input.amount === 'number' && Number.isFinite(input.amount) && input.amount > 0 && input.amount <= 100000000000000)
          const registrationType = input?.registrationType || 'Normal'
          const externalOrderId = typeof input?.externalOrderId === 'string' ? input.externalOrderId.trim() : ''
          const manualReason = typeof input?.manualReason === 'string' ? input.manualReason.trim() : ''
          if (!input || typeof input !== 'object') return sendJson(response, 400, { error: 'No se recibieron datos válidos para el caso.' })
          if (!['Normal', 'Manual'].includes(registrationType)) return sendJson(response, 400, { error: 'Elegí Registro normal o Registro manual.' })
          if (!['Depósito', 'Retiro'].includes(input.operation)) return sendJson(response, 400, { error: 'Elegí Depósito o Retiro como operación.' })
          if (!validAmount) {
            return sendJson(response, 400, { error: 'Ingresá un monto válido mayor que cero.' })
          }
          if (typeof input.playerId !== 'string' || !input.playerId.trim() || input.playerId.length > 120) return sendJson(response, 400, { error: 'Completá el ID de jugador (máximo 120 caracteres).' })
          if (typeof input.transactionId !== 'string' || !input.transactionId.trim() || input.transactionId.length > 160) return sendJson(response, 400, { error: 'Completá el ID de transacción (máximo 160 caracteres).' })
          if ((input.externalOrderId !== undefined && typeof input.externalOrderId !== 'string') || externalOrderId.length > 160 || (registrationType === 'Normal' && !externalOrderId)) return sendJson(response, 400, { error: registrationType === 'Normal' ? 'El ID de orden externa es obligatorio para un registro normal.' : 'El ID de orden externa no puede superar 160 caracteres.' })
          if (registrationType === 'Manual' && (!manualReason || manualReason.length > 1000)) return sendJson(response, 400, { error: 'El motivo del registro manual es obligatorio y admite hasta 1000 caracteres.' })
          const casinos = JSON.parse(fs.readFileSync(payCasinosFile, 'utf8'))
          const casino = casinos.find((item) => String(item.id) === String(input.casinoId) && item.status === 'Activo')
          if (!casino) return sendJson(response, 400, { error: 'Elegí un casino activo configurado por administración.' })
          const paymentMethod = (casino.paymentMethods || []).find((method) => method === input.paymentMethod)
          if (!paymentMethod) return sendJson(response, 400, { error: 'Elegí un método de pago habilitado para el casino.' })
          const currency = monedaSegunCasino(casino.name) || input.currency
          if (!['ARS', 'PYG'].includes(currency)) return sendJson(response, 400, { error: 'Elegí una moneda válida: ARS o PYG.' })
          if ((currency === 'PYG' && !Number.isInteger(input.amount)) || (currency === 'ARS' && Math.abs(input.amount * 100 - Math.round(input.amount * 100)) >= 1e-7)) return sendJson(response, 400, { error: currency === 'PYG' ? 'El casino está en Paraguay; ingresá un monto entero en PYG.' : 'El monto en ARS admite hasta dos decimales.' })
          if (!fs.existsSync(payCasesFile)) fs.writeFileSync(payCasesFile, '[]')
          const cases = JSON.parse(fs.readFileSync(payCasesFile, 'utf8'))
          const agentName = String(actor.displayName || actor.name || actor.username || 'Agente').trim()
          const record = { id: randomBytes(16).toString('hex'), casinoId: String(casino.id), casino: casino.name, paymentMethod, registrationType, manualReason: registrationType === 'Manual' ? manualReason : '', playerId: input.playerId.trim(), transactionId: input.transactionId.trim(), externalOrderId, amount: input.amount, currency, operation: input.operation, createdAt: new Date().toISOString(), createdByUsername: actor.username, agentName, author: agentName }
          cases.push(record)
          fs.writeFileSync(payCasesFile, JSON.stringify(cases, null, 2))
          return sendJson(response, 201, record)
        } catch { return sendJson(response, 400, { error: 'No se pudo guardar el caso.' }) }
      })


      server.middlewares.use('/api/pay/documento', (request, response, next) => {
        if (!canUsePay(request)) return sendJson(response, 403, { error: 'No tenés acceso a Orbital Pay.' })
        if (request.method === 'GET') {
          const [, casinoId = '', fileName = ''] = String(request.url || '').split('?')[0].split('/')
          if (!/^[a-zA-Z0-9_-]{1,80}$/.test(casinoId) || !/^[a-f0-9]{24}\.(xlsx|xls|csv|pdf|doc|docx)$/.test(fileName)) return sendJson(response, 404, { error: 'Documento no encontrado.' })
          const filePath = path.resolve(process.cwd(), 'data', 'pay-documents', casinoId, fileName)
          if (!filePath.startsWith(path.resolve(process.cwd(), 'data', 'pay-documents') + path.sep) || !fs.existsSync(filePath)) return sendJson(response, 404, { error: 'Documento no encontrado.' })
          const requestedName = new URL(request.url, 'http://localhost').searchParams.get('name') || fileName
          const safeName = path.basename(requestedName).replace(/[\r\n"\\]/g, '_').slice(0, 150)
          response.setHeader('Content-Type', 'application/octet-stream')
          response.setHeader('Content-Disposition', `attachment; filename="${safeName}"`)
          return fs.createReadStream(filePath).pipe(response)
        }
        if (request.method !== 'POST') return next()
        const originalName = decodeURIComponent(String(request.headers['x-file-name'] || 'documento').slice(0, 180))
        const extension = path.extname(originalName).toLowerCase()
        if (!['.xlsx', '.xls', '.csv', '.pdf', '.doc', '.docx'].includes(extension)) return sendJson(response, 415, { error: 'Formato no permitido. Usá XLSX, XLS, CSV, PDF, DOC o DOCX.' })
        const casinoId = String(request.headers['x-casino-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
        if (!casinoId) return sendJson(response, 400, { error: 'Falta indicar el casino.' })
        const chunks = []
        let size = 0
        let tooLarge = false
        request.on('data', (chunk) => {
          size += chunk.length
          if (size > 25 * 1024 * 1024) { tooLarge = true; chunks.length = 0 }
          else if (!tooLarge) chunks.push(chunk)
        })
        request.on('end', () => {
          if (tooLarge) return sendJson(response, 413, { error: 'El archivo no puede superar los 25 MB.' })
          if (!size) return sendJson(response, 400, { error: 'El archivo está vacío.' })
          const file = Buffer.concat(chunks)
          const hash = createHash('sha256').update(file).digest('hex').slice(0, 24)
          const fileName = `${hash}${extension}`
          const directory = path.resolve(process.cwd(), 'data', 'pay-documents', casinoId)
          fs.mkdirSync(directory, { recursive: true })
          fs.writeFileSync(path.join(directory, fileName), file)
          return sendJson(response, 200, { url: `/api/pay/documento/${casinoId}/${fileName}?name=${encodeURIComponent(path.basename(originalName))}`, name: path.basename(originalName), size })
        })
      })

      server.middlewares.use('/api/documentos/imagen', (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }
        if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })

        const imageTypes = {
          'image/png': { extension: 'png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
          'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
          'image/webp': { extension: 'webp', signature: (buffer) => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
          'image/gif': { extension: 'gif', signature: (buffer) => ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6)) },
        }
        const contentType = String(request.headers['content-type'] || '').split(';')[0].toLowerCase()
        const imageType = imageTypes[contentType]
        if (!imageType) {
          response.statusCode = 415
          response.end(JSON.stringify({ error: 'Formato de imagen no permitido.' }))
          return
        }

        const chunks = []
        let totalBytes = 0
        let tooLarge = false
        request.on('data', (chunk) => {
          totalBytes += chunk.length
          if (totalBytes > 12 * 1024 * 1024) {
            tooLarge = true
            chunks.length = 0
            return
          }
          if (!tooLarge) chunks.push(chunk)
        })
        request.on('end', () => {
          if (tooLarge) {
            response.statusCode = 413
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'La imagen no puede superar los 12 MB.' }))
            return
          }

          const image = Buffer.concat(chunks)
          if (!image.length || !imageType.signature(image)) {
            response.statusCode = 400
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: 'El archivo recibido no es una imagen válida.' }))
            return
          }

          const filename = `${createHash('sha256').update(image).digest('hex').slice(0, 20)}.${imageType.extension}`
          const imageDirectory = path.resolve(process.cwd(), 'public', 'document-assets', 'pegadas')
          fs.mkdirSync(imageDirectory, { recursive: true })
          fs.writeFileSync(path.join(imageDirectory, filename), image)
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ url: `/document-assets/pegadas/${filename}` }))
        })
      })

      server.middlewares.use('/api/documentos/importar', async (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }
        if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })

        try {
          const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
          const imported = []
          const failed = []

          for (const category of config.categories || []) {
            for (const document of category.documents || []) {
              if (!document.url) continue
              try {
                document.content = await importarTextoDocumento(document.url, document.title)
                if (new URL(document.url).hostname.endsWith('.p.clickup-attachments.com')) {
                  document.originalHtmlUrl = `/document-assets/${slugifyDocumentTitle(document.title)}/original.html`
                }
                imported.push(document.title)
              } catch (error) {
                if (document.title === 'Manual de Bancard' && !document.content?.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()) {
                  document.content = ''
                }
                failed.push({ title: document.title, reason: error.message })
              }
            }
          }

          if (config.faqUrl) {
            try {
              config.faqContent = await importarTextoDocumento(config.faqUrl, config.faqLinkTitle || 'Preguntas frecuentes')
              imported.push(config.faqLinkTitle || 'Preguntas frecuentes')
            } catch (error) {
              failed.push({ title: config.faqLinkTitle || 'Preguntas frecuentes', reason: error.message })
            }
          }

          limpiarCapturasSinReferencia(config)
          fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ config, imported, failed }))
        } catch {
          response.statusCode = 500
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ error: 'No se pudieron importar los documentos.' }))
        }
      })

      server.middlewares.use('/api/documentos/importar-individual', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
        try {
          const chunks = []
          for await (const chunk of request) chunks.push(chunk)
          const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          const storedConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'))
          const config = input.config && Array.isArray(input.config.categories) ? input.config : storedConfig
          const category = (config.categories || []).find((item) => item.target === input.categoryTarget)
          const title = String(input.title || '').trim().slice(0, 200)
          if (!category || !title) return sendJson(response, 400, { error: 'Indicá un nombre y una categoría válida.' })
          let content
          let sourceUrl = ''
          if (input.url) {
            const url = String(input.url).trim()
            if (!/^https:\/\//i.test(url) || url.length > 4000) return sendJson(response, 400, { error: 'La URL debe comenzar con https://.' })
            const imported = await importarTextoDocumento(url, title)
            content = imported.content
            sourceUrl = url
          } else {
            const raw = String(input.content || '')
            if (!raw || Buffer.byteLength(raw, 'utf8') > 50 * 1024 * 1024) return sendJson(response, 400, { error: 'El archivo está vacío o supera 50 MB.' })
            const isHtml = /\.html?$/i.test(String(input.fileName || '')) || /<\s*(?:html|body|h[1-6]|p|div|table)\b/i.test(raw)
            if (isHtml) {
              content = raw
            } else {
              content = `<p>${raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('</p><p>')}</p>`
            }
          }
          content = documentoHtmlCompleto(content, title)
          input.originalHtmlUrl = guardarHtmlImportado(category.target, title, content)
          const document = { icon: '📄', title, url: sourceUrl, content, ...(input.originalHtmlUrl ? { originalHtmlUrl: input.originalHtmlUrl } : {}) }
          category.documents = [...(category.documents || []), document]
          fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ config, category: category.title, document }))
        } catch (error) {
          sendJson(response, 400, { error: error.message || 'No se pudo importar el documento.' })
        }
      })

      server.middlewares.use('/api/documentos/guardar-html', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
        try {
          const input = await readRequestBody(request)
          const categoryTarget = String(input.categoryTarget || '')
          const title = String(input.title || '').trim().slice(0, 200)
          const html = String(input.html || '')
          if (!categoryTarget || !title || !/<html\b/i.test(html)) return sendJson(response, 400, { error: 'El documento HTML no es válido.' })
          if (Buffer.byteLength(html, 'utf8') > 50 * 1024 * 1024) return sendJson(response, 413, { error: 'El documento no puede superar 50 MB.' })
          const originalHtmlUrl = guardarHtmlImportado(categoryTarget, title, html)
          return sendJson(response, 200, { originalHtmlUrl })
        } catch (error) {
          return sendJson(response, 400, { error: error.message || 'No se pudo preparar el documento.' })
        }
      })

      server.middlewares.use('/api/comunicados', (request, response, next) => {
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/json')
          response.end(fs.readFileSync(comunicadosFile, 'utf8'))
          return
        }

        if (request.method === 'POST') {
          if (currentSessionUser(request)?.role !== 'administrador') return sendJson(response, 403, { ok: false, error: 'Acceso denegado.' })
          let body = ''
          request.on('data', (chunk) => {
            body += chunk
          })
          request.on('end', () => {
            try {
              const comunicados = JSON.parse(body)
              if (!Array.isArray(comunicados)) {
                throw new Error('Formato inválido')
              }

              fs.writeFileSync(comunicadosFile, JSON.stringify(comunicados, null, 2))
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ ok: true }))
            } catch {
              response.statusCode = 400
              response.end(JSON.stringify({ ok: false }))
            }
          })
          return
        }

        next()
      })

      server.middlewares.use('/api/auth/session', (request, response, next) => {
        if (request.method !== 'GET') return next()
        const user = currentSessionUser(request)
        if (!user) return sendJson(response, 401, { error: 'La sesión no está activa.' })
        return sendJson(response, 200, { user: safeUser(user) })
      })

      server.middlewares.use('/api/auth/login', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        try {
          const { username, password } = await readRequestBody(request)
          const users = readUsers()
          const user = users.find((item) => item.username === String(username || '').trim())
          if (!user) return sendJson(response, 401, { error: 'Usuario o contraseña incorrectos.' })
          if (user.blockedByAdmin) {
            return sendJson(response, 423, { error: 'Tu usuario fue bloqueado por el administrador.' })
          }
          const isAdministrator = user.role === 'administrador'
          if (!isAdministrator && (user.locked || user.failedAttempts >= 3)) {
            user.locked = true
            fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
            return sendJson(response, 423, { error: 'Usuario bloqueado por intentos fallidos. Contactá al administrador.' })
          }
          if (!verifyPassword(String(password || ''), user.passwordHash)) {
            if (isAdministrator) {
              return sendJson(response, 401, { error: 'Usuario o contraseña incorrectos.' })
            }
            user.failedAttempts += 1
            if (user.failedAttempts >= 3) user.locked = true
            fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
            const attemptsRemaining = Math.max(0, 3 - user.failedAttempts)
            return sendJson(response, user.locked ? 423 : 401, {
              error: user.locked ? 'Usuario bloqueado. Contactá al administrador.' : `Usuario o contraseña incorrectos. Intentos restantes: ${attemptsRemaining}.`,
              attemptsRemaining,
            })
          }

          user.failedAttempts = 0
          user.locked = false
          fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
          const token = randomBytes(32).toString('hex')
          authSessions.set(token, { username: user.username, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
          response.setHeader('Set-Cookie', `orbital_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`)
          return sendJson(response, 200, { user: safeUser(user) })
        } catch {
          return sendJson(response, 400, { error: 'No se pudo procesar el inicio de sesión.' })
        }
      })

      server.middlewares.use('/api/auth/logout', (request, response, next) => {
        if (request.method !== 'POST') return next()
        const token = request.headers.cookie?.match(/(?:^|;\s*)orbital_admin_session=([^;]+)/)?.[1]
        if (token) authSessions.delete(token)
        response.setHeader('Set-Cookie', 'orbital_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
        return sendJson(response, 200, { ok: true })
      })

      server.middlewares.use('/api/auth/change-password', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        const actor = currentSessionUser(request)
        if (!actor) return sendJson(response, 401, { error: 'La sesión venció. Iniciá sesión nuevamente.' })
        try {
          const { password } = await readRequestBody(request)
          if (typeof password !== 'string' || password.trim().length < 8) return sendJson(response, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' })
          const users = readUsers()
          const user = users.find((item) => item.username === actor.username)
          user.passwordHash = hashPassword(password.trim())
          user.mustChangePassword = false
          user.failedAttempts = 0
          user.locked = false
          fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
          return sendJson(response, 200, { ok: true })
        } catch {
          return sendJson(response, 400, { error: 'No se pudo guardar la nueva contraseña.' })
        }
      })

      server.middlewares.use('/api/admin/users/reset-password', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        const actor = currentSessionUser(request)
        if (actor?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
        try {
          const { username, password } = await readRequestBody(request)
          if (typeof password !== 'string' || password.length < 12) return sendJson(response, 400, { error: 'La contraseña temporal debe tener al menos 12 caracteres.' })
          const users = readUsers()
          const user = users.find((item) => item.username === username)
          if (!user) return sendJson(response, 404, { error: 'No se encontró el usuario.' })
          user.passwordHash = hashPassword(password)
          user.failedAttempts = 0
          user.locked = false
          user.blockedByAdmin = false
          user.mustChangePassword = true
          fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
          return sendJson(response, 200, { ok: true, user: safeUser(user) })
        } catch {
          return sendJson(response, 400, { error: 'No se pudo restablecer la contraseña.' })
        }
      })

      server.middlewares.use('/api/admin/users/unlock', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        const actor = currentSessionUser(request)
        if (actor?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
        try {
          const { username } = await readRequestBody(request)
          const users = readUsers()
          const user = users.find((item) => item.username === username)
          if (!user) return sendJson(response, 404, { error: 'No se encontró el usuario.' })
          user.failedAttempts = 0
          user.locked = false
          user.blockedByAdmin = false
          fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
          return sendJson(response, 200, { ok: true, user: safeUser(user) })
        } catch {
          return sendJson(response, 400, { error: 'No se pudo desbloquear el usuario.' })
        }
      })

      server.middlewares.use('/api/admin/users/block', async (request, response, next) => {
        if (request.method !== 'POST') return next()
        const actor = currentSessionUser(request)
        if (actor?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
        try {
          const { username } = await readRequestBody(request)
          if (username === actor.username) return sendJson(response, 400, { error: 'No podés bloquear tu propio usuario.' })
          const users = readUsers()
          const user = users.find((item) => item.username === username)
          if (!user) return sendJson(response, 404, { error: 'No se encontró el usuario.' })
          user.locked = true
          user.blockedByAdmin = true
          fs.writeFileSync(usuariosFile, JSON.stringify(users, null, 2))
          return sendJson(response, 200, { ok: true, user: safeUser(user) })
        } catch {
          return sendJson(response, 400, { error: 'No se pudo bloquear el usuario.' })
        }
      })

      server.middlewares.use('/api/usuarios', async (request, response, next) => {
        if (!['GET', 'POST'].includes(request.method)) return next()
        const actor = currentSessionUser(request)
        if (request.method === 'GET') {
          if (!actor || actor.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
          return sendJson(response, 200, readUsers().map(safeUser))
        }
        if (actor?.role !== 'administrador') return sendJson(response, 403, { error: 'Acceso denegado.' })
        try {
          const submittedUsers = await readRequestBody(request)
          const currentUsers = readUsers()
          if (!Array.isArray(submittedUsers) || submittedUsers.some((user) =>
            typeof user.username !== 'string' || !['administrador', 'agente'].includes(user.role) ||
            (user.projects !== undefined && (!Array.isArray(user.projects) || user.projects.some((project) => !['wallet', 'pay'].includes(project)) || (user.role === 'agente' && user.projects.length === 0)))
          )) throw new Error('Formato inválido')

          const updatedUsers = submittedUsers.map((user) => {
            const previous = currentUsers.find((item) => item.username === user.username)
            const nextUser = {
              ...(previous || {}),
              ...user,
              projects: Array.isArray(user.projects) ? [...new Set(user.projects)] : previous?.projects || ['wallet', 'pay'],
              failedAttempts: Number.isInteger(user.failedAttempts) ? user.failedAttempts : previous?.failedAttempts || 0,
              locked: typeof user.locked === 'boolean' ? user.locked : previous?.locked || false,
            }
            if (nextUser.role === 'administrador' && !nextUser.blockedByAdmin) {
              nextUser.failedAttempts = 0
              nextUser.locked = false
            }
            if (typeof user.password === 'string' && user.password.length >= 8) {
              nextUser.passwordHash = hashPassword(user.password)
              nextUser.mustChangePassword = Boolean(user.mustChangePassword)
            }
            delete nextUser.password
            if (!previous && !nextUser.passwordHash) throw new Error('Falta contraseña para el nuevo usuario.')
            return nextUser
          })
          if (!updatedUsers.some((user) => user.role === 'administrador')) throw new Error('Debe quedar al menos un administrador.')
          fs.writeFileSync(usuariosFile, JSON.stringify(updatedUsers, null, 2))
          return sendJson(response, 200, { ok: true, users: updatedUsers.map(safeUser) })
        } catch {
          return sendJson(response, 400, { ok: false, error: 'No se pudieron guardar los usuarios.' })
        }
      })
    },
    // Keep API routes available in the single-instance Compose deployment and local build preview.
    configurePreviewServer(server) {
      comunicadosApi().configureServer(server)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [comunicadosApi(), react()],
  optimizeDeps: {
    include: ['exceljs'],
  },
  server: {
    host: true,
  },
})
