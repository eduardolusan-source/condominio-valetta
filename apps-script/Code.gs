/* Condominio La Valetta · Finanzas en vivo
   Apps Script que lee la hoja "Valetta-Captura-Mensual" (proyecto propio en
   script.google.com, o ligado a la hoja desde Extensiones → Apps Script).
   Instalación paso a paso: apps-script/INSTALAR.md

   Qué hace:
   - doGet: responde a finanzas.html con un JSON de cifras AGREGADAS por mes
     (saldos, ingresos, egresos, cobranza, mora acumulada y desglose de gastos
     por concepto). Lee directamente las pestañas mensuales (ENERO, FEBRERO…),
     así que un mes aparece en el sitio en cuanto su pestaña tiene datos.
     NUNCA devuelve cobros por departamento: la morosidad sale sumada.
   - instalar(): se corre UNA vez a mano. Crea las pestañas que falten hasta
     diciembre (OCTUBRE, NOVIEMBRE, DICIEMBRE) copiando la del último mes,
     en blanco y con el saldo inicial encadenado al saldo final anterior.
   - crearSiguienteMes(): crea solo la pestaña del mes que sigue al último.

   Cómo reconoce las pestañas: por su nombre, un mes en mayúsculas ("OCTUBRE")
   o con año ("ENERO 2027"). El año lo toma de la celda "Mes y año" (C5) y,
   si no es fecha, del nombre de la pestaña. "Captura Mensual" es la plantilla
   y no cuenta. Una pestaña sin cobros ni gastos se considera vacía y no se
   publica, por eso se pueden dejar los meses del año creados por adelantado. */

/* Id de la hoja. Con él, el script puede vivir en un proyecto propio de
   script.google.com (no hace falta que esté ligado a la hoja). Si se pega
   dentro de la hoja (Extensiones → Apps Script) también funciona. */
const HOJA_ID = "1jHowL3TmE3W-jTENYDXbLREyYeSWndkQJXo5HnG3fPw";

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CACHE_SEGUNDOS = 300;          // el sitio ve los cambios de la hoja a más tardar 5 minutos después
const FILAS = 120;                   // hasta dónde se lee cada pestaña

/* ============================ SERVICIO WEB ============================ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const cache = CacheService.getScriptCache();
    if (!p.fresh) {
      const guardado = cache.get("finanzas");
      if (guardado) return texto_(guardado);
    }
    const salida = JSON.stringify(armarFinanzas_());
    try { cache.put("finanzas", salida, CACHE_SEGUNDOS); } catch (_) { /* si pesa más de lo que admite el caché, se sirve sin caché */ }
    return texto_(salida);
  } catch (err) {
    return texto_(JSON.stringify({ ok: false, error: String(err.message || err) }));
  }
}

function hoja_() { return HOJA_ID ? SpreadsheetApp.openById(HOJA_ID) : SpreadsheetApp.getActive(); }
function aviso_(msg) { Logger.log(msg); try { hoja_().toast(msg, "La Valetta", 10); } catch (_) { /* sin hoja activa no hay aviso en pantalla */ } }
function texto_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }

/* Para probar desde el editor: Ejecutar → probar, y ver el registro. */
function probar() {
  const d = armarFinanzas_();
  Logger.log(JSON.stringify(d, null, 2));
  return d;
}

/* ============================ LECTURA ============================ */

function armarFinanzas_(conSaldos) {
  const ss = hoja_();
  const hojas = hojasMes_(ss);
  const hist = historico_(ss);
  if (!hojas.length && !Object.keys(hist).length) throw new Error("No encuentro pestañas de meses (ENERO, FEBRERO…).");

  /* Meses futuros (alguien pagó diciembre por adelantado): no se publican ni cobran
     cuota; sus pagos cuentan como adelanto del mes en curso. */
  const hoyId = Utilities.formatDate(new Date(), "America/Mexico_City", "yyyy-MM");
  const meses = [], futuros = [];
  const proyectos = {};
  let unidades = 0, cuota = 0;
  hojas.forEach(h => {
    /* Un mes ya archivado (pestaña oculta y guardado en Histórico) no se vuelve a leer. */
    if (hist[h.id] && h.hoja.isSheetHidden()) return;
    const m = leerMes_(h);
    if (!m.capturado) return;
    if (m.id > hoyId) { futuros.push(m); return; }
    unidades = m.unidades || unidades;
    cuota = m.cuota || cuota;
    m.proyectos.forEach(p => { proyectos[p.nombre.toLowerCase()] = p; });
    meses.push(m);
  });
  Object.keys(hist).forEach(id => { if (!meses.some(m => m.id === id)) meses.push(Object.assign({ archivado: true }, hist[id].mes, { _saldos: hist[id].saldos })); });
  meses.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!meses.length) throw new Error("Ninguna pestaña mensual tiene datos todavía.");
  if (!unidades) unidades = meses[meses.length - 1].unidades;
  if (!cuota) cuota = meses[meses.length - 1].cuota;

  /* Mora acumulada: saldo por unidad = todo lo pagado − todas las cuotas transcurridas,
     SIN reiniciar en enero (quien debe diciembre sigue debiéndolo en enero). Se calcula
     aquí, con los cobros por departamento, y SOLO salen las sumas. Los meses archivados
     traen su foto de saldos (privada, en la pestaña Histórico) y la cuenta sigue desde ahí. */
  let saldos = {};
  meses.forEach((m, i) => {
    if (m.archivado) { saldos = JSON.parse(JSON.stringify(m._saldos || {})); }
    else {
      m.pagosPorUnidad.forEach(([depto, pagado]) => { saldos[depto] = (saldos[depto] || 0) + pagado - m.cuota; });
      if (i === meses.length - 1) futuros.forEach(f => f.pagosPorUnidad.forEach(([depto, pagado]) => { saldos[depto] = (saldos[depto] || 0) + pagado; }));
      const vals = Object.keys(saldos).map(k => saldos[k]);
      const neg = vals.filter(v => v < -0.5), pos = vals.filter(v => v > 0.5);
      m.mora = {
        acumulada: redondear_(-neg.reduce((a, b) => a + b, 0)),
        unidades: neg.length,
        adelantos: redondear_(pos.reduce((a, b) => a + b, 0)),
        unidadesAdelanto: pos.length
      };
    }
    if (conSaldos) m._saldos = JSON.parse(JSON.stringify(saldos));
    else delete m._saldos;
    m.enCurso = m.id === hoyId;
    delete m.pagosPorUnidad;   // no sale del script
    delete m.archivado;
  });

  return {
    ok: true,
    servicio: "valetta-finanzas",
    generado: new Date().toISOString(),
    unidades: unidades,
    cuota: cuota,
    anio: Math.max.apply(null, meses.map(m => m.anio)),
    meses: meses,
    proyectos: Object.keys(proyectos).map(k => proyectos[k])
  };
}

/* Pestañas que son un mes, ordenadas por año y mes. */
function hojasMes_(ss) {
  return ss.getSheets().map(h => infoMes_(h)).filter(Boolean).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function infoMes_(hoja) {
  const n = sinAcentos_(hoja.getName().trim().toUpperCase());
  const m = /^([A-Z]+)(?:\s+(\d{4}))?$/.exec(n);
  if (!m) return null;
  const mes = MESES.indexOf(m[1]);
  if (mes < 0) return null;
  let anio = m[2] ? parseInt(m[2], 10) : null;
  if (!anio) {
    const v = hoja.getRange("C5").getValue();
    /* La celda guarda el día 1 a medianoche; 12 horas de margen evitan que un
       desfase de zona horaria la convierta en el 31 de diciembre del año anterior. */
    if (v instanceof Date) anio = new Date(v.getTime() + 12 * 3600 * 1000).getFullYear();
    else {
      const t = /(\d{2,4})\s*$/.exec(String(v || ""));
      if (t) anio = t[1].length === 2 ? 2000 + parseInt(t[1], 10) : parseInt(t[1], 10);
    }
  }
  if (!anio) anio = new Date().getFullYear();
  return { hoja: hoja, mes: mes, anio: anio, id: anio + "-" + ("0" + (mes + 1)).slice(-2) };
}

/* Lee una pestaña mensual buscando cada dato por su etiqueta (columna B),
   así no importa si la Administración inserta o mueve filas. */
function leerMes_(info) {
  const h = info.hoja;
  const vals = h.getRange(1, 2, FILAS, 4).getValues();          // B:E
  const etiquetas = vals.map(f => norm_(f[0]));

  const filaDe = (clave, desde, hasta) => {
    for (let i = desde || 0; i < Math.min(hasta || FILAS, etiquetas.length); i++) if (etiquetas[i].indexOf(clave) === 0) return i;
    return -1;
  };
  /* Las secciones van después del bloque COBROS; buscar desde ahí evita confundir
     "EGRESOS FIJOS (servicios)" con el renglón "(−) Egresos fijos" del resumen. */
  const fCobros = filaDe("cobrospordepartamento");
  const seccion = clave => filaDe(clave, fCobros > 0 ? fCobros + 1 : 0);
  const fCasa = seccion("ingresoporrentadecasaclub");
  const fFijos = seccion("egresosfijos");
  const fVar = seccion("egresosvariables");
  const fProy = seccion("proyectosencurso");
  const topeResumen = fCobros > 0 ? fCobros : 30;

  const numResumen = clave => { const i = filaDe(clave, 0, topeResumen); return i < 0 ? 0 : num_(vals[i][1]); };
  const unidades = Math.round(numResumen("numerodeunidades")) || 32;
  const cuota = numResumen("cuotademantenimiento") || 1100;

  /* Renglones de una sección: desde la fila siguiente al encabezado de columnas
     hasta el renglón "TOTAL" (o hasta un bloque vacío largo). */
  const renglones = (inicio, conTotal) => {
    const out = [];
    if (inicio < 0) return out;
    let vacias = 0;
    for (let i = inicio + 2; i < etiquetas.length; i++) {
      const et = etiquetas[i];
      if (conTotal && et.indexOf("total") === 0) break;
      if (!conTotal && (et.indexOf("egresos") === 0 || et.indexOf("ingreso") === 0 || et.indexOf("cobros") === 0 || et.indexOf("proyectos") === 0)) break;
      if (!et && !String(vals[i][1]).trim()) { if (++vacias >= 8) break; continue; }
      vacias = 0;
      out.push({ fila: i + 1, concepto: String(vals[i][0]).trim(), monto: num_(vals[i][1]), c: vals[i][1], d: vals[i][2] });
    }
    return out;
  };

  const cobros = renglones(fCobros, true).filter(r => r.concepto);
  const pagosPorUnidad = cobros.map(r => [r.concepto, num_(r.c)]);
  const mantoCobrado = pagosPorUnidad.reduce((a, b) => a + b[1], 0);
  const aguaCobrada = cobros.reduce((a, r) => a + num_(r.d), 0);
  const casaClub = renglones(fCasa, true).reduce((a, r) => a + r.monto, 0);

  const ligas = ligasDrive_(h, fFijos, fVar);
  const items = (lista) => lista.filter(r => r.concepto && r.monto).map(r => {
    const liga = ligas[r.fila];
    return liga ? [r.concepto, redondear_(r.monto), liga] : [r.concepto, redondear_(r.monto)];
  });
  const fijos = items(renglones(fFijos, true));
  const variables = items(renglones(fVar, true));
  const totFijos = fijos.reduce((a, b) => a + b[1], 0);
  const totVar = variables.reduce((a, b) => a + b[1], 0);

  const proyectos = renglones(fProy, false).filter(r => r.concepto).map(r => ({
    nombre: r.concepto, estado: String(r.c || "").trim(), liga: /^https?:\/\//.test(String(r.d || "").trim()) ? String(r.d).trim() : "", avance: /^https?:\/\//.test(String(r.d || "").trim()) ? "" : String(r.d || "").trim()
  }));

  const saldoIni = numResumen("saldoinicial");
  let saldoFin = numResumen("saldofinaldelmes");
  if (filaDe("saldofinaldelmes", 0, topeResumen) < 0) saldoFin = saldoIni + mantoCobrado + aguaCobrada + casaClub - totFijos - totVar;
  const pagaron = pagosPorUnidad.filter(p => p[1] > 0).length;
  const capturado = mantoCobrado > 0 || totFijos > 0 || totVar > 0 || casaClub > 0;

  return {
    id: info.id, anio: info.anio, nombre: NOMBRES[info.mes], corto: CORTOS[info.mes],
    unidades: unidades, cuota: cuota,
    saldoIni: redondear_(saldoIni), saldoFin: redondear_(saldoFin),
    ingresos: { manto: redondear_(mantoCobrado), agua: redondear_(aguaCobrada), casaClub: redondear_(casaClub) },
    egresos: { fijos: redondear_(totFijos), variables: redondear_(totVar) },
    cobranza: { pagaron: pagaron, pct: redondear_(unidades ? pagaron / unidades * 100 : 0, 1), morosos: Math.max(0, unidades - pagaron) },
    detalle: { fijos: fijos, variables: variables },
    proyectos: proyectos,
    capturado: capturado,
    pagosPorUnidad: pagosPorUnidad
  };
}

/* Ligas de comprobante en la columna D de egresos: como hipervínculo del
   texto, como URL escrita o como fórmula HYPERLINK. Devuelve { fila: url }. */
function ligasDrive_(h, fFijos, fVar) {
  const out = {};
  const inicio = Math.min(fFijos < 0 ? FILAS : fFijos, fVar < 0 ? FILAS : fVar);
  if (inicio >= FILAS) return out;
  const rango = h.getRange(inicio + 1, 4, FILAS - inicio, 1);     // D
  const ricos = rango.getRichTextValues();
  const formulas = rango.getFormulas();
  const valores = rango.getValues();
  for (let i = 0; i < ricos.length; i++) {
    const fila = inicio + 1 + i;
    let url = ricos[i][0] && ricos[i][0].getLinkUrl();
    if (!url) {
      const runs = ricos[i][0] ? ricos[i][0].getRuns() : [];
      for (let r = 0; r < runs.length && !url; r++) url = runs[r].getLinkUrl();
    }
    if (!url) { const m = /HYPERLINK\(\s*"([^"]+)"/i.exec(formulas[i][0] || ""); if (m) url = m[1]; }
    if (!url && /^https?:\/\//.test(String(valores[i][0]).trim())) url = String(valores[i][0]).trim();
    if (url) out[fila] = url;
  }
  return out;
}

/* ============================ CAMBIO DE AÑO ============================ */
/* Una sola hoja viva, sin fin: una pestaña por mes ("ENERO 2027" desde el año
   siguiente). Para que no se haga lenta con los años:
   - mantenimientoMensual() corre solo el día 25 de cada mes (lo instala instalar()):
     crea la pestaña del mes siguiente (también enero, cruzando de año) en blanco y con
     su saldo inicial encadenado al saldo final del mes anterior, y cada 1 de marzo
     archiva el año anterior.
   - archivarAnio(anio) guarda en la pestaña "Histórico" las cifras agregadas de cada
     mes de ese año y la foto privada de saldos por unidad (para que la mora siga
     contando), y oculta esas pestañas. Nada se borra: para consultar o corregir un mes
     archivado, se muestra su pestaña (clic derecho → Mostrar) y se corre
     desarchivarAnio(anio). */
const HISTORICO = "Histórico";

function historico_(ss) {
  const h = ss.getSheetByName(HISTORICO);
  const out = {};
  if (!h || h.getLastRow() < 2) return out;
  h.getRange(2, 1, h.getLastRow() - 1, 3).getValues().forEach(f => {
    const id = String(f[0]).trim();
    if (!/^\d{4}-\d{2}$/.test(id)) return;
    try { out[id] = { mes: JSON.parse(f[1]), saldos: JSON.parse(f[2] || "{}") }; } catch (_) { /* renglón dañado: se ignora */ }
  });
  return out;
}

function archivarAnio(anio) {
  const ss = hoja_();
  anio = Number(anio) || (new Date().getFullYear() - 1);
  const d = armarFinanzas_(true);
  const delAnio = d.meses.filter(m => m.anio === anio);
  if (!delAnio.length) { aviso_("No hay meses de " + anio + " para archivar."); return; }
  let h = ss.getSheetByName(HISTORICO);
  if (!h) {
    h = ss.insertSheet(HISTORICO);
    h.getRange(1, 1, 1, 3).setValues([["Mes", "Cifras agregadas (lo que ve el sitio)", "Saldos por unidad al cierre (PRIVADO: no se publica)"]]).setFontWeight("bold");
    h.setFrozenRows(1);
  }
  const ya = historico_(ss);
  delAnio.forEach(m => {
    if (ya[m.id]) return;
    const saldos = m._saldos || {};
    const limpio = JSON.parse(JSON.stringify(m));
    delete limpio._saldos; delete limpio.proyectos; delete limpio.enCurso;
    h.appendRow([m.id, JSON.stringify(limpio), JSON.stringify(saldos)]);
  });
  h.getRange("A:A").setNumberFormat("@");
  hojasMes_(ss).filter(i => i.anio === anio).forEach(i => { try { i.hoja.hideSheet(); } catch (_) { /* ya oculta */ } });
  try { h.hideSheet(); } catch (_) { /* se queda visible si es la única */ }
  CacheService.getScriptCache().remove("finanzas");
  aviso_("Año " + anio + " archivado: " + delAnio.length + " meses en Histórico y sus pestañas ocultas.");
}

/* Para corregir un año archivado: borra sus renglones de Histórico y muestra sus pestañas. */
function desarchivarAnio(anio) {
  const ss = hoja_();
  anio = Number(anio);
  const h = ss.getSheetByName(HISTORICO);
  if (h && h.getLastRow() > 1) {
    const filas = h.getRange(2, 1, h.getLastRow() - 1, 1).getValues();
    for (let i = filas.length - 1; i >= 0; i--) if (String(filas[i][0]).indexOf(anio + "-") === 0) h.deleteRow(i + 2);
  }
  hojasMes_(ss).filter(i => i.anio === anio).forEach(i => i.hoja.showSheet());
  CacheService.getScriptCache().remove("finanzas");
  aviso_("Año " + anio + " vuelve a leerse de sus pestañas.");
}

/* Crea la pestaña del mes siguiente al de hoy si no existe (en blanco, saldo encadenado). */
function prepararMesSiguiente() {
  const ss = hoja_();
  const hoy = new Date();
  const sig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const id = sig.getFullYear() + "-" + ("0" + (sig.getMonth() + 1)).slice(-2);
  if (hojasMes_(ss).some(i => i.id === id)) return [];
  return crearMeses_(1, true);
}

/* Lo corre el disparador del día 25. */
function mantenimientoMensual() {
  const creadas = prepararMesSiguiente();
  const hoy = new Date();
  if (hoy.getMonth() === 2) {                       // marzo: se archiva el año anterior
    const anterior = hoy.getFullYear() - 1;
    if (!Object.keys(historico_(hoja_())).some(id => id.indexOf(anterior + "-") === 0)) archivarAnio(anterior);
  }
  if (creadas.length) Logger.log("Pestaña creada: " + creadas.join(", "));
}

function instalarDisparadores_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "mantenimientoMensual").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("mantenimientoMensual").timeBased().onMonthDay(25).atHour(6).inTimezone("America/Mexico_City").create();
}

/* ============================ INSTALACIÓN ============================ */

/* Crea las pestañas que faltan hasta diciembre del año del último mes. */
function instalar() {
  const creadas = crearMeses_(12);
  const afinadas = afinarVacios_();
  instalarDisparadores_();               // día 25: pestaña del mes siguiente (también enero) y archivo anual en marzo
  aviso_((creadas.length ? "Pestañas creadas: " + creadas.join(", ") : "No faltaba ningún mes.") + (afinadas.length ? " · Afinadas: " + afinadas.join(", ") : ""));
}

/* En las pestañas que aún no tienen datos, deja "Mes y año" como fecha exacta
   del día 1 y el renglón "(+) Renta de casa club" del resumen como fórmula
   hacia el total de su sección (al copiar un mes a mano suele quedar un
   número fijo). No toca ninguna pestaña con cobros o gastos. */
function afinarVacios_() {
  const ss = hoja_();
  const out = [];
  hojasMes_(ss).forEach(info => {
    if (leerMes_(info).capturado) return;
    const h = info.hoja;
    const vals = h.getRange(1, 2, FILAS, 1).getValues();
    const etiquetas = vals.map(f => norm_(f[0]));
    let cambio = false;
    const fMes = etiquetas.findIndex(e => e.indexOf("mesyano") === 0);
    if (fMes >= 0 && h.getRange(fMes + 1, 3).getFormula() !== "=DATE(" + info.anio + "," + (info.mes + 1) + ",1)") {
      h.getRange(fMes + 1, 3).setFormula("=DATE(" + info.anio + "," + (info.mes + 1) + ",1)");
      cambio = true;
    }
    const fCobros = etiquetas.findIndex(e => e.indexOf("cobrospordepartamento") === 0);
    const fRenta = etiquetas.findIndex((e, i) => e.indexOf("rentadecasaclub") === 0 && (fCobros < 0 || i < fCobros));
    const fCasa = etiquetas.findIndex((e, i) => e.indexOf("ingresoporrentadecasaclub") === 0 && i > fCobros);
    if (fRenta >= 0 && fCasa >= 0) {
      let fTotal = -1;
      for (let i = fCasa + 2; i < etiquetas.length; i++) if (etiquetas[i].indexOf("total") === 0) { fTotal = i; break; }
      if (fTotal >= 0 && !h.getRange(fRenta + 1, 3).getFormula()) {
        h.getRange(fRenta + 1, 3).setFormula("=C" + (fTotal + 1));
        cambio = true;
      }
    }
    if (cambio) out.push(h.getName());
  });
  return out;
}

/* Crea solo la pestaña del mes siguiente al último (sirve también para enero del año que entra). */
function crearSiguienteMes() {
  const creadas = crearMeses_(1, true);
  aviso_(creadas.length ? "Pestaña creada: " + creadas[0] : "No se creó nada.");
}

function crearMeses_(cuantos, cruzarAnio) {
  const ss = hoja_();
  const hojas = hojasMes_(ss);
  if (!hojas.length) throw new Error("No hay ninguna pestaña mensual de la cual copiar (ENERO, FEBRERO…).");
  const creadas = [];
  let prev = hojas[hojas.length - 1];
  for (let k = 0; k < cuantos; k++) {
    let mes = prev.mes + 1, anio = prev.anio;
    if (mes > 11) { if (!cruzarAnio) break; mes = 0; anio++; }
    let nombre = MESES[mes];
    if (ss.getSheetByName(nombre)) nombre = MESES[mes] + " " + anio;
    if (ss.getSheetByName(nombre)) { prev = infoMes_(ss.getSheetByName(nombre)); continue; }

    const nueva = prev.hoja.copyTo(ss).setName(nombre);
    limpiarMes_(nueva, prev.hoja.getName(), mes, anio);
    ss.setActiveSheet(nueva);
    ss.moveActiveSheet(ss.getNumSheets());
    creadas.push(nombre);
    prev = infoMes_(nueva);
  }
  return creadas;
}

/* Deja una pestaña copiada en blanco: conserva formato, fórmulas, la lista de
   departamentos y los conceptos de gasto fijo; borra montos y comprobantes. */
function limpiarMes_(h, nombrePrev, mes, anio) {
  const vals = h.getRange(1, 2, FILAS, 1).getValues();
  const etiquetas = vals.map(f => norm_(f[0]));
  const filaDe = (clave, desde) => { for (let i = desde || 0; i < etiquetas.length; i++) if (etiquetas[i].indexOf(clave) === 0) return i + 1; return -1; };
  const hastaTotal = (inicio) => { for (let i = inicio + 2; i <= etiquetas.length; i++) if (etiquetas[i - 1].indexOf("total") === 0) return i - 1; return inicio + 2; };

  const fMes = filaDe("mesyano");
  h.getRange(fMes > 0 ? fMes : 5, 3).setFormula("=DATE(" + anio + "," + (mes + 1) + ",1)");   // día 1 exacto, sin hora ni zona horaria
  const ref = /\s/.test(nombrePrev) ? "'" + nombrePrev + "'" : nombrePrev;
  const fSaldo = filaDe("saldoinicial");
  if (fSaldo > 0) h.getRange(fSaldo, 3).setFormula("=" + ref + "!C" + saldoFinalFila_(etiquetas));

  const fCobros = filaDe("cobrospordepartamento");
  const desde = fCobros > 0 ? fCobros : 0;             // las secciones están después del bloque de cobros
  if (fCobros > 0) h.getRange(fCobros + 2, 3, hastaTotal(fCobros) - fCobros - 1, 2).clearContent();      // C:D cobros
  const fCasa = filaDe("ingresoporrentadecasaclub", desde);
  if (fCasa > 0) {
    const n = hastaTotal(fCasa) - fCasa - 1;
    h.getRange(fCasa + 2, 2, n, 3).clearContent();                                                         // B:D
    h.getRange(fCasa + 2, 2).setValue("Renta de casa club");
    const fRenta = filaDe("rentadecasaclub");
    if (fRenta > 0 && fRenta < fCobros) h.getRange(fRenta, 3).setFormula("=C" + (hastaTotal(fCasa) + 1));   // "(+) Renta de casa club" del resumen → fila TOTAL de la sección
  }
  const fFijos = filaDe("egresosfijos", desde);
  if (fFijos > 0) h.getRange(fFijos + 2, 3, hastaTotal(fFijos) - fFijos - 1, 2).clearContent();           // C:D, conceptos se quedan
  const fVar = filaDe("egresosvariables", desde);
  if (fVar > 0) h.getRange(fVar + 2, 2, hastaTotal(fVar) - fVar - 1, 3).clearContent();                   // B:D
  const fProy = filaDe("proyectosencurso", desde);
  if (fProy > 0) h.getRange(fProy + 2, 2, Math.max(1, FILAS - fProy - 2), 3).clearContent();              // B:D
}

function saldoFinalFila_(etiquetas) {
  for (let i = 0; i < etiquetas.length; i++) if (etiquetas[i].indexOf("saldofinaldelmes") === 0) return i + 1;
  return 18;
}

/* ============================ UTILIDADES ============================ */

function sinAcentos_(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function norm_(s) { return sinAcentos_(String(s == null ? "" : s)).toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function num_(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v == null ? "" : v).trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /[-−–]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  const lp = s.lastIndexOf("."), lc = s.lastIndexOf(",");
  if (lp !== -1 && lc !== -1) s = lp > lc ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  else if (lc !== -1) { const p = s.split(","); s = (p.length === 2 && p[1].length !== 3) ? p[0] + "." + p[1] : s.replace(/,/g, ""); }
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : 0;
}
function redondear_(v, dec) { const f = Math.pow(10, dec == null ? 2 : dec); return Math.round(v * f) / f; }
