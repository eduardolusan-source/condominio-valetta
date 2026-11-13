/* La Valetta · Revisión de la hoja (archivo «Revision» del proyecto de Apps Script).

   El día 5 de cada mes, a las 8 h, le llega SOLO A LA ADMINISTRACIÓN (admonV_: su correo y Config (sitio) →
   reporte_copia; a ti no) un correo con lo que conviene corregir en la hoja antes del reporte del día 10.
   Una tarjeta por hallazgo: qué pasa, dónde (pestaña y celda), cómo corregirlo y un botón que
   abre la hoja justo en esa celda. Al final, una o dos mejoras al diseño de la hoja que nacen de lo que pasó ese mes
   y la lista de lo que ya cuadra.
   Revisa en cada pestaña de mes: conceptos que quedaron como fecha o número, montos escritos como texto (el TOTAL no
   los suma), gastos sin concepto, gastos repetidos, montos negativos y gastos recientes sin comprobante. Además:
   la dirección del sitio en Config (sitio) (si las ligas del correo dan error), si el reporte les llega a los vecinos,
   el acceso a la hoja (si cualquiera con el enlace puede editarla) y todo lo que ya marca el semáforo.
   Solo lee la hoja: no cambia nada.

   Una sola vez: Ejecutar → instalarRevision. Ejecutar → revisarHoja se la manda ya a la
   Administración; Ejecutar → revisionPrueba te la manda solo a ti, para ver cómo queda. */

const REV_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const REV_Z = "America/Mexico_City";
/* Lo que cambia de un condominio a otro: dónde están las pestañas, las secciones de gastos y sus columnas. */
const REVC = {
  nombre: "La Valetta", remitente: "La Valetta · Administración", color: "#545a4f", filas: FILAS, colLibre: "E", dueno: false, quien: "",
  libro: () => hoja_(),
  norm: s => norm_(s),
  meses: (libro, hoyId) => hojasMes_(libro).filter(m => m.id <= hoyId && !m.hoja.isSheetHidden()).map(m => ({ hoja: m.hoja, id: m.id })),
  secciones: [
    { clave: "egresosfijos", nombre: "egresos fijos", concepto: 2, monto: 3, liga: 4 },
    { clave: "egresosvariables", nombre: "egresos variables", concepto: 2, monto: 3, liga: 4 }
  ],
  mejoraComprobante: "Sube el comprobante a la carpeta del mes en Drive y pega la liga en la columna D al capturar el gasto.",
  extra: (libro, add, marcas) => revVecinos_(libro, add, marcas, libro.getSheetByName(HOJA_CFG_V))
};

function instalarRevision() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "revisionMensual").forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("revisionMensual").timeBased().onMonthDay(5).atHour(8).inTimezone(REV_Z).create();
  Logger.log("Listo: la revisión de la hoja llega el día 5 de cada mes a las 8 h a la Administración: " + admonV_().join(", "));
}
function revisionMensual() { revisarHoja(); }
/* Arma la revisión y se la manda a la Administración (admonV_: su correo y Config (sitio) → reporte_copia).
   A ti no te llega, igual que el kit del día 10. */
function revisarHoja() { return revEnviar_(admonV_()); }
/* La misma revisión, pero solo a ti: para ver cómo queda sin mandarle nada a la Administración. */
function revisionPrueba() { return revEnviar_([Session.getEffectiveUser().getEmail()]); }
function revEnviar_(para) {
  if (!para.length) { Logger.log("No hay a quién mandar la revisión: revisa Config (sitio) → reporte_copia."); return null; }
  const r = revisionHoja_();
  const rojos = r.hallazgos.filter(h => h.nivel === "rojo").length, amarillos = r.hallazgos.filter(h => h.nivel === "amarillo").length;
  const asunto = "🔎 Revisión de la hoja · " + REVC.nombre + " · " + (rojos ? rojos + " por corregir" : amarillos ? amarillos + " por revisar" : "todo cuadra ✅");
  MailApp.sendEmail(para.join(","), asunto, revTexto_(r), { name: REVC.remitente, htmlBody: revHtml_(r) });
  Logger.log(asunto + " → " + para.join(", "));
  return { rojos: rojos, amarillos: amarillos, mejoras: r.mejoras.length, para: para.length };
}

/* ============================ LA REVISIÓN ============================ */

function revisionHoja_() {
  const libro = REVC.libro(), hallazgos = [], marcas = { sinliga: 0, variantes: null, ejemploFecha: "" };
  const add = (nivel, titulo, donde, que, como, url, boton, clave) => {
    const h = { nivel: nivel, titulo: titulo, donde: donde, que: que, como: como, url: url || "", boton: boton || "", clave: clave || "" };
    hallazgos.push(h);
    return h;
  };
  const hoyId = Utilities.formatDate(new Date(), REV_Z, "yyyy-MM");
  let meses = [];
  try { meses = REVC.meses(libro, hoyId); } catch (e) { add("amarillo", "No pude leer las pestañas de los meses", "", String(e.message || e), "Revisa que la hoja abra bien.", "", "", "error"); }
  const recientes = meses.slice(-3).map(m => m.id), conceptos = {};
  meses.forEach(m => { try { revSecciones_(m, add, marcas, recientes, conceptos); } catch (e) { add("amarillo", "No pude revisar «" + m.hoja.getName() + "»", "", String(e.message || e), "Revisa que la pestaña tenga sus secciones de gastos.", "", "", "error"); } });
  /* Los gastos sin comprobante van en una sola tarjeta, con la lista por mes y sección. */
  const sl = marcas.sinLigaLista || [];
  if (sl.length) {
    const n = sl.reduce((a, x) => a + x.n, 0), cols = sl.map(x => x.col).filter((c, i, a) => a.indexOf(c) === i);
    add("amarillo", n === 1 ? "Un gasto sin comprobante" : n + " gastos sin comprobante", "Últimos tres meses", "Los vecinos los ven en el sitio, pero no pueden abrir su comprobante.",
      "Pega la liga del archivo en Drive en la columna " + cols.join(" o ") + "." + REVC.quien, sl[0].url, sl[0].celda, "sinliga").lista = sl.map(x => x.texto);
    marcas.sinliga = n;
  }
  /* El mismo gasto escrito de dos formas distintas (para la mejora de la lista desplegable). */
  Object.keys(conceptos).some(k => { const v = Object.keys(conceptos[k]); if (v.length > 1) { marcas.variantes = v.slice(0, 2); return true; } return false; });
  try { REVC.extra(libro, add, marcas); } catch (e) { add("amarillo", "Una parte de la revisión falló", "", String(e.message || e), "Vuelve a correr revisarHoja; si se repite, avísale a Claude.", "", "", "error"); }
  try { revAcceso_(libro, add, marcas); } catch (e) { /* sin permiso para ver el acceso */ }
  const orden = { rojo: 0, amarillo: 1 };
  hallazgos.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  return { hallazgos: hallazgos, mejoras: revMejoras_(marcas, hoyId), ok: revCuadra_(hallazgos, marcas), notas: marcas.notas || [], url: "https://docs.google.com/spreadsheets/d/" + libro.getId() + "/edit", fecha: new Date() };
}

/* Revisa las secciones de gastos de una pestaña de mes, renglón por renglón. */
function revSecciones_(m, add, marcas, recientes, conceptos) {
  const h = m.hoja, nombre = h.getName(), filas = Math.min(h.getLastRow(), REVC.filas);
  if (filas < 3) return;
  const ancho = Math.max.apply(null, REVC.secciones.map(s => Math.max(s.concepto, s.monto, s.liga || 0, s.proveedor || 0)));
  const vals = h.getRange(1, 1, filas, ancho).getValues();
  const et = vals.map(f => REVC.norm(f[1]));
  const iCobros = et.findIndex(e => e.indexOf("cobrospordepartamento") === 0);
  const vacio = v => v === "" || v == null || (typeof v === "string" && !v.trim());
  const esFecha = v => Object.prototype.toString.call(v) === "[object Date]";
  REVC.secciones.forEach(sec => {
    const i0 = et.findIndex((e, i) => i > iCobros && e.indexOf(sec.clave) === 0);
    if (i0 < 0) return;
    const ligas = sec.liga ? revLigas_(h, i0 + 1, filas - i0, sec.liga) : {};
    const donde = nombre + " · " + sec.nombre, vistos = {}, sinLiga = [];
    let vacias = 0;
    for (let i = i0 + 2; i < filas; i++) {
      if (et[i].indexOf("total") === 0) break;
      const fila = i + 1, f = vals[i], conc = f[sec.concepto - 1], monto = f[sec.monto - 1], prov = sec.proveedor ? f[sec.proveedor - 1] : "";
      if (vacio(conc) && vacio(monto) && vacio(prov)) { if (++vacias >= 8) break; continue; }
      vacias = 0;
      const cC = revCol_(sec.concepto) + fila, cM = revCol_(sec.monto) + fila;
      const num = typeof monto === "number" ? monto : 0, dinero = num ? " por " + revPesos_(num) : "";
      const fechaEn = esFecha(conc) ? [conc, cC] : esFecha(prov) ? [prov, revCol_(sec.proveedor) + fila] : null;
      if (fechaEn) {
        add("rojo", "Un concepto quedó como fecha", donde + " · celda " + fechaEn[1], "Donde va qué se pagó dice «" + revFecha_(fechaEn[0]) + "»" + dinero + ". En el sitio y en el reporte sale como «Gasto sin concepto».",
          "Escribe qué se pagó y a quién; si quieres la fecha, ponla dentro del texto." + REVC.quien, revEnlace_(h, fechaEn[1]), fechaEn[1], "fecha");
        if (!marcas.ejemploFecha) marcas.ejemploFecha = nombre + " " + fechaEn[1];
      } else if (typeof conc === "number" && vacio(prov)) {
        add("rojo", "Un concepto quedó como número", donde + " · celda " + cC, "Donde va qué se pagó dice «" + conc + "»" + dinero + ".", "Escribe qué se pagó y a quién." + REVC.quien, revEnlace_(h, cC), cC, "numero");
      } else if (vacio(conc) && vacio(prov) && num) {
        add("rojo", "Un gasto sin concepto", donde + " · celda " + cC, "Hay " + revPesos_(num) + " sin decir qué se pagó.", "Escribe qué se pagó y a quién." + REVC.quien, revEnlace_(h, cC), cC, "sinconcepto");
      }
      if (typeof monto === "string" && monto.trim()) {
        add("rojo", "Un monto escrito como texto", donde + " · celda " + cM, "Dice «" + monto.trim() + "»: la hoja lo trata como texto y el TOTAL no lo suma.", "Escribe solo el número, sin letras, espacios ni signo de pesos." + REVC.quien, revEnlace_(h, cM), cM, "texto");
        marcas.texto = true;
      }
      if (num < 0) add("amarillo", "Un gasto negativo", donde + " · celda " + cM, "El monto es " + revPesos_(num) + ".", "Si fue una devolución, anótala como ingreso; si no, quita el signo menos." + REVC.quien, revEnlace_(h, cM), cM, "negativo");
      if (num > 0 && typeof conc === "string" && conc.trim()) {
        const k = REVC.norm(conc) + "|" + REVC.norm(prov) + "|" + Math.round(num * 100);
        /* Repetidos: solo en los meses recientes y en secciones donde dos pagos iguales no son lo normal (p. ej. pipas). */
        if (vistos[k] && sec.repetidos !== false && recientes.indexOf(m.id) >= 0) add("amarillo", "¿Un gasto repetido?", donde + " · filas " + vistos[k] + " y " + fila, "«" + conc.trim() + "»" + dinero + " aparece dos veces en el mes.", "Si se pagó una sola vez, borra uno de los dos." + REVC.quien, revEnlace_(h, revCol_(sec.concepto) + fila), revCol_(sec.concepto) + fila, "repetido");
        else vistos[k] = fila;
        const base = REVC.norm(conc.split(/\s+[·\-–]\s+|\s*\(/)[0]);
        if (base) { conceptos[base] = conceptos[base] || {}; conceptos[base][conc.trim()] = 1; }
      }
      if (num > 0 && sec.liga && !ligas[fila] && recientes.indexOf(m.id) >= 0) sinLiga.push(fila);
    }
    if (sinLiga.length) {
      const c = revCol_(sec.liga) + sinLiga[0];
      (marcas.sinLigaLista = marcas.sinLigaLista || []).push({ texto: donde + ": " + (sinLiga.length === 1 ? "fila " : "filas ") + revLista_(sinLiga), url: revEnlace_(h, c), celda: c, n: sinLiga.length, col: revCol_(sec.liga) });
    }
  });
}

/* Ligas de comprobante de una columna: texto con liga, fórmula HYPERLINK o la dirección escrita. */
function revLigas_(h, fila, n, col) {
  const out = {};
  if (n < 1) return out;
  const r = h.getRange(fila, col, n, 1), ricos = r.getRichTextValues(), formulas = r.getFormulas(), valores = r.getValues();
  for (let i = 0; i < n; i++) {
    let url = ricos[i][0] && ricos[i][0].getLinkUrl();
    if (!url && ricos[i][0]) { const runs = ricos[i][0].getRuns(); for (let j = 0; j < runs.length && !url; j++) url = runs[j].getLinkUrl(); }
    if (!url) { const mm = /HYPERLINK\(\s*"([^"]+)"/i.exec(formulas[i][0] || ""); if (mm) url = mm[1]; }
    if (!url && /^https?:\/\//.test(String(valores[i][0]).trim())) url = String(valores[i][0]).trim();
    if (url) out[fila + i] = url;
  }
  return out;
}

/* Cualquiera con el enlace puede editar la hoja: se avisa. */
function revAcceso_(libro, add, marcas) {
  const f = DriveApp.getFileById(libro.getId()), acc = f.getSharingAccess();
  if ((acc === DriveApp.Access.ANYONE_WITH_LINK || acc === DriveApp.Access.ANYONE) && f.getSharingPermission() === DriveApp.Permission.EDIT) {
    add("amarillo", "La hoja se edita con el enlace", "Botón Compartir · Acceso general", "Cualquiera que tenga el enlace puede abrirla y cambiarla" + (REVC.sensible ? REVC.sensible(libro) : "") + ".",
      REVC.dueno ? "Si solo tú la editas, déjala en «Restringido» (Compartir → Acceso general)." : "Pídele a quien es dueño de la hoja que la deje en «Restringido» o «Lector».", "https://docs.google.com/spreadsheets/d/" + libro.getId() + "/edit", "la hoja", "acceso");
  } else marcas.accesoOk = true;
}

/* Los puntos del semáforo, como tarjetas: los del mismo tipo van juntos, con liga cuando dicen la pestaña y la fila. */
function revSemaforo_(s, libro, add, marcas, niveles) {
  if (!s || !s.puntos) return;
  const tipos = [
    [/gasto de ejemplo/i, "Gastos de ejemplo de la plantilla", "Bórralos si no se pagaron."],
    [/triple del promedio|fuga/i, "Consumo de agua fuera de lo normal", "Compáralo con la foto del medidor antes del día 10."],
    [/clave/i, "Claves de ejemplo", "Cámbialas en Config por unas que nadie adivine."],
    [/lectura/i, "Lecturas de agua por revisar", "Revisa las lecturas del mes en la pestaña Agua."],
    [/saldo inicial/i, "Un saldo que no encadena", "El saldo inicial debe ser el saldo final del mes anterior."],
    [/dos pestañas|mismas cifras|mismos cobros|copiada|copió/i, "Pestaña repetida o copiada", "Deja una sola pestaña por mes, con sus propias cifras."],
    [/texto donde va un monto/i, "Texto donde va un monto", "Escribe solo números en los cobros."],
    [/más de 3 cuotas/i, "Cobros de varias cuotas en un mes", "Si pagó varios meses, anota cada uno en la pestaña de su mes."],
    [/bandeja|más de una semana/i, "Pagos esperando en la bandeja", "Confírmalos o recházalos en bandeja.html."],
    [/recibo/i, "Recibo de agua sin capturar", "Captúralo en lecturas.html."],
    [/reserva/i, "Reservas de casa club por confirmar", "Confírmalas o recházalas."],
    [/cobranza/i, "Pocos pagos en el mes", "Revisa que estén capturados todos los cobros del mes."],
    [/sin capturar|no tiene (cobros|pestaña)|no hay pestaña/i, "Un mes sin capturar", "Captura los cobros y gastos del mes."]
  ];
  const grupos = [], porTitulo = {};
  s.puntos.forEach(p => {
    const nivel = niveles[p.nivel], texto = String(p.texto || "").trim();
    if (!texto) return;
    if (!nivel) { (marcas.notas = marcas.notas || []).push(texto); return; }
    if (/sin liga de comprobante|sin comprobante/i.test(texto)) return;        // ya va en «gastos sin comprobante», con liga
    const t = tipos.find(x => x[0].test(texto)) || [null, "Revisa esto", "Revísalo en la hoja."];
    let g = porTitulo[t[1]];
    if (!g) { g = porTitulo[t[1]] = { nivel: nivel, titulo: t[1], como: t[2], textos: [], url: "", boton: "" }; grupos.push(g); }
    if (nivel === "rojo") g.nivel = "rojo";
    g.textos.push(texto.replace(/^¿[^?]*\?\s*/, ""));            // «¿Gasto de ejemplo de la plantilla? julio · …» → «julio · …»
    const mm = /^(?:¿[^?]*\?\s*)?«?([^·«»]+?)»?\s+·.*?·\s*fila\s+(\d+)/i.exec(texto);
    if (mm && !g.url) { const h = libro.getSheetByName(mm[1].trim()); if (h) { g.boton = "B" + mm[2]; g.url = revEnlace_(h, g.boton); } }
  });
  grupos.forEach(g => {
    const t = add(g.nivel, g.titulo, "Semáforo de la hoja", g.textos.length === 1 ? g.textos[0] : "Son " + g.textos.length + ":", g.como + REVC.quien, g.url, g.boton, "semaforo");
    if (g.textos.length > 1) t.lista = g.textos;
  });
  marcas.semaforo = true;
}

/* Mejoras al diseño de la hoja: las que nacen de lo que pasó; si faltan, una general que rota cada mes. */
function revMejoras_(marcas, hoyId) {
  const m = [];
  if (marcas.ejemploFecha) m.push({ titulo: "Una columna para la fecha del gasto", porque: "Este mes una fecha quedó en la columna del concepto (" + marcas.ejemploFecha + ").",
    que: "Escribe «Fecha» como encabezado en la columna " + REVC.colLibre + " de las secciones de gastos y anota ahí el día del pago. El sitio no lee esa columna: no se mueve nada." });
  if (marcas.variantes) m.push({ titulo: "El mismo gasto, siempre con el mismo nombre", porque: "«" + marcas.variantes[0] + "» y «" + marcas.variantes[1] + "» son el mismo gasto escrito de dos formas; así cuesta compararlo mes con mes.",
    que: "Pon una lista desplegable en la columna de conceptos (Datos → Validación de datos → Desplegable) con los gastos de siempre." });
  if (marcas.texto) m.push({ titulo: "Que los montos solo acepten números", porque: "Este mes un monto quedó como texto y el TOTAL no lo sumó.",
    que: "Selecciona la columna de montos de los gastos → Datos → Validación de datos → «Es un número» → «Rechazar la entrada»." });
  if (marcas.sinliga >= 3) m.push({ titulo: "El comprobante, al momento de capturar", porque: marcas.sinliga + " gastos de los últimos tres meses no tienen comprobante.", que: REVC.mejoraComprobante });
  if (marcas.pagodoble) m.push({ titulo: "Que la página avise antes de un pago repetido", porque: "Este mes entró un pago dos veces con minutos de diferencia.",
    que: "pago.html preguntaría «Ya reportaste " + marcas.pagodoble + " hoy, ¿es otro pago?» antes de enviar. Pídeselo a Claude." });
  const generales = [
    { titulo: "Protege las fórmulas de los totales", porque: "Una fórmula borrada por accidente cambia el saldo sin que nadie lo note.", que: "Datos → Proteger hojas y rangos → elige los renglones TOTAL y el resumen → «Mostrar una advertencia»." },
    { titulo: "Que se vea qué se captura y qué se calcula", porque: "Si las celdas de captura y las de fórmula se ven igual, es fácil escribir donde no va.", que: "Deja en azul solo lo que se captura (conceptos y montos) y en gris lo que la hoja calcula." },
    { titulo: "Una pestaña nueva cada mes, desde la plantilla", porque: "Copiar el mes anterior arrastra sus cifras y luego hay que borrarlas.", que: "Crea cada mes desde la plantilla vacía" + (REVC.plantilla ? " (" + REVC.plantilla + ")" : "") + " en lugar de copiar el mes anterior." }
  ];
  const n = parseInt(hoyId.slice(5), 10);
  for (let i = 0; m.length < 2 && i < generales.length; i++) m.push(generales[(n + i) % generales.length]);
  return m.slice(0, 2);
}

/* Lo que se revisó y salió bien. */
function revCuadra_(hallazgos, marcas) {
  const hay = c => hallazgos.some(h => h.clave === c);
  const ok = [];
  if (!hay("fecha") && !hay("numero") && !hay("sinconcepto")) ok.push("todos los gastos dicen qué se pagó");
  if (!hay("texto")) ok.push("los montos son números");
  if (!hay("repetido")) ok.push("ningún gasto repetido");
  if (!hay("sinliga")) ok.push("comprobantes de los últimos tres meses");
  if (marcas.semaforo && !hay("semaforo")) ok.push("saldos, pestañas y capturas del semáforo");
  if (marcas.accesoOk) ok.push("acceso a la hoja");
  (marcas.okExtra || []).forEach(x => ok.push(x));
  return ok;
}

/* ============================ AYUDAS ============================ */

function revEnlace_(h, celda) { return "https://docs.google.com/spreadsheets/d/" + h.getParent().getId() + "/edit#gid=" + h.getSheetId() + "&range=" + celda; }
function revCol_(n) { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function revPesos_(v) { const a = Math.abs(v), c = Math.round(a * 100) % 100; return (v < 0 ? "−$" : "$") + Math.floor(a).toLocaleString("es-MX") + (c ? "." + ("0" + c).slice(-2) : ""); }
function revFecha_(d) { const p = Utilities.formatDate(d, REV_Z, "d-M-yyyy").split("-"); return p[0] + " de " + REV_MESES[Number(p[1]) - 1] + " de " + p[2]; }
function revLista_(l) { return l.length > 1 ? l.slice(0, -1).join(", ") + " y " + l[l.length - 1] : String(l[0]); }
/* Un texto de varios renglones (puntos del semáforo del mismo tipo) se muestra como lista. */
function revQue_(s) { const l = String(s).split(/\n/); return l.length < 2 ? revEsc_(s) : "• " + l.map(revEsc_).join("<br>• "); }
function revEsc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
/* El renglón de una clave en una pestaña de configuración (columna A), o 0. */
function revFilaClave_(h, clave) {
  if (!h || h.getLastRow() < 1) return 0;
  const v = h.getRange(1, 1, h.getLastRow(), 1).getValues();
  for (let i = 0; i < v.length; i++) if (String(v[i][0]).trim() === clave) return i + 1;
  return 0;
}

/* ============================ CORREO ============================ */

function revTexto_(r) {
  const l = ["Revisión de la hoja · " + REVC.nombre, ""];
  r.hallazgos.forEach(h => l.push((h.nivel === "rojo" ? "🔴 " : "🟡 ") + h.titulo + (h.donde ? " · " + h.donde : "") + "\n   " + h.que +
    (h.lista ? h.lista.map(x => "\n   • " + x).join("") : "") + "\n   Cómo: " + h.como + (h.url ? "\n   " + h.url : "")));
  if (!r.hallazgos.length) l.push("✅ Todo cuadra.");
  r.mejoras.forEach(m => l.push("💡 " + m.titulo + ": " + m.que));
  return l.join("\n");
}
function revHtml_(r) {
  const F = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", G = "Georgia,'Times New Roman',serif";
  const rojos = r.hallazgos.filter(h => h.nivel === "rojo"), amarillos = r.hallazgos.filter(h => h.nivel === "amarillo");
  const chip = (fondo, color, t) => '<span style="display:inline-block;white-space:nowrap;background:' + fondo + ";color:" + color + ';border-radius:999px;padding:6px 12px;font-size:13px;font-weight:800;margin:0 6px 6px 0">' + t + "</span>";
  const tarjeta = h => {
    const c = h.nivel === "rojo" ? "#b3261e" : "#e0a400";
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #e1e0d9;border-left:5px solid ' + c + ';border-radius:14px;margin:0 0 12px"><tr><td style="padding:14px;font-family:' + F + '">' +
      '<div style="font-size:16px;font-weight:800;color:#0b0b0b">' + revEsc_(h.titulo) + "</div>" +
      (h.donde ? '<div style="font-size:12px;color:#52514e;margin-top:3px">📍 ' + revEsc_(h.donde) + "</div>" : "") +
      '<div style="font-size:14px;line-height:1.5;color:#333333;margin-top:8px">' + revQue_(h.que) + "</div>" +
      (h.lista && h.lista.length ? '<div style="font-size:14px;line-height:1.6;color:#333333;margin-top:4px">' + h.lista.map(x => "• " + revEsc_(x)).join("<br>") + "</div>" : "") +
      '<div style="font-size:14px;line-height:1.5;color:#1d5a2a;background:#e3f2e6;border-radius:8px;padding:8px 10px;margin-top:8px"><b>Cómo:</b> ' + revEsc_(h.como) + "</div>" +
      (h.url ? '<div style="margin-top:10px"><a href="' + revEsc_(h.url) + '" style="display:inline-block;background:' + REVC.color + ';color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:10px 16px;border-radius:999px">Abrir ' + revEsc_(h.boton || "la hoja") + " ↗</a></div>" : "") +
      "</td></tr></table>";
  };
  const grupo = (lista, fondo, color, titulo, nota) => !lista.length ? "" :
    '<div style="margin:16px 0 10px;font-family:' + F + '"><span style="display:inline-block;background:' + fondo + ";color:" + color + ';font-size:13px;font-weight:800;border-radius:999px;padding:5px 12px">' + titulo + " · " + lista.length + '</span> <span style="font-size:12px;color:#898781">' + nota + "</span></div>" +
    lista.slice(0, 12).map(tarjeta).join("") + (lista.length > 12 ? '<div style="font-size:13px;color:#898781;margin:-4px 0 10px">… y ' + (lista.length - 12) + " más.</div>" : "");
  const mejoras = r.mejoras.map(m => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:#fbf3e2;border:1px solid #f0e2c0;border-radius:14px;margin:0 0 12px"><tr><td style="padding:14px;font-family:' + F + '">' +
    '<div style="font-size:16px;font-weight:800;color:#3d2a0c">💡 ' + revEsc_(m.titulo) + "</div>" +
    '<div style="font-size:14px;line-height:1.5;color:#3d2a0c;margin-top:6px"><b>Por qué:</b> ' + revEsc_(m.porque) + "</div>" +
    '<div style="font-size:14px;line-height:1.5;color:#3d2a0c;margin-top:4px"><b>Qué cambia:</b> ' + revEsc_(m.que) + "</div></td></tr></table>").join("");
  const fecha = r.fecha, p = Utilities.formatDate(fecha, REV_Z, "d-M").split("-");
  return '<div style="background:#f8f7f3;padding:18px 8px;font-family:' + F + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="max-width:620px;margin:0 auto;border-collapse:separate">' +
    '<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:' + REVC.color + ';border-radius:18px 18px 0 0"><tr><td style="padding:22px 20px 18px;font-family:' + F + '">' +
      '<div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;color:#d6e2ee">' + revEsc_(REVC.nombre) + " · para la Administración</div>" +
      '<div style="font-family:' + G + ';font-size:27px;line-height:1.15;color:#ffffff;margin-top:6px">Revisión de la hoja</div>' +
      '<div style="font-size:15px;line-height:1.45;color:#e6edf3;margin-top:6px">' + p[0] + " de " + REV_MESES[Number(p[1]) - 1] + " · " + (r.hallazgos.length ? "lo que conviene corregir antes del reporte del día 10." : "todo cuadra: la hoja está lista para el reporte del día 10.") + "</div>" +
      '<div style="margin-top:14px">' + (rojos.length ? chip("#fde7e6", "#8c1d18", "🔴 " + rojos.length + " por corregir") : "") + (amarillos.length ? chip("#fff3dc", "#7a4a00", "🟡 " + amarillos.length + " por revisar") : "") +
        (!r.hallazgos.length ? chip("#e3f2e6", "#1d5a2a", "✅ todo cuadra") : "") + (r.mejoras.length ? chip("#eef1f5", "#1d3f63", "💡 " + r.mejoras.length + (r.mejoras.length === 1 ? " mejora" : " mejoras")) : "") + "</div>" +
    "</td></tr></table></td></tr>" +
    '<tr><td style="background:#ffffff;border:1px solid #e1e0d9;border-top:0;border-radius:0 0 18px 18px;padding:12px 14px 20px">' +
      grupo(rojos, "#fde7e6", "#b3261e", "Por corregir", "cambian lo que ven los vecinos") +
      grupo(amarillos, "#fff3dc", "#a86a00", "Por revisar", "puede estar bien, pero vale la pena ver") +
      (mejoras ? '<div style="margin:16px 0 10px;font-family:' + F + '"><span style="display:inline-block;background:#eef1f5;color:#1d3f63;font-size:13px;font-weight:800;border-radius:999px;padding:5px 12px">Mejoras a la hoja</span> <span style="font-size:12px;color:#898781">nacen de lo que pasó este mes</span></div>' + mejoras : "") +
      (r.ok.length ? '<div style="background:#e3f2e6;border-radius:14px;padding:12px 14px;margin-top:14px;font-family:' + F + '"><div style="font-size:14px;font-weight:800;color:#1d5a2a">✅ Lo que ya cuadra</div><div style="font-size:14px;line-height:1.7;color:#1d5a2a;margin-top:4px">' + revEsc_(r.ok.map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" · ")) + "</div></div>" : "") +
      (r.notas.length ? '<div style="font-size:13px;line-height:1.5;color:#52514e;margin-top:12px;font-family:' + F + '">ℹ️ ' + r.notas.map(revEsc_).join("<br>ℹ️ ") + "</div>" : "") +
      '<div style="font-size:12px;line-height:1.55;color:#898781;margin-top:16px;padding-top:12px;border-top:1px solid #efeee8;font-family:' + F + '">🔒 Les llega solo a la Administración, cada día 5 a las 8 h. Los botones abren la hoja justo en la celda. ' +
        '<a href="' + revEsc_(r.url) + '" style="color:#898781">Abrir la hoja</a>.</div>' +
    "</td></tr></table></div>";
}

/* ============================ LO PROPIO DEL SITIO ============================ */

/* El semáforo, la dirección del sitio (si las ligas del correo dan error) y si el reporte les llega a los vecinos. */
function revVecinos_(libro, add, marcas, hc) {
  if (typeof salud_ === "function") revSemaforo_(salud_(), libro, add, marcas, { rojo: "rojo", amarillo: "amarillo" });
  const cfg = typeof cfgV_ === "function" ? cfgV_() : {}, u = String(cfg.sitio_url || "").trim();
  const fu = revFilaClave_(hc, "sitio_url"), fe = revFilaClave_(hc, "reporte_envio");
  if (u && (/\.html?$/i.test(u.replace(/\/+$/, "")) || !/^https:\/\//i.test(u) || /\s/.test(u)))
    add("rojo", "Las ligas del reporte dan error", "Config (sitio) · sitio_url", "La dirección del sitio es «" + u + "»: los botones del correo llevan a una página que no existe.",
      "Déjala sin «/index.html» al final (como https://…/condominio-…)." + (REVC.sitioQuien || ""), fu && !REVC.sitioQuien ? revEnlace_(hc, "B" + fu) : "", fu ? "B" + fu : "", "sitio");
  else (marcas.okExtra = marcas.okExtra || []).push("ligas del reporte");
  if (!/^s[ií]/i.test(String(cfg.reporte_envio || "")))
    add("amarillo", "El reporte no les llega a los vecinos", "Config (sitio) · reporte_envio", "Está en «" + String(cfg.reporte_envio || "vacío") + "»: el día 10 solo sale el kit para la Administración y los vecinos no reciben el reporte.",
      "Cámbialo a «sí» si quieres que les llegue." + (REVC.sitioQuien || ""), fe && !REVC.sitioQuien ? revEnlace_(hc, "B" + fe) : "", fe ? "B" + fe : "", "envio");
  else (marcas.okExtra = marcas.okExtra || []).push("el reporte del día 10 les llega a los vecinos");
}

