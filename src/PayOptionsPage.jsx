import { useEffect, useState } from "react";
import { useSharedPolling } from "./useSharedPolling";
import { PAY_CURRENCIES, PAY_CURRENCY_CODES } from "./payCurrencies";

function monedaPredeterminada(casino) {
  if (PAY_CURRENCY_CODES.includes(casino?.currency)) return casino.currency;
  const name = String(casino?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (name.includes("paraguay")) return "PYG";
  if (name.includes("argentina")) return "ARS";
  return "ARS";
}

export default function PayOptionsPage({ content, getBrandStyles, Header }) {
  const [casinos, setCasinos] = useState([]);
  const [payCases, setPayCases] = useState([]);
  const [casinoId, setCasinoId] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [methods, setMethods] = useState("");
  const [currency, setCurrency] = useState("ARS");
  const [status, setStatus] = useState("Activo");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const formatMoney = (amount, currency) => new Intl.NumberFormat("es", { style: "currency", currency }).format(amount || 0);
  const refresh = async () => {
    const [response, casesResponse] = await Promise.all([fetch("/api/pay/casinos", { cache: "no-cache" }), fetch("/api/pay/casos", { cache: "no-cache" })]);
    if (!response.ok) throw new Error("No se pudieron cargar las opciones de Orbital Pay.");
    if (!casesResponse.ok) throw new Error("No se pudieron cargar los registros de Orbital Pay.");
    const [items, cases] = await Promise.all([response.json(), casesResponse.json()]);
    setCasinos(Array.isArray(items) ? items : []);
    setPayCases(Array.isArray(cases) ? cases : []);
    setLoading(false);
    setNotice("");
  };
  useEffect(() => { refresh().catch((error) => { setNotice(error.message); setLoading(false); }); }, []);
  useSharedPolling(() => refresh().catch((error) => setNotice(error.message)), !saving, 12000);

  const edit = (casino) => { setCasinoId(String(casino.id)); setName(casino.name); setContact(casino.contact || ""); setMethods((casino.paymentMethods || []).join("\n")); setStatus(casino.status || "Activo"); setCurrency(monedaPredeterminada(casino)); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const reset = () => { setCasinoId(""); setName(""); setContact(""); setMethods(""); setStatus("Activo"); setCurrency("ARS"); };
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/pay/casinos", { cache: "no-cache" });
      if (!response.ok) throw new Error("No se pudo consultar la configuración actual.");
      const latest = await response.json();
      const paymentMethods = [...new Set(methods.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean))].slice(0, 50);
      const casino = { id: casinoId || crypto.randomUUID(), name: name.trim(), contact: contact.trim(), status, currency, paymentMethods, reports: latest.find((item) => String(item.id) === casinoId)?.reports || [] };
      const next = casinoId ? latest.map((item) => String(item.id) === casinoId ? casino : item) : [...latest, casino];
      const result = await fetch("/api/pay/casinos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const body = await result.json(); if (!result.ok) throw new Error(body.error || "No se pudo guardar el casino.");
      setCasinos(next); reset(); setNotice("Opciones guardadas. Ya están disponibles en el registro de casos.");
    } catch (error) { setNotice(error.message); }
    finally { setSaving(false); }
  };
  const remove = async (casino) => {
    if (!window.confirm(`¿Eliminar “${casino.name}” de las opciones de Orbital Pay?`)) return;
    try {
      const next = casinos.filter((item) => String(item.id) !== String(casino.id));
      const response = await fetch("/api/pay/casinos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "No se pudo eliminar el casino.");
      setCasinos(next); if (casinoId === String(casino.id)) reset(); setNotice("Casino eliminado de las opciones.");
    } catch (error) { setNotice(error.message); }
  };
  const currenciesInUse = [...new Set([
    ...casinos.map((casino) => casino.currency),
    ...payCases.map((item) => item.currency),
  ].filter((code) => PAY_CURRENCY_CODES.includes(code)))].sort();
  const totalsByCurrency = currenciesInUse.map((currency) => ({ currency, total: payCases.filter((item) => item.currency === currency).reduce((sum, item) => sum + (Number(item.amount) || 0), 0) }));

  return <div className="app pay-app" style={getBrandStyles(content)}><Header content={{ ...content, headerSubtitle: "Opciones de casino y pago · Orbital Pay" }} />
    <main className="pay-dashboard pay-cases-page">
      <nav className="pay-nav"><a className="module-switch-link" href="/admin"><span className="navigation-link-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M19 12H5m0 0 6 6m-6-6 6-6" /></svg></span><span>Volver al selector de módulos</span></a><span>ADMINISTRACIÓN / OPCIONES DE PAY</span></nav>
      <div className="pay-heading"><div><span className="pay-kicker">CONFIGURACIÓN ADMINISTRATIVA</span><h1>Opciones de casino y pago</h1><p>Definí qué casinos y métodos aparecerán para los agentes en el registro de casos.</p></div><div className="pay-admin-pay-links"><a className="pay-case-admin-link" href="/admin/pay/comunicados">Comunicados →</a><a className="pay-case-admin-link" href="/admin/pay/reportes">Reportes internos de casinos →</a><a className="pay-case-admin-link" href="/admin/pay/registros">Registros de agentes →</a></div></div>
      <section className="pay-panel pay-admin-cases-summary" aria-label="Resumen de registros de Orbital Pay"><div><span className="pay-kicker">ACTIVIDAD DEL EQUIPO</span><h2>Registros de agentes</h2><p>Casos enviados por el equipo, con montos agrupados por moneda.</p></div><div className="pay-admin-cases-metrics"><article><small>CASOS REGISTRADOS</small><strong>{payCases.length}</strong></article>{totalsByCurrency.map(({ currency, total }) => <article key={currency}><small>TOTAL {currency}</small><strong>{formatMoney(total, currency)}</strong></article>)}</div><a className="pay-case-admin-link" href="/admin/pay/registros">Consultar detalle y filtros →</a></section>
      <section className="pay-panel pay-case-options-panel"><div className="pay-panel-title"><span>＋</span><div><small>{casinoId ? "MODIFICAR OPCIÓN" : "NUEVA OPCIÓN"}</small><h2>{casinoId ? "Editar casino y métodos" : "Agregar casino y métodos"}</h2></div></div>
        <form className="pay-case-config-form" onSubmit={save}><label>Nombre del casino<input value={name} onChange={(event) => setName(event.target.value)} maxLength="200" required placeholder="Ej. Casino Central" /></label><label>Contacto responsable<input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Nombre o correo" /></label><label>Moneda predeterminada<select value={currency} onChange={(event) => setCurrency(event.target.value)}>{PAY_CURRENCIES.map(({ code, name: label }) => <option key={code} value={code}>{code} · {label}</option>)}</select></label><label className="pay-options-methods">Métodos de pago <small>Escribí un método por línea o separado por comas.</small><textarea rows="5" value={methods} onChange={(event) => setMethods(event.target.value)} placeholder={"Transferencia bancaria\nTarjeta\nCripto"} /></label><label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Activo</option><option>En revisión</option><option>Inactivo</option></select></label><div className="pay-case-config-actions"><button type="submit" disabled={saving}>{saving ? "Guardando…" : casinoId ? "Guardar cambios" : "Agregar casino"}</button>{casinoId && <button className="pay-case-config-cancel" type="button" onClick={reset}>Cancelar</button>}</div></form>
        {notice && <p className="pay-notice" role="status">{notice}</p>}
      </section>
      <section className="pay-panel pay-case-options-panel"><div className="pay-panel-title"><span>▤</span><div><small>LISTA COMPARTIDA</small><h2>Casinos y métodos disponibles</h2></div></div>
        {loading ? <p>Cargando opciones…</p> : casinos.length ? <div className="pay-case-options-list">{casinos.map((casino) => <article key={casino.id}><div><strong>{casino.name}</strong><small>{casino.status} · {monedaPredeterminada(casino)} · {casino.contact || "Sin contacto"} · {(casino.paymentMethods || []).join(", ") || "Sin métodos de pago"}</small></div><button type="button" onClick={() => edit(casino)}>Modificar</button><button type="button" className="pay-case-option-delete" onClick={() => remove(casino)}>Eliminar</button></article>)}</div> : <p className="pay-case-empty">Todavía no configuraste casinos.</p>}
      </section>
    </main>
  </div>;
}
