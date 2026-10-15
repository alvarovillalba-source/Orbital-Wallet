import { useEffect, useMemo, useState } from "react";
import { useSharedPolling } from "./useSharedPolling";

function monedaPorCasino(casino) {
  const nombre = String(casino?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (nombre.includes("paraguay")) return "PYG";
  if (nombre.includes("argentina")) return "ARS";
  return "";
}

export default function PayCasesPage({ content, getBrandStyles, Header, isAdmin }) {
  const [casinos, setCasinos] = useState([]);
  const [casinoId, setCasinoId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [registrationType, setRegistrationType] = useState("Normal");
  const [manualReason, setManualReason] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [operation, setOperation] = useState("Depósito");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const activeCasinos = useMemo(() => casinos.filter((casino) => casino.status === "Activo"), [casinos]);
  const selectedCasino = activeCasinos.find((casino) => String(casino.id) === casinoId);
  const methods = selectedCasino?.paymentMethods || [];

  const refreshCasinos = async () => {
    const response = await fetch("/api/pay/casinos", { cache: "no-cache" });
    if (!response.ok) throw new Error("No se pudieron cargar los casinos habilitados.");
    const available = await response.json();
    const list = Array.isArray(available) ? available : [];
    setCasinos(list);
    const chosenId = casinoId && list.some((casino) => String(casino.id) === casinoId && casino.status === "Activo") ? casinoId : String(list.find((casino) => casino.status === "Activo")?.id || "");
    setCasinoId(chosenId);
    const automaticCurrency = monedaPorCasino(list.find((casino) => String(casino.id) === chosenId));
    if (automaticCurrency) setCurrency(automaticCurrency);
    setLoading(false);
    setMessage("");
    setMessageError(false);
  };
  useEffect(() => { refreshCasinos().catch((error) => { setMessage(error.message); setLoading(false); }); }, []);
  useSharedPolling(() => refreshCasinos().catch((error) => setMessage(error.message)), !saving, 12000);

  useEffect(() => { setPaymentMethod(""); }, [casinoId]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage(""); setMessageError(false);
    if (!casinoId || !paymentMethod || !playerId.trim() || !transactionId.trim() || !amount || !currency || !operation || (registrationType === "Normal" && !externalOrderId.trim()) || (registrationType === "Manual" && !manualReason.trim())) {
      setMessage("Revisá los campos obligatorios. El motivo solo es obligatorio para registros manuales.");
      setMessageError(true);
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage("Ingresá un monto válido mayor que cero.");
      setMessageError(true);
      return;
    }
    if (currency === "PYG" && !Number.isInteger(numericAmount)) {
      setMessage("El guaraní (PYG) no admite decimales. Ingresá un monto entero o seleccioná ARS.");
      setMessageError(true);
      return;
    }
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/pay/casos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ casinoId, paymentMethod, registrationType, manualReason, playerId, transactionId, externalOrderId, amount: numericAmount, currency, operation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el caso.");
      const time = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Asuncion" }).format(new Date(result.createdAt));
      setPlayerId(""); setTransactionId(""); setExternalOrderId(""); setManualReason(""); setRegistrationType("Normal"); setAmount(""); setCurrency("");
      setMessage(`Caso registrado el ${time} por ${result.agentName || result.author || "Agente"}.`);
    } catch (error) { setMessage(error.message); setMessageError(true); }
    finally { setSaving(false); }
  };

  return <div className="app pay-app" style={getBrandStyles(content)}>
    <Header content={{ ...content, headerSubtitle: "Registro de casos · Orbital Pay" }} />
    <main className="pay-dashboard pay-cases-page">
      <nav className="pay-nav"><a className="module-switch-link" href={isAdmin ? "/admin/pay" : "/orbital-pay"}><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span><span>{isAdmin ? "Volver a administración de Pay" : "Volver a Orbital Pay"}</span></a><span>ORBITAL PAY / REGISTRO DE CASOS</span></nav>
      <div className="pay-heading"><div><span className="pay-kicker">OPERACIONES</span><h1>Registro de casos</h1><p>Registrá depósitos y retiros usando las opciones habilitadas por administración.</p></div><a className="pay-case-admin-link pay-record-action" href={isAdmin ? "/admin/pay/registros" : "/orbital-pay/registros"}><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.5 4.5" /></svg>Consultar registros de agentes<svg className="pay-record-action-arrow" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></a></div>
      <section className="pay-panel pay-case-form-panel"><div className="pay-panel-title"><span>＋</span><div><small>NUEVO REGISTRO</small><h2>Registrar caso</h2></div></div>
        <form className="pay-case-form" onSubmit={submit}>
          <fieldset className="pay-case-mode-selector"><legend>Tipo de registro</legend><label className={registrationType === "Normal" ? "is-selected" : ""}><input type="radio" name="registrationType" value="Normal" checked={registrationType === "Normal"} onChange={() => setRegistrationType("Normal")} /><span><strong>Registro normal</strong><small>Incluye ID de orden externa.</small></span></label><label className={registrationType === "Manual" ? "is-selected" : ""}><input type="radio" name="registrationType" value="Manual" checked={registrationType === "Manual"} onChange={() => setRegistrationType("Manual")} /><span><strong>Registro manual</strong><small>Requiere indicar el motivo.</small></span></label></fieldset>
          <label>Casino<select value={casinoId} onChange={(event) => { const nextId = event.target.value; setCasinoId(nextId); setCurrency(monedaPorCasino(activeCasinos.find((casino) => String(casino.id) === nextId))); }} required><option value="">Elegí un casino</option>{activeCasinos.map((casino) => <option key={casino.id} value={casino.id}>{casino.name}</option>)}</select></label>
          <label>Método de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} required disabled={!methods.length}><option value="">{methods.length ? "Elegí un método" : "Sin métodos configurados"}</option>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
          <label>ID de jugador (obligatorio)<input name="playerId" type="text" autoComplete="off" value={playerId} onChange={(event) => setPlayerId(event.target.value)} maxLength="120" required placeholder="Ingresá el ID del jugador" /></label>
          <label>ID de transacción (obligatorio)<input name="transactionId" type="text" autoComplete="off" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} maxLength="160" required placeholder="Ingresá el ID de transacción" /></label>
          <label>ID de orden externa ({registrationType === "Manual" ? "opcional" : "obligatorio"})<input name="externalOrderId" type="text" autoComplete="off" value={externalOrderId} onChange={(event) => setExternalOrderId(event.target.value)} maxLength="160" required={registrationType === "Normal"} placeholder={registrationType === "Manual" ? "Podés dejarlo vacío para un registro manual" : "Ingresá el ID de la orden"} /></label>
          {registrationType === "Manual" && <label className="pay-case-manual-reason">Motivo del registro manual (obligatorio)<textarea name="manualReason" value={manualReason} onChange={(event) => setManualReason(event.target.value)} maxLength="1000" required rows="3" placeholder="Explicá por qué este caso debe registrarse manualmente" /></label>}
          <label>Monto (obligatorio)<input name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="Ingresá el monto" /></label>
          <label>Moneda<select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required disabled={Boolean(monedaPorCasino(selectedCasino))}><option value="">Elegí una moneda</option><option value="ARS">ARS · Peso argentino</option><option value="PYG">PYG · Guaraní paraguayo</option></select>{monedaPorCasino(selectedCasino) && <small>Moneda asignada automáticamente según el país del casino.</small>}</label>
          <label>Operación<select value={operation} onChange={(event) => setOperation(event.target.value)}><option>Depósito</option><option>Retiro</option></select></label>
          {!loading && !activeCasinos.length && <p className="pay-case-empty">Todavía no hay casinos activos. Pedile a un administrador que configure casinos y métodos de pago.</p>}
          {selectedCasino && !methods.length && <p className="pay-case-empty">Este casino aún no tiene métodos de pago configurados por administración.</p>}
          {message && <p className={`pay-notice ${messageError ? "pay-notice-error" : ""}`} role={messageError ? "alert" : "status"}>{message}</p>}
          <button type="submit" disabled={saving || loading || !activeCasinos.length || !methods.length}>{saving ? "Guardando…" : "Guardar caso"} <span>→</span></button>
        </form>
      </section>
    </main>
  </div>;
}
