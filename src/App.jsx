import "./App.css";
import logo from "./assets/Logo.png";

function App() {
  const categorias = [
    {
      icon: "👤",
      title: "ONBOARDING",
      description: "Creación y gestión inicial de clientes",
      target: "onboarding",
    },
    {
      icon: "💳",
      title: "OPERACIONES",
      description: "Gestión de operaciones y cuentas",
      target: "operaciones",
    },
    {
      icon: "🛡️",
      title: "SEGURIDAD",
      description: "Validaciones y casos especiales",
      target: "seguridad",
    },
    {
      icon: "📚",
      title: "PROCEDIMIENTOS",
      description: "Guías para gestionar casos de clientes",
      target: "procedimientos",
    },
  ];

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
  ];

  return (
    <div className="app">

      {/* =========================
          ENCABEZADO
      ========================= */}

      <header className="hero">
        <div className="hero-content">
          <img src={logo} alt="Orbital Wallet" className="logo-image" />

          <div>
            <h1>Orbital Wallet</h1>
            <p>Manual Interno de Atención y Procesos</p>
          </div>
        </div>

        <p className="hero-description">
          Centro interno de consulta para el equipo de atención al cliente.
          Encontrá rápidamente el procedimiento que necesitás para gestionar
          cada caso.
        </p>
      </header>

      <main>

        {/* =========================
            CATEGORÍAS
        ========================= */}

        <section className="intro">
          <h2>¿Qué necesitás hacer?</h2>

          <p>
            Seleccioná una categoría para acceder al procedimiento
            correspondiente.
          </p>
        </section>

        <section className="categories">

          {categorias.map((categoria) => (
            <article className="category-card" key={categoria.title}>

              <div className="category-icon">
                {categoria.icon}
              </div>

              <h3>{categoria.title}</h3>

              <p>{categoria.description}</p>

              <a
                className="category-link"
                href={`#${categoria.target}`}
              >
                Ver procesos →
              </a>

            </article>
          ))}

        </section>


        {/* =========================
            PROCESOS MÁS UTILIZADOS
        ========================= */}

        <section className="frequent">

          <div className="section-heading">

            <h2>Procesos más utilizados</h2>

            <p>
              Accedé directamente a los procedimientos que el equipo consulta
              con mayor frecuencia durante la atención.
            </p>

          </div>

          <div className="process-grid">

            {procesos.map((proceso) => (
              <a
                className="process-button"
                key={proceso.title}
                href={proceso.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div>
                  <strong>{proceso.title}</strong>
                  <small>{proceso.category}</small>
                </div>

                <span>↗</span>
              </a>
            ))}

          </div>

        </section>


        {/* =========================
            ONBOARDING
        ========================= */}

        <section
          className="document-section"
          id="onboarding"
        >

          <div className="section-heading">
            <h2>👤 Onboarding</h2>

            <p>
              Procedimientos relacionados con la creación y gestión inicial
              de clientes.
            </p>
          </div>

          <div className="document-list">

            <a
              href="https://t90171296805.p.clickup-attachments.com/t90171296805/f8d616ad-6adc-4206-bdfe-3ae0d2cd8a01/crear-cuenta.html?view=open"
              target="_blank"
              rel="noopener noreferrer"
              className="document-link"
            >
              <span>📄</span>
              <div>
                <strong>Crear una cuenta</strong>
                <small>Ver procedimiento →</small>
              </div>
            </a>

            <a
              href="https://t90171296805.p.clickup-attachments.com/t90171296805/b164cc82-2985-4aec-a6a9-cf6615091996/olvide-contrasena.html?view=open"
              target="_blank"
              rel="noopener noreferrer"
              className="document-link"
            >
              <span>🔑</span>
              <div>
                <strong>Olvidé mi contraseña</strong>
                <small>Ver procedimiento →</small>
              </div>
            </a>

            <a
              href="https://t90171296805.p.clickup-attachments.com/t90171296805/b20582d2-3f75-4877-8642-78abeed524e0/cierre-de-cuenta.html?view=open"
              target="_blank"
              rel="noopener noreferrer"
              className="document-link"
            >
              <span>🚫</span>
              <div>
                <strong>Proceso de cancelación de cuenta</strong>
                <small>Ver procedimiento →</small>
              </div>
            </a>

          </div>

        </section>


        {/* =========================
            OPERACIONES
        ========================= */}

        <section
          className="document-section"
          id="operaciones"
        >

          <div className="section-heading">

            <h2>💳 Operaciones</h2>

            <p>
              Procedimientos relacionados con operaciones y gestión de
              cuentas.
            </p>

          </div>

          <div className="document-list">

            <a
              href="https://docs.google.com/document/d/1ztv_-mfXZwmO_xzGzkvD-OsCxOB18LJxX0p7sCswG2A/edit?tab=t.0"
              target="_blank"
              rel="noopener noreferrer"
              className="document-link"
            >
              <span>💸</span>

              <div>
                <strong>Transferencias</strong>
                <small>Consultar documentación →</small>
              </div>

            </a>


            <a
              href="https://docs.google.com/document/d/1HA9JvqGeEDT11_4XrZl-2XajGBik_GaDrza9lOAHyis/edit?tab=t.0"
              target="_blank"
              rel="noopener noreferrer"
              className="document-link"
            >
              <span>🏦</span>

              <div>
                <strong>Caja de ahorro</strong>
                <small>Consultar documentación →</small>
              </div>

            </a>

          </div>

        </section>


        {/* =========================
            SEGURIDAD
        ========================= */}

        <section
          className="document-section"
          id="seguridad"
        >

          <div className="section-heading">

            <h2>🛡️ Seguridad</h2>

            <p>
              Validaciones y procedimientos relacionados con casos especiales
              de seguridad.
            </p>

          </div>

          <div className="empty-section">
            <span>🔒</span>

            <p>
              Próximamente agregaremos los procedimientos de esta categoría.
            </p>
          </div>

        </section>


        {/* =========================
            PROCEDIMIENTOS
        ========================= */}

        <section
          className="document-section"
          id="procedimientos"
        >

          <div className="section-heading">

            <h2>📚 Procedimientos</h2>

            <p>
              Guías internas para facilitar la gestión de casos durante la
              atención al cliente.
            </p>

          </div>

          <div className="empty-section">

            <span>📖</span>

            <p>
              Esta sección se irá completando con los procedimientos internos.
            </p>

          </div>

        </section>

      </main>


      {/* =========================
          FOOTER
      ========================= */}

      <footer>

        <strong>ORBITAL WALLET</strong>

        <span>
          Manual interno de atención y gestión de procesos
        </span>

        <small>
          Uso interno — Información destinada exclusivamente al equipo
          autorizado.
        </small>

      </footer>

    </div>
  );
}

export default App;