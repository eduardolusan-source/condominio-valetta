/* Sección financiera — Condominio La Valetta */
(function () {
  "use strict";

  /* ---------- Portón de acceso ---------- */
  const KEY_HASH = "16740bf13991fe083fbe5820cc8da08a5d88e5a48f44a3cfcc283c27b2797ba7";
  const gate = document.getElementById("gate");
  const content = document.getElementById("content");

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function unlock() {
    gate.hidden = true;
    content.hidden = false;
    sessionStorage.setItem("valettaFin", "1");
    render();
  }

  document.getElementById("gateForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const err = document.getElementById("gateError");
    if (!window.crypto || !crypto.subtle) {
      err.textContent = "Abre el sitio desde su dirección https para poder validar la clave.";
      return;
    }
    const val = document.getElementById("gateKey").value.trim();
    if ((await sha256(val)) === KEY_HASH) { unlock(); }
    else {
      err.textContent = "Clave incorrecta. Solicítala a la administración.";
      document.getElementById("gateKey").value = "";
      document.getElementById("gateKey").focus();
    }
  });

  /* ---------- Origen de datos en vivo ----------
     La página se alimenta de la hoja de Google Sheets de la Administración.
     Para que funcione hay que publicar DOS pestañas como CSV
     (en la hoja: Archivo → Compartir → Publicar en la web → elegir la
     pestaña → "Valores separados por comas (.csv)") y pegar aquí las URLs.

     1) RESUMEN_URL — una fila por mes, con estos encabezados (el orden no
        importa; mayúsculas, acentos y espacios tampoco):
        Mes ID | Mes | Corto | Saldo inicial | Saldo final |
        Mantenimiento cobrado | Agua cobrada | Casa club cobrada |
        Gastos fijos | Gastos variables | Unidades que pagaron |
        % cobranza | Unidades morosas | Mora acumulada | Unidades con mora |
        Pagos adelantados | Unidades adelantadas
        (las cuatro últimas son opcionales; ver README para calcularlas)
        "Mes ID" va como 2026-09. Cada celda puede ser una fórmula que apunte
        a la pestaña del mes, así la fila se llena sola.

     2) DETALLE_URL (opcional) — el desglose por concepto, una fila por
        gasto: Mes ID | Tipo | Concepto | Monto | Comprobante
        Tipo es "fijo" o "variable"; Comprobante es la liga de Drive, si hay.

     Si una URL queda vacía o la descarga falla, se usa js/data.js.

     REGLA: lo publicado es legible por cualquiera que tenga la URL; la clave
     del sitio no lo protege. Esas pestañas NUNCA llevan datos por
     departamento: solo agregados. */
  const RESUMEN_URL = "";
  const DETALLE_URL = "";

  /* ---------- Utilidades ---------- */
  const C = VALETTA;
  const M = C.meses;
  const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  const mxn2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
  const fmt = v => mxn.format(v);
  const fmt2 = v => mxn2.format(v);
  const kfmt = v => "$" + Math.round(v / 1000) + " mil";
  const ingresosDe = m => m.ingresos.manto + m.ingresos.agua + m.ingresos.casaClub;
  const egresosDe = m => m.egresos.fijos + m.egresos.variables;
  const resultadoDe = m => ingresosDe(m) - egresosDe(m);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const sum = arr => arr.reduce((a, b) => a + b, 0);
  const prom = arr => arr.length ? sum(arr) / arr.length : 0;
  const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); return Math.ceil(v / p) * p; };

  const tip = document.getElementById("vizTip");
  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.style.display = "block";
    const w = tip.offsetWidth, sw = window.innerWidth;
    tip.style.left = Math.min(x + 14, sw - w - 10) + "px";
    tip.style.top = (y + 16) + "px";
  }
  function hideTip() { tip.style.display = "none"; }

  function setText(id, t) { const el = document.getElementById(id); if (el) el.textContent = t; }
  function rango() {
    if (!M.length) return "";
    const a = M[0], b = M[M.length - 1];
    return a.id === b.id ? a.nombre + " de " + C.anio : a.nombre.toLowerCase() + " a " + b.nombre.toLowerCase() + " de " + C.anio;
  }

  /* ---------- Datos del mes ---------- */
  let mesIdx = M.length - 1;

  function renderChips() {
    const box = document.getElementById("chips");
    box.innerHTML = "";
    M.forEach((m, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = m.nombre;
      b.className = i === mesIdx ? "on" : "";
      b.addEventListener("click", () => { mesIdx = i; renderMes(); renderChips(); setText("tituloMes", "Detalle de " + mesMin(m) + " " + C.anio); if (history.replaceState) history.replaceState(null, "", "#mes-" + m.id); });
      box.appendChild(b);
    });
  }

  function deltaTxt(actual, previo, menosEsMejor) {
    if (previo == null) return "";
    const d = actual - previo;
    const mejora = menosEsMejor ? d <= 0 : d >= 0;
    const cls = mejora ? "pos" : "neg";
    const flecha = d >= 0 ? "▲" : "▼";
    return '<div class="d"><span class="' + cls + '" style="font-weight:600">' + flecha + " " + fmt(Math.abs(d)) + "</span> vs. mes anterior</div>";
  }

  function renderMes() {
    const m = M[mesIdx];
    const prev = mesIdx > 0 ? M[mesIdx - 1] : null;
    const ing = ingresosDe(m), egr = egresosDe(m), res = resultadoDe(m);

    document.getElementById("statCards").innerHTML =
      '<div class="stat"><div class="k">Ingresos · ' + esc(m.nombre) + '</div><div class="v">' + fmt(ing) + "</div>" +
      deltaTxt(ing, prev && ingresosDe(prev)) + "</div>" +
      '<div class="stat"><div class="k">Egresos · ' + esc(m.nombre) + '</div><div class="v">' + fmt(egr) + "</div>" +
      deltaTxt(egr, prev && egresosDe(prev), true) + "</div>" +
      '<div class="stat"><div class="k">Resultado del mes</div><div class="v ' + (res >= 0 ? "pos" : "neg") + '">' + fmt2(res) + '</div><div class="d">ingresos menos egresos</div></div>' +
      '<div class="stat"><div class="k">Saldo al cierre</div><div class="v ' + (m.saldoFin >= 0 ? "pos" : "neg") + '">' + fmt2(m.saldoFin) + '</div><div class="d">inició el mes en ' + fmt2(m.saldoIni) + "</div></div>";

    let ingRows = "<tr><td>Cuotas de mantenimiento</td><td class='num'>" + fmt2(m.ingresos.manto) + "</td></tr>";
    if (m.ingresos.agua) ingRows += "<tr><td>Cuota de agua de áreas comunes</td><td class='num'>" + fmt2(m.ingresos.agua) + "</td></tr>";
    ingRows += "<tr><td>Casa club (limpieza y fondo de mantenimiento)</td><td class='num'>" + fmt2(m.ingresos.casaClub) + "</td></tr>";
    document.getElementById("tIngresos").innerHTML =
      "<thead><tr><th>Concepto</th><th class='num'>Monto</th></tr></thead><tbody>" + ingRows +
      "<tr class='total'><td>Total de ingresos</td><td class='num'>" + fmt2(ing) + "</td></tr></tbody>";

    const teorico = C.cuota * C.unidades;
    document.getElementById("tIndicadores").innerHTML =
      "<tbody>" +
      "<tr><td>Unidades que pagaron mantenimiento</td><td class='num'>" + m.cobranza.pagaron + " de " + C.unidades + "</td></tr>" +
      "<tr><td>Cobranza de mantenimiento</td><td class='num'>" + m.cobranza.pct.toFixed(1) + "%</td></tr>" +
      "<tr><td>Ingreso teórico por cuotas</td><td class='num'>" + fmt2(teorico) + "</td></tr>" +
      "<tr><td>Cobrado vs. teórico</td><td class='num'>" + (m.ingresos.manto - teorico >= 0 ? "+" : "−") + fmt2(Math.abs(m.ingresos.manto - teorico)) + "</td></tr>" +
      "<tr><td>Gasto operativo por unidad</td><td class='num'>" + fmt2(egr / C.unidades) + "</td></tr>" +
      "</tbody>";

    const secciones = [
      ["Gastos fijos (servicios)", m.detalle.fijos, m.egresos.fijos],
      ["Gastos variables", m.detalle.variables, m.egresos.variables]
    ];
    const conLiga = secciones.some(s => s[1].some(it => it[2]));
    let rows = "<thead><tr><th>Concepto</th><th class='num'>Monto</th>" + (conLiga ? "<th></th>" : "") + "</tr></thead><tbody>";
    const span = conLiga ? 3 : 2;
    secciones.forEach(([titulo, items, subtotal]) => {
      rows += "<tr><td colspan='" + span + "' style='font-weight:700; color:var(--ink); padding-top:0.9rem'>" + titulo + "</td></tr>";
      if (!items.length) {
        rows += "<tr><td colspan='" + span + "' style='color:var(--muted); font-style:italic'>Desglose por concepto pendiente de capturar.</td></tr>";
      }
      items.forEach(it => {
        rows += "<tr><td>" + esc(it[0]) + "</td><td class='num'>" + fmt2(it[1]) + "</td>" +
          (conLiga ? "<td class='num'>" + (it[2] ? "<a href='" + esc(it[2]) + "' target='_blank' rel='noopener'>comprobante</a>" : "") + "</td>" : "") + "</tr>";
      });
      rows += "<tr class='total'><td>Subtotal</td><td class='num'>" + fmt2(subtotal) + "</td>" + (conLiga ? "<td></td>" : "") + "</tr>";
    });
    rows += "<tr class='total'><td style='font-size:1.02em'>TOTAL DE EGRESOS</td><td class='num' style='font-size:1.02em'>" + fmt2(egr) + "</td>" + (conLiga ? "<td></td>" : "") + "</tr></tbody>";
    document.getElementById("tEgresos").innerHTML = rows;
    document.getElementById("egresosSub").textContent = m.nombre + " " + C.anio;

    const mo = m.cobranza.morosos;
    const mr = m.mora || {};
    const has = v => typeof v === "number" && isFinite(v);
    const plural = (n, s) => n + " unidad" + (n === 1 ? "" : "es") + s;
    document.getElementById("morosidadCards").innerHTML =
      '<div class="stat"><div class="k">Mora acumulada al cierre de ' + esc(m.nombre.toLowerCase()) + '</div><div class="v ' + (has(mr.acumulada) && mr.acumulada > 0 ? "neg" : "") + '">' + (has(mr.acumulada) ? fmt(mr.acumulada) : "—") + '</div><div class="d">' + (has(mr.unidades) ? plural(mr.unidades, " con cuotas del año sin pagar") : "pendiente de calcular en la hoja") + "</div></div>" +
      '<div class="stat"><div class="k">Pagos adelantados</div><div class="v ' + (has(mr.adelantos) && mr.adelantos > 0 ? "pos" : "") + '">' + (has(mr.adelantos) ? fmt(mr.adelantos) : "—") + '</div><div class="d">' + (has(mr.unidadesAdelanto) ? plural(mr.unidadesAdelanto, " con meses ya cubiertos") : "pendiente de calcular en la hoja") + "</div></div>" +
      '<div class="stat"><div class="k">Unidades sin pago registrado en el mes</div><div class="v">' + mo + ' <span style="font-size:0.9rem; font-weight:400; color:var(--muted)">de ' + C.unidades + '</span></div><div class="d">incluye a quienes ya habían pagado por adelantado</div></div>' +
      '<div class="stat"><div class="k">Cobranza del mes</div><div class="v ' + (m.cobranza.pct >= 95 ? "pos" : "") + '">' + m.cobranza.pct.toFixed(1) + '%</div><div class="d">' + (C.unidades - m.cobranza.pagaron) + " cuota(s) de " + fmt(C.cuota) + " no entraron este mes</div></div>";
  }

  /* ---------- Vista general del año ---------- */
  const NOMBRES_MIN = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mesMin = m => (m.nombre || "").toLowerCase();

  function renderOverview() {
    const box = document.getElementById("overviewCards");
    if (!M.length) { box.innerHTML = "<div class='stat'><div class='k'>Sin meses capturados</div></div>"; return; }
    const first = M[0], last = M[M.length - 1];
    const ingAcum = sum(M.map(ingresosDe)), egrAcum = sum(M.map(egresosDe));
    const resAcum = ingAcum - egrAcum;
    const gastoProm = egrAcum / M.length;
    const fijosProm = prom(M.map(m => m.egresos.fijos));
    const diasReserva = gastoProm > 0 ? Math.max(0, last.saldoFin) / (gastoProm / 30) : 0;
    const reservaTxt = diasReserva >= 60 ? (diasReserva / 30).toFixed(1) + " meses" : Math.round(diasReserva) + " días";
    const teoricoAnual = C.cuota * C.unidades * M.length;
    const mr = last.mora || {};
    const hasMora = typeof mr.acumulada === "number";
    const cobradoReal = hasMora ? teoricoAnual - mr.acumulada : sum(M.map(m => m.ingresos.manto));
    const pctReal = teoricoAnual ? cobradoReal / teoricoAnual * 100 : 0;
    const porUnidad = gastoProm / C.unidades;
    const brecha = C.cuota - porUnidad;
    const positivos = M.filter(m => resultadoDe(m) >= 0);

    box.innerHTML =
      '<div class="stat"><div class="k">Saldo en caja</div><div class="v ' + (last.saldoFin >= 0 ? "pos" : "neg") + '">' + fmt2(last.saldoFin) + '</div><div class="d">al cierre de ' + esc(mesMin(last)) + " · el año inició en " + fmt2(first.saldoIni) + "</div></div>" +
      '<div class="stat"><div class="k">Resultado acumulado ' + C.anio + '</div><div class="v ' + (resAcum >= 0 ? "pos" : "neg") + '">' + fmt2(resAcum) + '</div><div class="d">ingresos ' + fmt(ingAcum) + " − egresos " + fmt(egrAcum) + "</div></div>" +
      '<div class="stat"><div class="k">Reserva operativa</div><div class="v ' + (diasReserva < 30 ? "neg" : "") + '">' + reservaTxt + '</div><div class="d">lo que el saldo cubre del gasto mensual promedio (' + fmt(gastoProm) + ")</div></div>" +
      '<div class="stat"><div class="k">Mora acumulada</div><div class="v ' + (hasMora && mr.acumulada > 0 ? "neg" : "") + '">' + (hasMora ? fmt(mr.acumulada) : "—") + '</div><div class="d">' + (hasMora ? mr.unidades + " unidad(es) con cuotas pendientes · adelantos: " + fmt(mr.adelantos || 0) + " (" + (mr.unidadesAdelanto || 0) + ")" : "pendiente de calcular en la hoja") + "</div></div>" +
      '<div class="stat"><div class="k">Cuotas del año cobradas</div><div class="v ' + (pctReal >= 95 ? "pos" : "") + '">' + pctReal.toFixed(1) + '%</div><div class="d">' + fmt(cobradoReal) + " de " + fmt(teoricoAnual) + (hasMora ? "; lo que falta es la mora" : "") + "</div></div>" +
      '<div class="stat"><div class="k">Costo de operar por unidad</div><div class="v">' + fmt(porUnidad) + '</div><div class="d">al mes, frente a la cuota de ' + fmt(C.cuota) + ": " + (brecha >= 0 ? "sobran " + fmt(brecha) : "faltan " + fmt(-brecha)) + " por unidad</div></div>" +
      '<div class="stat"><div class="k">Meses con resultado positivo</div><div class="v">' + positivos.length + ' <span style="font-size:0.9rem; font-weight:400; color:var(--muted)">de ' + M.length + '</span></div><div class="d">' + (positivos.length ? positivos.map(mesMin).join(", ") : "ninguno todavía") + "</div></div>" +
      '<div class="stat"><div class="k">Gasto mensual promedio</div><div class="v">' + fmt(gastoProm) + '</div><div class="d">fijos ' + fmt(fijosProm) + " (" + Math.round(fijosProm / gastoProm * 100) + "%) + variables " + fmt(gastoProm - fijosProm) + "</div></div>";
  }

  function renderAnual() {
    const t = document.getElementById("tAnual");
    let rows = "<thead><tr><th>Mes</th><th class='num'>Ingresos</th><th class='num'>Egresos</th><th class='num'>Resultado</th><th class='num'>Saldo al cierre</th><th class='num'>Cobranza</th><th class='num'>Mora acum.</th><th></th></tr></thead><tbody>";
    M.forEach((m, i) => {
      const res = resultadoDe(m), mr = m.mora || {};
      rows += "<tr class='click' data-i='" + i + "'><td style='font-weight:600; color:var(--ink)'>" + esc(m.nombre) + "</td>" +
        "<td class='num'>" + fmt(ingresosDe(m)) + "</td><td class='num'>" + fmt(egresosDe(m)) + "</td>" +
        "<td class='num' style='color:var(--" + (res >= 0 ? "good" : "bad") + "-text); font-weight:600'>" + fmt(res) + "</td>" +
        "<td class='num'>" + fmt(m.saldoFin) + "</td><td class='num'>" + m.cobranza.pct.toFixed(0) + "%</td>" +
        "<td class='num'>" + (typeof mr.acumulada === "number" ? fmt(mr.acumulada) : "—") + "</td><td class='go'><span class='btn-mini'>Ver mes ›</span></td></tr>";
    });
    const ing = sum(M.map(ingresosDe)), egr = sum(M.map(egresosDe));
    rows += "<tr class='total'><td>Acumulado " + C.anio + "</td><td class='num'>" + fmt(ing) + "</td><td class='num'>" + fmt(egr) + "</td><td class='num'>" + fmt(ing - egr) + "</td><td class='num'></td><td class='num'></td><td class='num'></td><td></td></tr>";
    t.innerHTML = rows + "</tbody>";
    t.querySelectorAll("tr.click").forEach(tr => tr.addEventListener("click", () => abrirMes(+tr.dataset.i)));
  }

  function renderMoraCards() {
    const last = M[M.length - 1];
    const mr = (last && last.mora) || {};
    const has = v => typeof v === "number";
    document.getElementById("moraCards").innerHTML =
      '<div class="stat"><div class="k">Mora acumulada al cierre de ' + (last ? esc(mesMin(last)) : "") + '</div><div class="v ' + (has(mr.acumulada) && mr.acumulada > 0 ? "neg" : "") + '">' + (has(mr.acumulada) ? fmt(mr.acumulada) : "—") + '</div><div class="d">' + (has(mr.unidades) ? mr.unidades + " unidad(es) con cuotas del año sin pagar" : "pendiente de calcular en la hoja") + "</div></div>" +
      '<div class="stat"><div class="k">Pagos adelantados</div><div class="v ' + (has(mr.adelantos) && mr.adelantos > 0 ? "pos" : "") + '">' + (has(mr.adelantos) ? fmt(mr.adelantos) : "—") + '</div><div class="d">' + (has(mr.unidadesAdelanto) ? mr.unidadesAdelanto + " unidad(es) con meses ya cubiertos" : "pendiente de calcular en la hoja") + "</div></div>" +
      '<div class="stat"><div class="k">Sin pago registrado en el último mes</div><div class="v">' + (last ? last.cobranza.morosos : "—") + ' <span style="font-size:0.9rem; font-weight:400; color:var(--muted)">de ' + C.unidades + '</span></div><div class="d">incluye a quienes ya habían pagado por adelantado</div></div>';
  }

  /* ---------- Navegación general ↔ detalle ---------- */
  const secResumen = document.getElementById("resumen");
  const secDetalle = document.getElementById("detalle");
  function abrirMes(i) {
    mesIdx = i;
    renderChips(); renderMes();
    secResumen.hidden = true; secDetalle.hidden = false;
    setText("tituloMes", "Detalle de " + mesMin(M[i]) + " " + C.anio);
    if (history.replaceState) history.replaceState(null, "", "#mes-" + M[i].id);
    window.scrollTo(0, 0);
  }
  function volver(e) {
    if (e) e.preventDefault();
    secDetalle.hidden = true; secResumen.hidden = false;
    if (history.replaceState) history.replaceState(null, "", location.pathname);
    window.scrollTo(0, 0);
  }
  document.getElementById("volver").addEventListener("click", volver);
  document.getElementById("volver2").addEventListener("click", volver);

  /* ---------- Gráfica: mora acumulada y adelantos por mes ---------- */
  function chartMora() {
    const box = document.getElementById("chartMora");
    if (!box) return;
    const rows = M.map(m => [m, (m.mora || {}).acumulada, (m.mora || {}).adelantos]);
    if (!rows.some(r => typeof r[1] === "number" || typeof r[2] === "number")) { box.innerHTML = ""; return; }
    const W = 760, H = 220, L = 56, R = 8, T = 14, B = 30;
    const pw = W - L - R, ph = H - T - B;
    const maxV = nice(Math.max(1000, ...rows.map(r => Math.max(r[1] || 0, r[2] || 0))) * 1.1);
    const step = maxV / 4;
    const y = v => T + ph - (v / maxV) * ph;
    let g = "";
    for (let t = 0; t <= maxV + 1; t += step) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--grid)" stroke-width="1"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + (t === 0 ? "0" : kfmt(t)) + "</text>";
    }
    const gw = pw / M.length, bw = Math.min(24, gw / 2 - 6);
    let bars = "", hits = "";
    rows.forEach(([m, mora, adel], i) => {
      const cx = L + gw * i + gw / 2;
      const bar = (x, v, color) => { const yy = y(v || 0); return '<rect x="' + x + '" y="' + yy + '" width="' + bw + '" height="' + Math.max(0, T + ph - yy) + '" rx="3" fill="' + color + '"/>'; };
      bars += bar(cx - bw - 1, mora, "var(--series-2)") + bar(cx + 1, adel, "var(--series-1)");
      bars += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11.5" fill="var(--ink-2)">' + esc(m.corto) + "</text>";
      hits += '<rect data-i="' + i + '" x="' + (L + gw * i) + '" y="' + T + '" width="' + gw + '" height="' + ph + '" fill="transparent"/>';
    });
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Mora acumulada y pagos adelantados al cierre de cada mes">' + g +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--baseline)" stroke-width="1.5"/>' + bars + hits + "</svg>";
    box.querySelectorAll("rect[data-i]").forEach(rect => {
      rect.addEventListener("mousemove", e => {
        const [m, mora, adel] = rows[+rect.dataset.i];
        showTip("<b>Cierre de " + esc(m.nombre.toLowerCase()) + "</b><br>Mora acumulada: <b>" + (typeof mora === "number" ? fmt(mora) : "—") + "</b><br>Pagos adelantados: <b>" + (typeof adel === "number" ? fmt(adel) : "—") + "</b>", e.clientX, e.clientY);
      });
      rect.addEventListener("mouseleave", hideTip);
    });
  }

  /* ---------- Gráfica: barras ingresos vs egresos ---------- */
  function chartBars() {
    const W = 760, H = 300, L = 56, R = 8, T = 14, B = 30;
    const pw = W - L - R, ph = H - T - B;
    const maxV = nice(Math.max(1, ...M.map(m => Math.max(ingresosDe(m), egresosDe(m)))) * 1.05);
    const step = maxV / 5;
    const y = v => T + ph - (v / maxV) * ph;
    const s1 = "var(--series-1)", s2 = "var(--series-2)";
    let g = "";
    for (let t = 0; t <= maxV + 1; t += step) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--grid)" stroke-width="1"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + (t === 0 ? "0" : kfmt(t)) + "</text>";
    }
    const gw = pw / M.length, bw = Math.min(24, gw / 2 - 6);
    let bars = "", hits = "";
    M.forEach((m, i) => {
      const cx = L + gw * i + gw / 2;
      const ing = ingresosDe(m), egr = egresosDe(m);
      const x1 = cx - bw - 1, x2 = cx + 1;
      const r = 4;
      const bar = (x, v, color) => {
        const yy = y(v), hh = Math.max(0, T + ph - yy);
        if (hh < r) return '<rect x="' + x + '" y="' + yy + '" width="' + bw + '" height="' + hh + '" fill="' + color + '"/>';
        return '<path d="M' + x + " " + (yy + r) + " q0 -" + r + " " + r + " -" + r + " h" + (bw - 2 * r) + " q" + r + " 0 " + r + " " + r + " v" + (hh - r) + " h-" + bw + ' z" fill="' + color + '"/>';
      };
      bars += bar(x1, ing, s1) + bar(x2, egr, s2);
      bars += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11.5" fill="var(--ink-2)">' + esc(m.corto) + "</text>";
      hits += '<rect data-i="' + i + '" x="' + (L + gw * i) + '" y="' + T + '" width="' + gw + '" height="' + ph + '" fill="transparent"/>';
    });
    const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ingresos y egresos por mes">' + g +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--baseline)" stroke-width="1.5"/>' +
      bars + hits + "</svg>";
    const box = document.getElementById("chartBars");
    box.innerHTML = svg;
    box.querySelectorAll("rect[data-i]").forEach(rect => {
      rect.addEventListener("mousemove", e => {
        const m = M[+rect.dataset.i];
        showTip("<b>" + esc(m.nombre) + " " + C.anio + "</b><br>Ingresos: <b>" + fmt(ingresosDe(m)) + "</b><br>Egresos: <b>" + fmt(egresosDe(m)) + "</b><br>Resultado: <b>" + fmt(resultadoDe(m)) + "</b>", e.clientX, e.clientY);
      });
      rect.addEventListener("mouseleave", hideTip);
    });
  }

  /* ---------- Gráfica: línea de saldo ---------- */
  function chartLine() {
    const W = 760, H = 260, L = 60, R = 70, T = 14, B = 30;
    const pw = W - L - R, ph = H - T - B;
    const vals = M.map(m => m.saldoFin).concat(M.length ? [M[0].saldoIni] : [0]);
    const step = Math.max(1000, nice((Math.max(...vals) - Math.min(...vals)) / 4));
    const maxV = Math.ceil(Math.max(0, ...vals) / step) * step + (Math.max(...vals) === Math.ceil(Math.max(...vals) / step) * step ? step : 0);
    const minV = Math.floor(Math.min(0, ...vals) / step) * step;
    const y = v => T + (maxV - v) / (maxV - minV) * ph;
    const x = i => M.length > 1 ? L + (pw / (M.length - 1)) * i : L + pw / 2;
    let g = "";
    for (let t = minV; t <= maxV; t += step) {
      const strong = t === 0;
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="' + (strong ? "var(--baseline)" : "var(--grid)") + '" stroke-width="' + (strong ? 1.5 : 1) + '"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + (t === 0 ? "0" : kfmt(t)) + "</text>";
    }
    let path = "", dots = "", hits = "", labels = "";
    M.forEach((m, i) => {
      const px = x(i), py = y(m.saldoFin);
      path += (i === 0 ? "M" : "L") + px + " " + py + " ";
      dots += '<circle cx="' + px + '" cy="' + py + '" r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>';
      hits += '<circle data-i="' + i + '" cx="' + px + '" cy="' + py + '" r="14" fill="transparent"/>';
      labels += '<text x="' + px + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11.5" fill="var(--ink-2)">' + esc(m.corto) + "</text>";
    });
    const last = M[M.length - 1];
    const lastLbl = last ? '<text x="' + (x(M.length - 1) + 10) + '" y="' + (y(last.saldoFin) + 4) + '" font-size="11.5" font-weight="700" fill="var(--ink)">' + fmt(last.saldoFin) + "</text>" : "";
    const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Saldo al cierre de cada mes">' + g +
      '<path d="' + path + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>' +
      dots + lastLbl + labels + hits + "</svg>";
    const box = document.getElementById("chartLine");
    box.innerHTML = svg;
    box.querySelectorAll("circle[data-i]").forEach(c => {
      c.addEventListener("mousemove", e => {
        const m = M[+c.dataset.i];
        showTip("<b>" + esc(m.nombre) + " " + C.anio + "</b><br>Saldo al cierre: <b>" + fmt2(m.saldoFin) + "</b>", e.clientX, e.clientY);
      });
      c.addEventListener("mouseleave", hideTip);
    });
    const neg = M.filter(m => m.saldoFin < 0).map(m => m.nombre.toLowerCase());
    setText("saldoNota", neg.length
      ? "El saldo llegó a terreno negativo en " + neg.join(" y ") + "; el condominio opera con un colchón de pocos miles de pesos, así que un gasto extraordinario o una baja en la cobranza se siente de inmediato."
      : "El saldo se ha mantenido positivo todo el año, aunque el colchón es de pocos miles de pesos.");
  }

  /* ---------- Métricas del año ---------- */
  function hbars(boxId, items, aria, nota) {
    const total = sum(items.map(i => i[1]));
    const W = 560, rowH = 30, T = 6, L = 230, R = 84;
    const H = T + items.length * rowH + (nota ? 26 : 10);
    const pw = W - L - R;
    const maxV = Math.max(1, ...items.map(i => i[1]));
    let rows = "";
    items.forEach(([label, v], i) => {
      const yy = T + i * rowH + 6;
      const bw2 = Math.max(2, (v / maxV) * pw);
      rows += '<text x="' + (L - 10) + '" y="' + (yy + 12) + '" text-anchor="end" font-size="11.5" fill="var(--ink-2)">' + esc(label) + "</text>" +
        '<rect data-i="' + i + '" x="' + L + '" y="' + yy + '" width="' + bw2 + '" height="16" rx="4" fill="var(--series-1)"/>' +
        '<text x="' + (L + bw2 + 8) + '" y="' + (yy + 12.5) + '" font-size="11.5" font-weight="600" fill="var(--ink)">' + fmt(v) + "</text>";
    });
    const n = nota ? '<text x="' + L + '" y="' + (H - 6) + '" font-size="10.5" fill="var(--muted)">' + esc(nota) + "</text>" : "";
    const box = document.getElementById(boxId);
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(aria) + '">' + rows + n + "</svg>";
    box.querySelectorAll("rect[data-i]").forEach(r => {
      r.addEventListener("mousemove", e => {
        const it = items[+r.dataset.i];
        showTip("<b>" + esc(it[0]) + "</b><br>" + fmt(it[1]) + " · " + Math.round(it[1] / total * 100) + "% del total", e.clientX, e.clientY);
      });
      r.addEventListener("mouseleave", hideTip);
    });
  }

  function acortar(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }

  function chartFijos() {
    const last = M[M.length - 1];
    const items = (last && last.detalle.fijos.length ? last.detalle.fijos : [])
      .map(it => [acortar(it[0], 34), it[1]]).sort((a, b) => b[1] - a[1]);
    if (!items.length) { document.getElementById("chartFijos").innerHTML = "<p class='ref'>Sin desglose de gastos fijos para el último mes.</p>"; return; }
    hbars("chartFijos", items, "Composición del gasto fijo mensual", "gasto fijo de " + last.nombre.toLowerCase() + " " + C.anio);
  }

  /* Agrupa los gastos variables del año por rubro, a partir del concepto. */
  const RUBROS = [
    [/luz|cfe/i, "Luz de áreas comunes y elevador (CFE)"],
    [/elevador/i, "Elevador: mantenimiento y refacciones"],
    [/pintura|resane/i, "Pintura de pasillos y bardas"],
    [/riego|poda|maleza|jardin/i, "Jardinería, poda y riego"],
    [/cisterna|flotador|v[aá]lvula|agua/i, "Agua: cisterna, válvulas y bombeo"],
    [/cerca/i, "Cerca electrificada"],
    [/limpieza|escoba|foco|l[aá]mpara|consumible/i, "Limpieza y consumibles"]
  ];
  function rubroDe(concepto) {
    for (const [re, nombre] of RUBROS) if (re.test(concepto)) return nombre;
    return "Mantenimiento general";
  }
  function chartVariables() {
    const acc = {};
    M.forEach(m => m.detalle.variables.forEach(it => { const r = rubroDe(it[0]); acc[r] = (acc[r] || 0) + it[1]; }));
    const items = Object.keys(acc).map(k => [k, acc[k]]).sort((a, b) => b[1] - a[1]);
    if (!items.length) { document.getElementById("chartVariables").innerHTML = "<p class='ref'>Sin desglose de gastos variables.</p>"; return; }
    hbars("chartVariables", items.map(i => [acortar(i[0], 36), i[1]]), "Gasto variable acumulado por rubro", "acumulado " + rango());
    setText("variablesTotal", fmt(sum(M.map(m => m.egresos.variables))));
  }

  function renderProyectos() {
    let rows = "<thead><tr><th>Proyecto</th><th>Estado</th><th class='num'>Monto</th></tr></thead><tbody>";
    (C.proyectos || []).forEach(p => {
      rows += "<tr><td>" + esc(p.nombre) + "</td><td>" + esc(p.estado) + "</td><td class='num'>" + (p.presupuesto ? fmt(p.presupuesto) : "por definir") + "</td></tr>";
    });
    if (!(C.proyectos || []).length) rows += "<tr><td colspan='3' style='color:var(--muted); font-style:italic'>Sin proyectos registrados.</td></tr>";
    document.getElementById("tProyectos").innerHTML = rows + "</tbody>";
  }

  /* ---------- Lectura de la hoja publicada ---------- */
  const COLS = {
    mesid: "id", mes: "nombre", nombre: "nombre", corto: "corto",
    saldoinicial: "saldoIni", saldofinal: "saldoFin",
    mantenimientocobrado: "manto", aguacobrada: "agua", casaclubcobrada: "casaClub", rentacasaclub: "casaClub",
    gastosfijos: "fijos", egresosfijos: "fijos", gastosvariables: "variables", egresosvariables: "variables",
    unidadesquepagaron: "pagaron", "%cobranza": "pct", cobranza: "pct", unidadesmorosas: "morosos", morosos: "morosos",
    moraacumulada: "moraAcum", unidadesconmora: "moraUnidades", pagosadelantados: "adelantos", unidadesadelantadas: "adelUnidades"
  };
  const COLS_DET = { mesid: "id", tipo: "tipo", concepto: "concepto", proveedor: "concepto", monto: "monto", comprobante: "liga", liga: "liga" };

  const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[^a-z0-9%]+/g, "");

  /* Acepta "$35,200.00", "$35.200,00", "35200", "-2.273,54", "(2,273.54)", "87,5%". */
  function num(v) {
    let s = String(v == null ? "" : v).trim();
    if (!s) return 0;
    let neg = /^\(.*\)$/.test(s) || /[-−–]/.test(s);
    s = s.replace(/[^0-9.,]/g, "");
    const lp = s.lastIndexOf("."), lc = s.lastIndexOf(",");
    if (lp !== -1 && lc !== -1) {
      s = lp > lc ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
    } else if (lc !== -1) {
      const partes = s.split(",");
      s = (partes.length === 2 && partes[1].length !== 3) ? partes[0] + "." + partes[1] : s.replace(/,/g, "");
    } else if (lp !== -1) {
      const partes = s.split(".");
      if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3)) s = s.replace(/\./g, "");
    }
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : 0;
  }

  function parseCSV(texto) {
    const filas = [];
    let campo = "", fila = [], comillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (comillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
        } else campo += c;
      } else if (c === '"') comillas = true;
      else if (c === ",") { fila.push(campo); campo = ""; }
      else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
      else if (c !== "\r") campo += c;
    }
    if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  async function leerTabla(url, cols, requerida) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const filas = parseCSV(await r.text()).filter(f => f.some(c => String(c).trim() !== ""));
    if (filas.length < 2) throw new Error("la hoja no trae filas de datos");
    /* La fila de encabezados es la primera que contiene la columna requerida. */
    let hi = filas.findIndex(f => f.some(h => cols[norm(h)] === requerida));
    if (hi === -1) throw new Error("falta la columna '" + requerida + "'");
    const cab = filas[hi].map(h => cols[norm(h)] || null);
    return filas.slice(hi + 1).map(f => { const o = {}; cab.forEach((k, i) => { if (k) o[k] = f[i]; }); return o; })
      .filter(o => /^\d{4}-\d{2}$/.test(String(o.id || "").trim()))
      /* Filas preparadas para meses que aún no tienen pestaña (fórmulas con
         IFERROR que devuelven vacío) se ignoran: así Resumen puede traer los
         doce meses del año y el sitio muestra solo los que ya se capturaron. */
      .filter(o => ["saldoIni", "saldoFin", "manto", "fijos", "variables", "monto"]
        .some(k => k in o && String(o[k]).replace(/[^0-9]/g, "") !== ""));
  }

  /* Las columnas de mora son opcionales: si la hoja no las trae, las
     tarjetas muestran "—" en vez de un cero engañoso. */
  function opcional(o, kAcum, kUni, kAdel, kUniAdel) {
    const val = k => (k in o && String(o[k]).trim() !== "") ? Math.abs(num(o[k])) : null;
    return { acumulada: val(kAcum), unidades: val(kUni), adelantos: val(kAdel), unidadesAdelanto: val(kUniAdel) };
  }

  const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  async function cargarHoja() {
    if (!RESUMEN_URL) return false;
    const nuevos = await leerTabla(RESUMEN_URL, COLS, "id");
    if (!nuevos.length) throw new Error("ninguna fila con 'Mes ID' válido");

    let detalle = null;
    if (DETALLE_URL) {
      try {
        detalle = {};
        (await leerTabla(DETALLE_URL, COLS_DET, "id")).forEach(o => {
          const id = String(o.id).trim();
          const tipo = /var/i.test(String(o.tipo)) ? "variables" : "fijos";
          const concepto = String(o.concepto || "").trim();
          if (!concepto) return;
          detalle[id] = detalle[id] || { fijos: [], variables: [] };
          const liga = String(o.liga || "").trim();
          detalle[id][tipo].push(liga ? [concepto, num(o.monto), liga] : [concepto, num(o.monto)]);
        });
      } catch (e) {
        console.warn("[Valetta] Sin desglose desde la hoja (" + e.message + ").");
        detalle = null;
      }
    }

    const previos = {};
    C.meses.forEach(m => { previos[m.id] = m; });
    const armados = nuevos.map(o => {
      const id = String(o.id).trim();
      const antes = previos[id];
      const mesNum = parseInt(id.slice(5), 10);
      const nombre = String(o.nombre || "").trim() || (antes && antes.nombre) || NOMBRES[mesNum - 1] || id;
      return {
        id: id, nombre: nombre,
        corto: String(o.corto || "").trim() || (antes && antes.corto) || nombre.slice(0, 3),
        saldoIni: num(o.saldoIni), saldoFin: num(o.saldoFin),
        ingresos: { manto: num(o.manto), agua: num(o.agua), casaClub: num(o.casaClub) },
        egresos: { fijos: Math.abs(num(o.fijos)), variables: Math.abs(num(o.variables)) },
        cobranza: { pagaron: num(o.pagaron), pct: num(o.pct), morosos: num(o.morosos) },
        mora: opcional(o, "moraAcum", "moraUnidades", "adelantos", "adelUnidades"),
        detalle: (detalle && detalle[id]) || (antes && antes.detalle) || { fijos: [], variables: [] }
      };
    }).sort((a, b) => a.id.localeCompare(b.id));

    const anios = armados.map(m => parseInt(m.id.slice(0, 4), 10));
    C.anio = Math.max(...anios);
    C.meses.length = 0;
    armados.forEach(m => C.meses.push(m));
    return true;
  }

  function renderFuente(live) {
    const el = document.getElementById("fuente");
    if (!el) return;
    el.className = "source-badge" + (live ? " live" : "");
    el.innerHTML = '<span class="dot"></span>' + (live
      ? "Datos en vivo desde la hoja de la Administración · " + esc(rango())
      : "Copia local · " + esc(rango()) + " · la hoja en vivo se conecta desde js/finanzas.js");
  }

  /* ---------- Render general ---------- */
  let rendered = false, live = false;
  function render() {
    if (rendered) return;
    rendered = true;
    setText("tituloGeneral", "Rendición de cuentas " + C.anio);
    setText("rangoSub", "Vista general del año con cifras de la hoja de captura mensual de la Administración · " + rango() + " · " + C.unidades + " unidades · cuota de " + fmt(C.cuota) + " (ingreso teórico " + fmt(C.cuota * C.unidades) + " al mes).");
    renderFuente(live);
    renderOverview();
    renderAnual();
    chartBars();
    chartLine();
    renderMoraCards();
    chartMora();
    chartFijos();
    chartVariables();
    renderProyectos();
    renderChips();
    renderMes();
    /* Si la URL trae #mes-2026-08 se abre ese mes directamente. */
    const h = /^#mes-(\d{4}-\d{2})$/.exec(location.hash);
    const i = h ? M.findIndex(m => m.id === h[1]) : -1;
    if (i >= 0) abrirMes(i);
  }

  cargarHoja().then(ok => {
    if (!ok) return;
    live = true;
    mesIdx = M.length - 1;
    if (rendered) { rendered = false; render(); }
  }).catch(e => {
    console.warn("[Valetta] No se pudo leer la hoja publicada (" + e.message + "). Se muestran los datos de js/data.js.");
  });

  if (sessionStorage.getItem("valettaFin") === "1") { unlock(); }
})();
