import { useEffect, useMemo, useState } from "react";
import { useSharedPolling } from "./useSharedPolling";
import { PAY_CURRENCY_CODES } from "./payCurrencies";

function monedaPorCasino(casino) {
  if (PAY_CURRENCY_CODES.includes(casino?.currency)) return casino.currency;
  const nombre = String(casino?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (nombre.includes("paraguay")) return "PYG";
  if (nombre.includes("argentina")) return "ARS";
  return "";
}

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
  return new Intl.NumberFormat("es", { style: "currency", currency }).format(Number(amount));
}

export default function PayCaseRecordsPage({ content, getBrandStyles, Header, isAdmin, deletedArchive = false, currentUsername = "" }) {
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
  const [casinosOptions, setCasinosOptions] = useState([]);
  const [editingRecord, setEditingRecord] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [requestReason, setRequestReason] = useState("");
  const [changeRequests, setChangeRequests] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [viewingRequest, setViewingRequest] = useState(null);
  const [reviewPassword, setReviewPassword] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const refreshRecords = async () => {
    const response = await fetch(deletedArchive ? "/api/pay/casos-eliminados" : "/api/pay/casos", { cache: "no-cache" });
    if (!response.ok) throw new Error("No se pudieron cargar los registros compartidos.");
    const result = await response.json();
    setRecords(Array.isArray(result) ? result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : []);
    setError("");
    setLoading(false);
  };
  useEffect(() => { refreshRecords().catch((requestError) => { setError(requestError.message); setLoading(false); }); }, []);
  useSharedPolling(() => refreshRecords().catch((requestError) => setError(requestError.message)), !exporting, 12000);
  useEffect(() => {
    if (deletedArchive) return;
    const loadRequests = () => fetch("/api/pay/casos-solicitudes", { cache: "no-cache" }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudieron cargar las solicitudes pendientes.");
      setChangeRequests(await response.json());
    });
    loadRequests().catch((requestError) => setError(requestError.message));
    const timer = window.setInterval(() => loadRequests().catch((requestError) => setError(requestError.message)), 12000);
    return () => window.clearInterval(timer);
  }, [isAdmin, deletedArchive]);
  useEffect(() => {
    if (isAdmin || deletedArchive) return;
    fetch("/api/pay/casinos", { cache: "no-cache" }).then((response) => response.ok ? response.json() : []).then(setCasinosOptions).catch(() => setCasinosOptions([]));
  }, [isAdmin, deletedArchive]);

  const deleteRecord = async (event) => {
    event.preventDefault();
    if (!deleteTarget || !deleteReason.trim() || !deletePassword) return;
    setActionBusy(true);
    try {
      const response = await fetch("/api/pay/casos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: deleteTarget.id, reason: deleteReason, password: deletePassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo eliminar el registro.");
      setRecords((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null); setDeleteReason(""); setDeletePassword("");
      setExportMessage("Registro movido al archivo de eliminados.");
    } catch (requestError) { setError(requestError.message); }
    finally { setActionBusy(false); }
  };

  const startEdit = (record) => {
    setEditingRecord(record);
    const casino = casinosOptions.find((item) => String(item.id) === String(record.casinoId));
    setEditDraft({ casinoId: String(record.casinoId || ""), paymentMethod: record.paymentMethod || "", registrationType: record.registrationType || "Normal", manualReason: record.manualReason || "", playerId: record.playerId || "", transactionId: record.transactionId || "", externalOrderId: record.externalOrderId || "", amount: String(record.amount ?? ""), currency: monedaPorCasino(casino || { name: record.casino }) || record.currency || "", operation: record.operation || "Depósito" });
    setRequestReason("");
  };
  const submitChangeRequest = async (event) => {
    event.preventDefault();
    if (!editingRecord || !editDraft) return;
    setActionBusy(true); setError("");
    try {
      const response = await fetch("/api/pay/casos-solicitudes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseId: editingRecord.id, reason: requestReason, changes: { ...editDraft, amount: Number(editDraft.amount) } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo enviar la solicitud.");
      setChangeRequests((current) => [result, ...current.filter((item) => item.id !== result.id)]);
      setEditingRecord(null); setEditDraft(null); setExportMessage("La solicitud se envió a administración para su revisión.");
    } catch (requestError) { setError(requestError.message); }
    finally { setActionBusy(false); }
  };
  const resolveChangeRequest = async (event) => {
    event.preventDefault();
    if (!reviewTarget) return;
    setActionBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/pay/casos-solicitudes-resolver", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: reviewTarget.request.id, decision: reviewTarget.decision, password: reviewPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo resolver la solicitud.");
      setChangeRequests((current) => current.filter((item) => item.id !== reviewTarget.request.id));
      setReviewTarget(null); setReviewPassword("");
      await refreshRecords();
      setExportMessage(reviewTarget.decision === "Aprobada" ? "Cambio aprobado y aplicado al registro." : "Solicitud rechazada.");
    } catch (requestError) { setError(requestError.message); }
    finally { setActionBusy(false); }
  };

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
  const pendingChangeRequests = changeRequests.filter((item) => item.status === "Pendiente");
  const requestOriginalRecord = viewingRequest ? viewingRequest.originalRecord || records.find((record) => record.id === viewingRequest.caseId) || viewingRequest.previousValues || {} : {};

  const exportAll = async () => {
    setExporting(true); setExportMessage("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Orbital Pay";
      const [activeResponse, deletedResponse, requestsResponse] = await Promise.all([
        fetch("/api/pay/casos", { cache: "no-cache" }),
        fetch("/api/pay/casos-eliminados", { cache: "no-cache" }),
        fetch("/api/pay/casos-solicitudes", { cache: "no-cache" }),
      ]);
      if (!activeResponse.ok || !deletedResponse.ok || !requestsResponse.ok) throw new Error("No se pudieron cargar todos los registros para exportar.");
      const [activeCases, deletedCases, changeRequests] = await Promise.all([activeResponse.json(), deletedResponse.json(), requestsResponse.json()]);
      const activeRows = Array.isArray(activeCases) ? activeCases : [];
      const deletedRows = Array.isArray(deletedCases) ? deletedCases : [];
      const requests = Array.isArray(changeRequests) ? changeRequests : [];
      const caseColumns = [
        { header: "ID del caso", key: "id", width: 34 },
        { header: "Fecha y hora del registro (Paraguay)", key: "createdAt", width: 27 },
        { header: "Agente responsable", key: "agentName", width: 25 },
        { header: "Usuario del agente", key: "createdByUsername", width: 23 },
        { header: "Casino", key: "casino", width: 30 },
        { header: "Método de pago", key: "paymentMethod", width: 22 },
        { header: "Monto", key: "amount", width: 18 },
        { header: "Moneda", key: "currency", width: 12 },
        { header: "Operación", key: "operation", width: 16 },
        { header: "Tipo de registro", key: "registrationType", width: 18 },
        { header: "Motivo del registro manual", key: "manualReason", width: 40 },
        { header: "ID de jugador", key: "playerId", width: 22 },
        { header: "ID de transacción", key: "transactionId", width: 25 },
        { header: "ID de orden externa", key: "externalOrderId", width: 26 },
      ];
      const caseRow = (item) => ({ id: item.id || "", createdAt: fechaHoraParaguay(item.createdAt), agentName: item.agentName || item.author || "Agente", createdByUsername: item.createdByUsername || "", casino: item.casino || "", paymentMethod: item.paymentMethod || "", amount: item.amount ?? "", currency: item.currency || "", operation: item.operation || "", registrationType: item.registrationType || "Normal", manualReason: item.manualReason || "", playerId: item.playerId || "", transactionId: item.transactionId || "", externalOrderId: item.externalOrderId || "" });
      const styleSheet = (sheet) => {
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
        sheet.getRow(1).height = 30;
        sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFED1B2F" } };
        sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true }; });
      };
      const activeSheet = workbook.addWorksheet("Casos activos");
      activeSheet.columns = caseColumns;
      activeRows.forEach((item) => activeSheet.addRow(caseRow(item)));
      styleSheet(activeSheet);

      const deletedSheet = workbook.addWorksheet("Casos eliminados");
      deletedSheet.columns = [...caseColumns, { header: "Fecha de eliminación", key: "deletedAt", width: 26 }, { header: "Eliminado por", key: "deletedBy", width: 25 }, { header: "Usuario administrador", key: "deletedByUsername", width: 24 }, { header: "Motivo de eliminación", key: "deletionReason", width: 42 }];
      deletedRows.forEach((item) => deletedSheet.addRow({ ...caseRow(item), deletedAt: fechaHoraParaguay(item.deletedAt), deletedBy: item.deletedBy || "", deletedByUsername: item.deletedByUsername || "", deletionReason: item.deletionReason || "" }));
      styleSheet(deletedSheet);

      const modifiedSheet = workbook.addWorksheet("Casos modificados");
      const comparisonFields = [
        ["casino", "Casino"], ["paymentMethod", "Método de pago"], ["registrationType", "Tipo de registro"], ["manualReason", "Motivo del registro manual"],
        ["playerId", "ID de jugador"], ["transactionId", "ID de transacción"], ["externalOrderId", "ID de orden externa"], ["amount", "Monto"], ["currency", "Moneda"], ["operation", "Operación"],
      ];
      modifiedSheet.columns = [
        { header: "ID del caso", key: "caseId", width: 34 }, { header: "Fecha de solicitud", key: "requestedAt", width: 25 },
        { header: "Fecha de modificación", key: "reviewedAt", width: 25 }, { header: "Agente solicitante", key: "requestedBy", width: 24 },
        { header: "Usuario solicitante", key: "requestedByUsername", width: 22 }, { header: "Modificado / aprobado por", key: "reviewedBy", width: 26 },
        { header: "Estado", key: "status", width: 16 }, { header: "Motivo de la solicitud", key: "reason", width: 42 },
        ...comparisonFields.flatMap(([key, label]) => [
          { header: `${label} original`, key: `original_${key}`, width: key === "manualReason" ? 35 : 24 },
          { header: `${label} final`, key: `final_${key}`, width: key === "manualReason" ? 35 : 24 },
        ]),
      ];
      const snapshotsById = new Map([...activeRows, ...deletedRows].map((item) => [item.id, item]));
      requests.filter((item) => item.status === "Aprobada").forEach((item) => {
        const current = snapshotsById.get(item.caseId) || {};
        const original = item.originalRecord || { ...current, ...(item.previousValues || {}) };
        const finalValues = item.changes || {};
        const row = {
          caseId: item.caseId || "", requestedAt: fechaHoraParaguay(item.requestedAt), reviewedAt: fechaHoraParaguay(item.reviewedAt),
          requestedBy: item.requestedBy || "", requestedByUsername: item.requestedByUsername || "", reviewedBy: item.reviewedBy || current.modifiedBy || "",
          status: item.status, reason: item.reason || "",
        };
        comparisonFields.forEach(([key]) => {
          const originalValue = original[key];
          const finalValue = finalValues[key] ?? current[key];
          row[`original_${key}`] = key === "amount" ? formatoMonto(originalValue, original.currency) : (originalValue ?? "");
          row[`final_${key}`] = key === "amount" ? formatoMonto(finalValue, finalValues.currency || current.currency) : (finalValue ?? "");
        });
        modifiedSheet.addRow(row);
      });
      styleSheet(modifiedSheet);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `orbital-pay-registros-${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
      const modifiedCount = modifiedSheet.rowCount - 1;
      setExportMessage(`Excel generado: ${activeRows.length} casos activos, ${deletedRows.length} eliminados y ${modifiedCount} modificados.`);
    } catch (exportError) { setExportMessage(exportError.message || "No se pudo exportar el archivo Excel."); }
    finally { setExporting(false); }
  };

  const resetFilters = () => { setAgentFilter(""); setDateFromFilter(""); setDateToFilter(""); setMethodFilter(""); setCasinoFilter(""); };
  return <div className="app pay-app" style={getBrandStyles(content)}><Header content={{ ...content, headerSubtitle: deletedArchive ? "Registros eliminados · Orbital Pay" : "Registros de agentes · Orbital Pay" }} />
    <main className="pay-dashboard pay-cases-page">
      <nav className="pay-nav"><a className="module-switch-link" href={isAdmin ? "/admin/pay" : "/orbital-pay"}><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span><span>{isAdmin ? "Volver a administración de Pay" : "Volver a Orbital Pay"}</span></a><span>ORBITAL PAY / {deletedArchive ? "REGISTROS ELIMINADOS" : "REGISTROS DE AGENTES"}</span></nav>
      <div className="pay-heading pay-records-heading"><div><span className="pay-kicker">{deletedArchive ? "ARCHIVO DE SOLO LECTURA" : "REGISTRO COMPARTIDO"}</span><h1>{deletedArchive ? "Registros eliminados" : "Registros de agentes"}</h1><p>{deletedArchive ? "Consulta los registros retirados por administración. Este archivo no permite eliminar información." : "Consultá los casos registrados por todo el equipo."}</p></div><div className="pay-records-actions">{isAdmin && <a className="pay-case-admin-link pay-record-action" href={deletedArchive ? "/admin/pay/registros" : "/admin/pay/registros-eliminados"}><svg aria-hidden="true" viewBox="0 0 24 24"><path d={deletedArchive ? "M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" : "M3 12a9 9 0 1 0 2.64-6.36L3 8m0-5v5h5M12 7v5l3 2"} /></svg>{deletedArchive ? "Volver a registros activos" : "Ver eliminados"}<svg className="pay-record-action-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>}{isAdmin && <a className="pay-case-admin-link pay-record-action" href="/admin/pay/solicitudes-revisadas"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.5M4 4v4.5h4.5M12 7v5l3 2" /></svg>Ver modificados<svg className="pay-record-action-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>}{!deletedArchive && <a className="pay-case-admin-link pay-record-action" href={isAdmin ? "/admin/pay/casos" : "/orbital-pay/casos"}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>Registrar caso<svg className="pay-record-action-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a>}{isAdmin && !deletedArchive && <a className="pay-case-admin-link pay-record-action" href="/admin/pay"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3-1.8a7 7 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.7Z" /></svg>Opciones de casino y pago</a>}{isAdmin && <button className="pay-case-admin-link pay-record-action" type="button" onClick={exportAll} disabled={exporting}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg>{exporting ? "Preparando Excel…" : "Exportar a Excel"}</button>}</div></div>
      {isAdmin && !deletedArchive && <section className="pay-panel pay-change-requests"><div className="pay-panel-title"><span aria-hidden="true">✎</span><div><small>REVISIÓN ADMINISTRATIVA</small><h2>Solicitudes de cambio <b>{pendingChangeRequests.length}</b></h2></div></div>{pendingChangeRequests.length ? <div className="pay-change-request-list">{pendingChangeRequests.map((changeRequest) => <article key={changeRequest.id}><header><div><strong>{changeRequest.requestedBy}</strong><small>Solicitado {fechaHoraParaguay(changeRequest.requestedAt)} · Caso {changeRequest.caseId.slice(0, 8)}</small></div><span>Pendiente</span></header><p><strong>Motivo:</strong> {changeRequest.reason}</p><div className="pay-request-actions"><button type="button" onClick={() => setViewingRequest(changeRequest)}>Ver solicitud</button></div></article>)}</div> : <p className="pay-change-requests-empty">No hay solicitudes pendientes.</p>}</section>}
      {editingRecord && editDraft && <section className="pay-panel pay-edit-request-panel"><div className="pay-panel-title"><span aria-hidden="true">✎</span><div><small>SOLICITUD PARA ADMINISTRACIÓN</small><h2>Solicitar modificación del caso</h2></div></div><form className="pay-edit-request-form" onSubmit={submitChangeRequest}><label>Casino<select value={editDraft.casinoId} onChange={(event) => { const nextCasino = casinosOptions.find((item) => String(item.id) === event.target.value); const automaticCurrency = monedaPorCasino(nextCasino); setEditDraft((draft) => ({ ...draft, casinoId: event.target.value, paymentMethod: nextCasino?.paymentMethods?.[0] || "", currency: automaticCurrency || "" })); }} required>{casinosOptions.filter((item) => item.status === "Activo").map((casino) => <option key={casino.id} value={String(casino.id)}>{casino.name}</option>)}</select></label><label>Método de pago<select value={editDraft.paymentMethod} onChange={(event) => setEditDraft((draft) => ({ ...draft, paymentMethod: event.target.value }))} required>{(casinosOptions.find((item) => String(item.id) === editDraft.casinoId)?.paymentMethods || []).map((method) => <option key={method}>{method}</option>)}</select></label><label>Tipo de registro<select value={editDraft.registrationType} onChange={(event) => setEditDraft((draft) => ({ ...draft, registrationType: event.target.value }))}><option>Normal</option><option>Manual</option></select></label><label>Operación<select value={editDraft.operation} onChange={(event) => setEditDraft((draft) => ({ ...draft, operation: event.target.value }))}><option>Depósito</option><option>Retiro</option></select></label><label>ID de jugador<input value={editDraft.playerId} onChange={(event) => setEditDraft((draft) => ({ ...draft, playerId: event.target.value }))} required maxLength={120} /></label><label>ID de transacción<input value={editDraft.transactionId} onChange={(event) => setEditDraft((draft) => ({ ...draft, transactionId: event.target.value }))} required maxLength={160} /></label><label>ID de orden externa{editDraft.registrationType === "Normal" ? " (obligatorio)" : ""}<input value={editDraft.externalOrderId} onChange={(event) => setEditDraft((draft) => ({ ...draft, externalOrderId: event.target.value }))} required={editDraft.registrationType === "Normal"} maxLength={160} /></label><label>Monto<input type="number" min={editDraft.currency === "PYG" ? "1" : "0.01"} step={editDraft.currency === "PYG" ? "1" : "0.01"} value={editDraft.amount} onChange={(event) => setEditDraft((draft) => ({ ...draft, amount: event.target.value }))} required /></label><label>Moneda<select value={editDraft.currency} onChange={(event) => setEditDraft((draft) => ({ ...draft, currency: event.target.value }))} required disabled={Boolean(monedaPorCasino(casinosOptions.find((item) => String(item.id) === editDraft.casinoId)))}><option value="">Elegí una moneda</option><option value="ARS">ARS</option><option value="PYG">PYG</option></select>{monedaPorCasino(casinosOptions.find((item) => String(item.id) === editDraft.casinoId)) && <small>Moneda asignada automáticamente según el país del casino.</small>}</label>{editDraft.registrationType === "Manual" && <label className="pay-edit-request-wide">Motivo del registro manual<textarea value={editDraft.manualReason} onChange={(event) => setEditDraft((draft) => ({ ...draft, manualReason: event.target.value }))} required maxLength={1000} /></label>}<label className="pay-edit-request-wide">Motivo de la solicitud<textarea value={requestReason} onChange={(event) => setRequestReason(event.target.value)} required maxLength={1000} placeholder="Explicá por qué necesitás modificar el caso." /></label><div className="pay-edit-request-actions"><button type="submit" disabled={actionBusy}>{actionBusy ? "Enviando…" : "Enviar solicitud"}</button><button type="button" className="is-secondary" onClick={() => { setEditingRecord(null); setEditDraft(null); }}>Cancelar</button></div></form></section>}
      <section className="pay-panel pay-case-records-panel"><div className="pay-panel-title"><span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg></span><div><small>FILTROS</small><h2>Buscar registros</h2></div></div>
        <div className="pay-record-filters"><label>Nombre de agente<select value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)}><option value="">Todos los agentes</option>{agents.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</select></label><label>Desde<input aria-label="Fecha desde" type="date" value={dateFromFilter} max={dateToFilter || undefined} onChange={(event) => setDateFromFilter(event.target.value)} /></label><label>Hasta<input aria-label="Fecha hasta" type="date" value={dateToFilter} min={dateFromFilter || undefined} onChange={(event) => setDateToFilter(event.target.value)} /></label><label>Método de pago<select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}><option value="">Todos los métodos</option>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><label>Casino<select value={casinoFilter} onChange={(event) => setCasinoFilter(event.target.value)}><option value="">Todos los casinos</option>{casinos.map((casino) => <option key={casino} value={casino}>{casino}</option>)}</select></label><button type="button" className="pay-case-filter-reset" onClick={resetFilters}>Limpiar filtros</button><span className="pay-case-filter-count">Mostrando {filteredRecords.length} de {records.length}</span></div>
        {error && <p className="pay-notice pay-notice-error" role="alert">{error}</p>}{exportMessage && <p className="pay-notice" role="status">{exportMessage}</p>}
        {loading ? <p>Cargando registros…</p> : filteredRecords.length ? <div className="pay-case-table-wrap"><table className="pay-case-table"><thead><tr><th>Fecha y hora (Paraguay)</th>{deletedArchive && <th>Eliminado el</th>}{deletedArchive && <th>Eliminado por</th>}{deletedArchive && <th>Motivo de eliminación</th>}<th>Agente</th><th>Casino</th><th>Método de pago</th><th>Monto</th><th>Operación</th><th>Tipo de registro</th><th>Motivo manual</th><th>ID de jugador</th><th>ID de transacción</th><th>ID de orden externa</th>{isAdmin && !deletedArchive && <th>Acciones</th>}{!isAdmin && !deletedArchive && <th>Acciones</th>}</tr></thead><tbody>{filteredRecords.map((item) => { const pendingRequest = changeRequests.some((request) => request.caseId === item.id && request.status === "Pendiente"); return <tr key={item.id}><td>{fechaHoraParaguay(item.createdAt)}</td>{deletedArchive && <td>{fechaHoraParaguay(item.deletedAt)}</td>}{deletedArchive && <td>{item.deletedBy || "Administrador"}</td>}{deletedArchive && <td>{item.deletionReason || "—"}</td>}<td>{item.agentName || item.author || "Agente"}</td><td>{item.casino}</td><td>{item.paymentMethod}</td><td>{formatoMonto(item.amount, item.currency)}</td><td><span className={`pay-case-type ${item.operation === "Retiro" ? "is-withdrawal" : ""}`}>{item.operation}</span></td><td>{item.registrationType || "Normal"}</td><td>{item.manualReason || "—"}</td><td>{item.playerId}</td><td>{item.transactionId || "—"}</td><td>{item.externalOrderId || "—"}</td>{isAdmin && !deletedArchive && <td><button className="pay-record-delete" type="button" onClick={() => { setDeleteTarget(item); setDeleteReason(""); setDeletePassword(""); }} aria-label={`Eliminar registro de ${item.agentName || item.author || "agente"}`}>Mover a eliminados</button></td>}{!isAdmin && !deletedArchive && <td>{item.createdByUsername === currentUsername ? pendingRequest ? <button className="pay-record-edit is-pending" type="button" disabled aria-label="Solicitud de modificación pendiente">Solicitud pendiente</button> : <button className="pay-record-edit" type="button" onClick={() => startEdit(item)}>Solicitar cambio</button> : <span>—</span>}</td>}</tr>; })}</tbody></table></div> : <div className="casino-empty"><strong>{records.length ? "No hay registros con esos filtros" : deletedArchive ? "No hay registros eliminados" : "No hay casos registrados"}<p>{deletedArchive ? "Los registros archivados por administración aparecerán aquí." : "Los casos guardados por agentes y administradores aparecerán aquí."}</p></strong></div>}
      </section>
      {deleteTarget && <div className="pay-confirm-backdrop" role="presentation"><form className="pay-confirm-dialog" onSubmit={deleteRecord} role="dialog" aria-modal="true" aria-labelledby="delete-case-title"><span className="pay-kicker">CONFIRMACIÓN ADMINISTRATIVA</span><h2 id="delete-case-title">Archivar registro</h2><p>El caso se moverá al archivo de eliminados y no podrá borrarse desde allí.</p><label>Motivo de eliminación<textarea value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} required maxLength={1000} autoFocus placeholder="Indicá por qué se elimina este registro." /></label><label>Contraseña de tu usuario administrador<input type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} required autoComplete="current-password" /></label><div className="pay-edit-request-actions"><button type="submit" disabled={actionBusy}>{actionBusy ? "Confirmando…" : "Confirmar eliminación"}</button><button type="button" className="is-secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button></div></form></div>}
      {reviewTarget && <div className="pay-confirm-backdrop" role="presentation"><form className="pay-confirm-dialog" onSubmit={resolveChangeRequest} role="dialog" aria-modal="true" aria-labelledby="review-case-title"><span className="pay-kicker">REVISIÓN ADMINISTRATIVA</span><h2 id="review-case-title">{reviewTarget.decision === "Aprobada" ? "Aprobar modificación" : "Rechazar solicitud"}</h2><p>{reviewTarget.decision === "Aprobada" ? "El cambio se aplicará al caso original. Confirmá con la contraseña de tu usuario administrador." : "La solicitud quedará registrada como rechazada."}</p>{reviewTarget.decision === "Aprobada" && <label>Contraseña de tu usuario administrador<input type="password" value={reviewPassword} onChange={(event) => setReviewPassword(event.target.value)} required autoComplete="current-password" autoFocus /></label>}<div className="pay-edit-request-actions"><button type="submit" disabled={actionBusy}>{actionBusy ? "Guardando…" : reviewTarget.decision === "Aprobada" ? "Confirmar aprobación" : "Confirmar rechazo"}</button><button type="button" className="is-secondary" onClick={() => setReviewTarget(null)}>Cancelar</button></div></form></div>}
      {viewingRequest && <div className="pay-confirm-backdrop pay-request-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingRequest(null); }}><section className="pay-confirm-dialog pay-request-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="request-detail-title"><span className="pay-kicker">SOLICITUD PENDIENTE · CASO {viewingRequest.caseId}</span><h2 id="request-detail-title">Revisar solicitud de modificación</h2><p>Solicitante: <strong>{viewingRequest.requestedBy}</strong> · {fechaHoraParaguay(viewingRequest.requestedAt)}</p><section><h3>Motivo informado</h3><p>{viewingRequest.reason || "—"}</p></section><section><h3>Orden original</h3><div className="pay-request-detail-grid">{Object.entries(requestOriginalRecord).map(([key, value]) => { const label = ({ id: "ID del caso", createdAt: "Fecha de registro", createdByUsername: "Usuario del agente", agentName: "Agente", author: "Agente", casino: "Casino", casinoId: "ID de casino", paymentMethod: "Método de pago", playerId: "ID de jugador", transactionId: "ID de transacción", externalOrderId: "ID de orden externa", amount: "Monto", currency: "Moneda", operation: "Operación", registrationType: "Tipo de registro", manualReason: "Motivo de registro manual" })[key] || key; const display = key === "amount" ? formatoMonto(value, requestOriginalRecord.currency) : (value == null || value === "" ? "—" : String(value)); return <div key={key}><strong>{label}</strong><span>{display}</span></div>; })}</div></section><section><h3>Cambios solicitados</h3><div className="pay-request-detail-grid">{Object.entries(viewingRequest.changes || {}).filter(([key, value]) => key !== "casinoId" && String(requestOriginalRecord[key] ?? "") !== String(value ?? "")).map(([key, value]) => { const label = ({ casino: "Casino", paymentMethod: "Método de pago", playerId: "ID de jugador", transactionId: "ID de transacción", externalOrderId: "ID de orden externa", amount: "Monto", currency: "Moneda", operation: "Operación", registrationType: "Tipo de registro", manualReason: "Motivo de registro manual" })[key] || key; const oldValue = key === "amount" ? formatoMonto(requestOriginalRecord[key], requestOriginalRecord.currency) : requestOriginalRecord[key] || "—"; const newValue = key === "amount" ? formatoMonto(value, viewingRequest.changes.currency) : value || "—"; return <div key={key}><strong>{label}</strong><span>{String(oldValue)} <b>→</b> {String(newValue)}</span></div>; })}</div></section><div className="pay-request-actions"><button type="button" onClick={() => { setReviewTarget({ request: viewingRequest, decision: "Aprobada" }); setReviewPassword(""); setViewingRequest(null); }}>Aprobar cambio</button><button type="button" className="is-secondary" onClick={() => { setReviewTarget({ request: viewingRequest, decision: "Rechazada" }); setReviewPassword(""); setViewingRequest(null); }}>Rechazar</button><button type="button" className="is-secondary" onClick={() => setViewingRequest(null)}>Cerrar</button></div></section></div>}
    </main>
  </div>;
}
