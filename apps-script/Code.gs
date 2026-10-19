/* Condominio La Valetta · Finanzas en vivo
   Apps Script ligado a la hoja "Valetta-Captura-Mensual" (Extensiones → Apps Script).
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

function texto_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }

/* Para probar desde el editor: Ejecutar → probar, y ver el registro. */
function probar() {
  const d = armarFinanzas_();
  Logger.log(JSON.stringify(d, null, 2));
  return d;
}

/* ============================ LECTURA ============================ */

function armarFinanzas_() {
  const ss = SpreadsheetApp.getActive();
  const hojas = hojasMes_(ss);
  if (!hojas.length) throw new Error("No encuentro pestañas de meses (ENERO, FEBRERO…).");

  const meses = [];
  const proyectos = {};
  let unidades = 0, cuota = 0;
  hojas.forEach(h => {
    const m = leerMes_(h);
    if (!m.capturado) return;
    unidades = m.unidades || unidades;
    cuota = m.cuota || cuota;
    m.proyectos.forEach(p => { proyectos[p.nombre.toLowerCase()] = p; });
    meses.push(m);
  });
  if (!meses.length) throw new Error("Ninguna pestaña mensual tiene datos todavía.");

  /* Mora acumulada: saldo por unidad = pagado en el año − cuotas transcurridas.
     Se calcula aquí, con los cobros por departamento, y SOLO salen las sumas. */
  const saldos = {};
  let anioSaldos = null;
  meses.forEach(m => {
    if (m.anio !== anioSaldos) { anioSaldos = m.anio; Object.keys(saldos).forEach(k => delete saldos[k]); }
    m.pagosPorUnidad.forEach(([depto, pagado]) => { saldos[depto] = (saldos[depto] || 0) + pagado - m.cuota; });
    const vals = Object.keys(saldos).map(k => saldos[k]);
    const neg = vals.filter(v => v < -0.5), pos = vals.filter(v => v > 0.5);
    m.mora = {
      acumulada: redondear_(-neg.reduce((a, b) => a + b, 0)),
      unidades: neg.length,
      adelantos: redondear_(pos.reduce((a, b) => a + b, 0)),
      unidadesAdelanto: pos.length
    };
    delete m.pagosPorUnidad;   // no sale del script
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

/* ============================ INSTALACIÓN ============================ */

/* Crea las pestañas que faltan hasta diciembre del año del último mes. */
function instalar() {
  const creadas = crearMeses_(12);
  SpreadsheetApp.getActive().toast(creadas.length ? "Pestañas creadas: " + creadas.join(", ") : "No faltaba ningún mes.", "La Valetta", 10);
  Logger.log(creadas.length ? "Creadas: " + creadas.join(", ") : "No faltaba ningún mes.");
}

/* Crea solo la pestaña del mes siguiente al último (sirve también para enero del año que entra). */
function crearSiguienteMes() {
  const creadas = crearMeses_(1, true);
  SpreadsheetApp.getActive().toast(creadas.length ? "Pestaña creada: " + creadas[0] : "No se creó nada.", "La Valetta", 10);
}

function crearMeses_(cuantos, cruzarAnio) {
  const ss = SpreadsheetApp.getActive();
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

  h.getRange("C5").setValue(new Date(anio, mes, 1));
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
