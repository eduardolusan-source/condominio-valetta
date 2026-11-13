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
const ENC_RCC_V = ["Folio", "Solicitada el", "Día", "Departamento", "Correo", "Estatus", "Nota de la Administración", "Quién la pide"];
const EST_RCC_V = ["Por confirmar", "Confirmada", "Rechazada", "Cancelada"];
const ZONA_V = "America/Mexico_City";
const REMITENTE_V = "La Valetta · Administración";

/* ------------------------------- rutas ------------------------------- */
function rutaVecinosGet_(p) {
  if (p.accion === "vecinos") return { ok: true, deptos: deptosV_(), correos: correosCuenta_() };
  if (p.accion === "anonimo") return anonimoV_();
  if (p.accion === "casa") return casaPublica_();
  if (p.accion === "folio") return folioCasa_(p.folio);
  if (p.accion === "resolverCasa") return resolverCasaV_(p);
  return null;
}
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (String(d.web || "").trim()) return texto_(JSON.stringify({ ok: true }));                 // campo trampa
    if (!limiteV_("post", 300)) return texto_(JSON.stringify({ ok: false, error: "espera" }));
    lock.waitLock(15000);
    const r = d.accion === "correo" ? registrarCorreoV_(d) : d.accion === "casa" ? reservarCasaV_(d) : d.accion === "cancelarCasa" ? cancelarCasaV_(d)
      : d.accion === "pin" ? crearPinV_(d) : d.accion === "cuenta" ? miCuentaV_(d) : { ok: false, error: "accion" };
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
/* A quién le llega lo de la Administración (kit, semáforo, casa club, PIN nuevos): Config → reporte_copia.
   Solo si está vacío, a la cuenta dueña del script. */
/* Avisos de la Administración: siempre a lavalettaa@gmail.com más quien esté en Config → reporte_copia;
   al dueño del script nunca le llegan. */
function admonV_() {
  const yo = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  return ["lavalettaa@gmail.com"].concat(String(cfgV_().reporte_copia || "").split(/[,;\s]+/)).map(x => String(x).trim().toLowerCase())
    .filter(correoOkV_).filter((x, i, a) => a.indexOf(x) === i).filter(x => x === "lavalettaa@gmail.com" || x !== yo);
}
function secretoV_() { const p = PropertiesService.getScriptProperties(); let k = p.getProperty("secreto"); if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); p.setProperty("secreto", k); } return k; }
function hexV_(b) { return b.map(x => ("0" + ((x + 256) % 256).toString(16)).slice(-2)).join(""); }
function firmaV_(texto) { return hexV_(Utilities.computeHmacSha256Signature(texto, secretoV_())).slice(0, 32); }
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
  const c = CacheService.getScriptCache(), g = c.get("casa_pub"); if (g) return JSON.parse(g);
  const r = casaPublicaFresca_(); try { c.put("casa_pub", JSON.stringify(r), 60); } catch (_) {} return r;
}
function olvidarCasa_() { try { CacheService.getScriptCache().remove("casa_pub"); } catch (_) {} }
function casaPublicaFresca_() {
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
  /* Sin clave: puede pedirla el propietario o el inquilino; la Administración confirma cada una. */
  const depto = limpioV_(d.depto, 20), dia = String(d.dia || "").slice(0, 10), correo = String(d.correo || "").trim().toLowerCase(), nombre = limpioV_(d.nombre, 80);
  if (!limiteV_("casa_" + depto.toLowerCase(), 6)) return { ok: false, error: "espera" };
  if (nombre.length < 3) return { ok: false, error: "nombre" };
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
  if (!String(h.getRange(1, 8).getValue() || "").trim()) h.getRange(1, 8).setValue(ENC_RCC_V[7]).setFontWeight("bold");
  h.getRange(fila, 1, 1, ENC_RCC_V.length).setValues([[folio, new Date(), dia, depto, correo, "Por confirmar", "", nombre]]);
  h.getRange(fila, 3).setNumberFormat("yyyy-mm-dd"); olvidarCasa_();
  try { h.getRange(fila, 6).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(EST_RCC_V, true).setAllowInvalid(true).build()); } catch (_) {}
  const liga = e => (sitioV_() ? sitioV_() + "/casa-admin.html" : ScriptApp.getService().getUrl()) + "?accion=resolverCasa&folio=" + folio + "&e=" + e + "&t=" + firmaV_(folio + "|" + e);
  const boton = (e, txt, color) => '<a href="' + liga(e) + '" style="display:inline-block;margin:6px 8px 6px 0;padding:14px 22px;border-radius:999px;background:' + color + ';color:#fff;text-decoration:none;font-weight:700;font-size:16px">' + txt + "</a>";
  const fechaL = Utilities.formatDate(new Date(dia + "T12:00:00"), ZONA_V, "dd/MM/yyyy"), otras = fs.filter(f => activaV_(f) && diaV_(f[2]) >= hoy).length;
  admonV_().forEach(a => MailApp.sendEmail(a, "🏠 Casa club: depto " + depto + " pide el " + fechaL + " (" + folio + ")",
    nombre + " (depto " + depto + ") pide la casa club el " + dia + ". Confirmar: " + liga("Confirmada") + "  ·  Rechazar: " + liga("Rechazada"),
    { name: REMITENTE_V, htmlBody: '<div style="font-family:system-ui,sans-serif;max-width:520px"><p style="font-size:13px;color:#6f766a;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0">Casa club · ' + folio + '</p><h2 style="margin:6px 0 4px">Depto ' + depto + " pide el " + fechaL + '</h2><p style="color:#52514e;margin:0 0 14px"><b>' + nombre + "</b> · " + correo + "<br>10:00 a 23:59 h · garantía $3,000</p>" +
      boton("Confirmada", "✅ Confirmar", "#2e7d32") + boton("Rechazada", "❌ Rechazar", "#b3261e") + '<p style="color:#898781;font-size:13px;margin-top:16px">Un toque basta: se anota en la hoja y al residente le llega el aviso. ' + (otras ? "Hay " + otras + " fecha(s) más apartadas en la pestaña «" + HOJA_RCC_V + "»." : "") + "</p></div>" }));
  MailApp.sendEmail(correo, "Recibimos tu solicitud de casa club " + folio, "Día: " + dia + " (10:00 a 23:59 h)\nEstatus: por confirmar.\n\nLa Administración te confirmará por correo. Garantía: $3,000; se devuelven $2,000 si todo está en orden.\nConsulta tu folio en la página «Casa club» del sitio.", { name: REMITENTE_V });
  return { ok: true, folio: folio };
}
function cancelarCasaV_(d) {
  const folio = String(d.folio || "").trim().toUpperCase(), correo = String(d.correo || "").trim().toLowerCase();
  const h = hoja_().getSheetByName(HOJA_RCC_V), fs = filasV_(HOJA_RCC_V, ENC_RCC_V.length), i = fs.findIndex(f => String(f[0]).toUpperCase() === folio && String(f[4]).toLowerCase() === correo);
  if (!h || i < 0) return { ok: false, error: "no encontrado" };
  h.getRange(i + 2, 6).setValue("Cancelada"); olvidarCasa_();
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
  admonV_().forEach(a => MailApp.sendEmail(a, "Semáforo de la hoja · La Valetta", textoSalud_(s), { name: REMITENTE_V }));
  return s;
}
function textoSalud_(s) { const p = s.puntos.filter(x => x.nivel !== "info"); return (p.length ? p.map(x => (x.nivel === "rojo" ? "🔴 " : "🟡 ") + x.texto).join("\n") : "🟢 Todo cuadra.") + "\n" + s.puntos.filter(x => x.nivel === "info").map(x => "ℹ️ " + x.texto).join("\n"); }

/* ------------------------------- reporte mensual ------------------------------- */
/* El correo del día 10 es una carta corta y visual que se lee en un minuto: el edificio de noche con una ventana
   encendida por cada depto que pagó su cuota (se barajan con el mes: no son deptos reales), cómo se movió la caja,
   en qué se fue la cuota, un dato del mes y las ligas a Mi cuenta y Finanzas. Solo tablas y colores, sin
   imágenes: se ve igual en Gmail, Outlook y el celular. Las cifras son siempre agregadas. */
const $V = v => (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("es-MX");
const MARCA_V = { nombre: "La Valetta", acento: "#6f766a", oscuro: "#545a4f", suave: "#e3e3db", notaCuota: "" };
/* Rubro · cómo se reconoce en proveedor y concepto · color · ícono. El orden importa: gana el primero que coincide. */
const RUBROS_V = [
  ["Teléfono, internet y app", /telmex|telcel|condovive|plataforma|internet/i, "#7a8a99", "📶"],
  ["Luz de áreas comunes", /\bluz\b|cfe/i, "#e0a400", "💡"],
  ["Elevador", /elevador|schindler/i, "#8a6bbf", "↕️"],
  ["Alberca", /alberca/i, "#2f9fd0", "🏊"],
  ["Jardinería", /jard|poda|maleza/i, "#5c9e5a", "🌿"],
  ["Limpieza", /limpi/i, "#3f8f7a", "🧹"],
  ["Vigilancia", /vigilan|seguridad|guardia/i, "#5b6b8c", "🛡️"],
  ["Administración", /administra|edificare/i, "#1d3f63", "🗂️"],
  ["Mantenimiento y reparaciones", /manten|mtto|manto|repar|port[oó]n|ferreter|pintura|flotador|cerca|sensor|bomba|plomer|herrer/i, "#c4744f", "🔧"]
];
const OTROS_V = ["Otros gastos", "#a9a397", "🧾"], CAJA_V = ["Quedó para la caja", "#d9c08a", "🐷"];
const RCV = { tinta: "#0b0b0b", gris: "#52514e", suave: "#898781", linea: "#e1e0d9", fina: "#efeee8", papel: "#f9f9f7",
  noche: "#1b2238", suelo: "#24304a", muro: "#2c3a5c", cornisa: "#3b4a6b", luz: "#ffcb45", luz2: "#e0a400", apagada: "#3b4a6b", apagada2: "#323f5c",
  oro: "#c08a3e", crema: "#fbf3e2", verde: "#2f7d32", verdeClaro: "#e3f2e6", rojo: "#b3261e", rojoClaro: "#fde7e6", coral: "#e8735a",
  agua: "#2f7fb5", aguaClaro: "#e6f3fb", cielo: "#a9c3dd", hielo: "#d6e2ee" };
const RFV = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", RGV = "Georgia,'Times New Roman',serif";
const MESES_V = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* La Valetta: detalle = [concepto, monto, liga]. La casa club entra como ingreso. */
function datosReporte_(id) {
  const d = armarFinanzas_(), m = d.meses.find(x => x.id === id);
  if (!m || !m.detalle) return null;
  const g = x => ({ texto: conceptoV_(x[0]), monto: Number(x[1]) || 0 });
  const comunes = m.detalle.fijos.concat(m.detalle.variables).map(g);
  return armarReporteV_(d, m, {
    ing: [["cuotas", m.ingresos.manto], ["agua", m.ingresos.agua || 0], ["casa club", m.ingresos.casaClub || 0]],
    egr: [["gastos fijos", m.egresos.fijos], ["variables", m.egresos.variables]],
    comunes: comunes, todos: comunes, agua: null
  });
}
/* Un concepto que en la hoja quedó como fecha («Fri Oct 23 2026…») se muestra como «Gasto sin concepto». */
function conceptoV_(s) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return /^(mon|tue|wed|thu|fri|sat|sun) \w{3} \d{1,2} \d{4}/i.test(s) || !s ? "Gasto sin concepto" : s; }
/* Las cifras del mes, ya agregadas, en un solo objeto para el correo y el texto de WhatsApp. */
function armarReporteV_(d, m, x) {
  const U = m.unidades || d.unidades || 1, suma = l => l.reduce((s, p) => s + (Number(p[1]) || 0), 0), ing = suma(x.ing), egr = suma(x.egr);
  const tot = {}; let otros = 0;
  x.comunes.forEach(g => { const r = RUBROS_V.find(r => r[1].test(g.texto)); if (r) tot[r[0]] = (tot[r[0]] || 0) + g.monto; else otros += g.monto; });
  let rubros = RUBROS_V.filter(r => tot[r[0]] > 0.5).map(r => [r[0], tot[r[0]] / U, r[2], r[3], tot[r[0]]]).sort((a, b) => b[4] - a[4]);
  if (rubros.length > 6) { rubros.slice(5).forEach(r => { otros += r[4]; }); rubros = rubros.slice(0, 5); }
  if (otros > 0.5) rubros.push([OTROS_V[0], otros / U, OTROS_V[1], OTROS_V[2], otros]);
  const delAnio = d.meses.filter(y => y.anio === m.anio && y.id <= m.id);
  const resAnio = delAnio.reduce((s, y) => s + (y.saldoFin - y.saldoIni), 0);
  let correos = null; try { correos = correosCuenta_(); } catch (e) { /* sin hoja de correos */ }
  return {
    m: m, ing: ing, egr: egr, gastos: x.todos.map(g => [g.texto, g.monto]).sort((a, b) => b[1] - a[1]), mes: m.nombre + " " + m.anio, proyectos: d.proyectos || [],
    id: m.id, mesMin: String(m.nombre).toLowerCase(), anio: m.anio, mesNum: parseInt(m.id.slice(5), 10), unidades: U, cuota: m.cuota || d.cuota || 0,
    saldoIni: m.saldoIni, saldoFin: m.saldoFin, res: ing - egr, partesIng: x.ing, partesEgr: x.egr,
    pagaron: m.cobranza ? m.cobranza.pagaron : 0, mora: m.mora || null, rubros: rubros, costoUnidad: rubros.reduce((s, r) => s + r[1], 0),
    agua: x.agua || null, correos: correos, resAnio: resAnio, mesesAnio: delAnio.length, base: sitioV_()
  };
}
function escV_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function mayV_(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function mesNomV_(id) { return MESES_V[parseInt(String(id).slice(5), 10) - 1] || String(id); }
function urlV_(k, p) { return k.base ? k.base + "/" + p : ""; }
function listaV_(p) { return p.length > 1 ? p.slice(0, -1).join(", ") + " y " + p[p.length - 1] : p.join(""); }
function partesV_(l) { return l.filter(p => p[1] > 0.5).map(p => p[0] + " " + $V(p[1])).join(" · "); }
/* La historia del mes en una línea: lo primero que se lee. Si la caja está en números rojos, se dice. */
function historiaV_(k) {
  const U = k.unidades, verde = k.pagaron >= U, rojo = k.saldoFin < -0.5, fin = $V(k.saldoFin);
  const titulo = verde ? "¡Mes verde! Pagaron los " + U + " deptos" : k.res >= 0 ? (rojo ? "La caja se recuperó " : "La caja creció ") + $V(k.res) : "La caja bajó " + $V(-k.res);
  const bajada = rojo ? (verde ? "Aun así, la caja sigue en números rojos: cerró " : "Sigue en números rojos: cerró ") + k.mesMin + " en " + fin + "."
    : (verde ? "Y la caja cerró " : "Cerró ") + k.mesMin + " con " + fin + (verde ? "." : " en la caja.");
  return {
    titulo: titulo, bajada: bajada,
    bajadaHtml: escV_(bajada).replace(escV_(fin), '<b style="white-space:nowrap;color:' + (rojo ? "#ffb4a8" : RCV.luz) + '">' + escV_(fin) + "</b>"),
    corto: verde ? "¡mes verde!" : k.res >= 0 ? (rojo ? "la caja se recupera" : "la caja creció " + $V(k.res)) : "la caja bajó " + $V(-k.res),
    ventanas: verde ? "Las " + U + " ventanas encendidas: todos pagaron su cuota de " + k.mesMin + "."
      : k.pagaron + " de " + U + " ventanas encendidas: cada luz es un depto que ya pagó su cuota de " + k.mesMin + "."
  };
}
function asuntoV_(k) { return "Las cuentas de " + k.mesMin + " · " + historiaV_(k).corto + " · " + MARCA_V.nombre; }
function moraTxtV_(k) { return !k.mora ? "" : k.mora.acumulada > 0.5 ? "Cuotas atrasadas: " + $V(k.mora.acumulada) + " de " + k.mora.unidades + (k.mora.unidades === 1 ? " depto" : " deptos") : "Nadie tiene cuotas atrasadas"; }
/* Una ventana por depto; las encendidas son los que pagaron, barajadas con el mes como semilla. */
function ventanasV_(k) {
  const n = k.unidades, on = Math.max(0, Math.min(n, k.pagaron)), v = [];
  for (let i = 0; i < n; i++) v.push(i < on);
  let s = semillaV_(k.id);
  for (let i = n - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1), t = v[i]; v[i] = v[j]; v[j] = t; }
  return v;
}
function semillaV_(t) { let s = 7; String(t).split("").forEach(c => { s = (s * 31 + c.charCodeAt(0)) % 2147483647; }); return s || 7; }
/* La cuota partida en rubros (por depto) más lo que quedó para la caja, con su porcentaje de la barra. */
function segmentosV_(k) {
  const seg = k.rubros.map(r => [r[0], r[1], r[2], r[3]]), sobra = k.cuota - k.costoUnidad;
  if (k.cuota > 0 && sobra > 0.5) seg.push([CAJA_V[0], sobra, CAJA_V[1], CAJA_V[2]]);
  const base = seg.reduce((a, s) => a + s[1], 0) || 1;
  let acum = 0;
  seg.forEach((s, i) => { s[4] = i === seg.length - 1 ? Math.max(0, 100 - acum) : Math.max(1, Math.round(s[1] / base * 100)); acum += s[4]; });
  return { seg: seg, sobra: sobra };
}
/* Un dato distinto cada mes. Mientras menos de la mitad reciba el correo, invita a registrarse. */
function datoMesV_(k) {
  const reg = urlV_(k, "correo.html");
  if (k.correos && k.correos.total && k.correos.con < k.correos.total / 2 && reg)
    return { texto: "Solo " + k.correos.con + " de " + k.correos.total + " deptos reciben este reporte por correo. Si tu vecino no lo recibe, pásale esta liga para registrarse (con la clave de residentes): " + reg,
      html: "Solo <b>" + k.correos.con + " de " + k.correos.total + "</b> deptos reciben este reporte por correo. Si tu vecino no lo recibe, pásale " +
        '<a href="' + reg + '" style="color:#8a5a12;font-weight:bold">esta liga para registrarse</a> (con la clave de residentes).' };
  const op = [], r = k.rubros.filter(x => x[0] !== OTROS_V[0])[0];
  if (r) op.push(r[0] + " costó " + $V(r[4]) + " en " + k.mesMin + ": " + $V(r[1]) + " por depto, unos " + $V(r[1] / 30) + " al día.");
  if (k.cuota) op.push("Tu cuota de " + $V(k.cuota) + " al mes son unos " + $V(k.cuota / 30) + " al día, y con eso se sostiene todo el edificio.");
  if (k.agua && k.agua.pipas) op.push("En " + k.mesMin + " llegaron " + k.agua.pipas + " pipas de agua: " + (k.agua.pipas >= 30 ? "más de una al día." : "una cada " + Math.max(1, Math.round(30 / k.agua.pipas)) + " días."));
  if (k.mesesAnio >= 2) op.push("En lo que va de " + k.anio + ", la caja " + (k.resAnio >= 0 ? "suma " + $V(k.resAnio) + " a favor." : "lleva " + $V(-k.resAnio) + " en contra."));
  const t = op[(k.mesNum + k.anio) % op.length];
  return t ? { texto: t, html: escV_(t) } : null;
}

function textoWaV_(k) {
  const h = historiaV_(k), dato = datoMesV_(k);
  const l = ["🏢 *" + MARCA_V.nombre + " · cuentas de " + k.mesMin + " " + k.anio + "*", "", (k.pagaron >= k.unidades ? "🎉 " : "") + "*" + h.titulo + "*", ""];
  l.push("💰 En la caja: *" + $V(k.saldoFin) + "*" + (k.saldoFin < -0.5 ? " (números rojos)" : ""));
  l.push("📥 Entró " + $V(k.ing) + " · 📤 Salió " + $V(k.egr));
  l.push(k.res >= 0 ? "✅ Sobraron " + $V(k.res) : "↘️ Faltaron " + $V(-k.res));
  l.push("💡 " + k.pagaron + " de " + k.unidades + " deptos pagaron su cuota");
  if (k.mora && k.mora.acumulada > 0.5) l.push("⏳ " + moraTxtV_(k));
  if (k.agua && k.agua.pagado > 0.5) l.push("💧 Pipas de agua: " + $V(k.agua.pagado) + (k.agua.pipas ? " (" + k.agua.pipas + " pipas)" : "") + " · derrama cobrada " + $V(k.agua.cobrado));
  if (dato) l.push("", "✨ " + dato.texto);
  if (k.base) l.push("", "Cómo va tu depto 👇", urlV_(k, "micuenta.html"), "", "Todas las cuentas y comprobantes (con la clave de residentes) 👇", urlV_(k, "finanzas.html"));
  l.push("", "_Cifras agregadas: no se identifica a nadie._");
  return l.join("\n");
}

/* ---------- Correo a los residentes ---------- */
function seccionV_(html, primera) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:24px 22px;font-family:' + RFV + (primera ? "" : ";border-top:1px solid " + RCV.fina) + '">' + html + "</td></tr></table>";
}
function tituloV_(t, sub) {
  return '<div style="font-family:' + RGV + ";font-size:22px;line-height:1.25;color:" + RCV.tinta + '">' + t + "</div>" +
    (sub ? '<div style="font-family:' + RFV + ";font-size:14px;line-height:1.55;color:" + RCV.gris + ';margin-top:5px">' + sub + "</div>" : "");
}
function edificioV_(k) {
  const v = ventanasV_(k), n = v.length, cols = n <= 16 ? 4 : n <= 25 ? 5 : n <= 40 ? (n % 4 === 0 && n <= 32 ? 4 : 5) : Math.ceil(Math.sqrt(n * 0.6));
  const filas = Math.ceil(n / cols), w = n > 24 ? 17 : 22, hh = n > 24 ? 17 : 23, pad = n > 24 ? 4 : 5;
  let pisos = "";
  for (let f = 0; f < filas; f++) {
    pisos += "<tr>";
    for (let c = 0; c < cols; c++) {
      const i = f * cols + c, on = v[i];
      pisos += '<td style="padding:0 ' + pad + "px " + (pad * 2) + 'px">' + (i < n
        ? '<div style="width:' + w + "px;height:" + hh + "px;background:" + (on ? RCV.luz : RCV.apagada) + ";border-bottom:4px solid " + (on ? RCV.luz2 : RCV.apagada2) + ';border-radius:3px 3px 1px 1px;font-size:0;line-height:0">&nbsp;</div>'
        : '<div style="width:' + w + "px;height:" + (hh + 4) + 'px;font-size:0;line-height:0">&nbsp;</div>') + "</td>";
    }
    pisos += "</tr>";
  }
  const edificio = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">' +
    '<tr><td style="background:' + RCV.cornisa + ';height:9px;border-radius:5px 5px 0 0;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="background:' + RCV.muro + ';padding:13px 10px 2px"><table role="presentation" cellpadding="0" cellspacing="0" border="0">' + pisos + "</table></td></tr>" +
    '<tr><td align="center" style="background:' + RCV.muro + ';padding:0;font-size:0;line-height:0"><div style="width:26px;height:30px;margin:0 auto;background:' + RCV.oro + ';border-radius:5px 5px 0 0;font-size:0;line-height:0">&nbsp;</div></td></tr></table>';
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>' +
    '<td valign="bottom" style="font-size:34px;line-height:1;padding:0 4px 0 0">🌳</td><td valign="bottom">' + edificio + "</td>" +
    '<td valign="bottom" style="font-size:26px;line-height:1;padding:0 0 0 4px">🌳</td></tr></table>';
}
function heroV_(k, h) {
  const mora = !k.mora ? "" : k.mora.acumulada > 0.5
    ? '<div style="margin-top:10px"><span style="display:inline-block;background:#4a2b31;color:#ffd7d2;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:700">⏳ ' + escV_(moraTxtV_(k)) + "</span></div>"
    : '<div style="margin-top:10px"><span style="display:inline-block;background:#23402e;color:#c9f0d3;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:700">Nadie tiene cuotas atrasadas 🎉</span></div>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:' + RCV.noche + ';border-radius:20px 20px 0 0">' +
    '<tr><td style="padding:22px 22px 0;font-family:' + RFV + '">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td style="font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:' + RCV.cielo + '">' + escV_(MARCA_V.nombre) + " · " + mayV_(k.mesMin) + " " + k.anio + "</td>" +
        '<td align="right" style="font-size:24px;line-height:1">🌙</td></tr></table>' +
      '<div style="font-family:' + RGV + ';font-size:30px;line-height:1.15;color:#ffffff;margin-top:10px">' + escV_(h.titulo) + "</div>" +
      '<div style="font-size:16px;line-height:1.5;color:' + RCV.hielo + ';margin-top:8px">' + h.bajadaHtml + "</div></td></tr>" +
    '<tr><td align="center" style="padding:20px 10px 0;font-family:' + RFV + ";font-size:13px;letter-spacing:10px;color:" + RCV.cielo + '">✦&nbsp;✧&nbsp;✦</td></tr>' +
    '<tr><td align="center" style="padding:6px 10px 0">' + edificioV_(k) + "</td></tr>" +
    '<tr><td align="center" style="background:' + RCV.suelo + ';padding:14px 22px 20px;font-family:' + RFV + '">' +
      '<div style="font-size:14px;line-height:1.5;color:' + RCV.hielo + '">' + escV_(h.ventanas) + "</div>" + mora + "</td></tr></table>";
}
function cajaV_(k) {
  const max = Math.max(k.ing, k.egr, 1);
  const fila = (et, v, color, sub) => '<tr><td style="padding:12px 0 0">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr>' +
      '<td width="58" style="width:58px;font-family:' + RFV + ";font-size:14px;color:" + RCV.gris + '">' + et + "</td>" +
      '<td><table role="presentation" width="' + Math.max(4, Math.round(v / max * 100)) + '%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:' + color + ';height:16px;border-radius:8px;font-size:0;line-height:0">&nbsp;</td></tr></table></td>' +
      '<td width="100" align="right" style="width:100px;font-family:' + RFV + ";font-size:17px;font-weight:800;color:" + RCV.tinta + ';white-space:nowrap">' + $V(v) + "</td></tr></table>" +
    (sub ? '<div style="font-family:' + RFV + ";font-size:12px;line-height:1.4;color:" + RCV.suave + ';margin:4px 0 0 58px">' + sub + "</div>" : "") + "</td></tr>";
  const res = k.res >= 0
    ? '<span style="display:inline-block;background:' + RCV.verdeClaro + ';color:#1d5a2a;border-radius:999px;padding:7px 14px;font-size:15px;font-weight:800">✅ Sobraron ' + $V(k.res) + "</span>"
    : '<span style="display:inline-block;background:' + RCV.rojoClaro + ';color:#8c1d18;border-radius:999px;padding:7px 14px;font-size:15px;font-weight:800">Faltaron ' + $V(-k.res) + "</span>";
  const fin = k.saldoFin < -0.5 ? '<b style="white-space:nowrap;color:' + RCV.rojo + '">' + $V(k.saldoFin) + "</b> (números rojos)" : '<b style="white-space:nowrap;color:' + MARCA_V.acento + '">' + $V(k.saldoFin) + "</b>";
  return seccionV_(tituloV_("Cómo se movió la caja", "Empezó " + escV_(k.mesMin) + " en " + $V(k.saldoIni) + " y cerró en " + fin + ".") +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + fila("Entró", k.ing, RCV.verde, partesV_(k.partesIng)) + fila("Salió", k.egr, RCV.coral, partesV_(k.partesEgr)) + "</table>" +
    '<div style="margin-top:16px">' + res + "</div>", true);
}
function cuotaV_(k) {
  if (!k.rubros.length || !k.cuota) return "";
  const c = segmentosV_(k), seg = c.seg, n = seg.length;
  const celdas = seg.map((s, i) => '<td width="' + s[4] + '%" style="background:' + s[2] + ";height:22px;font-size:0;line-height:0;border-radius:" +
    (n === 1 ? "11px" : i === 0 ? "11px 0 0 11px" : i === n - 1 ? "0 11px 11px 0" : "0") + '">&nbsp;</td>').join("");
  const leyenda = seg.map(s => "<tr>" +
    '<td width="22" style="width:22px;padding:7px 0;border-bottom:1px solid ' + RCV.fina + '"><div style="width:12px;height:12px;border-radius:3px;background:' + s[2] + ';font-size:0;line-height:0">&nbsp;</div></td>' +
    '<td style="padding:7px 0;border-bottom:1px solid ' + RCV.fina + ";font-family:" + RFV + ";font-size:15px;color:" + RCV.tinta + '">' + s[3] + "&nbsp; " + escV_(s[0]) + "</td>" +
    '<td align="right" style="padding:7px 0;border-bottom:1px solid ' + RCV.fina + ";font-family:" + RFV + ";font-size:15px;font-weight:800;color:" + RCV.tinta + ';white-space:nowrap">' + $V(s[1]) + "</td></tr>").join("");
  const caja = t => '<div style="font-size:14px;line-height:1.5;color:' + RCV.gris + ";background:" + RCV.papel + ';border-radius:12px;padding:10px 12px;margin-top:12px">' + t + "</div>";
  const grandes = k.gastos.filter(g => g[1] > 0.5).slice(0, 3).map(g => '<b style="white-space:nowrap">' + $V(g[1]) + "</b> en " + escV_(g[0]));
  const nota = (c.sobra < -0.5 ? caja("Este mes el gasto por depto (" + $V(k.costoUnidad) + ") pasó la cuota: la diferencia, " + $V(-c.sobra) + " por depto, salió de la caja.") : "") +
    (grandes.length ? caja("Los gastos más grandes del mes: " + listaV_(grandes) + ".") : "");
  return seccionV_(tituloV_("¿En qué se fue tu cuota de " + $V(k.cuota) + "?", "Lo que costó mantener el edificio en " + escV_(k.mesMin) + ", dividido entre los " + k.unidades + " deptos." + MARCA_V.notaCuota) +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;table-layout:fixed;border-collapse:separate"><tr>' + celdas + "</tr></table>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">' + leyenda + "</table>" + nota);
}
function aguaV_(k) {
  const a = k.agua;
  if (!a || !(a.pagado > 0.5)) return "";
  const pct = Math.round(a.cobrado / a.pagado * 100), lleno = Math.max(0, Math.min(100, pct));
  const barra = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;table-layout:fixed;border-collapse:separate;background:' + RCV.aguaClaro + ';border-radius:11px"><tr>' +
    (lleno > 0 ? '<td width="' + Math.max(lleno, 3) + '%" style="background:' + RCV.agua + ';height:22px;border-radius:11px;font-size:0;line-height:0">&nbsp;</td>' : "") +
    (lleno < 100 ? '<td style="height:22px;font-size:0;line-height:0">&nbsp;</td>' : "") + "</tr></table>";
  const sub = (a.pipas ? "Llegaron <b>" + a.pipas + " pipas</b> " + (a.pipas >= 30 ? "(más de una al día)" : "") + " y costaron " : "Las pipas costaron ") + $V(a.pagado) +
    ". La derrama de agua juntó " + $V(a.cobrado) + (a.derrama ? " (" + $V(a.derrama) + " por depto)" : "") + ".";
  return seccionV_(tituloV_("💧 El agua de " + escV_(k.mesMin), sub.replace(" )", ")")) + barra +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td style="padding-top:6px;font-family:' + RFV + ";font-size:13px;font-weight:700;color:" + RCV.agua + '">Derrama ' + $V(a.cobrado) + "</td>" +
      '<td align="right" style="padding-top:6px;font-family:' + RFV + ";font-size:13px;color:" + RCV.gris + '">' + (pct >= 100 ? "¡Alcanzó! (" + pct + "%)" : "Cubrió el " + pct + "%") + "</td></tr></table>");
}
function proyectosV_(k) {
  const p = (k.proyectos || []).filter(x => x && x.nombre).slice(0, 3);
  if (!p.length) return "";
  return seccionV_(tituloV_("🔧 En la mira", "Proyectos del condominio y en qué van.") +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px">' + p.map(x => "<tr>" +
      '<td style="padding:8px 0;border-bottom:1px solid ' + RCV.fina + ";font-family:" + RFV + ";font-size:15px;color:" + RCV.tinta + '">' + escV_(x.nombre) + "</td>" +
      '<td align="right" style="padding:8px 0;border-bottom:1px solid ' + RCV.fina + '"><span style="display:inline-block;background:' + MARCA_V.suave + ";color:" + MARCA_V.oscuro + ";font-family:" + RFV + ';font-size:12px;font-weight:800;border-radius:999px;padding:4px 10px;white-space:nowrap">' + escV_(x.estado || "en marcha") + "</span></td></tr>").join("") + "</table>");
}
function datoCorreoV_(k) {
  const d = datoMesV_(k);
  if (!d) return "";
  return seccionV_('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:' + RCV.crema + ';border:1px solid #f0e2c0;border-radius:16px"><tr><td style="padding:16px 18px;font-family:' + RFV + '">' +
    '<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:800;color:#8a5a12">✨ Dato del mes</div>' +
    '<div style="font-family:' + RGV + ';font-size:19px;line-height:1.4;color:#3d2a0c;margin-top:6px">' + d.html + "</div></td></tr></table>");
}
function botonesV_(k) {
  if (!k.base) return "";
  return seccionV_('<div style="text-align:center">' +
    '<div style="font-family:' + RGV + ";font-size:20px;color:" + RCV.tinta + ';margin-bottom:12px">¿Y tu depto, cómo va?</div>' +
    '<a href="' + urlV_(k, "micuenta.html") + '" style="display:inline-block;background:' + MARCA_V.acento + ';color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;padding:13px 22px;border-radius:999px;margin:0 4px 8px">Ver mi cuenta</a>' +
    '<a href="' + urlV_(k, "finanzas.html") + '" style="display:inline-block;border:2px solid ' + MARCA_V.acento + ";color:" + MARCA_V.acento + ';text-decoration:none;font-weight:800;font-size:15px;padding:11px 20px;border-radius:999px;margin:0 4px 8px">Todas las cuentas</a>' +
    '<div style="font-size:13px;color:' + RCV.suave + ';margin-top:6px">Finanzas pide la clave de residentes; Mi cuenta, tu PIN.</div></div>');
}
function htmlReporteV_(k) {
  const h = historiaV_(k), pre = escV_(h.titulo + ". " + h.bajada + " Entraron " + $V(k.ing) + " y salieron " + $V(k.egr) + ".");
  const baja = urlV_(k, "correo.html");
  const pie = "Las cifras salen de la hoja de captura de la Administración.<br>La morosidad se publica siempre agregada: las ventanas encendidas se acomodan al azar y no son departamentos reales.<br>" +
    (baja ? '¿Prefieres no recibir estos correos? <a href="' + baja + '" style="color:' + RCV.suave + '">Date de baja aquí</a>.' : "Para dejar de recibir este correo, date de baja en la página «Recibe el reporte» del sitio.");
  return '<div style="background:' + RCV.papel + ";padding:18px 8px;font-family:" + RFV + '">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:' + RCV.papel + '">' + pre + "&#8199;&#847;".repeat(60) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:600px;margin:0 auto;border-collapse:separate">' +
    "<tr><td>" + heroV_(k, h) + "</td></tr>" +
    '<tr><td style="background:#ffffff;border-left:1px solid ' + RCV.linea + ";border-right:1px solid " + RCV.linea + '">' + cajaV_(k) + cuotaV_(k) + aguaV_(k) + proyectosV_(k) + datoCorreoV_(k) + botonesV_(k) + "</td></tr>" +
    '<tr><td style="background:#ffffff;border:1px solid ' + RCV.linea + ";border-top:1px solid " + RCV.fina + ';border-radius:0 0 20px 20px;padding:18px 22px 22px;font-family:' + RFV + ";font-size:12px;line-height:1.6;color:" + RCV.suave + ';text-align:center">' + pie + "</td></tr>" +
    "</table></div>";
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
  for (let i = 0; i < dest.length; i += 40) MailApp.sendEmail("lavalettaa@gmail.com", asuntoV_(k), textoWaV_(k), { name: REMITENTE_V, bcc: dest.slice(i, i + 40).join(","), htmlBody: htmlReporteV_(k) });
  props.setProperty("enviado_" + id, new Date().toISOString());
  bitacoraV_(id, dest.length + " correos", "Enviado");
}
function envioAhora() { PropertiesService.getScriptProperties().deleteProperty("enviado_" + mesAnteriorV_()); envioMensual(); }
function reportePrueba() {
  const k = datosReporte_(mesAnteriorV_()); const yo = Session.getEffectiveUser().getEmail();
  if (!k) { MailApp.sendEmail(yo, "Prueba del reporte · La Valetta", "El mes " + mesAnteriorV_() + " todavía no tiene datos.", { name: REMITENTE_V }); return; }
  MailApp.sendEmail(yo, "[Prueba] " + asuntoV_(k), textoWaV_(k), { name: REMITENTE_V, htmlBody: htmlReporteV_(k) });
}

/* ------------------------------- instalación ------------------------------- */
function instalarVecinos() {
  const h = hojaV_(HOJA_CFG_V, ["Clave", "Valor", "Para qué"]);
  const tiene = k => filasV_(HOJA_CFG_V, 1).some(f => String(f[0]).trim() === k);
  [["reporte_envio", "no", "«sí» manda el reporte del día 10 a los correos registrados. En «no» solo llega el kit a la Administración."],
   ["reporte_copia", "lavalettaa@gmail.com", "Quién recibe el kit del mes, el semáforo y los avisos de casa club (separa con comas)."],
   ["sitio_url", "", "Dirección del sitio (sin / al final), para las ligas de los correos."],
   ["casa_club_garantia", 3000, "Garantía al apartar la casa club."], ["casa_club_costo", 1000, "Lo que se queda: limpieza y fondo de la casa club."]]
    .forEach(r => { if (!tiene(r[0])) h.getRange(h.getLastRow() + 1, 1, 1, 3).setValues([r]); });
  hojaV_(HOJA_CORREOS_V, ENC_CORREOS_V); hojaV_(HOJA_RCC_V, ENC_RCC_V); hojaV_(HOJA_REP_V, ["Fecha", "Mes", "Enviado a", "Nota"]);
  ScriptApp.getProjectTriggers().filter(t => ["envioMensual", "avisosCasa"].indexOf(t.getHandlerFunction()) >= 0).forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("envioMensual").timeBased().onMonthDay(10).atHour(9).inTimezone(ZONA_V).create();
  ScriptApp.newTrigger("avisosCasa").timeBased().everyMinutes(30).create();
  if (typeof instalarCalentador === "function") instalarCalentador();
  aviso_("Listo: pestañas Config (sitio), Correos, Reservas casa club y Reportes; envío del día 10 a las 9 h y avisos de casa club cada 30 min.");
}

/* El administrador toca «Confirmar» o «Rechazar» en el correo: la liga va firmada (no se puede inventar). */
function resolverCasaV_(p) {
  const folio = String(p.folio || "").toUpperCase(), e = p.e === "Confirmada" || p.e === "Rechazada" ? p.e : "";
  if (!e || String(p.t || "") !== firmaV_(folio + "|" + e)) return { ok: false, error: "liga" };
  const h = hoja_().getSheetByName(HOJA_RCC_V), fs = filasV_(HOJA_RCC_V, ENC_RCC_V.length), i = fs.findIndex(f => String(f[0]).toUpperCase() === folio);
  if (!h || i < 0) return { ok: false, error: "no encontrado" };
  const antes = String(fs[i][5] || "Por confirmar");
  if (/cancelada/i.test(antes)) return { ok: false, error: "cancelada", folio: folio, dia: diaV_(fs[i][2]), depto: String(fs[i][3]) };
  if (e === "Confirmada" && fs.some((f, k) => k !== i && /confirmada/i.test(String(f[5])) && diaV_(f[2]) === diaV_(fs[i][2]))) return { ok: false, error: "ocupado", folio: folio };
  h.getRange(i + 2, 6).setValue(e); olvidarCasa_();
  avisosCasa();                                  // el residente se entera al momento
  return { ok: true, folio: folio, estatus: e, antes: antes, dia: diaV_(fs[i][2]), depto: String(fs[i][3]) };
}

/* ------------------------------- Mi cuenta (PIN por departamento) -------------------------------
   Cada propietario crea su PIN una vez (con la clave de residentes). Se guarda cifrado en la pestaña
   «PIN (privado)»; nadie puede cambiar un PIN que ya existe: para reponerlo, la Administración borra
   ese renglón. Cada PIN nuevo le llega como aviso a la Administración. */
const HOJA_PIN_V = "PIN (privado)", ENC_PIN_V = ["Departamento", "PIN cifrado (no editar)", "Creado", "Correo"];
function hashPinV_(depto, pin) { return hexV_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, secretoV_() + "|" + String(depto).toUpperCase() + "|" + String(pin), Utilities.Charset.UTF_8)); }
function deptoValidoV_(depto) { const l = deptosV_(); const i = l.map(x => x.toLowerCase()).indexOf(String(depto || "").trim().toLowerCase()); return i >= 0 ? l[i] : (l.length ? "" : String(depto || "").trim()); }
function crearPinV_(d) {
  const depto = deptoValidoV_(d.depto), pin = String(d.pin || ""), correo = String(d.correo || "").trim().toLowerCase();
  if (!depto) return { ok: false, error: "departamento" };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: "pin" };
  if (/^(\d)\1+$/.test(pin) || "0123456789".indexOf(pin) >= 0) return { ok: false, error: "facil" };
  if (!claveOkV_(d.clave)) return { ok: false, error: "clave" };
  if (correo && !correoOkV_(correo)) return { ok: false, error: "correo" };
  const h = hojaV_(HOJA_PIN_V, ENC_PIN_V);
  if (filasV_(HOJA_PIN_V, 1).some(f => String(f[0]).toUpperCase() === depto.toUpperCase())) return { ok: false, error: "existe" };
  h.getRange(h.getLastRow() + 1, 1, 1, 4).setValues([[depto, hashPinV_(depto, pin), new Date(), correo]]);
  admonV_().forEach(a => MailApp.sendEmail(a, "Mi cuenta: depto " + depto + " creó su PIN", "El depto " + depto + " creó su PIN para ver su estado de cuenta en el sitio" + (correo ? " (correo: " + correo + ")" : "") + ".\n\nSi no fue el propietario, borra su renglón en la pestaña «" + HOJA_PIN_V + "» y el depto podrá crear uno nuevo.", { name: REMITENTE_V }));
  if (correo) MailApp.sendEmail(correo, "Tu PIN de La Valetta quedó listo", "Ya puedes ver el estado de cuenta del depto " + depto + " en la página «Mi cuenta» del sitio" + (sitioV_() ? ": " + sitioV_() + "/micuenta.html" : "") + ".\n\nSi lo olvidas, pide a la Administración que lo reponga.", { name: REMITENTE_V });
  return Object.assign({ ok: true }, cuentaDeptoV_(depto));
}
function miCuentaV_(d) {
  const depto = deptoValidoV_(d.depto), c = CacheService.getScriptCache(), k = "pinmal_" + String(depto).toUpperCase(), malos = Number(c.get(k) || 0);
  if (!depto) return { ok: false, error: "departamento" };
  if (malos >= 6) return { ok: false, error: "espera" };
  const f = filasV_(HOJA_PIN_V, 2).find(x => String(x[0]).toUpperCase() === depto.toUpperCase());
  if (!f) return { ok: false, error: "sinpin" };
  if (String(f[1]) !== hashPinV_(depto, String(d.pin || ""))) { c.put(k, String(malos + 1), 3600); return { ok: false, error: "pinmal", quedan: 5 - malos }; }
  c.remove(k);
  return Object.assign({ ok: true }, cuentaDeptoV_(depto));
}
/* Estado de cuenta de UN depto, con la misma regla que la mora de Finanzas: todo lo pagado menos todas las
   cuotas transcurridas, sin reiniciar en enero; los meses futuros cuentan como adelanto. */
function cuentaDeptoV_(depto) {
  const ss = hoja_(), hist = historico_(ss), hoyId = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM"), U = depto.toUpperCase();
  let saldo = 0, desde = "", meses = [], adelanto = 0;
  const archivados = Object.keys(hist).sort();
  matrizPagosV_().forEach(m => {
    if (!m.capturado && m.id !== hoyId) return;          // el mes en curso cuenta aunque aún no tenga capturas
    const k = Object.keys(m.pagos).find(x => x.toUpperCase() === U), pagado = k ? Number(m.pagos[k]) || 0 : 0;
    if (m.id > hoyId) { adelanto += pagado; return; }
    meses.push({ id: m.id, nombre: m.nombre + " " + m.anio, cuota: m.cuota, pagado: Math.round(pagado * 100) / 100 });
  });
  meses.sort((a, b) => a.id < b.id ? -1 : 1);
  const ultArch = archivados.filter(id => !meses.length || id < meses[0].id).pop();
  if (ultArch) { saldo = Number((hist[ultArch].saldos || {})[depto]) || 0; desde = ultArch; }
  else { const ini = saldosIniciales_(ss); const k = Object.keys(ini).find(x => x.toUpperCase() === U); saldo = k ? ini[k] : 0; desde = saldo ? "inicio" : ""; }
  const saldoInicial = Math.round(saldo * 100) / 100;
  /* Cada pago cubre primero lo más viejo: un adelanto marca como cubiertos los meses siguientes. */
  let fuente = "", montoFuente = 0;                      // el último pago que dejó saldo a favor (para explicar «cubierto»)
  meses.forEach(m => {
    const antes = saldo;
    saldo += m.pagado - m.cuota; m.saldo = Math.round(saldo * 100) / 100; m.enCurso = m.id === hoyId;
    if (m.pagado > m.cuota + 0.5 && saldo > 0.5) { fuente = m.nombre; montoFuente = m.pagado; }
    if (m.pagado < m.cuota - 0.5 && antes > 0.5) { m.cubiertoPor = fuente || "saldo a favor anterior"; m.montoCubre = montoFuente; }
    m.estado = saldo >= -0.5 ? (m.pagado >= m.cuota - 0.5 ? "pagado" : "cubierto") : saldo > -m.cuota + 0.5 ? "parcial" : "pendiente";
    m.falta = saldo < -0.5 ? Math.round(Math.min(m.cuota, -saldo) * 100) / 100 : 0;
  });
  saldo += adelanto;
  return { depto: depto, saldoInicial: saldoInicial, archivadoHasta: desde, meses: meses, adelanto: Math.round(adelanto * 100) / 100,
    debe: saldo < -0.5 ? Math.round(-saldo * 100) / 100 : 0, aFavor: saldo > 0.5 ? Math.round(saldo * 100) / 100 : 0, cuota: meses.length ? meses[meses.length - 1].cuota : 1100,
    contacto: { tel: "524422827829", correo: "lavalettaa@gmail.com" } };
}

/* Pagos de todos los deptos por mes (lo único que necesita «Mi cuenta»). Se guarda 2 minutos: así varias
   consultas seguidas no vuelven a leer las 12 pestañas. Un cambio en la hoja se ve a más tardar 2 min después. */
function matrizPagosV_(fresca) {
  const c = CacheService.getScriptCache(), g = fresca ? null : c.get("matriz_pagos"); if (g) return JSON.parse(g);
  const ss = hoja_(), hist = historico_(ss), out = [];
  hojasMes_(ss).forEach(h => {
    if (hist[h.id] && h.hoja.isSheetHidden()) return;
    const m = leerMes_(h), pagos = {};
    m.pagosPorUnidad.forEach(p => { pagos[String(p[0]).trim()] = Number(p[1]) || 0; });
    out.push({ id: m.id, nombre: m.nombre, anio: m.anio, cuota: m.cuota, capturado: m.capturado, pagos: pagos });
  });
  try { c.put("matriz_pagos", JSON.stringify(out), fresca ? 1500 : 120); } catch (_) {}
  return out;
}
/* Lo llama el calentador (Code.gs): «Mi cuenta» y la lista de deptos ya no esperan a la hoja. */
function calentarVecinos_() {
  matrizPagosV_(true);
  try { CacheService.getScriptCache().put("anonimo", JSON.stringify(anonimoCalcV_()), 1500); } catch (_) {}
  try { CacheService.getScriptCache().remove("deptos_v"); deptosV_(); } catch (_) {}
}

/* ---------------- El edificio de noche (Finanzas): cuántos deptos están al corriente, por mes ----------------
   ANÓNIMO: aquí se calcula depto por depto, pero al sitio solo salen CONTEOS por mes (nunca qué depto es cuál).
   Misma regla que «Mi cuenta»: cada pago cubre primero el mes más viejo. Se guarda 5 min (el calentador lo renueva). */
function anonimoV_() {
  const c = CacheService.getScriptCache(), g = c.get("anonimo");
  if (g) { try { return JSON.parse(g); } catch (e) {} }
  const r = anonimoCalcV_();
  try { c.put("anonimo", JSON.stringify(r), 300); } catch (e) {}
  return r;
}
function anonimoCalcV_() {
  if (typeof LOTE_V !== "undefined") LOTE_V.on = true;
  const hoyId = Utilities.formatDate(new Date(), ZONA_V, "yyyy-MM"), meses = {}, ds = deptosV_();
  let deben = 0, monto = 0, mantoTot = 0, aguaDeben = 0, aguaMonto = 0, aguaMes = "";
  ds.forEach(d => {
    let cu; try { cu = cuentaDeptoV_(d); } catch (e) { return; }
    (cu.meses || []).forEach(m => {
      const x = meses[m.id] || (meses[m.id] = { id: m.id, nombre: m.nombre, enCurso: m.id === hoyId, total: 0, al: 0, parte: 0, uno: 0, dos: 0, tres: 0 });
      x.total++;
      if (m.saldo >= -0.5) x.al++;
      else { const atras = Math.ceil(-m.saldo / (m.cuota || 1) - 0.001); if (-m.saldo < m.cuota - 0.5) x.parte++; else if (atras <= 1) x.uno++; else if (atras === 2) x.dos++; else x.tres++; }
    });
    /* Lo VENCIDO: la cuota del mes en curso todavía no se debe (lo que ya se pagó de ella sí cuenta). */
    const ult = (cu.meses || [])[(cu.meses || []).length - 1];
    let saldoHoy = (Number(cu.aFavor) || 0) - (Number(cu.debeManto != null ? cu.debeManto : cu.debe) || 0);
    if (ult && ult.enCurso) saldoHoy += Number(ult.cuota) || 0;
    const debeM = Math.max(0, -saldoHoy);
    mantoTot += debeM;
    if (debeM > 0.5) { deben++; monto += debeM; }
  });
  return { ok: true, unidades: ds.length, hoy: hoyId, meses: Object.keys(meses).sort().map(k => meses[k]),
    hoyDeben: { deptos: deben, monto: Math.round(monto), mantenimiento: Math.round(mantoTot) },
    generado: new Date().toISOString() };
}
