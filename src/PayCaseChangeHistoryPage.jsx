import { useEffect, useMemo, useState } from "react";

function fechaHoraParaguay(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Asuncion" }).format(new Date(value));
}

function fechaParaguay(value) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatoValor(value, key, currency) {
  if (value == null || value === "") return "—";
  if (key === "amount" && currency) {
    return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "es-PY", { style: "currency", currency, maximumFractionDigits: currency === "PYG" ? 0 : 2 }).format(Number(value));
  }
  return String(value);
}

const labels = {
  id: "ID del caso", createdAt: "Fecha de registro", createdByUsername: "Usuario del agente", agentName: "Agente", author: "Agente",
  casino: "Casino", casinoId: "Casino", paymentMethod: "Método de pago", playerId: "ID de jugador", transactionId: "ID de transacción",
  externalOrderId: "ID de orden externa", amount: "Monto", currency: "Moneda", operation: "Operación", registrationType: "Tipo de registro",
  manualReason: "Motivo del registro manual",
};

export default function PayCaseChangeHistoryPage({ content, getBrandStyles, Header }) {
  const [requests, setRequests] = useState([]);
  const [caseSnapshots, setCaseSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/pay/casos-solicitudes", { cache: "no-cache" }),
      fetch("/api/pay/casos", { cache: "no-cache" }),
      fetch("/api/pay/casos-eliminados", { cache: "no-cache" }),
    ])
      .then(async ([requestsResponse, casesResponse, deletedResponse]) => {
        if (!requestsResponse.ok) throw new Error("No se pudo cargar el historial de solicitudes.");
        const [data, cases, deletedCases] = await Promise.all([
          requestsResponse.json(),
          casesResponse.ok ? casesResponse.json() : [],
          deletedResponse.ok ? deletedResponse.json() : [],
        ]);
        setRequests(Array.isArray(data) ? data.filter((item) => item.status !== "Pendiente").sort((a, b) => new Date(b.reviewedAt || b.requestedAt) - new Date(a.reviewedAt || a.requestedAt)) : []);
        setCaseSnapshots([...(Array.isArray(cases) ? cases : []), ...(Array.isArray(deletedCases) ? deletedCases : [])]);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const agents = useMemo(() => [...new Set(requests.map((item) => item.requestedBy || item.requestedByUsername).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [requests]);
  const filteredRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    return requests.filter((item) => {
      const agent = item.requestedBy || item.requestedByUsername || "";
      const searchable = [item.caseId, agent, item.reason, ...Object.values(item.changes || {})].join(" ").toLocaleLowerCase("es");
      const requestDate = fechaParaguay(item.requestedAt);
      return (!normalizedSearch || searchable.includes(normalizedSearch))
        && (!statusFilter || item.status === statusFilter)
        && (!agentFilter || agent === agentFilter)
        && (!dateFrom || requestDate >= dateFrom)
        && (!dateTo || requestDate <= dateTo);
    });
  }, [requests, search, statusFilter, agentFilter, dateFrom, dateTo]);
  const clearFilters = () => { setSearch(""); setStatusFilter(""); setAgentFilter(""); setDateFrom(""); setDateTo(""); };

  return <div className="app pay-app" style={getBrandStyles(content)}>
    <Header content={{ ...content, headerSubtitle: "Historial de solicitudes · Orbital Pay" }} />
    <main className="pay-dashboard pay-cases-page">
      <nav className="pay-nav"><a className="module-switch-link" href="/admin/pay/registros"><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span><span>Volver a registros de agentes</span></a><span>ORBITAL PAY / HISTORIAL DE SOLICITUDES</span></nav>
      <div className="pay-heading pay-records-heading"><div><span className="pay-kicker">ARCHIVO ADMINISTRATIVO · SOLO LECTURA</span><h1>Solicitudes revisadas</h1><p>Revisá el motivo, la decisión y la comparación entre los datos originales y los solicitados.</p></div><div className="pay-records-actions"><a className="pay-case-admin-link pay-record-action" href="/admin/pay/registros"><span aria-hidden="true">←</span>Registros activos</a><a className="pay-case-admin-link pay-record-action" href="/admin/pay/registros-eliminados"><span aria-hidden="true">⌫</span>Registros eliminados</a></div></div>
      {error && <p className="pay-notice pay-notice-error" role="alert">{error}</p>}
      <section className="pay-panel pay-review-filters-panel"><div className="pay-panel-title"><span aria-hidden="true">⌕</span><div><small>FILTROS</small><h2>Buscar solicitudes</h2></div></div><div className="pay-record-filters pay-review-filters"><label>Buscar<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caso, agente o motivo" /></label><label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todos los estados</option><option value="Aprobada">Aprobadas</option><option value="Rechazada">Rechazadas</option><option value="Cancelada">Canceladas</option></select></label><label>Agente<select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="">Todos los agentes</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></label><label>Desde<input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label><label>Hasta<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label><button type="button" className="pay-case-filter-reset" onClick={clearFilters}>Limpiar filtros</button><span className="pay-case-filter-count">Mostrando {filteredRequests.length} de {requests.length}</span></div></section>
      <section className="pay-panel pay-request-history-panel">
        <div className="pay-panel-title"><span aria-hidden="true">◷</span><div><small>TRAZABILIDAD</small><h2>Historial de solicitudes <b>{filteredRequests.length}</b></h2></div></div>
        {loading ? <p className="pay-change-requests-empty">Cargando historial…</p> : filteredRequests.length ? <div className="pay-request-history-list">{filteredRequests.map((item) => {
          const currentSnapshot = caseSnapshots.find((record) => record.id === item.caseId) || {};
          const original = item.originalRecord || { ...currentSnapshot, ...(item.previousValues || {}) };
          const changes = item.changes || {};
          const changedValues = Object.entries(changes).filter(([key, value]) => key !== "casinoId" && String(original[key] ?? "") !== String(value ?? ""));
          const approved = item.status === "Aprobada";
          const originalEntries = Object.entries(original).filter(([key]) => !["id", "createdByUsername"].includes(key));
          return <article key={item.id}>
            <header className="pay-request-history-card-header"><div><small className="pay-request-history-eyebrow">CASO {String(item.caseId || "").slice(0, 8)}</small><strong>{item.requestedBy || item.requestedByUsername || "Agente"}</strong><small>Enviada {fechaHoraParaguay(item.requestedAt)}</small></div><span className={`pay-request-history-status ${approved ? "is-approved" : item.status === "Rechazada" ? "is-rejected" : ""}`}>{item.status}</span></header>
            <div className="pay-request-history-reason"><strong>Motivo informado por el agente</strong><p>{item.reason || "—"}</p></div>
            <div className="pay-request-history-diff-wrap"><div className="pay-request-history-section-heading"><div><small>COMPARACIÓN</small><h3>Original vs. {approved ? "aplicado" : "solicitado"}</h3></div><span>{changedValues.length} {changedValues.length === 1 ? "dato" : "datos"}</span></div>
              {changedValues.length ? <div className="pay-request-history-table-wrap"><table className="pay-request-history-table"><thead><tr><th>Campo</th><th>Valor original</th><th>{approved ? "Valor aplicado" : "Valor solicitado"}</th></tr></thead><tbody>{changedValues.map(([key, value]) => <tr key={key}><th>{labels[key] || key}</th><td>{formatoValor(original[key], key, original.currency)}</td><td>{formatoValor(value, key, changes.currency)}</td></tr>)}</tbody></table></div> : <p className="pay-request-history-no-diff">No se registraron diferencias de campos.</p>}
            </div>
            <details className="pay-request-original-details"><summary>Ver todos los datos originales de la orden</summary><div className="pay-request-original-grid">{originalEntries.map(([key, value]) => <div key={key}><strong>{labels[key] || key}</strong><span>{key === "amount" ? formatoValor(value, key, original.currency) : formatoValor(value, key, original.currency)}</span></div>)}</div></details>
            <footer><span>Revisada {fechaHoraParaguay(item.reviewedAt)}</span><span>Por {item.reviewedBy || "Administración"}</span>{item.reviewNote && <span>{item.reviewNote}</span>}</footer>
          </article>;
        })}</div> : <div className="casino-empty"><strong>{requests.length ? "No hay solicitudes que coincidan con los filtros" : "Todavía no hay solicitudes revisadas"}<p>{requests.length ? "Probá cambiar los criterios o limpiá los filtros." : "Las solicitudes aprobadas, rechazadas o canceladas aparecerán aquí con su motivo y comparación."}</p></strong></div>}
      </section>
    </main>
  </div>;
}
