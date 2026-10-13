import "./App.css";
import logo from "./assets/Logo.png";
import { lazy, Suspense, useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { documentoAHtml } from "./documentContent";
import CommunicationEditor from "./CommunicationEditor";

const AdminDocumentEditorPage = lazy(() => import("./DocumentRichEditor.jsx"));

const CONSULTAS_KEY = "orbital-wallet-consultas";
const COMUNICADOS_KEY = "orbital-wallet-comunicados";
const ADMIN_USERNAME_KEY = "orbital-wallet-admin-username";
const ADMIN_USERS_KEY = "orbital-wallet-admin-users";
const ADMIN_SESSION_KEY = "orbital-wallet-admin-session";
const ADMIN_SESSION_ROLE_KEY = "orbital-wallet-admin-session-role";
const ADMIN_MUST_CHANGE_PASSWORD_KEY = "orbital-wallet-admin-must-change-password";
const ADMIN_ACTIVITY_KEY = "orbital-wallet-admin-activity";
const THEME_KEY = "orbital-wallet-theme";
const CASINOS_KEY = "orbital-pay-casinos";
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_ADMIN_USERNAME = "admin";
const ADMIN_ROLE = "administrador";
const AGENT_ROLE = "agente";

function leerConsultas() {
  try {
    return JSON.parse(localStorage.getItem(CONSULTAS_KEY)) || {};
  } catch {
    return {};
  }
}

function registrarConsulta(titulo) {
  const consultas = leerConsultas();
  const nuevasConsultas = {
    ...consultas,
    [titulo]: (consultas[titulo] || 0) + 1,
  };

  localStorage.setItem(CONSULTAS_KEY, JSON.stringify(nuevasConsultas));
  return nuevasConsultas;
}

const comunicadosIniciales = [
  {
    message: "Atención.\n\nEl día de hoy 17/09/2026 estaremos presentando intermitencias en el servicio de transferencias SPI debido a una actualización del BCP.\n\nEsto se llevará a cabo desde las 01:00 hs hasta las 03:00 hs.\n\nUna vez finalizadas las tareas de mantenimiento, el servicio volverá a operar con normalidad.\n\nLos servicios afectados son los siguientes:\n\n- Orbital Wallet\n- Orbital Retiros Azar Latino Paraguay",
    date: "17/09/2026",
    time: "16:38",
  },
  {
    message: "No hay comunicados nuevos disponibles.",
    date: "17/09/2026",
    time: "16:05",
  },
  {
    message: "HOLA HOLA HOLA",
    date: "17/09/2026",
    time: "16:04",
  },
];

function leerComunicados() {
  try {
    const guardados = JSON.parse(localStorage.getItem(COMUNICADOS_KEY));
    return Array.isArray(guardados) ? guardados : comunicadosIniciales;
  } catch {
    return comunicadosIniciales;
  }
}

function guardarComunicados(comunicados) {
  localStorage.setItem(COMUNICADOS_KEY, JSON.stringify(comunicados));
  return fetch("/api/comunicados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(comunicados),
  }).catch(() => null);
}

function leerUsuarioAdmin() {
  return localStorage.getItem(ADMIN_USERNAME_KEY) || DEFAULT_ADMIN_USERNAME;
}

function leerUsuariosAdmin() {
  try {
    const usuarios = JSON.parse(localStorage.getItem(ADMIN_USERS_KEY));
    if (Array.isArray(usuarios) && usuarios.length > 0) {
      return normalizarUsuariosAdmin(usuarios);
    }
  } catch {
    // Usa las credenciales antiguas si la lista no existe o está dañada.
  }

  return [{ username: leerUsuarioAdmin(), role: ADMIN_ROLE }];
}

function normalizarUsuariosAdmin(usuarios) {
  return usuarios.map((usuario) => ({
    ...usuario,
    role: usuario.username?.toLowerCase() === "alvaro villalba" || usuario.username === DEFAULT_ADMIN_USERNAME
      ? ADMIN_ROLE
      : usuario.role || AGENT_ROLE,
  }));
}

function usuariosSinCredenciales(usuarios) {
  return usuarios.map(({ password, ...usuario }) => usuario);
}

async function obtenerUsuariosAdmin() {
  const response = await fetch("/api/usuarios");
  if (!response.ok) {
    throw new Error("No se pudieron cargar los usuarios compartidos.");
  }

  const usuarios = await response.json();
  if (!Array.isArray(usuarios)) {
    throw new Error("La lista de usuarios compartidos no es válida.");
  }

  const usuariosNormalizados = normalizarUsuariosAdmin(usuarios);
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(usuariosNormalizados));
  return usuariosNormalizados;
}

function guardarUsuariosAdmin(usuarios) {
  return fetch("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(usuarios),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("No se pudieron guardar los usuarios compartidos.");
    }
    const result = await response.json();
    localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(result.users || usuariosSinCredenciales(usuarios)));
    return result.users || usuariosSinCredenciales(usuarios);
  }).catch(() => {
    window.alert("No se pudieron guardar los usuarios en el servidor compartido.");
  });
}

function marcarActividadSesion() {
  if (localStorage.getItem(ADMIN_SESSION_KEY)) {
    const ultimaActividad = Number(localStorage.getItem(ADMIN_ACTIVITY_KEY));
    if (!ultimaActividad || Date.now() - ultimaActividad >= 30 * 1000) {
      localStorage.setItem(ADMIN_ACTIVITY_KEY, String(Date.now()));
    }
  }
}

function generarPassword() {
  const caracteres = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const randomValues = new Uint32Array(16);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => caracteres[value % caracteres.length]).join("");
}

function leerSesionAdmin() {
  const sesion = localStorage.getItem(ADMIN_SESSION_KEY);
  if (!sesion) {
    return "";
  }

  const actividad = Number(localStorage.getItem(ADMIN_ACTIVITY_KEY));
  if (actividad && Date.now() - actividad >= SESSION_TIMEOUT_MS) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_ACTIVITY_KEY);
    return "";
  }

  if (!actividad) {
    marcarActividadSesion();
  }

  return sesion === "true" ? leerUsuarioAdmin() : sesion;
}

function leerRolSesionAdmin() {
  const sesion = leerSesionAdmin();
  if (!sesion) {
    return "";
  }

  return leerUsuariosAdmin().find((usuario) => usuario.username === sesion)?.role || AGENT_ROLE;
}

function guardarSesion(usuario) {
  const usuarios = leerUsuariosAdmin().filter((item) => item.username !== usuario.username);
  localStorage.setItem(ADMIN_USERS_KEY, JSON.stringify(usuariosSinCredenciales([...usuarios, usuario])));
  localStorage.setItem(ADMIN_SESSION_KEY, usuario.username);
  localStorage.setItem(ADMIN_SESSION_ROLE_KEY, usuario.role);
  if (usuario.mustChangePassword) {
    localStorage.setItem(ADMIN_MUST_CHANGE_PASSWORD_KEY, "true");
  } else {
    localStorage.removeItem(ADMIN_MUST_CHANGE_PASSWORD_KEY);
  }
  marcarActividadSesion();
}

const procesos = [
  {
    title: "Crear una cuenta",
    category: "Onboarding",
    url: "https://t90171296805.p.clickup-attachments.com/t90171296805/f8d616ad-6adc-4206-bdfe-3ae0d2cd8a01/crear-cuenta.html?view=open",
  },
  {
    title: "Recuperar contraseña",
    category: "Onboarding",
    url: "https://t90171296805.p.clickup-attachments.com/t90171296805/b164cc82-2985-4aec-a6a9-cf6615091996/olvide-contrasena.html?view=open",
  },
  {
    title: "Cancelar una cuenta",
    category: "Onboarding",
    url: "https://t90171296805.p.clickup-attachments.com/t90171296805/b20582d2-3f75-4877-8642-78abeed524e0/cierre-de-cuenta.html?view=open",
  },
  {
    title: "Transferencias",
    category: "Operaciones",
    url: "https://docs.google.com/document/d/1ztv_-mfXZwmO_xzGzkvD-OsCxOB18LJxX0p7sCswG2A/edit?tab=t.0",
  },
  {
    title: "Caja de ahorro",
    category: "Operaciones",
    url: "https://docs.google.com/document/d/1HA9JvqGeEDT11_4XrZl-2XajGBik_GaDrza9lOAHyis/edit?tab=t.0",
  },
  {
    title: "Protocolo de Fraudes",
    category: "Seguridad",
    url: "https://docs.google.com/document/d/1YDXSBFNYAm4CdIRBU7kN0UoQ9SMn9XpqGTXZJnzCQbc/edit?tab=t.0",
  },
];

const categorias = [
  { icon: "👤", logo: "", title: "ONBOARDING", description: "Creación y gestión inicial de clientes", content: "", target: "onboarding" },
  { icon: "💳", logo: "", title: "OPERACIONES", description: "Gestión de operaciones y cuentas", content: "", target: "operaciones" },
  { icon: "🛡️", logo: "", title: "SEGURIDAD", description: "Validaciones y casos especiales", content: "", target: "seguridad" },
  { icon: "📚", logo: "", title: "PROCEDIMIENTOS", description: "Guías para gestionar casos de clientes", content: "", target: "procedimientos" },
];

const configuracionInicial = {
  logoUrl: "",
  backgroundColor: "",
  backgroundImage: "",
  headerSubtitle: "Manual Interno de Atención y Procesos",
  communicationsTitle: "Comunicados",
  communicationsDescription: "Novedades y avisos importantes del equipo.",
  introTitle: "¿Qué necesitás hacer?",
  introDescription: "Seleccioná una categoría para acceder al procedimiento correspondiente.",
  popularTitle: "Procesos más utilizados",
  popularDescription: "Accedé directamente a los procedimientos que el equipo consulta con mayor frecuencia durante la atención.",
  faqTitle: "Preguntas frecuentes",
  faqDescription: "Consultá las respuestas a las preguntas más habituales del equipo.",
  faqLinkTitle: "Preguntas frecuentes",
  faqLinkText: "Consultar documentación →",
  faqUrl: "https://docs.google.com/document/d/1B9Ok1MzBvZKjzPg7hRkLyQGoFPHmBASRWv_NWv4bPGE/edit?tab=t.0",
  faqContent: "",
  suggestionsTitle: "Sugerencias",
  suggestionsDescription: "Ayudanos a mejorar el manual compartiendo tus ideas y propuestas.",
  suggestionsLinkTitle: "Enviar una sugerencia",
  suggestionsLinkText: "Abrir formulario →",
  suggestionsUrl: "https://docs.google.com/forms/d/e/1FAIpQLSfODSKkrw6Pj0llPeG1H6a5OB9EBdxnpEMpY5dn_1MHOLm0yw/viewform?usp=preview",
  footerBrand: "ORBITAL WALLET",
  footerNote: "Uso Interno - Desarrollado por Alvaro Villalba",
  categories: categorias,
  processes: procesos,
};

function combinarConfiguracion(config) {
  return {
    ...configuracionInicial,
    ...config,
    categories: (config?.categories?.length ? config.categories : configuracionInicial.categories).map((categoria, index) => ({
      ...configuracionInicial.categories[index],
      ...categoria,
      logo: categoria.logo || "",
      content: categoria.content || "",
      documents: categoria.documents || documentosPorCategoria[categoria.target]?.documents || [],
    })),
    processes: config?.processes?.length ? config.processes : configuracionInicial.processes,
  };
}

function getBrandStyles(content) {
  const hasCustomColor = Boolean(content.backgroundColor);
  return {
    "--page-background-color": content.backgroundColor || "transparent",
    "--page-background-image": content.backgroundImage
      ? `url(${JSON.stringify(content.backgroundImage)})`
      : hasCustomColor
        ? "none"
        : "linear-gradient(135deg, #080808 0%, #151515 52%, #3b0008 100%)",
  };
}

const documentosPorCategoria = {
  onboarding: {
    icon: "👤",
    title: "Onboarding",
    description: "Procedimientos relacionados con la creación y gestión inicial de clientes.",
    documents: [
      { icon: "📄", title: "Crear una cuenta", url: procesos[0].url },
      { icon: "🔑", title: "Olvidé mi contraseña", url: procesos[1].url },
      { icon: "🚫", title: "Proceso de cancelación de cuenta", url: procesos[2].url },
    ],
  },
  operaciones: {
    icon: "💳",
    title: "Operaciones",
    description: "Procedimientos relacionados con operaciones y gestión de cuentas.",
    documents: [
      { icon: "💸", title: "Transferencias", url: procesos[3].url },
      { icon: "🏦", title: "Caja de ahorro", url: procesos[4].url },
      {
        icon: "🏛️",
        title: "Manual de Bancard",
        url: "https://docs.google.com/document/d/1Nn3zZX0V4zhfRDXlR5QFcmQEqcHsN-Pmu3kcBAHjlPQ/edit?tab=t.0",
      },
    ],
  },
  seguridad: {
    icon: "🛡️",
    title: "Seguridad",
    description: "Validaciones y procedimientos relacionados con casos especiales de seguridad.",
    documents: [{ icon: "🔒", title: "Protocolo de Fraudes", url: "https://docs.google.com/document/d/1YDXSBFNYAm4CdIRBU7kN0UoQ9SMn9XpqGTXZJnzCQbc/edit?tab=t.0" }],
  },
  procedimientos: {
    icon: "📚",
    title: "Procedimientos",
    description: "Guías internas para facilitar la gestión de casos durante la atención al cliente.",
    documents: [],
  },
};

function Header({ content, username = "" }) {
  const activeUsername = username || leerSesionAdmin();
  const isAdministrator = Boolean(activeUsername) && leerRolSesionAdmin() === ADMIN_ROLE;
  const isAdminRoute = window.location.pathname.startsWith("/admin");
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!activeUsername) return undefined;
    let cancelled = false;
    const validateSession = async () => {
      try {
        const response = await fetch("/api/auth/session");
        if (!response.ok && !cancelled) {
          localStorage.removeItem(ADMIN_SESSION_KEY);
          localStorage.removeItem(ADMIN_SESSION_ROLE_KEY);
          localStorage.removeItem(ADMIN_ACTIVITY_KEY);
          window.location.replace("/");
        }
      } catch {
        // A temporary network error does not end the local session.
      }
    };
    validateSession();
    const timer = window.setInterval(validateSession, 30 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeUsername]);

  return (
    <header className="hero">
      {activeUsername && (
        <span className="admin-current-user">Usuario: {activeUsername}</span>
      )}
      <div className="hero-actions">
        {isAdministrator && (
          <a className="admin-switch-button" href={isAdminRoute ? "/" : "/admin"}>
            {isAdminRoute ? "Ir a Inicio" : "Ir a Administrador"}
          </a>
        )}
        <button
          className="theme-toggle"
          type="button"
          title={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
          onClick={() => setTheme((currentTheme) => currentTheme === "dark" ? "light" : "dark")}
        >
          <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
          {theme === "dark" ? "Modo claro" : "Modo oscuro"}
        </button>
        {activeUsername && (
          <button
            className="logout-button"
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
              localStorage.removeItem(ADMIN_SESSION_KEY);
              localStorage.removeItem(ADMIN_SESSION_ROLE_KEY);
              localStorage.removeItem(ADMIN_ACTIVITY_KEY);
              window.location.href = "/";
            }}
          >
            ↪ Cerrar sesión
          </button>
        )}
      </div>
      <div className="hero-content">
        <img src={content.logoUrl || logo} alt="Orbital Wallet" className="logo-image" />
        <div>
          <p>{content.headerSubtitle}</p>
        </div>
      </div>
    </header>
  );
}

function Footer({ content }) {
  return (
    <footer>
      <strong>{content.footerBrand}</strong>
      <small>{content.footerNote}</small>
    </footer>
  );
}

function NavigationLinks({ admin = false, backHref }) {
  const destination = backHref || (admin ? "/admin" : "/");
  return (
    <div className="navigation-links">
      <a className="back-link" href={destination}>← Volver atrás</a>
      <a className="back-link" href={admin ? "/admin" : "/"}>⌂ Volver al inicio</a>
    </div>
  );
}

function slugifyDocumentTitle(title) {
  return title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getDocumentRoute(category, document) {
  return `/documentos/${category.target}/${slugifyDocumentTitle(document.title)}`;
}

function getAdminDocumentEditorRoute(category, document) {
  return `/admin/documento/${category.target}/${slugifyDocumentTitle(document.title)}`;
}

function findDocumentForProcess(content, process) {
  for (const category of content.categories) {
    const document = category.documents.find((item) => item.url === process.url || item.title === process.title);
    if (document) {
      return { category, document };
    }
  }
  return null;
}

function DocumentPage({ document, category, content }) {
  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} />
      <main className="category-page integrated-document-page">
        <NavigationLinks backHref={category?.target ? `/${category.target}` : "/"} />
        <article className="integrated-document">
          <header className="integrated-document-header">
            <div className="integrated-document-icon">{document.icon || "📄"}</div>
            <div>
              {category && <small>{category.title}</small>}
              <h1>{document.title}</h1>
            </div>
          </header>
          {document.originalHtmlUrl ? (
            <div className="integrated-document-original">
              <iframe
                title={`Documento original: ${document.title}`}
                src={document.originalHtmlUrl}
                sandbox="allow-same-origin"
                onLoad={(event) => {
                  const frame = event.currentTarget;
                  const page = frame.contentDocument;
                  if (!page) return;
                  const height = Math.max(page.documentElement?.scrollHeight || 0, page.body?.scrollHeight || 0);
                  if (height > 0) frame.style.height = `${height}px`;
                }}
              />
            </div>
          ) : document.content ? (
            <div className="integrated-document-content">
              <div dangerouslySetInnerHTML={{ __html: documentoAHtml(document.content) }} />
            </div>
          ) : (
            <div className="document-content-pending">
              <p>Este documento todavía no tiene una copia integrada.</p>
              {document.url && <a href={document.url} target="_blank" rel="noopener noreferrer">Abrir documento original ↗</a>}
            </div>
          )}
          {document.content && document.url && (
            <a className="document-source-link" href={document.url} target="_blank" rel="noopener noreferrer">
              Abrir documento original ↗
            </a>
          )}
        </article>
      </main>
    </div>
  );
}

function CategoryPage({ category, categoryContent, onConsultation, content }) {
  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} />
      <main className="category-page">
        <NavigationLinks backHref="/" />
        <section className="category-detail">
          <div className="category-detail-icon">
            {categoryContent.logo ? <img src={categoryContent.logo} alt="" /> : category.icon}
          </div>
          <h1>{category.title}</h1>
          <p>{category.description}</p>
          {categoryContent.content && <div className="category-extra-content">{categoryContent.content}</div>}
        </section>
        {categoryContent.documents.length > 0 ? (
          <div className="document-list">
            {categoryContent.documents.map((document) => (
              <a className="document-link" href={getDocumentRoute(categoryContent, document)} key={document.title} onClick={() => onConsultation(document.title)}>
                <span>{document.icon}</span>
                <div>
                  <strong>{document.title}</strong>
                  <small>{document.content ? "Leer documento →" : "Ver documento →"}</small>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="empty-section">
            <span>📖</span>
            <p>HOLA HOLA HOLA</p>
          </div>
        )}
      </main>
    </div>
  );
}

function CommunicationCard({ comunicado, onDelete }) {
  return (
    <article className="communication-item">
      <span>📢</span>
      <div className="communication-item-body">
        <div className="communication-item-message" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comunicado.message || "") }} />
        <small>{comunicado.date} - {comunicado.time}</small>
      </div>
      {onDelete && (
        <button className="communication-delete" type="button" onClick={onDelete}>
          Eliminar
        </button>
      )}
    </article>
  );
}

function CommunicationsPage({ comunicados, content, previousOnly = false }) {
  const avisos = previousOnly ? comunicados.slice(1) : [comunicados[0]];

  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} />
      <main className="category-page">
        <NavigationLinks backHref={previousOnly ? "/comunicados" : "/"} />
        <section className="category-detail">
          <div className="category-detail-icon">📢</div>
          <h1>{previousOnly ? "Comunicados anteriores" : "Comunicados"}</h1>
          <p>
            {previousOnly
              ? "Historial de avisos publicados anteriormente."
              : "Aviso principal del equipo."}
          </p>
        </section>

        <div className="communications-list">
          {avisos.length > 0 ? (
            avisos.map((comunicado) => (
              <CommunicationCard
                comunicado={comunicado}
                key={`${comunicado.date}-${comunicado.time}-${comunicado.message}`}
              />
            ))
          ) : (
            <div className="empty-section">
              <span>📢</span>
              <p>No hay comunicados anteriores disponibles.</p>
            </div>
          )}
        </div>

        {!previousOnly && comunicados.length > 1 && (
          <a className="category-link communication-action" href="/comunicados/anteriores">
            Ver comunicados anteriores →
          </a>
        )}
      </main>
    </div>
  );
}

function PublicLoginSection({ redirectTo = "/admin" }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const authenticate = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "No se pudo iniciar sesión.");
        return;
      }
      const usuario = result.user;
      guardarSesion(usuario);
      window.location.href = usuario.mustChangePassword ? "/cambiar-password" : "/modulos";
    } catch {
      setError("No se pudo conectar con el servidor de acceso.");
    }
  };

  return (
    <section className="public-login-section">
      <div className="section-heading">
        <h2>Iniciar sesión</h2>
        <p>Accedé a la información protegida con tu usuario y contraseña.</p>
      </div>
      <form className="public-login-form" onSubmit={authenticate}>
        <label>
          Usuario
          <input type="text" value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} required />
        </label>
        <label>
          Contraseña
          <input type="password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} required />
        </label>
        {error && <p className="public-login-error" role="alert">{error}</p>}
        <button type="submit">Ingresar</button>
      </form>
    </section>
  );
}

function ModulePicker({ content }) {
  return <div className="app" style={getBrandStyles(content)}>
    <Header content={content} />
    <main className="module-picker">
      <div className="section-heading"><span className="pay-kicker">PLATAFORMA ORBITAL</span><h1>¿A qué módulo querés ingresar?</h1><p>Elegí el espacio de trabajo que necesitás usar.</p></div>
      <div className="module-grid">
        <a className="module-card wallet-module" href="/"><span className="module-symbol">◉</span><span className="module-tag">ATENCIÓN Y OPERACIONES</span><h2>Orbital Wallet</h2><p>Manuales, procedimientos y comunicados del equipo.</p><span className="module-cta">Ingresar a Wallet <b>→</b></span></a>
        <a className="module-card pay-module" href="/orbital-pay"><span className="module-symbol">₱</span><span className="module-tag">GESTIÓN DE CASINOS</span><h2>Orbital Pay</h2><p>Administrá casinos, contactos y el estado de cada operación.</p><span className="module-cta">Ingresar a Pay <b>→</b></span></a>
      </div>
    </main>
  </div>;
}

function OrbitalPayPage({ content }) {
  const [casinos, setCasinos] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(CASINOS_KEY)); return Array.isArray(saved) ? saved : []; } catch { return []; }
  });
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("Activo");
  const save = (items) => { setCasinos(items); localStorage.setItem(CASINOS_KEY, JSON.stringify(items)); };
  const addCasino = (event) => { event.preventDefault(); save([...casinos, { id: Date.now(), name: name.trim(), contact: contact.trim(), status }]); setName(""); setContact(""); };
  return <div className="app pay-app"><Header content={{ ...content, headerSubtitle: "Gestión de casinos · Orbital Pay" }} />
    <main className="pay-dashboard">
      <nav className="pay-nav"><a href="/modulos">← Cambiar módulo</a><span>ORBITAL PAY / CASINOS</span></nav>
      <div className="pay-heading"><div><span className="pay-kicker">CENTRO DE OPERACIONES</span><h1>Gestión de casinos</h1><p>Administrá los establecimientos vinculados a Orbital Pay.</p></div><div className="pay-total"><strong>{String(casinos.length).padStart(2, "0")}</strong><span>CASINOS REGISTRADOS</span></div></div>
      <div className="pay-layout"><section className="pay-panel pay-form-panel"><div className="pay-panel-title"><span>＋</span><div><small>NUEVO REGISTRO</small><h2>Agregar casino</h2></div></div><form className="pay-form" onSubmit={addCasino}><label>Nombre del casino<input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Casino Central" required /></label><label>Contacto responsable<input value={contact} onChange={e => setContact(e.target.value)} placeholder="Nombre o correo" /></label><label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option>Activo</option><option>En revisión</option><option>Inactivo</option></select></label><button type="submit">Guardar casino <span>→</span></button></form></section>
      <section className="pay-panel pay-list-panel"><div className="pay-panel-title"><span>▤</span><div><small>DIRECTORIO</small><h2>Casinos registrados</h2></div></div>{casinos.length ? <div className="casino-list">{casinos.map(casino => <article className="casino-row" key={casino.id}><div className="casino-avatar">{casino.name.slice(0,1).toUpperCase()}</div><div className="casino-info"><strong>{casino.name}</strong><small>{casino.contact || "Sin contacto asignado"}</small></div><span className={`casino-status ${casino.status === "Activo" ? "is-active" : ""}`}>{casino.status}</span><button type="button" className="casino-delete" aria-label={`Eliminar ${casino.name}`} onClick={() => save(casinos.filter(item => item.id !== casino.id))}>×</button></article>)}</div> : <div className="casino-empty"><span>▤</span><strong>Aún no hay casinos</strong><p>Los nuevos registros aparecerán en este directorio.</p></div>}</section></div>
    </main>
  </div>;
}

function PasswordChangePage({ content, username }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const changePassword = async (event) => {
    event.preventDefault();
    if (newPassword.trim().length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword.trim() }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "No se pudo guardar la nueva contraseña.");
      }

      localStorage.removeItem(ADMIN_MUST_CHANGE_PASSWORD_KEY);
      window.location.assign("/");
    } catch {
      setError("No se pudo guardar la contraseña. Intentá nuevamente.");
      setSaving(false);
    }
  };

  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} username={username} />
      <main className="access-page">
        <section className="public-login-section">
          <div className="section-heading">
            <h2>Cambiá tu contraseña</h2>
            <p>Para continuar, definí una contraseña nueva para tu usuario.</p>
          </div>
          <form className="public-login-form" onSubmit={changePassword}>
            <label>
              Nueva contraseña
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" required />
            </label>
            <label>
              Confirmar contraseña
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="8" required />
            </label>
            {error && <p className="public-login-error" role="alert">{error}</p>}
            <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar contraseña"}</button>
          </form>
        </section>
      </main>
    </div>
  );
}

function AdminPage({ adminSection, comunicados, content, onSave, onSaveContent }) {
  const [sessionUsername, setSessionUsername] = useState(() => leerSesionAdmin());
  const [authenticated, setAuthenticated] = useState(() => Boolean(leerSesionAdmin()) && leerRolSesionAdmin() === ADMIN_ROLE);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [generatedUsername, setGeneratedUsername] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [generatedRole, setGeneratedRole] = useState(AGENT_ROLE);
  const [adminUsers, setAdminUsers] = useState(() => leerUsuariosAdmin());
  const [authError, setAuthError] = useState("");
  const [message, setMessage] = useState("");
  const [communicationEditorKey, setCommunicationEditorKey] = useState(0);
    const [contentDraft, setContentDraft] = useState(content);
    const [importingDocuments, setImportingDocuments] = useState(false);

  useEffect(() => {
    if (authenticated) obtenerUsuariosAdmin().then(setAdminUsers).catch(() => null);
  }, [authenticated]);

  const authenticate = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAuthError(result.error || "Usuario o contraseña incorrectos.");
        return;
      }
      const usuario = result.user;
      guardarSesion(usuario);
      setPassword("");
      if (usuario.mustChangePassword) {
        window.location.assign("/cambiar-password");
        return;
      }
      if (usuario.role !== ADMIN_ROLE) {
        setAuthError("Este usuario no tiene acceso al panel de administración.");
        return;
      }
      setAuthenticated(true);
      setSessionUsername(usuario.username);
      setAuthError("");
    } catch {
      setAuthError("No se pudo conectar con el servidor de acceso.");
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (newPassword.trim().length < 8) {
      window.alert("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword.trim() }),
    });
    const result = await response.json();
    if (!response.ok) {
      window.alert(result.error || "No se pudo guardar la contraseña.");
      return;
    }
    setNewPassword("");
    window.alert("Contraseña actualizada correctamente.");
  };

  const createUser = (event) => {
    event.preventDefault();
    const nombre = generatedUsername.trim();
    const clave = generatedPassword.trim();
    if (nombre.length < 3 || clave.length < 8) {
      window.alert("El usuario debe tener al menos 3 caracteres y la contraseña 8.");
      return;
    }

    const usuarios = leerUsuariosAdmin();
    if (usuarios.some((usuario) => usuario.username === nombre)) {
      window.alert("Ese nombre de usuario ya existe.");
      return;
    }

    const usuariosActualizados = [...usuarios, { username: nombre, password: clave, role: generatedRole, mustChangePassword: true }];
    guardarUsuariosAdmin(usuariosActualizados);
    setAdminUsers(usuariosSinCredenciales(usuariosActualizados));
    setGeneratedUsername("");
    setGeneratedPassword("");
    setGeneratedRole(AGENT_ROLE);
    window.alert(`Usuario creado: ${nombre}\nContraseña: ${clave}`);
  };

  const fillGeneratedPassword = () => setGeneratedPassword(generarPassword());

  const updateUserRole = (usernameToUpdate, role) => {
    const usuarios = leerUsuariosAdmin();
    if (role === AGENT_ROLE && usuarios.filter((usuario) => usuario.role === ADMIN_ROLE).length <= 1) {
      window.alert("Debe existir al menos un administrador.");
      return;
    }

    const usuariosActualizados = usuarios.map((usuario) => usuario.username === usernameToUpdate
      ? { ...usuario, role }
      : usuario);
    guardarUsuariosAdmin(usuariosActualizados);
    setAdminUsers(usuariosActualizados);

    if (usernameToUpdate === sessionUsername && role === AGENT_ROLE) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_ROLE_KEY);
      localStorage.removeItem(ADMIN_ACTIVITY_KEY);
      window.location.assign("/");
    }
  };

  const resetRegisteredUserPassword = async (event) => {
    event.preventDefault();
    const usernameToReset = resetUsername || adminUsers[0]?.username;
    if (!usernameToReset) return;
    const password = generarPassword();
    try {
      const response = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameToReset, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        window.alert(result.error || "No se pudo restablecer la contraseña.");
        return;
      }
      setResetUsername(usernameToReset);
      setAdminUsers((current) => current.map((user) => user.username === usernameToReset ? result.user : user));
      setTemporaryPassword(password);
      if (usernameToReset === sessionUsername) {
        localStorage.setItem(ADMIN_MUST_CHANGE_PASSWORD_KEY, "true");
      }
    } catch {
      window.alert("No se pudo conectar con el servidor para restablecer la contraseña.");
    }
  };

  const unlockRegisteredUser = async (usernameToUnlock) => {
    try {
      const response = await fetch("/api/admin/users/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameToUnlock }),
      });
      const result = await response.json();
      if (!response.ok) {
        window.alert(result.error || "No se pudo desbloquear el usuario.");
        return;
      }
      setAdminUsers((current) => current.map((user) => user.username === usernameToUnlock ? result.user : user));
    } catch {
      window.alert("No se pudo conectar con el servidor para desbloquear el usuario.");
    }
  };

  const blockRegisteredUser = async (usernameToBlock) => {
    if (!window.confirm(`¿Bloquear el acceso de ${usernameToBlock}?`)) return;
    try {
      const response = await fetch("/api/admin/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameToBlock }),
      });
      const result = await response.json();
      if (!response.ok) {
        window.alert(result.error || "No se pudo bloquear el usuario.");
        return;
      }
      setAdminUsers((current) => current.map((user) => user.username === usernameToBlock ? result.user : user));
    } catch {
      window.alert("No se pudo conectar con el servidor para bloquear el usuario.");
    }
  };

  const deleteRegisteredUser = (usernameToDelete) => {
    const usuarios = leerUsuariosAdmin();
    const usuario = usuarios.find((item) => item.username === usernameToDelete);
    if (!usuario || !window.confirm(`¿Eliminar el usuario ${usernameToDelete}?`)) {
      return;
    }

    if (usuario.role === ADMIN_ROLE && usuarios.filter((item) => item.role === ADMIN_ROLE).length <= 1) {
      window.alert("No se puede eliminar el último administrador.");
      return;
    }

    guardarUsuariosAdmin(usuarios.filter((item) => item.username !== usernameToDelete));
    setAdminUsers((currentUsers) => currentUsers.filter((item) => item.username !== usernameToDelete));
    if (usernameToDelete === sessionUsername) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_SESSION_ROLE_KEY);
      localStorage.removeItem(ADMIN_ACTIVITY_KEY);
      window.location.assign("/");
      return;
    }

    window.alert(`Usuario ${usernameToDelete} eliminado correctamente.`);
  };

  const publish = (event) => {
    event.preventDefault();
    const safeMessage = DOMPurify.sanitize(message);
    const plainMessage = new DOMParser().parseFromString(safeMessage, "text/html").body.textContent || "";
    if (!plainMessage.trim()) {
      return;
    }

    const publishedAt = new Date();
    const nuevoComunicado = {
      message: safeMessage,
      publishedAt: publishedAt.toISOString(),
      date: publishedAt.toLocaleDateString("es-PY", { timeZone: "America/Asuncion" }),
      time: publishedAt.toLocaleTimeString("es-PY", { timeZone: "America/Asuncion", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }),
    };
    onSave([nuevoComunicado, ...comunicados]);
    setMessage("");
    setCommunicationEditorKey((key) => key + 1);
  };

  const deleteCommunication = (index) => {
    if (!window.confirm("¿Eliminar este comunicado?")) {
      return;
    }

    onSave(comunicados.filter((_, comunicadoIndex) => comunicadoIndex !== index));
  };

  const saveContent = (event) => {
    event.preventDefault();
    onSaveContent(combinarConfiguracion(contentDraft));
    window.alert("Contenido actualizado correctamente.");
  };

  const updateContentField = (field, value) => {
    setContentDraft((draft) => ({ ...draft, [field]: value }));
  };

  const importDocuments = async () => {
    if (!window.confirm("La importación reemplazará el contenido integrado que editaste. ¿Querés continuar?")) {
      return;
    }

    setImportingDocuments(true);
    try {
      const response = await fetch("/api/documentos/importar", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "No se pudieron importar los documentos.");
      }

      const importedContent = combinarConfiguracion(result.config);
      setContentDraft(importedContent);
      onSaveContent(importedContent);
      const failedDocuments = result.failed.map(({ title, reason }) => `${title}: ${reason}`).join("\n");
      window.alert(`Documentos importados: ${result.imported.length}.${failedDocuments ? `\n\nPendientes:\n${failedDocuments}` : ""}`);
    } catch (error) {
      window.alert(error.message || "No se pudieron importar los documentos.");
    } finally {
      setImportingDocuments(false);
    }
  };

  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      window.alert('El logo debe estar en formato PNG o JPG.');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      window.alert('El logo no puede superar los 2 MB.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => updateContentField('logoUrl', reader.result);
    reader.readAsDataURL(file);
  };

  const updateListItem = (list, index, field, value) => {
    setContentDraft((draft) => ({
      ...draft,
      [list]: draft[list].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const addCategoryDocument = (categoryIndex) => {
    setContentDraft((draft) => ({
      ...draft,
      categories: draft.categories.map((categoria, index) => index === categoryIndex
        ? { ...categoria, documents: [...categoria.documents, { icon: "📄", title: "Nuevo documento", url: "https://" }] }
        : categoria),
    }));
  };

  const deleteCategoryDocument = (categoryIndex, documentIndex) => {
    setContentDraft((draft) => ({
      ...draft,
      categories: draft.categories.map((categoria, index) => index === categoryIndex
        ? { ...categoria, documents: categoria.documents.filter((_, itemIndex) => itemIndex !== documentIndex) }
        : categoria),
    }));
  };

  const addCategory = () => {
    const number = contentDraft.categories.length + 1;
    setContentDraft((draft) => ({
      ...draft,
      categories: [
        ...draft.categories,
        {
          icon: "📁",
          logo: "",
          title: `NUEVA CATEGORÍA ${number}`,
          description: "Descripción de la nueva categoría",
          content: "",
          target: `categoria-${Date.now()}`,
        },
      ],
    }));
  };

  const deleteCategory = (index) => {
    if (contentDraft.categories.length <= 1 || !window.confirm("¿Eliminar esta categoría?")) {
      return;
    }

    setContentDraft((draft) => ({
      ...draft,
      categories: draft.categories.filter((_, categoryIndex) => categoryIndex !== index),
    }));
  };

  if (!authenticated) {
    return (
      <div className="app" style={getBrandStyles(content)}>
        <Header content={content} />
        <main className="admin-page">
          <form className="admin-form admin-login" onSubmit={authenticate}>
            <h1>Admin - Orbital Wallet</h1>
            <p>Acceso exclusivo para el administrador.</p>
            <label>
              Usuario
              <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoFocus required />
            </label>
            <label>
              Contraseña
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            {authError && <p className="public-login-error" role="alert">{authError}</p>}
            <button type="submit">Ingresar</button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} admin username={sessionUsername} />
      <main className="admin-page">
        {adminSection && <NavigationLinks admin backHref="/admin" />}
        {!adminSection ? (
          <section className="admin-menu">
            <div className="admin-menu-header">
              <div>
                <span className="admin-menu-kicker">CENTRO DE CONTROL</span>
                <h1>Administración</h1>
                <p>Gestioná los avisos, accesos y contenido de Orbital Wallet.</p>
              </div>
              <span className="admin-menu-status"><span /> PANEL ACTIVO</span>
            </div>
            <div className="admin-dashboard-overview" aria-label="Resumen del panel">
              <div><span>Comunicados</span><strong>{String(comunicados.length).padStart(2, "0")}</strong></div>
              <div><span>Usuarios</span><strong>{String(adminUsers.length).padStart(2, "0")}</strong></div>
              <div><span>Categorías</span><strong>{String(content.categories.length).padStart(2, "0")}</strong></div>
            </div>
            <div className="admin-menu-grid">
              <section className="admin-menu-panel admin-communications-panel">
                <div className="admin-menu-panel-heading">
                  <span className="admin-menu-panel-icon">📢</span>
                  <div><small>PUBLICACIONES</small><strong>Comunicados</strong></div>
                  <span className="admin-menu-panel-count">{String(comunicados.length).padStart(2, "0")}</span>
                </div>
                <div className="admin-menu-panel-links">
                  <a href="/admin/nuevo">
                    <span className="admin-menu-action-icon">＋</span>
                    <span><strong>Nuevo comunicado</strong><small>Publicar un aviso</small></span>
                    <span className="admin-menu-arrow">↗</span>
                  </a>
                  <a href="/admin/historial">
                    <span className="admin-menu-action-icon">↺</span>
                    <span><strong>Historial</strong><small>Ver o eliminar comunicados</small></span>
                    <span className="admin-menu-arrow">↗</span>
                  </a>
                </div>
              </section>
              <a className="admin-menu-tile admin-users-tile" href="/admin/password">
                <span className="admin-menu-tile-icon">🔐</span>
                <span className="admin-menu-tile-index">02</span>
                <strong>Usuarios y acceso</strong>
                <small>Gestionar usuarios y contraseñas</small>
                <span className="admin-menu-tile-link">Gestionar acceso <b>↗</b></span>
              </a>
              <a className="admin-menu-tile admin-content-tile" href="/admin/contenido">
                <span className="admin-menu-tile-icon">✎</span>
                <span className="admin-menu-tile-index">03</span>
                <strong>Editar contenido</strong>
                <small>Modificar textos, enlaces y categorías</small>
                <span className="admin-menu-tile-link">Abrir editor <b>↗</b></span>
              </a>
            </div>
          </section>
        ) : null}

        {adminSection === "nuevo" && <section className="admin-form">
          <h1>Nuevo comunicado</h1>
          <form onSubmit={publish}>
            <div className="communication-editor-field">
              <span>Mensaje</span>
              <CommunicationEditor key={communicationEditorKey} onChange={setMessage} />
            </div>
            <p className="communication-timestamp-note">La fecha y hora exactas de Paraguay se registran automáticamente al publicar.</p>
            <button type="submit">Publicar comunicado</button>
          </form>
        </section>}

        {adminSection === "historial" && <section className="admin-history admin-form">
          <h2>Historial local</h2>
          <div className="communications-list">
            {comunicados.map((comunicado, index) => (
              <CommunicationCard
                comunicado={comunicado}
                key={`${comunicado.date}-${comunicado.time}-${comunicado.message}`}
                onDelete={() => deleteCommunication(index)}
              />
            ))}
          </div>
        </section>}

        {adminSection === "password" && <section className="admin-form admin-password-form">
          <h2>Usuarios y acceso</h2>
          <p>Usuario activo: <strong>{sessionUsername}</strong></p>
          <div className="access-forms">
            <form onSubmit={resetRegisteredUserPassword}>
              <h3>Restablecer contraseña de un usuario</h3>
              <label>
                Elegir usuario
                <select value={resetUsername || adminUsers[0]?.username || ""} onChange={(event) => { setResetUsername(event.target.value); setTemporaryPassword(""); }} required>
                  {adminUsers.map((usuario) => <option key={usuario.username} value={usuario.username}>{usuario.username}</option>)}
                </select>
              </label>
              <p>Genera una contraseña temporal aleatoria y la exige al próximo inicio de sesión.</p>
              <button type="submit" disabled={!adminUsers.length}>Generar contraseña temporal</button>
              {temporaryPassword && <label className="temporary-password-result">
                Contraseña temporal (copiala ahora)
                <input type="text" value={temporaryPassword} readOnly onFocus={(event) => event.target.select()} />
              </label>}
              {temporaryPassword && resetUsername === sessionUsername && <button className="secondary-admin-button" type="button" onClick={() => window.location.assign("/cambiar-password")}>Continuar para cambiarla</button>}
            </form>
            <form onSubmit={changePassword}>
              <h3>Cambiar contraseña</h3>
              <label>
                Nueva contraseña
                <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength="8" required />
              </label>
              <button type="submit">Guardar contraseña</button>
            </form>
          </div>
          <div className="admin-users-list">
            <h3>Usuarios registrados</h3>
            {adminUsers.map((usuario) => (
              <div className="admin-user-row" key={usuario.username}>
                <div className="admin-user-identity">
                  <strong>{usuario.username}</strong>
                  <small className={usuario.locked ? "admin-user-locked" : "admin-user-unlocked"}>
                    {usuario.blockedByAdmin ? "Bloqueado manualmente por administración" : usuario.role === ADMIN_ROLE ? "Acceso activo · sin bloqueo por intentos fallidos" : usuario.locked ? "Bloqueado por intentos fallidos" : `Acceso activo · ${usuario.failedAttempts || 0}/3 intentos fallidos`}
                  </small>
                </div>
                <div className="admin-user-actions">
                  <select className="admin-role-select" value={usuario.role} onChange={(event) => updateUserRole(usuario.username, event.target.value)} aria-label={`Rol de ${usuario.username}`}>
                    <option value={ADMIN_ROLE}>Administrador</option>
                    <option value={AGENT_ROLE}>Agente</option>
                  </select>
                  {usuario.locked && <button className="secondary-admin-button" type="button" onClick={() => unlockRegisteredUser(usuario.username)}>Desbloquear</button>}
                  {!usuario.locked && usuario.username !== sessionUsername && <button className="secondary-admin-button admin-block-user-button" type="button" onClick={() => blockRegisteredUser(usuario.username)}>Bloquear usuario</button>}
                  <button className="editor-delete-button" type="button" onClick={() => deleteRegisteredUser(usuario.username)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
          <form className="create-user-form" onSubmit={createUser}>
            <h3>Crear nuevo usuario</h3>
            <div className="admin-fields">
              <label>
                Nombre de usuario
                <input type="text" value={generatedUsername} onChange={(event) => setGeneratedUsername(event.target.value)} minLength="3" required />
              </label>
              <label>
                Contraseña
                <input type="text" value={generatedPassword} onChange={(event) => setGeneratedPassword(event.target.value)} minLength="8" required />
              </label>
              <label>
                Elegir rol
                <select className="admin-role-select" value={generatedRole} onChange={(event) => setGeneratedRole(event.target.value)}>
                  <option value={AGENT_ROLE}>Agente</option>
                  <option value={ADMIN_ROLE}>Administrador</option>
                </select>
              </label>
            </div>
            <div className="access-actions">
              <button className="secondary-admin-button" type="button" onClick={fillGeneratedPassword}>Generar contraseña</button>
              <button type="submit">Crear usuario</button>
            </div>
          </form>
        </section>}

        {adminSection === "contenido" && <section className="admin-form admin-content-form">
          <div className="admin-section-title">
            <div>
              <h2>Editar contenido de toda la página</h2>
              <p>Modifica los textos, enlaces, categorías y procesos sin tocar el código.</p>
            </div>
          </div>

          <form className="visual-content-editor" onSubmit={saveContent}>
            <div className="admin-content-tools">
              <p>Importá documentos desde sus enlaces originales para actualizarlos.</p>
              <button className="editor-import-button" type="button" onClick={importDocuments} disabled={importingDocuments}>
                {importingDocuments ? "Importando documentos..." : "↓ Importar o actualizar documentos"}
              </button>
            </div>
            <div className="admin-editor-savebar">
              <span>Guardá para publicar los cambios en el sitio.</span>
              <button type="submit">Guardar cambios</button>
            </div>
            <details className="admin-editor-section" open>
              <summary><span><strong>Identidad visual</strong><small>Logo, colores e imagen de fondo</small></span><span className="admin-editor-section-count">4 opciones</span></summary>
              <div className="admin-editor-section-body">
              <label>
                URL del logo
                <input type="url" placeholder="Dejar logo predeterminado" value={contentDraft.logoUrl || ""} onChange={(event) => updateContentField("logoUrl", event.target.value)} />
              </label>
              <label>
                Subir logo desde la PC
                <input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} />
                <small className="editor-field-help">Formatos permitidos: PNG o JPG. Máximo 2 MB.</small>
              </label>
              <label>
                Color de fondo
                <input type="color" value={contentDraft.backgroundColor || "#080808"} onChange={(event) => updateContentField("backgroundColor", event.target.value)} />
              </label>
              <label>
                URL de imagen de fondo
                <input type="url" placeholder="Opcional" value={contentDraft.backgroundImage || ""} onChange={(event) => updateContentField("backgroundImage", event.target.value)} />
              </label>
              <button className="editor-reset-button" type="button" onClick={() => setContentDraft((draft) => ({ ...draft, logoUrl: "", backgroundColor: "", backgroundImage: "" }))}>
                Restaurar logo y fondo predeterminados
              </button>
              </div>
            </details>

            <details className="admin-editor-section">
              <summary><span><strong>Textos principales</strong><small>Títulos y descripciones de cada sección</small></span><span className="admin-editor-section-count">13 campos</span></summary>
              <div className="admin-editor-section-body admin-editor-field-grid">
              {[
                ["headerSubtitle", "Subtítulo del encabezado"],
                ["communicationsTitle", "Título de comunicados"],
                ["communicationsDescription", "Descripción de comunicados"],
                ["introTitle", "Título de categorías"],
                ["introDescription", "Descripción de categorías"],
                ["popularTitle", "Título de procesos destacados"],
                ["popularDescription", "Descripción de procesos destacados"],
                ["faqTitle", "Título de preguntas frecuentes"],
                ["faqDescription", "Descripción de preguntas frecuentes"],
                ["suggestionsTitle", "Título de sugerencias"],
                ["suggestionsDescription", "Descripción de sugerencias"],
                ["footerBrand", "Marca del pie de página"],
                ["footerNote", "Texto del pie de página"],
              ].map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input value={contentDraft[field] || ""} onChange={(event) => updateContentField(field, event.target.value)} />
                </label>
              ))}
              </div>
            </details>

            <details className="admin-editor-section">
              <summary><span><strong>Enlaces y preguntas frecuentes</strong><small>Direcciones y contenido integrado</small></span><span className="admin-editor-section-count">3 opciones</span></summary>
              <div className="admin-editor-section-body">
              {["faqUrl", "suggestionsUrl"].map((field) => (
                <label key={field}>
                  {field === "faqUrl" ? "Enlace de preguntas frecuentes" : "Enlace del formulario de sugerencias"}
                  <input type="url" value={contentDraft[field] || ""} onChange={(event) => updateContentField(field, event.target.value)} />
                </label>
              ))}

              <label>
                Contenido integrado de preguntas frecuentes (Markdown)
                <textarea rows="10" value={contentDraft.faqContent || ""} onChange={(event) => updateContentField("faqContent", event.target.value)} placeholder="Pegá o editá aquí el contenido de las preguntas frecuentes" />
              </label>
              </div>
            </details>

            <details className="admin-editor-section">
              <summary><span><strong>Categorías y documentos</strong><small>Guías, textos y capturas organizados por categoría</small></span><span className="admin-editor-section-count">{contentDraft.categories.length} categorías</span></summary>
              <div className="admin-editor-section-body">
              {contentDraft.categories.map((categoria, index) => (
                <details className="editor-category-block" key={`${categoria.target}-${index}`}>
                  <summary className="editor-category-summary">
                    <strong>{categoria.icon || "📁"} {categoria.title || `Categoría ${index + 1}`}</strong>
                    <span>{categoria.documents.length} documentos</span>
                  </summary>
                  <div className="editor-category-content">
                  <div className="editor-category-heading">
                    <h4>Detalles de categoría</h4>
                    <button className="editor-delete-button" type="button" onClick={() => deleteCategory(index)}>Eliminar categoría</button>
                  </div>
                  <div className="editor-row">
                  <input aria-label="Icono de categoría" value={categoria.icon} onChange={(event) => updateListItem("categories", index, "icon", event.target.value)} />
                  <input aria-label="URL del logo de categoría" type="url" placeholder="URL del logo" value={categoria.logo || ""} onChange={(event) => updateListItem("categories", index, "logo", event.target.value)} />
                  <input aria-label="Título de categoría" value={categoria.title} onChange={(event) => updateListItem("categories", index, "title", event.target.value)} />
                  <input aria-label="Descripción de categoría" value={categoria.description} onChange={(event) => updateListItem("categories", index, "description", event.target.value)} />
                  </div>
                  <label>
                    Contenido adicional de la categoría
                    <textarea rows="3" value={categoria.content || ""} onChange={(event) => updateListItem("categories", index, "content", event.target.value)} placeholder="Texto adicional que se mostrará en la categoría" />
                  </label>
                  <div className="category-documents-editor">
                    <div className="category-documents-heading">
                      <div>
                        <h5>Documentos de {categoria.title}</h5>
                        <small>Elegí un documento para abrir directamente su editor.</small>
                      </div>
                      <button className="editor-add-button" type="button" onClick={() => addCategoryDocument(index)}>+ Agregar documento</button>
                    </div>
                    {categoria.documents.length > 0 ? (
                      <div className="editor-document-list" aria-label={`Documentos de ${categoria.title}`}>
                        {categoria.documents.map((document, documentIndex) => (
                          <div className="editor-document-row" key={`${categoria.target}-document-row-${documentIndex}`}>
                            <a className="editor-document-open" href={getAdminDocumentEditorRoute(categoria, document)}>
                              <span className="editor-document-row-icon" aria-hidden="true">{document.icon || "📄"}</span>
                              <span className="editor-document-row-title">{document.title || `Documento ${documentIndex + 1}`}</span>
                              <span className="editor-document-row-action">Abrir editor <span aria-hidden="true">→</span></span>
                            </a>
                            <button
                              className="editor-document-tab-delete"
                              type="button"
                              aria-label={`Eliminar ${document.title || `documento ${documentIndex + 1}`}`}
                              onClick={() => deleteCategoryDocument(index, documentIndex)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="editor-document-preview-empty">Todavía no hay documentos en esta categoría.</div>
                    )}
                  </div>
                  </div>
                </details>
              ))}

              <button className="editor-add-button" type="button" onClick={addCategory}>
                + Crear nueva categoría
              </button>
              </div>
            </details>

            <details className="admin-editor-section">
              <summary><span><strong>Procesos más utilizados</strong><small>Accesos destacados de la página principal</small></span><span className="admin-editor-section-count">{contentDraft.processes.length} procesos</span></summary>
              <div className="admin-editor-section-body">
              {contentDraft.processes.map((proceso, index) => (
                <div className="editor-row editor-process-row" key={`process-${index}`}>
                  <input aria-label="Título del proceso" value={proceso.title} onChange={(event) => updateListItem("processes", index, "title", event.target.value)} />
                  <input aria-label="Categoría del proceso" value={proceso.category} onChange={(event) => updateListItem("processes", index, "category", event.target.value)} />
                  <input aria-label="Enlace del proceso" type="url" value={proceso.url} onChange={(event) => updateListItem("processes", index, "url", event.target.value)} />
                </div>
              ))}
              </div>
            </details>

            <div className="admin-editor-savebar admin-editor-savebar-bottom">
              <span>Los cambios se aplicarán a todo el sitio.</span>
              <button type="submit">Guardar todos los cambios</button>
            </div>
          </form>
        </section>}
      </main>
    </div>
  );
}

function AdminAccessRedirect({ target = "/" }) {
  useEffect(() => {
    window.location.href = target;
  }, [target]);

  return null;
}

function App() {
  const [consultas, setConsultas] = useState(() => leerConsultas());
  const [comunicados, setComunicados] = useState(() => leerComunicados());
  const [content, setContent] = useState(() => combinarConfiguracion(configuracionInicial));
  const [configLoaded, setConfigLoaded] = useState(false);
  const ruta = window.location.pathname.replace(/^\//, "");
  const categoriaActiva = documentosPorCategoria[ruta];
  const adminSection = ruta.startsWith("admin/") ? ruta.replace("admin/", "") : "";
  const adminContentRevision = content.categories.map((category) => (
    `${category.target}:${category.title}:${category.description}:${category.documents?.map((document) => `${document.title}:${document.content?.length || 0}`).join(",")}`
  )).join("|") + `:${content.faqContent?.length || 0}`;
  const usuarioSesion = leerSesionAdmin();
  const cambioPasswordPendiente = localStorage.getItem(ADMIN_MUST_CHANGE_PASSWORD_KEY) === "true";

  useEffect(() => {
    let configEtag = "";
    let disposed = false;
    let loadingConfig = false;
    const loadConfig = async () => {
      if (loadingConfig || disposed) return;
      loadingConfig = true;
      try {
        const response = await fetch("/api/config", {
          cache: "no-cache",
          headers: configEtag ? { "If-None-Match": configEtag } : {},
        });
        if (response.status === 304 || !response.ok) return;
        const config = await response.json();
        configEtag = response.headers.get("ETag") || "";
        if (!disposed) setContent(combinarConfiguracion(config));
      } catch {
        // Keep the last loaded content when the server is temporarily unavailable.
      } finally {
        loadingConfig = false;
        if (!disposed) setConfigLoaded(true);
      }
    };

    loadConfig();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadConfig();
    }, 10000);
    window.addEventListener("focus", loadConfig);

    fetch("/api/comunicados")
      .then((response) => response.json())
      .then((comunicadosDelServidor) => {
        setComunicados(comunicadosDelServidor);
        localStorage.setItem(COMUNICADOS_KEY, JSON.stringify(comunicadosDelServidor));
      })
      .catch(() => null);

    return () => {
      disposed = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", loadConfig);
    };
  }, []);

  useEffect(() => {
    const activityEvents = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    const handleActivity = () => marcarActividadSesion();
    const checkSession = () => {
      const hadSession = Boolean(localStorage.getItem(ADMIN_SESSION_KEY));
      const activeSession = leerSesionAdmin();
      if (hadSession && !activeSession) {
        window.location.reload();
      }
    };

    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity));
    const sessionTimer = window.setInterval(checkSession, 30 * 1000);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      window.clearInterval(sessionTimer);
    };
  }, []);

  const registrarYActualizar = (titulo) => {
    setConsultas(registrarConsulta(titulo));
  };

  const guardarYActualizarComunicados = (nuevosComunicados) => {
    guardarComunicados(nuevosComunicados);
    setComunicados(nuevosComunicados);
  };

  const guardarYActualizarContenido = (nuevoContenido) => {
    setContent(nuevoContenido);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoContenido),
    }).catch(() => null);
  };

  if (ruta === "cambiar-password") {
    if (!usuarioSesion || !cambioPasswordPendiente) {
      return <AdminAccessRedirect />;
    }
    return <PasswordChangePage content={content} username={usuarioSesion} />;
  }

  if (usuarioSesion && cambioPasswordPendiente) {
    return <AdminAccessRedirect target="/cambiar-password" />;
  }

  if (ruta.startsWith("admin/documento/")) {
    if (!usuarioSesion) {
      return <AdminAccessRedirect target="/admin" />;
    }
    if (leerRolSesionAdmin() !== ADMIN_ROLE) {
      return <AdminAccessRedirect />;
    }
    if (!configLoaded) {
      return <div className="app" style={getBrandStyles(content)} />;
    }

    const [, , categoryTarget, documentSlug] = ruta.split("/");
    const category = content.categories.find((item) => item.target === categoryTarget);
    const document = category?.documents.find((item) => slugifyDocumentTitle(item.title) === documentSlug);
    if (category && document) {
      return (
        <Suspense fallback={<div className="app" style={getBrandStyles(content)} />}>
          <AdminDocumentEditorPage
            document={document}
            category={category}
            content={content}
            getBrandStyles={getBrandStyles}
            getDocumentRoute={getDocumentRoute}
            Header={Header}
            NavigationLinks={NavigationLinks}
            slugifyDocumentTitle={slugifyDocumentTitle}
          />
        </Suspense>
      );
    }
    return <AdminAccessRedirect target="/admin/contenido" />;
  }

  if (ruta === "admin") {
    if (leerSesionAdmin() && leerRolSesionAdmin() !== ADMIN_ROLE) {
      return <AdminAccessRedirect />;
    }
    return <AdminPage key={adminContentRevision} adminSection="" comunicados={comunicados} content={content} onSave={guardarYActualizarComunicados} onSaveContent={guardarYActualizarContenido} />;
  }

  if (["nuevo", "historial", "password", "contenido"].includes(adminSection)) {
    if (leerSesionAdmin() && leerRolSesionAdmin() !== ADMIN_ROLE) {
      return <AdminAccessRedirect />;
    }
    return <AdminPage key={adminContentRevision} adminSection={adminSection} comunicados={comunicados} content={content} onSave={guardarYActualizarComunicados} onSaveContent={guardarYActualizarContenido} />;
  }

  if (!leerSesionAdmin()) {
    return (
      <div className="app" style={getBrandStyles(content)}>
        <Header content={content} />
        <main className="access-page">
          <PublicLoginSection redirectTo={window.location.pathname || "/"} />
        </main>
      </div>
    );
  }

  if (ruta === "modulos") return <ModulePicker content={content} />;
  if (ruta === "orbital-pay") return <OrbitalPayPage content={content} />;

  if (ruta === "documentos/preguntas-frecuentes") {
    return <DocumentPage document={{ icon: "❓", title: content.faqLinkTitle, content: content.faqContent, url: content.faqUrl }} category={{ title: content.faqTitle }} content={content} />;
  }

  if (ruta.startsWith("documentos/")) {
    const [, categoryTarget, documentSlug] = ruta.split("/");
    const category = content.categories.find((item) => item.target === categoryTarget);
    const document = category?.documents.find((item) => slugifyDocumentTitle(item.title) === documentSlug);
    if (category && document) {
      return <DocumentPage document={document} category={category} content={content} />;
    }
  }

  if (ruta === "comunicados") {
    return <CommunicationsPage comunicados={comunicados} content={content} />;
  }

  if (ruta === "comunicados/anteriores") {
    return <CommunicationsPage comunicados={comunicados} content={content} previousOnly />;
  }

  const categoryContent = content.categories.find((categoria) => categoria.target === ruta);

  if (categoryContent) {
    const category = {
      ...(categoriaActiva || { icon: categoryContent.icon, title: categoryContent.title, description: categoryContent.description, documents: [] }),
      title: categoryContent.title,
      description: categoryContent.description,
      documents: categoryContent.documents || [],
    };
    return <CategoryPage category={category} categoryContent={categoryContent} content={content} onConsultation={registrarYActualizar} />;
  }

  const procesosOrdenados = [...content.processes].sort(
    (a, b) => (consultas[b.title] || 0) - (consultas[a.title] || 0),
  );

  return (
    <div className="app" style={getBrandStyles(content)}>
      <Header content={content} />
      <main>
        <section className="frequent faq-section">
          <div className="section-heading">
            <h2>{content.communicationsTitle}</h2>
            <p>{content.communicationsDescription}</p>
          </div>

          <div className="communications-list">
            <CommunicationCard comunicado={comunicados[0]} />
            <a className="category-link communication-action" href="/comunicados/anteriores">
              Ver comunicados anteriores →
            </a>
          </div>
        </section>

        <section className="intro">
          <h2>{content.introTitle}</h2>
          <p>{content.introDescription}</p>
        </section>

        <section className="categories">
          {content.categories.map((categoria) => (
            <article className="category-card" key={categoria.title}>
              <div className="category-icon">
                {categoria.logo ? <img src={categoria.logo} alt="" /> : categoria.icon}
              </div>
              <h3>{categoria.title}</h3>
              <p>{categoria.description}</p>
              {categoria.content && <div className="category-extra-content">{categoria.content}</div>}
              <a className="category-link" href={`/${categoria.target}`}>Ver procesos →</a>
            </article>
          ))}
        </section>

        <section className="frequent">
          <div className="section-heading">
            <h2>{content.popularTitle}</h2>
            <p>{content.popularDescription}</p>
          </div>

          <div className="process-grid">
            {procesosOrdenados.map((proceso) => {
              const matchingDocument = findDocumentForProcess(content, proceso);
              return (
                <a
                  className="process-button"
                  key={proceso.title}
                  href={matchingDocument ? getDocumentRoute(matchingDocument.category, matchingDocument.document) : proceso.url}
                  target={matchingDocument ? undefined : "_blank"}
                  rel={matchingDocument ? undefined : "noopener noreferrer"}
                  onClick={() => registrarYActualizar(proceso.title)}
                >
                  <div>
                    <strong>{proceso.title}</strong>
                    <small>{proceso.category}</small>
                  </div>
                  <span>↗</span>
                </a>
              );
            })}
          </div>
        </section>

        <section className="frequent faq-section">
          <div className="section-heading">
            <h2>{content.faqTitle}</h2>
            <p>{content.faqDescription}</p>
          </div>

          <div className="document-list">
            <a
              className="document-link"
              href="/documentos/preguntas-frecuentes"
            >
              <span>❓</span>
              <div>
                <strong>{content.faqLinkTitle}</strong>
                <small>{content.faqLinkText}</small>
              </div>
            </a>
          </div>
        </section>

        <section className="frequent faq-section">
          <div className="section-heading">
            <h2>{content.suggestionsTitle}</h2>
            <p>{content.suggestionsDescription}</p>
          </div>

          <div className="document-list">
            <a
              className="document-link suggestion-link"
              href={content.suggestionsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>💡</span>
              <div>
                <strong>{content.suggestionsLinkTitle}</strong>
                <small>{content.suggestionsLinkText}</small>
              </div>
            </a>
          </div>
        </section>

      </main>
      <Footer content={content} />
    </div>
  );
}

export default App;
