/* La Valetta · Vecinos: correos, reporte mensual, semáforo y casa club (segundo archivo del proyecto).
   En el editor: «+ → Secuencia de comandos» → nómbralo Vecinos → pega este archivo. Luego, una sola vez:
   Ejecutar → instalarVecinos (crea las pestañas «Config (sitio)», «Correos», «Reservas casa club» y
   «Reportes» en la hoja de la Administración, y programa el envío del día 10 y el aviso de reservas).

   Qué hace
   - correo.html: un residente registra (o da de baja) su correo con su departamento y la clave del sitio
     (la misma de Finanzas: sin ella no se registra nadie de fuera).
   - Día 10: arma el reporte del mes anterior con cifras AGREGADAS. Con Config → reporte_envio = «sí» lo
     manda a los correos registrados (en copia oculta); siempre manda a la Administración el kit: el texto
     para WhatsApp y el semáforo de la hoja. No envía si el mes no tiene datos ni dos veces el mismo mes.
   - Semáforo (revisar): meses sin capturar, pestañas copiadas con montos, saldos que no encadenan, gastos
     sin comprobante, reservas sin confirmar. Es PRIVADO: solo llega a la Administración.
   - casa-club.html: calendario público (solo dice qué días están apartados, nunca quién). Pedir una fecha
     pide departamento y la clave del sitio; queda «Por confirmar» hasta que la Administración cambia la
     columna Estatus a Confirmada o Rechazada, y al residente le llega el aviso por correo.

   Para probar sin mandar nada a los vecinos: Ejecutar → reportePrueba (llega solo a ti) o revisar. */

const KEY_HASH_SITIO = "16740bf13991fe083fbe5820cc8da08a5d88e5a48f44a3cfcc283c27b2797ba7";   // el mismo de js/finanzas.js
const HOJA_CFG_V = "Config (sitio)", HOJA_CORREOS_V = "Correos", HOJA_RCC_V = "Reservas casa club", HOJA_REP_V = "Reportes";
const ENC_CORREOS_V = ["Registrado", "Departamento", "Correo", "Activo"];
const ENC_RCC_V = ["Folio", "Solicitada el", "Día", "Departamento", "Correo", "Estatus", "Nota de la Administración"];
const EST_RCC_V = ["Por confirmar", "Confirmada", "Rechazada", "Cancelada"];
const ZONA_V = "America/Mexico_City";
const REMITENTE_V = "La Valetta · Administración";

/* ------------------------------- rutas ------------------------------- */
function rutaVecinosGet_(p) {
  if (p.accion === "vecinos") return { ok: true, deptos: deptosV_(), correos: correosCuenta_() };
  if (p.accion === "casa") return casaPublica_();
  if (p.accion === "folio") return folioCasa_(p.folio);
  return null;
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (String(d.web || "").trim()) return texto_(JSON.stringify({ ok: true }));                 // campo trampa
    if (!limiteV_("post", 300)) return texto_(JSON.stringify({ ok: false, error: "espera" }));
    lock.waitLock(15000);
    const r = d.accion === "correo" ? registrarCorreoV_(d) : d.accion === "casa" ? reservarCasaV_(d) : d.accion === "cancelarCasa" ? cancelarCasaV_(d) : { ok: false, error: "accion" };
    return texto_(JSON.stringify(r));
  } catch (err) { return texto_(JSON.stringify({ ok: false, error: String(err.message || err) })); }
  finally { try { lock.releaseLock(); } catch (_) {} }
}

/* ------------------------------- utilidades ------------------------------- */
function cfgV_() {
  const h = hoja_().getSheetByName(HOJA_CFG_V), out = {};
  if (h && h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().forEach(f => { if (f[0]) out[String(f[0]).trim()] = f[1]; });
  return out;
}
function hojaV_(nombre, enc) {
  const ss = hoja_(); let h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight("bold").setBackground("#e3e3db"); h.setFrozenRows(1); }
  return h;
}
function filasV_(nombre, ancho) { const h = hoja_().getSheetByName(nombre); return h && h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, ancho).getValues() : []; }
function limpioV_(s, n) { return String(s == null ? "" : s).replace(/^[=+\-@\t\r]+/, "").replace(/\s+/g, " ").trim().slice(0, n); }
function correoOkV_(c) { return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i.test(String(c || "")); }
function diaV_(v) { return Object.prototype.toString.call(v) === "[object Date]" ? Utilities.formatDate(v, ZONA_V, "yyyy-MM-dd") : String(v || "").slice(0, 10); }
function limiteV_(k, max) { const c = CacheService.getScriptCache(), kk = "limv_" + k, n = Number(c.get(kk) || 0); if (n >= max) return false; c.put(kk, String(n + 1), 3600); return true; }
function sitioV_() { return String(cfgV_().sitio_url || "").replace(/\/+$/, ""); }
function admonV_() { const c = cfgV_(); return String(c.reporte_copia || "").split(/[,;\s]+/).filter(correoOkV_).concat([Session.getEffectiveUser().getEmail()]).filter((x, i, a) => x && a.indexOf(x) === i); }
function claveOkV_(clave) {
  if (!limiteV_("clave_" + String(clave || "").length, 60)) return false;
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(clave || "").trim(), Utilities.Charset.UTF_8);
  return b.map(x => ("0" + ((x + 256) % 256).toString(16)).slice(-2)).join("") === KEY_HASH_SITIO;
}
/* Departamentos: los renglones de COBROS de la pestaña más reciente que tenga datos. */
function deptosV_() {
  const c = CacheService.getScriptCache(), g = c.get("deptos_v"); if (g) return JSON.parse(g);
  const hs = hojasMes_(hoja_()).reverse();
  for (let i = 0; i < hs.length; i++) {
    const m = leerMes_(hs[i]); const ds = m.pagosPorUnidad.map(p => String(p[0]).trim()).filter(Boolean);
    if (ds.length) { c.put("deptos_v", JSON.stringify(ds), 3600); return ds; }
  }
  return [];
}
function correosCuenta_() {
  const act = filasV_(HOJA_CORREOS_V, 4).filter(f => correoOkV_(f[2]) && !/^no/i.test(String(f[3])));
  return { con: act.map(f => String(f[1])).filter((x, i, a) => a.indexOf(x) === i).length, total: deptosV_().length || 32 };
}

/* ------------------------------- correos ------------------------------- */
function registrarCorreoV_(d) {
  const correo = String(d.correo || "").trim().toLowerCase(), depto = limpioV_(d.depto, 20), baja = d.baja === true;
  if (!correoOkV_(correo)) return { ok: false, error: "correo" };
  const h = hojaV_(HOJA_CORREOS_V, ENC_CORREOS_V), fs = filasV_(HOJA_CORREOS_V, 4);
  const i = fs.findIndex(f => String(f[2]).trim().toLowerCase() === correo);
  if (baja) {
    if (i >= 0) h.getRange(i + 2, 4).setValue("no");
    MailApp.sendEmail(correo, "Ya no recibirás el reporte de La Valetta", "Listo: dejaste de recibir el reporte mensual de La Valetta.\n\nSi fue un error, vuelve a registrarte en el sitio.", { name: REMITENTE_V });
    return { ok: true, baja: true };
  }
  if (!claveOkV_(d.clave)) return { ok: false, error: "clave" };
  if (deptosV_().length && deptosV_().map(x => x.toLowerCase()).indexOf(depto.toLowerCase()) < 0) return { ok: false, error: "departamento" };
  if (i >= 0) h.getRange(i + 2, 1, 1, 4).setValues([[new Date(), depto, correo, "sí"]]);
  else h.getRange(h.getLastRow() + 1, 1, 1, 4).setValues([[new Date(), depto, correo, "sí"]]);
  MailApp.sendEmail(correo, "Ya recibirás el reporte de La Valetta", "Hola:\n\nCada mes, alrededor del día 10, te llegará el reporte de cuentas del condominio: saldo, ingresos, gastos y cobranza, siempre en cifras agregadas.\n\nSi no fuiste tú, date de baja en la página «Recibe el reporte» del sitio" + (sitioV_() ? ": " + sitioV_() + "/correo.html" : "") + ".", { name: REMITENTE_V });
  return { ok: true };
}

/* ------------------------------- casa club ------------------------------- */
const activaV_ = f => /por confirmar|confirmada/i.test(String(f[5] || "Por confirmar"));
function casaPublica_() {
  const hoy = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM-dd");
  return { ok: true, ocupados: filasV_(HOJA_RCC_V, ENC_RCC_V.length).filter(f => f[0] && activaV_(f) && diaV_(f[2]) >= hoy).map(f => ({ dia: diaV_(f[2]), estatus: /confirmada/i.test(String(f[5])) ? "ocupado" : "apartado" })),
    deptos: deptosV_(), garantia: Number(cfgV_().casa_club_garantia) || 3000, costo: Number(cfgV_().casa_club_costo) || 1000 };
}
function folioCasa_(folio) {
  const f = String(folio || "").trim().toUpperCase();
  if (!/^CC-\d{4}$/.test(f) || !limiteV_("folio", 200)) return { ok: false, error: "folio" };
  const x = filasV_(HOJA_RCC_V, ENC_RCC_V.length).find(r => String(r[0]).toUpperCase() === f);
  return x ? { ok: true, folio: f, dia: diaV_(x[2]), estatus: String(x[5] || "Por confirmar"), nota: String(x[6] || "") } : { ok: false, error: "no encontrado" };
}
function reservarCasaV_(d) {
  const depto = limpioV_(d.depto, 20), dia = String(d.dia || "").slice(0, 10), correo = String(d.correo || "").trim().toLowerCase();
  if (!claveOkV_(d.clave)) return { ok: false, error: "clave" };
  if (deptosV_().length && deptosV_().map(x => x.toLowerCase()).indexOf(depto.toLowerCase()) < 0) return { ok: false, error: "departamento" };
  if (!correoOkV_(correo)) return { ok: false, error: "correo" };
  const hoy = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM-dd"), tope = Utilities.formatDate(new Date(Date.now() + 90 * 864e5), ZONA_V, "yyyy-MM-dd");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia <= hoy) return { ok: false, error: "dia" };
  if (dia > tope) return { ok: false, error: "lejos" };
  const fs = filasV_(HOJA_RCC_V, ENC_RCC_V.length);
  if (fs.some(f => activaV_(f) && diaV_(f[2]) === dia)) return { ok: false, error: "ocupado" };
  if (fs.filter(f => activaV_(f) && String(f[3]).toLowerCase() === depto.toLowerCase() && diaV_(f[2]) >= hoy).length >= 2) return { ok: false, error: "tope" };
  const props = PropertiesService.getScriptProperties(), n = Number(props.getProperty("folio_casa") || 0) + 1; props.setProperty("folio_casa", String(n));
  const folio = "CC-" + ("000" + n).slice(-4), h = hojaV_(HOJA_RCC_V, ENC_RCC_V), fila = h.getLastRow() + 1;
  h.getRange(fila, 1, 1, ENC_RCC_V.length).setValues([[folio, new Date(), dia, depto, correo, "Por confirmar", ""]]);
  h.getRange(fila, 3).setNumberFormat("yyyy-mm-dd");
  try { h.getRange(fila, 6).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(EST_RCC_V, true).setAllowInvalid(true).build()); } catch (_) {}
  admonV_().forEach(a => MailApp.sendEmail(a, "Casa club por confirmar " + folio + " · " + dia, "Depto " + depto + " pide la casa club el " + dia + ".\n\nConfírmala o recházala en la pestaña «" + HOJA_RCC_V + "» de la hoja (columna Estatus). Al residente le llega el aviso solo.", { name: REMITENTE_V }));
  MailApp.sendEmail(correo, "Recibimos tu solicitud de casa club " + folio, "Día: " + dia + " (10:00 a 23:59 h)\nEstatus: por confirmar.\n\nLa Administración te confirmará por correo. Garantía: $3,000; se devuelven $2,000 si todo está en orden.\nConsulta tu folio en la página «Casa club» del sitio.", { name: REMITENTE_V });
  return { ok: true, folio: folio };
}
function cancelarCasaV_(d) {
  const folio = String(d.folio || "").trim().toUpperCase(), correo = String(d.correo || "").trim().toLowerCase();
  const h = hoja_().getSheetByName(HOJA_RCC_V), fs = filasV_(HOJA_RCC_V, ENC_RCC_V.length), i = fs.findIndex(f => String(f[0]).toUpperCase() === folio && String(f[4]).toLowerCase() === correo);
  if (!h || i < 0) return { ok: false, error: "no encontrado" };
  h.getRange(i + 2, 6).setValue("Cancelada");
  admonV_().forEach(a => MailApp.sendEmail(a, "Casa club cancelada " + folio, "Depto " + fs[i][3] + " canceló la casa club del " + diaV_(fs[i][2]) + ". La fecha quedó libre.", { name: REMITENTE_V }));
  return { ok: true };
}
/* Cada 30 minutos: si la Administración cambió el Estatus, avisa al residente (una sola vez por estatus). */
function avisosCasa() {
  const props = PropertiesService.getScriptProperties();
  filasV_(HOJA_RCC_V, ENC_RCC_V.length).forEach(f => {
    const folio = String(f[0]), est = String(f[5] || ""), k = "aviso_" + folio;
    if (!folio || !/confirmada|rechazada/i.test(est) || props.getProperty(k) === est || !correoOkV_(f[4])) return;
    MailApp.sendEmail(String(f[4]), "Casa club " + folio + ": " + est.toLowerCase(), "Tu solicitud de la casa club para el " + diaV_(f[2]) + " quedó " + est.toLowerCase() + "." + (f[6] ? "\n\nNota de la Administración: " + f[6] : "") + (/confirmada/i.test(est) ? "\n\nRecuerda: garantía de $3,000 al apartar, checklist de entrada y salida y se devuelven $2,000 cinco días después si todo está en orden." : ""), { name: REMITENTE_V });
    props.setProperty(k, est);
  });
}

/* ------------------------------- semáforo ------------------------------- */
function salud_() {
  const ss = hoja_(), puntos = [], hoyId = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM"), dia = Number(Utilities.formatDate(new Date(), ZONA_V, "d"));
  const hs = hojasMes_(ss).filter(h => !h.hoja.isSheetHidden()), meses = hs.map(h => Object.assign(leerMes_(h), { _hoja: h.hoja.getName() }));
  const mal = t => puntos.push({ nivel: "rojo", texto: t }), ojo = t => puntos.push({ nivel: "amarillo", texto: t });
  const ant = (() => { const [y, m] = hoyId.split("-").map(Number); return m === 1 ? (y - 1) + "-12" : y + "-" + ("0" + (m - 1)).slice(-2); })();
  const mAnt = meses.find(m => m.id === ant);
  if (!mAnt) mal("No hay pestaña del mes anterior (" + ant + ").");
  else if (!mAnt.capturado && dia >= 5) mal("El mes anterior (" + mAnt._hoja + ") no tiene cobros ni gastos capturados.");
  const firma = m => JSON.stringify([m.pagosPorUnidad, m.detalle]);
  meses.forEach((m, i) => {
    if (i && m.capturado && meses[i - 1].capturado && firma(m) === firma(meses[i - 1])) mal("«" + m._hoja + "» tiene exactamente los mismos cobros y gastos que «" + meses[i - 1]._hoja + "»: parece copiada sin limpiar.");
    if (i && meses[i - 1].capturado && Math.abs(m.saldoIni - meses[i - 1].saldoFin) > 1 && m.id <= hoyId) ojo("El saldo inicial de «" + m._hoja + "» ($" + Math.round(m.saldoIni).toLocaleString("es-MX") + ") no es el saldo final de «" + meses[i - 1]._hoja + "» ($" + Math.round(meses[i - 1].saldoFin).toLocaleString("es-MX") + ").");
    if (m.id > hoyId && m.capturado) ojo("«" + m._hoja + "» es un mes futuro con pagos: cuentan como adelanto, está bien si fue a propósito.");
  });
  if (mAnt && mAnt.capturado) {
    const sin = mAnt.detalle.fijos.concat(mAnt.detalle.variables).filter(x => !x[2]);
    if (sin.length) ojo(sin.length + " gasto(s) de " + mAnt._hoja + " sin liga de comprobante: " + sin.slice(0, 4).map(x => x[0]).join(", ") + (sin.length > 4 ? "…" : "") + ".");
    if (mAnt.cobranza.pct < 70) ojo("Cobranza de " + mAnt._hoja + ": " + mAnt.cobranza.pagaron + " de " + mAnt.unidades + " departamentos pagaron.");
  }
  const hoy = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM-dd"), viejas = filasV_(HOJA_RCC_V, ENC_RCC_V.length).filter(f => f[0] && /por confirmar|^$/i.test(String(f[5] || "")) && diaV_(f[2]) >= hoy && (Date.now() - new Date(f[1]).getTime()) > 2 * 864e5);
  if (viejas.length) ojo(viejas.length + " reserva(s) de casa club llevan más de 2 días por confirmar: " + viejas.map(f => f[0] + " (" + diaV_(f[2]) + ")").join(", ") + ".");
  const cc = correosCuenta_(); puntos.push({ nivel: "info", texto: "Correos registrados: " + cc.con + " de " + cc.total + " departamentos." });
  return { ok: !puntos.some(p => p.nivel === "rojo"), puntos: puntos };
}
function revisar() {
  const s = salud_(); Logger.log(s.puntos.map(p => (p.nivel === "rojo" ? "🔴 " : p.nivel === "amarillo" ? "🟡 " : "ℹ️ ") + p.texto).join("\n"));
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "Semáforo de la hoja · La Valetta", textoSalud_(s), { name: REMITENTE_V });
  return s;
}
function textoSalud_(s) { const p = s.puntos.filter(x => x.nivel !== "info"); return (p.length ? p.map(x => (x.nivel === "rojo" ? "🔴 " : "🟡 ") + x.texto).join("\n") : "🟢 Todo cuadra.") + "\n" + s.puntos.filter(x => x.nivel === "info").map(x => "ℹ️ " + x.texto).join("\n"); }

/* ------------------------------- reporte mensual ------------------------------- */
const $V = v => (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("es-MX");
function datosReporte_(id) {
  const d = armarFinanzas_(), m = d.meses.find(x => x.id === id);
  if (!m || !m.detalle) return null;
  const ing = m.ingresos.manto + m.ingresos.agua + m.ingresos.casaClub, egr = m.egresos.fijos + m.egresos.variables;
  const gastos = m.detalle.fijos.concat(m.detalle.variables).sort((a, b) => b[1] - a[1]);
  return { m: m, ing: ing, egr: egr, gastos: gastos, mes: m.nombre + " " + m.anio, proyectos: d.proyectos || [] };
}
function textoWaV_(k) {
  const m = k.m, l = ["🏢 *La Valetta · cuentas de " + k.mes + "*", "", "💰 Saldo al cierre: *" + $V(m.saldoFin) + "*", "⬆️ Entró: " + $V(k.ing) + "  ·  ⬇️ Salió: " + $V(k.egr),
    "✅ Pagaron su cuota: " + m.cobranza.pagaron + " de " + m.unidades];
  if (m.mora && m.mora.acumulada > 0.5) l.push("⏳ Cuotas atrasadas: " + $V(m.mora.acumulada) + " (" + m.mora.unidades + " deptos)");
  if (k.gastos.length) l.push("", "En qué se fue:", ...k.gastos.slice(0, 4).map(g => "• " + g[0] + ": " + $V(g[1])));
  l.push("", "Detalle y comprobantes en el sitio (Finanzas, con la clave de residentes)" + (sitioV_() ? ": " + sitioV_() + "/finanzas.html" : "."), "_Cifras agregadas: no se identifica a nadie._");
  return l.join("\n");
}
function htmlReporteV_(k) {
  const m = k.m, fila = (a, b, c) => '<tr><td style="padding:8px 0;border-bottom:1px solid #e1e0d9">' + a + '</td><td style="padding:8px 0;border-bottom:1px solid #e1e0d9;text-align:right;font-weight:700;color:' + (c || "#0b0b0b") + '">' + b + "</td></tr>";
  return '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0b0b0b">' +
    '<p style="margin:0;color:#6f766a;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Condominio La Valetta</p>' +
    '<h1 style="font-size:24px;margin:4px 0 2px">Cuentas de ' + k.mes + '</h1><p style="margin:0 0 16px;color:#52514e">Cierre del mes · cifras agregadas</p>' +
    '<div style="background:#f3f3ee;border-radius:14px;padding:16px 18px;margin-bottom:14px"><div style="font-size:13px;color:#52514e">Saldo al cierre</div><div style="font-size:32px;font-weight:800">' + $V(m.saldoFin) + "</div></div>" +
    '<table style="width:100%;border-collapse:collapse;font-size:15px">' + fila("Entró (cuotas, agua y casa club)", $V(k.ing), "#006300") + fila("Salió (gastos fijos y variables)", $V(k.egr), "#b3261e") +
    fila("Pagaron su cuota", m.cobranza.pagaron + " de " + m.unidades) + (m.mora && m.mora.acumulada > 0.5 ? fila("Cuotas atrasadas", $V(m.mora.acumulada) + " · " + m.mora.unidades + " deptos", "#b3261e") : "") + "</table>" +
    (k.gastos.length ? '<h2 style="font-size:16px;margin:18px 0 6px">En qué se fue</h2><table style="width:100%;border-collapse:collapse;font-size:14px">' + k.gastos.slice(0, 8).map(g => fila(g[0], $V(g[1]))).join("") + "</table>" : "") +
    (sitioV_() ? '<p style="margin:20px 0"><a href="' + sitioV_() + '/finanzas.html" style="display:inline-block;background:#6f766a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">Ver detalle y comprobantes</a></p>' : "") +
    '<p style="font-size:12px;color:#898781;margin-top:18px">Las cifras se publican siempre agregadas, sin identificar a nadie. Para dejar de recibir este correo, date de baja en la página «Recibe el reporte» del sitio.</p></div>';
}
function mesAnteriorV_() { const [y, m] = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM").split("-").map(Number); return m === 1 ? (y - 1) + "-12" : y + "-" + ("0" + (m - 1)).slice(-2); }
function bitacoraV_(mes, a, nota) { const h = hojaV_(HOJA_REP_V, ["Fecha", "Mes", "Enviado a", "Nota"]); h.getRange(h.getLastRow() + 1, 1, 1, 4).setValues([[new Date(), mes, a, nota]]); }

function envioMensual() {
  const id = mesAnteriorV_(), props = PropertiesService.getScriptProperties(), k = datosReporte_(id), s = salud_();
  const kit = (k ? "📲 Texto para el grupo de WhatsApp (cópialo tal cual):\n\n" + textoWaV_(k) + "\n\n" : "⚠️ El mes " + id + " no tiene datos: no se envió el reporte. Captúralo y corre envioAhora desde el editor.\n\n") + "🚦 Semáforo de la hoja (privado):\n" + textoSalud_(s);
  admonV_().forEach(a => MailApp.sendEmail(a, "Kit del mes · La Valetta · " + (k ? k.mes : id), kit, { name: REMITENTE_V }));
  if (!k) { bitacoraV_(id, "", "Sin datos: no se envió"); return; }
  if (props.getProperty("enviado_" + id)) { bitacoraV_(id, "", "Ya se había enviado"); return; }
  if (!/^s[ií]/i.test(String(cfgV_().reporte_envio || ""))) { bitacoraV_(id, "", "Envío a residentes en pausa (Config → reporte_envio)"); return; }
  const dest = filasV_(HOJA_CORREOS_V, 4).filter(f => correoOkV_(f[2]) && !/^no/i.test(String(f[3]))).map(f => String(f[2]).trim().toLowerCase()).filter((x, i, a) => a.indexOf(x) === i);
  for (let i = 0; i < dest.length; i += 40) MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "Cuentas de " + k.mes + " · La Valetta", textoWaV_(k), { name: REMITENTE_V, bcc: dest.slice(i, i + 40).join(","), htmlBody: htmlReporteV_(k) });
  props.setProperty("enviado_" + id, new Date().toISOString());
  bitacoraV_(id, dest.length + " correos", "Enviado");
}
function envioAhora() { PropertiesService.getScriptProperties().deleteProperty("enviado_" + mesAnteriorV_()); envioMensual(); }
function reportePrueba() {
  const k = datosReporte_(mesAnteriorV_()); const yo = Session.getEffectiveUser().getEmail();
  if (!k) { MailApp.sendEmail(yo, "Prueba del reporte · La Valetta", "El mes " + mesAnteriorV_() + " todavía no tiene datos.", { name: REMITENTE_V }); return; }
  MailApp.sendEmail(yo, "[Prueba] Cuentas de " + k.mes + " · La Valetta", textoWaV_(k), { name: REMITENTE_V, htmlBody: htmlReporteV_(k) });
}

/* ------------------------------- instalación ------------------------------- */
function instalarVecinos() {
  const h = hojaV_(HOJA_CFG_V, ["Clave", "Valor", "Para qué"]);
  const tiene = k => filasV_(HOJA_CFG_V, 1).some(f => String(f[0]).trim() === k);
  [["reporte_envio", "no", "«sí» manda el reporte del día 10 a los correos registrados. En «no» solo llega el kit a la Administración."],
   ["reporte_copia", "lavaletta@gmail.com", "Quién recibe el kit del mes, el semáforo y los avisos de casa club (separa con comas)."],
   ["sitio_url", "", "Dirección del sitio (sin / al final), para las ligas de los correos."],
   ["casa_club_garantia", 3000, "Garantía al apartar la casa club."], ["casa_club_costo", 1000, "Lo que se queda: limpieza y fondo de la casa club."]]
    .forEach(r => { if (!tiene(r[0])) h.getRange(h.getLastRow() + 1, 1, 1, 3).setValues([r]); });
  hojaV_(HOJA_CORREOS_V, ENC_CORREOS_V); hojaV_(HOJA_RCC_V, ENC_RCC_V); hojaV_(HOJA_REP_V, ["Fecha", "Mes", "Enviado a", "Nota"]);
  ScriptApp.getProjectTriggers().filter(t => ["envioMensual", "avisosCasa"].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("envioMensual").timeBased().onMonthDay(10).atHour(9).inTimezone(ZONA_V).create();
  ScriptApp.newTrigger("avisosCasa").timeBased().everyMinutes(30).create();
  aviso_("Listo: pestañas Config (sitio), Correos, Reservas casa club y Reportes; envío del día 10 a las 9 h y avisos de casa club cada 30 min.");
}
