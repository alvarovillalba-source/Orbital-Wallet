# Orbital Wallet

Aplicación interna construida con React y Vite para consultar y administrar contenido de Orbital Wallet y Orbital Pay. Incluye registro de casos, guías, comunicados, reportes y administración de usuarios.

## Requisitos

- Node.js compatible con Vite 8
- npm

## Desarrollo

```sh
npm install
npm run dev
```

El servidor de desarrollo sirve la interfaz y las rutas `/api/*` definidas en `vite.config.js`. Los datos editables se guardan en archivos de `data/`; los documentos y las imágenes se guardan en `data/pay-documents/` y `public/document-assets/`.

## Comprobaciones y vista previa

```sh
npm run lint
npm run build
npm run preview
```

La vista previa también conecta las rutas API para revisar localmente el build. En el despliegue Compose de una sola instancia, este mismo servidor entrega la compilación y las rutas API detrás del proxy HTTPS.

## Despliegue en un servidor

El proyecto incluye Docker Compose con el servidor de la aplicación, HTTPS automático con Caddy y volúmenes persistentes para datos y documentos. Se requiere un servidor Linux con Docker Engine y Compose, un dominio cuyo DNS apunte al servidor y los puertos TCP 80 y 443 accesibles desde Internet.

```sh
cp .env.example .env
# Editar .env y establecer ORBITAL_DOMAIN con el dominio real
docker compose up -d --build
docker compose logs -f proxy app
```

Caddy obtiene y renueva el certificado TLS. La aplicación no publica su puerto directamente; el proxy HTTPS es el único servicio expuesto. Para actualizar, ejecutar `docker compose up -d --build`. Los volúmenes `orbital_data` y `orbital_documents` preservan los archivos entre actualizaciones y reinicios.

La aplicación usa un único proceso y archivos JSON como almacenamiento. Es apropiado para una instancia de servidor y conserva el comportamiento y los datos actuales; no escalar a varias réplicas. Las sesiones viven en memoria y se cierran al reiniciar la aplicación. Hacer copias de seguridad periódicas de los volúmenes antes de actualizar o migrar el servidor:

```sh
docker compose exec -T app tar -czf - /app/data /app/public/document-assets > orbital-backup.tar.gz
```

El endpoint `GET /api/health` sirve para comprobar que la aplicación responde. El build de Vite por sí solo no incluye un backend; el despliegue debe hacerse con Compose para que las rutas API estén habilitadas.

## Datos locales

Los archivos de `data/` y `public/document-assets/` contienen estado de la aplicación. Hacer una copia de seguridad antes de cambiar de entorno o restaurar datos. No almacenar credenciales reales en el repositorio.
