import { useEffect, useMemo, useState } from "react";
import { useSharedPolling } from "./useSharedPolling";

export default function PayCasesPage({ content, getBrandStyles, Header, isAdmin }) {
  const [casinos, setCasinos] = useState([]);
  const [casinoId, setCasinoId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [externalOrderId, setExternalOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [operation, setOperation] = useState("Depósito");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeCasinos = useMemo(() => casinos.filter((casino) => casino.status === "Activo"), [casinos]);
  const selectedCasino = activeCasinos.find((casino) => String(casino.id) === casinoId);
  const methods = selectedCasino?.paymentMethods || [];

  const refreshCasinos = async () => {
    const response = await fetch("/api/pay/casinos", { cache: "no-cache" });
    if (!response.ok) throw new Error("No se pudieron cargar los casinos habilitados.");
    const available = await response.json();
    const list = Array.isArray(available) ? available : [];
    setCasinos(list);
    setCasinoId((current) => current && list.some((casino) => String(casino.id) === current && casino.status === "Activo") ? current : String(list.find((casino) => casino.status === "Activo")?.id || ""));
    setLoading(false);
    setMessage("");
  };
  useEffect(() => { refreshCasinos().catch((error) => { setMessage(error.message); setLoading(false); }); }, []);
  useSharedPolling(() => refreshCasinos().catch((error) => setMessage(error.message)), !saving, 12000);

  useEffect(() => { setPaymentMethod(""); }, [casinoId]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/pay/casos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ casinoId, paymentMethod, playerId, transactionId, externalOrderId, amount: Number(amount), currency, operation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar el caso.");
      const time = new Intl.DateTimeFormat("es-PY", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Asuncion" }).format(new Date(result.createdAt));
      setPlayerId(""); setTransactionId(""); setExternalOrderId(""); setAmount(""); setCurrency("");
      setMessage(`Caso registrado el ${time} por ${result.agentName || result.author || "Agente"}.`);
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  };

  return <div className="app pay-app" style={getBrandStyles(content)}>
    <Header content={{ ...content, headerSubtitle: "Registro de casos · Orbital Pay" }} />
    <main className="pay-dashboard pay-cases-page">
      <nav className="pay-nav"><a className="module-switch-link" href={isAdmin ? "/admin/pay" : "/orbital-pay"}><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span><span>{isAdmin ? "Volver a administración de Pay" : "Volver a Orbital Pay"}</span></a><span>ORBITAL PAY / REGISTRO DE CASOS</span></nav>
      <div className="pay-heading"><div><span className="pay-kicker">OPERACIONES</span><h1>Registro de casos</h1><p>Registrá depósitos y retiros usando las opciones habilitadas por administración.</p></div><a className="pay-case-admin-link" href={isAdmin ? "/admin/pay/registros" : "/orbital-pay/registros"}>Consultar registros de agentes →</a></div>
      <section className="pay-panel pay-case-form-panel"><div className="pay-panel-title"><span>＋</span><div><small>NUEVO REGISTRO</small><h2>Registrar caso</h2></div></div>
        <form className="pay-case-form" onSubmit={submit}>
          <label>Casino<select value={casinoId} onChange={(event) => setCasinoId(event.target.value)} required><option value="">Elegí un casino</option>{activeCasinos.map((casino) => <option key={casino.id} value={casino.id}>{casino.name}</option>)}</select></label>
          <label>Método de pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} required disabled={!methods.length}><option value="">{methods.length ? "Elegí un método" : "Sin métodos configurados"}</option>{methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
          <label>ID de jugador (obligatorio)<input name="playerId" type="text" autoComplete="off" value={playerId} onChange={(event) => setPlayerId(event.target.value)} maxLength="120" required placeholder="Ingresá el ID del jugador" /></label>
          <label>ID de transacción (obligatorio)<input name="transactionId" type="text" autoComplete="off" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} maxLength="160" required placeholder="Ingresá el ID de transacción" /></label>
          <label>ID de orden externa (obligatorio)<input name="externalOrderId" type="text" autoComplete="off" value={externalOrderId} onChange={(event) => setExternalOrderId(event.target.value)} maxLength="160" required placeholder="Ingresá el ID de la orden" /></label>
          <label>Monto (obligatorio)<input name="amount" type="number" inputMode="decimal" min="0.01" step={currency === "PYG" ? "1" : "0.01"} value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="Ingresá el monto" /></label>
          <label>Moneda<select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required><option value="">Elegí una moneda</option><option value="ARS">ARS · Peso argentino</option><option value="PYG">PYG · Guaraní paraguayo</option></select></label>
          <label>Operación<select value={operation} onChange={(event) => setOperation(event.target.value)}><option>Depósito</option><option>Retiro</option></select></label>
          {!loading && !activeCasinos.length && <p className="pay-case-empty">Todavía no hay casinos activos. Pedile a un administrador que configure casinos y métodos de pago.</p>}
          {selectedCasino && !methods.length && <p className="pay-case-empty">Este casino aún no tiene métodos de pago configurados por administración.</p>}
          {message && <p className="pay-notice" role="status">{message}</p>}
          <button type="submit" disabled={saving || loading || !activeCasinos.length || !methods.length}>{saving ? "Guardando…" : "Guardar caso"} <span>→</span></button>
        </form>
      </section>
    </main>
  </div>;
}
