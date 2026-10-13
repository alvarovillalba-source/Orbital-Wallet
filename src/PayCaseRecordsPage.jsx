import { useEffect, useMemo, useState } from "react";
import { useSharedPolling } from "./useSharedPolling";

function fechaParaguay(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function fechaHoraParaguay(value) {
  return new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Asuncion" }).format(new Date(value));
}

function formatoMonto(amount, currency) {
  if (amount == null || !currency) return "—";
  return new Intl.NumberFormat(currency === "ARS" ? "es-AR" : "es-PY", { style: "currency", currency, maximumFractionDigits: currency === "PYG" ? 0 : 2 }).format(Number(amount));
}

export default function PayCaseRecordsPage({ content, getBrandStyles, Header, isAdmin }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [casinoFilter, setCasinoFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const refreshRecords = async () => {
    const response = await fetch("/api/pay/casos", { cache: "no-cache" });
    if (!response.ok) throw new Error("No se pudieron cargar los registros compartidos.");
    const result = await response.json();
    setRecords(Array.isArray(result) ? result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { refreshRecords().catch((requestError) => { setError(requestError.message); setLoading(false); }); }, []);
  useSharedPolling(() => refreshRecords().catch((requestError) => setError(requestError.message)), !exporting, 12000);

  const agents = useMemo(() => [...new Set(records.map((item) => item.agentName || item.author).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [records]);
  const methods = useMemo(() => [...new Set(records.map((item) => item.paymentMethod).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [records]);
  const casinos = useMemo(() => [...new Set(records.map((item) => item.casino).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [records]);
  const filteredRecords = useMemo(() => records.filter((item) =>
    (!agentFilter || (item.agentName || item.author) === agentFilter)
    && (!dateFromFilter || fechaParaguay(item.createdAt) >= dateFromFilter)
    && (!dateToFilter || fechaParaguay(item.createdAt) <= dateToFilter)
    && (!methodFilter || item.paymentMethod === methodFilter)
    && (!casinoFilter || item.casino === casinoFilter)
  ), [records, agentFilter, dateFromFilter, dateToFilter, methodFilter, casinoFilter]);

  const exportAll = async () => {
    setExporting(true); setExportMessage("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Orbital Pay";
      const sheet = workbook.addWorksheet("Registros de casos");
      sheet.columns = [
        { header: "Fecha y hora (Paraguay)", key: "createdAt", width: 25 },
        { header: "Agente responsable", key: "agentName", width: 26 },
        { header: "Casino", key: "casino", width: 28 },
        { header: "Método de pago", key: "paymentMethod", width: 24 },
        { header: "Monto", key: "amount", width: 18 },
        { header: "Moneda", key: "currency", width: 12 },
        { header: "Tipo de operación", key: "operation", width: 18 },
        { header: "ID de jugador", key: "playerId", width: 22 },
        { header: "ID de transacción", key: "transactionId", width: 25 },
        { header: "ID de orden externa", key: "externalOrderId", width: 26 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFED1B2F" } };
      records.forEach((item) => sheet.addRow({ createdAt: fechaHoraParaguay(item.createdAt), agentName: item.agentName || item.author || "Agente", casino: item.casino, paymentMethod: item.paymentMethod, amount: item.amount ?? "", currency: item.currency || "", operation: item.operation, playerId: item.playerId, transactionId: item.transactionId || "", externalOrderId: item.externalOrderId }));
      sheet.autoFilter = { from: "A1", to: "J1" };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `orbital-pay-registros-${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
      setExportMessage(`Se exportaron ${records.length} registros.`);
    } catch { setExportMessage("No se pudo exportar el archivo Excel."); }
    finally { setExporting(false); }
  };

  const resetFilters = () => { setAgentFilter(""); setDateFromFilter(""); setDateToFilter(""); setMethodFilter(""); setCasinoFilter(""); };
  return <div className="app pay-app" style={getBrandStyles(content)}><Header content={{ ...content, headerSubtitle: "Registros de agentes · Orbital Pay" }} />
    <main className="pay-dashboard pay-cases-page">
      <nav className="pay-nav"><a className="module-switch-link" href={isAdmin ? "/admin/pay" : "/orbital-pay"}><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span><span>{isAdmin ? "Volver a administración de Pay" : "Volver a Orbital Pay"}</span></a><span>ORBITAL PAY / REGISTROS DE AGENTES</span></nav>
      <div className="pay-heading pay-records-heading"><div><span className="pay-kicker">REGISTRO COMPARTIDO</span><h1>Registros de agentes</h1><p>Consultá los casos registrados por todo el equipo.</p></div><div className="pay-records-actions"><a className="pay-case-admin-link pay-record-action" href={isAdmin ? "/admin/pay/casos" : "/orbital-pay/casos"}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>Registrar caso<svg className="pay-record-action-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>{isAdmin && <a className="pay-case-admin-link pay-record-action" href="/admin/pay"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3-1.8a7 7 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" /></svg>Opciones de casino y pago</a>}{isAdmin && <button className="pay-case-admin-link pay-record-action" type="button" onClick={exportAll} disabled={exporting}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg>{exporting ? "Preparando Excel…" : "Exportar a Excel"}</button>}</div></div>
      <section className="pay-panel pay-case-records-panel"><div className="pay-panel-title"><span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg></span><div><small>FILTROS</small><h2>Buscar registros</h2></div></div>
        <div className="pay-record-filters"><label>Nombre de agente<select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="">Todos los agentes</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></label><label>Desde<input aria-label="Fecha desde" type="date" value={dateFromFilter} max={dateToFilter || undefined} onChange={(event) => setDateFromFilter(event.target.value)} /></label><label>Hasta<input aria-label="Fecha hasta" type="date" value={dateToFilter} min={dateFromFilter || undefined} onChange={(event) => setDateToFilter(event.target.value)} /></label><label>Método de pago<select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">Todos los métodos</option>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><label>Casino<select value={casinoFilter} onChange={(event) => setCasinoFilter(event.target.value)}><option value="">Todos los casinos</option>{casinos.map((casino) => <option key={casino} value={casino}>{casino}</option>)}</select></label><button type="button" className="pay-case-filter-reset" onClick={resetFilters}>Limpiar filtros</button><span className="pay-case-filter-count">Mostrando {filteredRecords.length} de {records.length}</span></div>
        {error && <p className="pay-notice pay-notice-error" role="alert">{error}</p>}{exportMessage && <p className="pay-notice" role="status">{exportMessage}</p>}
        {loading ? <p>Cargando registros…</p> : filteredRecords.length ? <div className="pay-case-table-wrap"><table className="pay-case-table"><thead><tr><th>Fecha y hora (Paraguay)</th><th>Agente</th><th>Casino</th><th>Método de pago</th><th>Monto</th><th>Operación</th><th>ID de jugador</th><th>ID de transacción</th><th>ID de orden externa</th></tr></thead><tbody>{filteredRecords.map((item) => <tr key={item.id}><td>{fechaHoraParaguay(item.createdAt)}</td><td>{item.agentName || item.author || "Agente"}</td><td>{item.casino}</td><td>{item.paymentMethod}</td><td>{formatoMonto(item.amount, item.currency)}</td><td><span className={`pay-case-type ${item.operation === "Retiro" ? "is-withdrawal" : ""}`}>{item.operation}</span></td><td>{item.playerId}</td><td>{item.transactionId || "—"}</td><td>{item.externalOrderId}</td></tr>)}</tbody></table></div> : <div className="casino-empty"><strong>{records.length ? "No hay registros con esos filtros" : "No hay casos registrados"}<p>Los casos guardados por agentes y administradores aparecerán aquí.</p></strong></div>}
      </section>
    </main>
  </div>;
}
