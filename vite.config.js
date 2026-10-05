import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import TurndownService from 'turndown'

const comunicadosFile = path.resolve(process.cwd(), 'data/comunicados.json')
const configFile = path.resolve(process.cwd(), 'data/site-config.json')
const usuariosFile = path.resolve(process.cwd(), 'data/usuarios.json')

function slugifyDocumentTitle(title) {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function limpiarCapturasSinReferencia(config) {
  const assetRoot = path.resolve(process.cwd(), 'public', 'document-assets')
  if (!fs.existsSync(assetRoot)) return

  const markdown = [
    config.faqContent || '',
    ...(config.categories || []).flatMap((category) => (category.documents || []).map((document) => document.content || '')),
  ].join('\n')
  const references = new Set([...markdown.matchAll(/\/document-assets\/[^)\s"'<>]+/g)].map(([source]) => (
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

function comunicadosApi() {
  return {
    name: 'comunicados-api',
    configureServer(server) {
      server.middlewares.use('/api/config', (request, response, next) => {
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/json')
          response.end(fs.readFileSync(configFile, 'utf8'))
          return
        }

        if (request.method === 'POST') {
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

      server.middlewares.use('/api/documentos/imagen', (request, response, next) => {
        if (request.method !== 'POST') {
          next()
          return
        }

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

        try {
          const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
          const imported = []
          const failed = []

          for (const category of config.categories || []) {
            for (const document of category.documents || []) {
              if (!document.url) continue
              try {
                document.content = await importarTextoDocumento(document.url, document.title)
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

      server.middlewares.use('/api/comunicados', (request, response, next) => {
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/json')
          response.end(fs.readFileSync(comunicadosFile, 'utf8'))
          return
        }

        if (request.method === 'POST') {
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

      server.middlewares.use('/api/usuarios', (request, response, next) => {
        if (request.method === 'GET') {
          response.setHeader('Content-Type', 'application/json')
          response.end(fs.readFileSync(usuariosFile, 'utf8'))
          return
        }

        if (request.method === 'POST') {
          let body = ''
          request.on('data', (chunk) => {
            body += chunk
          })
          request.on('end', () => {
            try {
              const usuarios = JSON.parse(body)
              if (!Array.isArray(usuarios) || usuarios.some((usuario) =>
                typeof usuario.username !== 'string' || typeof usuario.password !== 'string' ||
                !['administrador', 'agente'].includes(usuario.role)
              )) {
                throw new Error('Formato inválido')
              }

              fs.writeFileSync(usuariosFile, JSON.stringify(usuarios, null, 2))
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
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [comunicadosApi(), react()],
  server: {
    host: true,
  },
})
