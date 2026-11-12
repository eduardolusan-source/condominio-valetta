/* Tablero financiero — motor común de los sitios de condominio
   (La Valetta, Lahia y Las Misiones usan este mismo archivo; si lo cambias en
   uno, cópialo a los otros dos).

   Idea: la gente se pierde con muchos datos. La portada muestra SEIS
   indicadores grandes y fáciles de leer; todo lo demás vive en secciones a
   las que se entra con un toque (mes por mes, gráficas, en qué se gasta,
   morosidad, agua, proyectos…). Cada sección tiene su dirección (#meses,
   #mes-2026-08, #gastos…), así el botón "atrás" del celular funciona.

   Uso (desde js/finanzas.js de cada sitio):
     const t = Tablero.montar(document.getElementById("tablero"), opciones);
     t.actualizar(modelo);           // cada vez que llegan datos (copia local o en vivo)

   modelo = {
     unidades, cuota,
     meses: [{ id: "2026-08", anio, nombre, corto, saldoIni, saldoFin, vivo,
               ingresos: [{ nombre, monto }],
               grupos:   [{ clave, nombre, monto, cuota: true|false,
                            items: [{ concepto, detalle, monto, liga }] }],
               cobranza: { pagaron, pct }, mora: { acumulada, unidades, adelantos, unidadesAdelanto } | null,
               agua: { cobrado, pagado } | null, deudaAgua: { monto, unidades } | null,
               indicadores: [[etiqueta, valor texto]], carpeta }],
     proyectos: [{ nombre, estado, monto, nota, liga }],
     morosidadFoto: { fecha, total, unidades, partes: [{ nombre, monto, unidades, nota }] } | null,
     revision: [{ tipo, titulo, detalle }] | null,
     fuente: { vivo, generado, texto } }

   REGLA: aquí solo llegan agregados. Nada por departamento. */
(function () {
  "use strict";

  /* ============================ Utilidades ============================ */
  const NF0 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  const NF2 = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const limpio = v => (Math.abs(v) < 0.5 ? 0 : v);
  const $0 = v => NF0.format(limpio(v)).replace("-", "−");
  const $2 = v => NF2.format(Math.abs(v) < 0.005 ? 0 : v).replace("-", "−");
  const $k = v => { const a = Math.abs(v); const s = v < 0 ? "−" : ""; return a >= 1000 ? s + "$" + (a / 1000).toFixed(a >= 100000 ? 0 : a >= 10000 ? 0 : 1).replace(".0", "") + " mil" : s + "$" + Math.round(a); };
  const firmado = v => (v > 0.5 ? "+" : "") + $0(v);
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const sum = a => a.reduce((x, y) => x + y, 0);
  const prom = a => (a.length ? sum(a) / a.length : 0);
  const min = m => (m.nombre || "").toLowerCase();
  const ingresosDe = m => sum(m.ingresos.map(i => i.monto));
  const egresosDe = m => sum(m.grupos.map(g => g.monto));
  const resultadoDe = m => ingresosDe(m) - egresosDe(m);
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  const reducido = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esLiga = u => /^https?:\/\//i.test(String(u || ""));

  /* Paleta categórica (orden fijo; el color sigue al rubro, nunca a su lugar). */
  const CAT = ["var(--tb-cat-1)", "var(--tb-cat-2)", "var(--tb-cat-3)", "var(--tb-cat-4)", "var(--tb-cat-5)", "var(--tb-cat-6)", "var(--tb-cat-7)"];
  const OTROS = "var(--tb-cat-otros)";

  /* ============================ Tooltip ============================ */
  let tip = null;
  function asegurarTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.className = "tb-tip";
    tip.setAttribute("role", "status");
    document.body.appendChild(tip);
    document.addEventListener("pointerdown", e => { if (!e.target.closest || !e.target.closest("[data-tip]")) ocultarTip(); }, true);
    window.addEventListener("scroll", ocultarTip, { passive: true });
    return tip;
  }
  function mostrarTip(html, x, y) {
    const t = asegurarTip();
    t.innerHTML = html;
    t.style.display = "block";
    const w = t.offsetWidth, h = t.offsetHeight, sw = window.innerWidth;
    let left = x + 14, top = y + 16;
    if (left + w > sw - 8) left = Math.max(8, x - w - 14);
    if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - 14);
    t.style.left = left + "px";
    t.style.top = top + "px";
  }
  function ocultarTip() { if (tip) tip.style.display = "none"; }
  /* Engancha el tooltip a los elementos [data-tip] de una caja: con mouse al
     pasar, con el dedo al tocar. data-ir="#mes-…" abre esa sección al tocar. */
  function enganchar(caja, textos) {
    caja.querySelectorAll("[data-tip]").forEach(el => {
      const html = () => textos[+el.getAttribute("data-tip")];
      el.addEventListener("pointermove", e => { if (e.pointerType === "mouse") mostrarTip(html(), e.clientX, e.clientY); });
      el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") ocultarTip(); });
      el.addEventListener("click", e => {
        const ir = el.getAttribute("data-ir");
        if (ir && (e.pointerType === "mouse" || el.getAttribute("data-visto") === "1")) { ocultarTip(); location.hash = ir; return; }
        caja.querySelectorAll("[data-visto]").forEach(x => x.removeAttribute("data-visto"));
        el.setAttribute("data-visto", "1");
        mostrarTip(html() + (ir ? '<div class="tb-tip-ir">Toca otra vez para abrir ›</div>' : ""), e.clientX, e.clientY);
      });
    });
  }

  /* Números que "cuentan" hasta su valor al aparecer. */
  function animarCifras(raiz) {
    const els = raiz.querySelectorAll("[data-cuenta]");
    if (reducido()) return;
    els.forEach(el => {
      const fin = parseFloat(el.getAttribute("data-cuenta"));
      const forma = el.getAttribute("data-forma") || "pesos";
      if (!isFinite(fin)) return;
      const t0 = performance.now(), dur = 900;
      const pinta = v => { el.textContent = forma === "pct" ? Math.round(v) + "%" : forma === "num" ? String(Math.round(v)) : $0(v); };
      const paso = t => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        pinta(fin * e);
        if (p < 1) requestAnimationFrame(paso); else pinta(fin);
      };
      requestAnimationFrame(paso);
    });
  }

  /* ============================ Gráficas (SVG a la medida de su caja) ============================ */
  function ancho(caja, def) { return Math.max(260, Math.round(caja.clientWidth || def || 600)); }
  function escala(maxV) {
    if (maxV <= 0) return { tope: 1000, paso: 250 };
    const p = Math.pow(10, Math.floor(Math.log10(maxV)));
    const pasos = [1, 2, 2.5, 5, 10].map(f => f * p / 2);
    for (const s of pasos) if (maxV / s <= 4.2) return { tope: Math.ceil(maxV / s) * s, paso: s };
    return { tope: Math.ceil(maxV / p) * p, paso: p };
  }
  /* Margen izquierdo según la etiqueta más larga del eje (que no se corte el "−"). */
  function margenEje(valores) { return Math.round(Math.max(30, ...valores.map(v => $k(v).length * 6.4)) + 10); }
  function barra(x, y, w, h, color, r) {
    r = Math.min(r == null ? 4 : r, w / 2);
    if (h <= 0) return "";
    if (h < r) return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + color + '"/>';
    return '<path d="M' + x + " " + (y + h) + " V" + (y + r) + " q0 -" + r + " " + r + " -" + r + " H" + (x + w - r) + " q" + r + " 0 " + r + " " + r + " V" + (y + h) + ' Z" fill="' + color + '"/>';
  }

  /* Barras agrupadas por mes (dos series), con tooltip y toque para abrir el mes. */
  function graficaBarras(caja, M, series, opc) {
    opc = opc || {};
    const W = ancho(caja), angosto = W < 520;
    const maxV = Math.max(1, ...M.map(m => Math.max(...series.map(s => s.valor(m)))));
    const { tope, paso } = escala(maxV);
    const H = opc.alto || (angosto ? 220 : 270), L = margenEje([0, tope]), R = 6, T = 12, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const y = v => T + ph - (v / tope) * ph;
    let g = "";
    for (let t = 0; t <= tope + 0.5; t += paso) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="var(--grid)"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end" class="tb-eje">' + (t === 0 ? "0" : $k(t)) + "</text>";
    }
    const gw = pw / M.length, n = series.length;
    const bw = Math.max(3, Math.min(22, (gw - 8) / n - 2));
    let marcas = "", golpes = "", textos = [];
    M.forEach((m, i) => {
      const cx = L + gw * i + gw / 2;
      series.forEach((s, k) => {
        const v = Math.max(0, s.valor(m)), x = cx - (n * bw + (n - 1) * 2) / 2 + k * (bw + 2);
        marcas += barra(x, y(v), bw, T + ph - y(v), s.color);
      });
      const etiqueta = angosto && M.length > 8 ? m.corto.charAt(0) : m.corto;
      marcas += '<text x="' + cx + '" y="' + (H - 7) + '" text-anchor="middle" class="tb-eje tb-eje-x">' + esc(etiqueta) + "</text>";
      textos.push("<b>" + esc(m.nombre) + " " + m.anio + "</b>" + series.map(s => '<div class="tb-tip-fila"><span class="tb-sw" style="background:' + s.color + '"></span>' + s.nombre + ": <b>" + $0(s.valor(m)) + "</b></div>").join("") + (opc.pie ? opc.pie(m) : ""));
      golpes += '<rect data-tip="' + i + '"' + (opc.abrir ? ' data-ir="#mes-' + m.id + '"' : "") + ' x="' + (L + gw * i) + '" y="' + T + '" width="' + gw + '" height="' + ph + '" fill="transparent" class="tb-golpe"/>';
    });
    caja.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opc.aria || "") + '">' + g +
      '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--baseline)" stroke-width="1.5"/>' + marcas + golpes + "</svg>";
    enganchar(caja, textos);
  }

  /* Línea del saldo al cierre de cada mes, con el cero marcado. */
  function graficaSaldo(caja, M) {
    const W = ancho(caja), angosto = W < 520;
    const vals = M.map(m => m.saldoFin).concat([M[0].saldoIni]);
    const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
    const { paso } = escala(Math.max(hi - lo, 1));
    const tope = Math.ceil(hi / paso) * paso || paso, piso = Math.floor(lo / paso) * paso;
    const H = angosto ? 210 : 250, L = margenEje([tope, piso]), R = angosto ? 14 : 70, T = 16, B = 26;
    const pw = W - L - R, ph = H - T - B;
    const y = v => T + (tope - v) / (tope - piso || 1) * ph;
    const x = i => (M.length > 1 ? L + (pw / (M.length - 1)) * i : L + pw / 2);
    let g = "";
    for (let t = piso; t <= tope + 0.5; t += paso) {
      const cero = Math.abs(t) < 0.5;
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t) + '" y2="' + y(t) + '" stroke="' + (cero ? "var(--baseline)" : "var(--grid)") + '" stroke-width="' + (cero ? 1.5 : 1) + '"/>' +
        '<text x="' + (L - 6) + '" y="' + (y(t) + 4) + '" text-anchor="end" class="tb-eje">' + (cero ? "0" : $k(t)) + "</text>";
    }
    if (lo < 0) g += '<rect x="' + L + '" y="' + y(0) + '" width="' + pw + '" height="' + (y(piso) - y(0)) + '" fill="var(--tb-rojo-suave)"/>' +
      '<text x="' + (L + 6) + '" y="' + (y(piso) - 6) + '" class="tb-eje" fill="var(--bad-text)">números rojos</text>';
    let d = "", area = "", puntos = "", golpes = "", etiquetas = "", textos = [];
    M.forEach((m, i) => {
      const px = x(i), py = y(m.saldoFin);
      d += (i ? "L" : "M") + px + " " + py + " ";
      puntos += '<circle cx="' + px + '" cy="' + py + '" r="4.5" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>';
      etiquetas += '<text x="' + px + '" y="' + (H - 7) + '" text-anchor="middle" class="tb-eje tb-eje-x">' + esc(angosto && M.length > 8 ? m.corto.charAt(0) : m.corto) + "</text>";
      golpes += '<rect data-tip="' + i + '" data-ir="#mes-' + m.id + '" x="' + (px - pw / M.length / 2) + '" y="' + T + '" width="' + pw / M.length + '" height="' + ph + '" fill="transparent" class="tb-golpe"/>';
      textos.push("<b>" + esc(m.nombre) + " " + m.anio + "</b><div>Saldo al cierre: <b>" + $0(m.saldoFin) + "</b></div><div class='tb-tip-sub'>empezó el mes en " + $0(m.saldoIni) + "</div>");
    });
    area = d + "L" + x(M.length - 1) + " " + y(Math.max(0, piso)) + " L" + x(0) + " " + y(Math.max(0, piso)) + " Z";
    const u = M[M.length - 1];
    const lbl = angosto ? "" : '<text x="' + (x(M.length - 1) + 9) + '" y="' + (y(u.saldoFin) + 4) + '" class="tb-eje" style="font-weight:700; fill:var(--ink)">' + $k(u.saldoFin) + "</text>";
    caja.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Saldo en caja al cierre de cada mes">' + g +
      '<path d="' + area + '" fill="var(--series-1)" opacity="0.08"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--series-1)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + puntos + lbl + etiquetas + golpes + "</svg>";
    enganchar(caja, textos);
  }

  /* Barras horizontales: [{ nombre, valor, color, sub }] */
  function graficaHorizontal(caja, items, opc) {
    opc = opc || {};
    const total = sum(items.map(i => i.valor));
    const maxV = Math.max(1, ...items.map(i => i.valor));
    const textos = [];
    caja.innerHTML = '<div class="tb-hbars">' + items.map((it, i) => {
      textos.push("<b>" + esc(it.nombre) + "</b><div>" + $0(it.valor) + (opc.sufijo || "") + " · " + pct(it.valor, total) + "% del total</div>" + (it.sub ? "<div class='tb-tip-sub'>" + esc(it.sub) + "</div>" : ""));
      return '<div class="tb-hbar" data-tip="' + i + '"><div class="tb-hbar-et">' + esc(it.nombre) + '</div><div class="tb-hbar-pista"><div class="tb-hbar-barra" style="--w:' + Math.max(1.5, it.valor / maxV * 100).toFixed(2) + "%; background:" + (it.color || "var(--series-1)") + '"></div><span class="tb-hbar-v">' + $0(it.valor) + "</span></div></div>";
    }).join("") + "</div>";
    enganchar(caja, textos);
  }

  function sparkline(M) {
    if (M.length < 2) return "";
    const W = 300, H = 56, P = 4;
    const vals = M.map(m => m.saldoFin);
    const hi = Math.max(0, ...vals), lo = Math.min(0, ...vals);
    const y = v => P + (hi - v) / ((hi - lo) || 1) * (H - 2 * P);
    const x = i => P + i * (W - 2 * P) / (M.length - 1);
    let d = "";
    vals.forEach((v, i) => { d += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1) + " "; });
    const ult = vals.length - 1;
    return '<svg class="tb-spark" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      (lo < 0 ? '<line x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--baseline)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>' : "") +
      '<path d="' + d + "L" + x(ult) + " " + H + " L" + x(0) + " " + H + ' Z" fill="currentColor" opacity="0.10"/>' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + x(ult) + '" cy="' + y(vals[ult]) + '" r="4" fill="currentColor"/></svg>';
  }

  function anillo(fraccion, etiqueta) {
    const r = 42, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, fraccion));
    return '<svg class="tb-anillo" viewBox="0 0 100 100" role="img" aria-label="' + esc(etiqueta) + '">' +
      '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--tb-pista)" stroke-width="11"/>' +
      '<circle class="tb-anillo-arco" cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--series-1)" stroke-width="11" stroke-linecap="round" ' +
      'stroke-dasharray="' + (c * f).toFixed(2) + " " + c.toFixed(2) + '" style="--c:' + c.toFixed(2) + '" transform="rotate(-90 50 50)"/></svg>';
  }

  /* ============================ Montaje ============================ */
  function montar(raiz, opciones) {
    const O = Object.assign({
      nombre: "", anioDefault: null, rubros: [], excluirDeCuota: null,
      agua: null,               // { titulo, cobro: "la derrama", gasto: "las pipas" }
      sexto: "reserva",         // "reserva" | "agua"
      textos: {},
      clave: ""                 // sessionStorage del año elegido
    }, opciones || {});
    const T = O.textos;

    let modelo = null, anio = null, navegoDentro = false;
    raiz.classList.add("tb");
    raiz.innerHTML = '<div class="tb-cargando">Cargando cifras…</div>';

    /* ---------- estado ---------- */
    const anios = () => (modelo ? modelo.meses.map(m => m.anio).filter((a, i, arr) => arr.indexOf(a) === i).sort() : []);
    const delAnio = () => modelo.meses.filter(m => m.anio === anio);

    /* ---------- piezas comunes ---------- */
    function fuenteHTML() {
      const f = modelo.fuente || {};
      let cuando = "";
      if (f.generado) {
        const min2 = Math.round((Date.now() - new Date(f.generado).getTime()) / 60000);
        cuando = min2 < 1 ? " · actualizado hace un momento" : min2 < 60 ? " · actualizado hace " + plural(min2, "minuto", "minutos") : "";
      }
      return '<div class="tb-fuente' + (f.vivo ? " vivo" : "") + '"><span class="tb-punto"></span><span>' + (f.vivo ? "<b>En vivo</b> desde la hoja de la administración" + cuando : "<b>Copia guardada</b>" + (f.texto ? " · " + esc(f.texto) : "")) + "</span></div>";
    }
    function chipsAnio(destino) {
      const A = anios();
      if (A.length < 2) return "";
      return '<div class="tb-chips" role="tablist" aria-label="Año">' + A.map(a => '<button type="button" role="tab" aria-selected="' + (a === anio) + '" class="' + (a === anio ? "on" : "") + '" data-anio="' + a + '" data-destino="' + destino + '">' + a + "</button>").join("") + "</div>";
    }
    function cabecera(titulo, sub) {
      return '<div class="tb-barra"><button type="button" class="tb-atras" data-atras>‹ <span>Inicio</span></button><div class="tb-barra-t">' + esc(titulo) + "</div></div>" +
        (sub ? '<p class="tb-sub">' + sub + "</p>" : "");
    }
    function rango(M) {
      if (!M.length) return String(anio);
      const a = M[0], b = M[M.length - 1];
      const esperados = (b.anio - a.anio) * 12 + parseInt(b.id.slice(5), 10) - parseInt(a.id.slice(5), 10) + 1;
      if (M.length < esperados) return plural(M.length, "mes", "meses") + " entre " + min(a) + " y " + min(b) + " de " + anio;   // hay meses sin publicar
      return (a.id === b.id ? min(a) : min(a) + " a " + min(b)) + " de " + anio;
    }

    /* ---------- cálculos ---------- */
    function rubroDe(texto) {
      for (let i = 0; i < O.rubros.length; i++) if (O.rubros[i].re.test(texto)) return i;
      return -1;
    }
    /* Promedio mensual por rubro de lo que paga la cuota, por unidad. */
    function desgloseCuota(M) {
      const acc = O.rubros.map(() => 0);
      let otros = 0;
      M.forEach(m => m.grupos.filter(g => g.cuota !== false).forEach(g => {
        const its = g.items.length ? g.items : [{ concepto: g.nombre, detalle: "", monto: g.monto }];
        let suma = 0;
        its.forEach(it => {
          const texto = (it.concepto || "") + " " + (it.detalle || "");
          suma += it.monto;
          if (O.excluirDeCuota && O.excluirDeCuota.test(texto)) return;
          const r = rubroDe(texto);
          if (r < 0) otros += it.monto; else acc[r] += it.monto;
        });
        if (g.monto - suma > 1) otros += g.monto - suma;      // gasto sin desglose
      }));
      const n = Math.max(1, M.length), u = modelo.unidades || 1;
      const lista = O.rubros.map((r, i) => ({ nombre: r.nombre, valor: acc[i] / n / u, mensual: acc[i] / n, color: CAT[i % CAT.length] })).filter(x => x.valor > 0.5);
      lista.sort((a, b) => b.valor - a.valor);
      if (otros / n / u > 0.5) lista.push({ nombre: "Otros gastos", valor: otros / n / u, mensual: otros / n, color: OTROS });
      return lista;
    }
    function aguaDel(M) {
      const meses = M.filter(m => m.agua);
      return { cobrado: sum(meses.map(m => m.agua.cobrado)), pagado: sum(meses.map(m => m.agua.pagado)), meses: meses };
    }

    /* ---------- INICIO: seis indicadores ---------- */
    function vistaInicio() {
      const M = delAnio();
      if (!M.length) return '<div class="tb-vacio">Todavía no hay meses capturados.</div>';
      const u = M[M.length - 1], p = M[M.length - 2] || null;
      const resAnio = sum(M.map(resultadoDe));
      const ing = ingresosDe(u), egr = egresosDe(u), res = ing - egr;
      const tope = Math.max(ing, egr, 1);
      const unidades = modelo.unidades, cuota = modelo.cuota;

      /* 1 · Saldo */
      const neg = u.saldoFin < -0.5;
      const delta = p ? u.saldoFin - p.saldoFin : u.saldoFin - u.saldoIni;
      const c1 = '<a class="tb-card tb-hero ' + (neg ? "rojo" : "verde") + '" href="#graficas">' +
        '<div class="tb-k">Saldo en caja</div>' +
        '<div class="tb-hero-fila"><div><div class="tb-big" data-cuenta="' + u.saldoFin + '">' + $0(u.saldoFin) + "</div>" +
        '<div class="tb-estado"><span class="tb-pill ' + (neg ? "mal" : "bien") + '">' + (neg ? "▼ En números rojos" : "● Con saldo a favor") + "</span> " + (u.enCurso ? "hoy, con " + esc(min(u)) + " en curso" : "al cierre de " + esc(min(u))) + "</div></div>" +
        '<div class="tb-hero-spark">' + sparkline(M) + "</div></div>" +
        '<div class="tb-d">' + (delta >= 0 ? "Subió " : "Bajó ") + $0(Math.abs(delta)) + (p ? " respecto a " + esc(min(p)) : " en el mes") + " · En " + anio + " " + (resAnio >= 0 ? "ha sobrado " : "ha faltado ") + "<b>" + $0(Math.abs(resAnio)) + "</b></div>" +
        '<span class="tb-mas">Ver cómo ha cambiado ›</span></a>';

      /* 2 · El último mes: entró vs salió */
      const c2 = '<a class="tb-card" href="#mes-' + u.id + '">' +
        '<div class="tb-k">' + esc(u.nombre) + (u.enCurso ? " (en curso): así va" : ": ¿alcanzó?") + "</div>" +
        '<div class="tb-duelo"><div class="tb-duelo-f"><span>Entró</span><div class="tb-duelo-p"><i style="--w:' + (ing / tope * 100).toFixed(1) + '%; background:var(--series-1)"></i></div><b>' + $0(ing) + "</b></div>" +
        '<div class="tb-duelo-f"><span>Salió</span><div class="tb-duelo-p"><i style="--w:' + (egr / tope * 100).toFixed(1) + '%; background:var(--series-2)"></i></div><b>' + $0(egr) + "</b></div></div>" +
        '<div class="tb-veredicto ' + (res >= 0 ? "bien" : "mal") + '">' + (u.enCurso ? (res >= 0 ? "✓ Va sobrando " : "✕ Va faltando ") : (res >= 0 ? "✓ Sobraron " : "✕ Faltaron ")) + "<b>" + $0(Math.abs(res)) + "</b>" + (u.enCurso ? " · el mes no ha cerrado" : "") + "</div>" +
        '<span class="tb-mas">Ver el mes completo ›</span></a>';

      /* 3 · Cobranza */
      const pag = u.cobranza ? u.cobranza.pagaron : 0;
      const c3 = '<a class="tb-card tb-c-anillo" href="#meses">' +
        '<div class="tb-k">' + (u.enCurso ? "Avance de " + esc(min(u)) + ": ¿quién ya pagó?" : "¿Quién pagó su cuota en " + esc(min(u)) + "?") + "</div>" +
        '<div class="tb-anillo-fila">' + anillo(unidades ? pag / unidades : 0, pag + " de " + unidades + " unidades pagaron") +
        '<div class="tb-anillo-txt"><div class="tb-big" data-cuenta="' + pct(pag, unidades) + '" data-forma="pct">' + pct(pag, unidades) + "%</div><div class='tb-d'><b>" + pag + " de " + unidades + "</b> unidades</div></div></div>" +
        '<div class="tb-d">' + (pag >= unidades ? "Todas las unidades pagaron este mes." : u.enCurso ? plural(unidades - pag, "unidad aún no paga", "unidades aún no pagan") + "; el mes sigue corriendo." : plural(unidades - pag, "unidad no registró pago", "unidades no registraron pago") + " este mes" + (T.notaCobranza ? "; " + T.notaCobranza : ".")) + "</div>" +
        '<span class="tb-mas">Ver mes por mes ›</span></a>';

      /* 4 · Morosidad */
      let c4;
      const mo = u.mora;
      if (mo && typeof mo.acumulada === "number") {
        const nadie = mo.acumulada < 0.5;
        c4 = '<a class="tb-card" href="#morosidad">' +
          '<div class="tb-k">Cuotas atrasadas</div>' +
          '<div class="tb-big ' + (nadie ? "pos" : "neg") + '" data-cuenta="' + mo.acumulada + '">' + $0(mo.acumulada) + "</div>" +
          '<div class="tb-d">' + (nadie ? "✓ Nadie debe cuotas de " + anio + "." : "⚠ " + plural(mo.unidades, "unidad debe", "unidades deben") + " cuotas " + (T.moraDesde ? "desde " + T.moraDesde : "de " + anio) + ".") + "</div>" +
          (mo.adelantos > 0.5 ? '<div class="tb-d">Además hay ' + $0(mo.adelantos) + " pagados por adelantado (" + plural(mo.unidadesAdelanto, "unidad", "unidades") + ").</div>" : "") +
          '<span class="tb-mas">Ver la morosidad ›</span></a>';
      } else if (modelo.morosidadFoto) {
        const f = modelo.morosidadFoto;
        c4 = '<a class="tb-card" href="#morosidad">' +
          '<div class="tb-k">Adeudos al ' + esc(f.fecha) + "</div>" +
          '<div class="tb-big neg" data-cuenta="' + f.total + '">' + $0(f.total) + "</div>" +
          '<div class="tb-d">⚠ ' + plural(f.unidades, "unidad tenía", "unidades tenían") + " algún adeudo (mantenimiento, agua o elevador).</div>" +
          '<span class="tb-mas">Ver la morosidad ›</span></a>';
      } else {
        c4 = '<a class="tb-card" href="#morosidad"><div class="tb-k">Cuotas atrasadas</div><div class="tb-big">—</div><div class="tb-d">Pendiente de calcular.</div></a>';
      }

      /* 5 · ¿En qué se va tu cuota? */
      const des = desgloseCuota(M);
      const costo = sum(des.map(d => d.valor));
      const escalaCuota = Math.max(cuota, costo, 1);
      const diferencia = cuota - costo;
      const segs = des.map(d => '<i style="--w:' + (d.valor / escalaCuota * 100).toFixed(2) + "%; background:" + d.color + '" title="' + esc(d.nombre) + ": " + $0(d.valor) + '"></i>').join("") +
        (diferencia > 0.5 ? '<i class="tb-libre" style="--w:' + (diferencia / escalaCuota * 100).toFixed(2) + '%" title="Sobra: ' + $0(diferencia) + '"></i>' : "");
      const marcaCuota = costo > cuota ? '<span class="tb-marca-cuota" style="left:' + (cuota / escalaCuota * 100).toFixed(2) + '%"><em>tu cuota</em></span>' : "";
      const c5 = '<a class="tb-card tb-c-cuota" href="#gastos">' +
        '<div class="tb-k">¿En qué se van tus ' + $0(cuota) + " al mes?</div>" +
        '<div class="tb-cuota-barra">' + segs + marcaCuota + "</div>" +
        '<ul class="tb-leyenda">' + des.slice(0, 6).map(d => '<li><span class="tb-sw" style="background:' + d.color + '"></span><span class="tb-ley-n">' + esc(d.nombre) + "</span><b>" + $0(d.valor) + "</b></li>").join("") +
        (des.length > 6 ? '<li><span class="tb-sw" style="background:' + OTROS + '"></span><span class="tb-ley-n">Lo demás</span><b>' + $0(sum(des.slice(6).map(d => d.valor))) + "</b></li>" : "") + "</ul>" +
        '<div class="tb-veredicto ' + (diferencia >= 0 ? "bien" : "mal") + '">' + (diferencia >= 0
          ? "✓ Operar cuesta " + $0(costo) + " por unidad: sobran <b>" + $0(diferencia) + "</b>"
          : "✕ Operar cuesta " + $0(costo) + " por unidad: faltan <b>" + $0(-diferencia) + "</b>") + "</div>" +
        '<div class="tb-d">Promedio mensual de ' + esc(rango(M)) + (T.notaCuota ? " · " + T.notaCuota : "") + ".</div>" +
        '<span class="tb-mas">Ver en qué se gasta ›</span></a>';

      /* 6 · Agua o reserva */
      let c6;
      if (O.sexto === "agua" && O.agua) {
        const a = aguaDel(M);
        const cob = pct(a.cobrado, a.pagado);
        c6 = '<a class="tb-card" href="#agua">' +
          '<div class="tb-k">💧 ' + esc(O.agua.titulo || "El agua") + "</div>" +
          '<div class="tb-big" data-cuenta="' + cob + '" data-forma="pct">' + cob + "%</div>" +
          '<div class="tb-d">' + esc(O.agua.frase || "de lo que se pagó de agua se cubrió con lo cobrado") + " en " + anio + ".</div>" +
          '<div class="tb-progreso"><i style="--w:' + Math.min(100, cob) + '%"></i></div>' +
          '<div class="tb-d">Cobrado ' + $0(a.cobrado) + " · pagado " + $0(a.pagado) + "</div>" +
          '<span class="tb-mas">Ver el agua ›</span></a>';
      } else {
        const gasto = prom(M.map(egresosDe));
        const dias = gasto > 0 ? Math.max(0, u.saldoFin) / (gasto / 30) : 0;
        const txt = u.saldoFin <= 0 ? "0 días" : dias >= 60 ? (dias / 30).toFixed(1).replace(".0", "") + " meses" : Math.round(dias) + " días";
        c6 = '<a class="tb-card" href="#graficas">' +
          '<div class="tb-k">Si mañana no entrara nada…</div>' +
          '<div class="tb-big ' + (dias < 30 ? "neg" : "pos") + '">' + txt + "</div>" +
          '<div class="tb-d">alcanzaría el saldo para cubrir el gasto (promedio de ' + $0(gasto) + " al mes).</div>" +
          '<div class="tb-progreso ' + (dias < 30 ? "mal" : "") + '"><i style="--w:' + Math.min(100, dias / 60 * 100).toFixed(1) + '%"></i></div>' +
          '<div class="tb-d">Lo sano es al menos dos meses de reserva.</div>' +
          '<span class="tb-mas">Ver gráficas ›</span></a>';
      }

      /* Explorar */
      const tiles = [
        ["#meses", "📅", "Mes por mes", plural(M.length, "mes", "meses") + " de " + anio],
        ["#graficas", "📈", "Gráficas del año", "ingresos, gastos y saldo"],
        ["#gastos", "🧾", "En qué se gasta", "proveedores y conceptos"],
        ["#morosidad", "⏳", "Morosidad", "siempre agregada"]
      ];
      if (O.agua) tiles.push(["#agua", "💧", O.agua.titulo || "El agua", O.agua.tile || "cobrado vs. pagado"]);
      if (modelo.proyectos && modelo.proyectos.length) tiles.push(["#proyectos", "🔧", "Proyectos", plural(modelo.proyectos.length, "proyecto", "proyectos")]);
      if (modelo.revision && modelo.revision.length) tiles.push(["#revision", "🔍", "Revisión de documentos", plural(modelo.revision.length, "hallazgo", "hallazgos")]);
      tiles.push(["#acerca", "ℹ️", "Cómo leer esto", "de dónde salen los datos"]);

      return '<header class="tb-portada">' +
        '<div class="tb-portada-t"><h1>' + esc(T.titulo || "Las cuentas del condominio") + "</h1>" +
        '<p class="tb-sub">' + esc(rango(M)) + " · " + plural(unidades, "unidad", "unidades") + " · cuota de " + $0(cuota) + "</p></div>" + fuenteHTML() + "</header>" +
        chipsAnio("inicio") +
        (T.aviso ? '<div class="tb-aviso">' + T.aviso + "</div>" : "") +
        '<div class="tb-grid">' + c1 + c2 + c3 + c4 + c6 + c5 + "</div>" +
        '<h2 class="tb-h2">Consulta a detalle</h2>' +
        '<nav class="tb-tiles">' + tiles.map(t => '<a class="tb-tile" href="' + t[0] + '"><span class="tb-tile-i" aria-hidden="true">' + t[1] + '</span><span class="tb-tile-t">' + esc(t[2]) + '</span><span class="tb-tile-s">' + esc(t[3]) + "</span></a>").join("") + "</nav>" +
        '<p class="tb-privacidad">🛡️ ' + (T.privacidad || "La morosidad se publica siempre agregada: montos y número de unidades, sin identificar a nadie.") + "</p>";
    }

    /* ---------- MES POR MES ---------- */
    function vistaMeses() {
      const M = delAnio();
      const tope = Math.max(1, ...M.map(m => Math.max(ingresosDe(m), egresosDe(m))));
      const tarjetas = M.slice().reverse().map(m => {
        const i = ingresosDe(m), e = egresosDe(m), r = i - e;
        return '<a class="tb-mes" href="#mes-' + m.id + '">' +
          '<div class="tb-mes-cab"><span class="tb-mes-n">' + esc(m.nombre) + (m.enCurso ? ' <small class="tb-encurso">en curso</small>' : "") + '</span><span class="tb-pill ' + (r >= 0 ? "bien" : "mal") + '">' + (r >= 0 ? "sobró " : "faltó ") + $0(Math.abs(r)) + "</span></div>" +
          '<div class="tb-mes-b"><span>Entró</span><div class="tb-duelo-p"><i style="--w:' + (i / tope * 100).toFixed(1) + '%; background:var(--series-1)"></i></div><b>' + $k(i) + "</b></div>" +
          '<div class="tb-mes-b"><span>Salió</span><div class="tb-duelo-p"><i style="--w:' + (e / tope * 100).toFixed(1) + '%; background:var(--series-2)"></i></div><b>' + $k(e) + "</b></div>" +
          '<div class="tb-mes-pie"><span>Caja al cierre: <b class="' + (m.saldoFin < 0 ? "neg" : "") + '">' + $0(m.saldoFin) + "</b></span>" +
          (m.cobranza ? "<span>Pagaron " + m.cobranza.pagaron + "/" + modelo.unidades + "</span>" : "") + "</div>" +
          '<span class="tb-mas">Ver detalle ›</span></a>';
      }).join("");
      return cabecera("Mes por mes", "Toca un mes para ver su detalle: qué entró, en qué se gastó y quién pagó. " + esc(rango(M)) + ".") +
        chipsAnio("meses") + '<div class="tb-meses">' + tarjetas + "</div>" + tablaAnual(M);
    }
    function tablaAnual(M) {
      return '<details class="tb-tabla-det"><summary>Ver como tabla</summary><div class="tb-scroll"><table class="tb-tabla"><thead><tr><th>Mes</th><th>Entró</th><th>Salió</th><th>Resultado</th><th>Caja al cierre</th><th>Pagaron</th>' +
        (M.some(m => m.mora) ? "<th>Atrasado</th>" : "") + "</tr></thead><tbody>" +
        M.map(m => { const r = resultadoDe(m); return '<tr><td><a href="#mes-' + m.id + '">' + esc(m.nombre) + "</a></td><td>" + $0(ingresosDe(m)) + "</td><td>" + $0(egresosDe(m)) + '</td><td class="' + (r >= 0 ? "pos" : "neg") + '">' + firmado(r) + "</td><td>" + $0(m.saldoFin) + "</td><td>" + (m.cobranza ? m.cobranza.pagaron + "/" + modelo.unidades : "—") + "</td>" + (M.some(x => x.mora) ? "<td>" + (m.mora ? $0(m.mora.acumulada) : "—") + "</td>" : "") + "</tr>"; }).join("") +
        '<tr class="tb-total"><td>Total ' + anio + "</td><td>" + $0(sum(M.map(ingresosDe))) + "</td><td>" + $0(sum(M.map(egresosDe))) + "</td><td>" + firmado(sum(M.map(resultadoDe))) + "</td><td></td><td></td>" + (M.some(m => m.mora) ? "<td></td>" : "") + "</tr></tbody></table></div></details>";
    }

    /* ---------- DETALLE DE UN MES ---------- */
    function vistaMes(id) {
      const todos = modelo.meses;
      const k = todos.findIndex(m => m.id === id);
      if (k < 0) return null;
      const m = todos[k], ant = todos[k - 1], sig = todos[k + 1];
      anio = m.anio;
      const ing = ingresosDe(m), egr = egresosDe(m), res = ing - egr;
      const nav = '<div class="tb-mes-nav">' +
        (ant ? '<a class="tb-flecha" href="#mes-' + ant.id + '" data-reemplazar aria-label="Mes anterior">‹ ' + esc(ant.corto) + "</a>" : "<span></span>") +
        '<a class="tb-flecha tb-flecha-c" href="#meses">Todos los meses</a>' +
        (sig ? '<a class="tb-flecha" href="#mes-' + sig.id + '" data-reemplazar aria-label="Mes siguiente">' + esc(sig.corto) + " ›</a>" : "<span></span>") + "</div>";
      const tres = '<div class="tb-tres">' +
        '<div class="tb-tres-c"><span>Entró</span><b data-cuenta="' + ing + '">' + $0(ing) + "</b></div>" +
        '<div class="tb-tres-c"><span>Salió</span><b data-cuenta="' + egr + '">' + $0(egr) + "</b></div>" +
        '<div class="tb-tres-c ' + (res >= 0 ? "pos" : "neg") + '"><span>' + (res >= 0 ? "Sobró" : "Faltó") + '</span><b data-cuenta="' + Math.abs(res) + '">' + $0(Math.abs(res)) + "</b></div></div>" +
        '<div class="tb-caja-mes">Caja: empezó en <b>' + $0(m.saldoIni) + "</b> → cerró en <b class='" + (m.saldoFin < 0 ? "neg" : "pos") + "'>" + $0(m.saldoFin) + "</b></div>";

      /* Flujo: de dónde vino y a dónde se fue, como dos barras apiladas. */
      const tope = Math.max(ing, egr, 1);
      /* El color sigue al concepto por su lugar en la lista completa, aunque otro venga en cero. */
      const pila = (lista, colores) => '<div class="tb-pila">' + lista.map((x, i) => x.monto > 0.5 ? '<i style="--w:' + (x.monto / tope * 100).toFixed(2) + "%; background:" + colores[i % colores.length] + '" title="' + esc(x.nombre) + ": " + $0(x.monto) + '"></i>' : "").join("") + "</div>";
      /* Órdenes validados (separación para daltonismo entre vecinos de la pila). */
      const colIng = ["var(--tb-cat-1)", "var(--tb-cat-3)", "var(--tb-cat-7)", "var(--tb-cat-4)", "var(--tb-cat-5)"];
      const colEgr = ["var(--tb-cat-2)", "var(--tb-cat-3)", "var(--tb-cat-5)", "var(--tb-cat-7)"];
      const ingresos = m.ingresos.filter(x => x.monto > 0.5);
      const flujo = '<section class="tb-panel"><h3>De dónde vino y a dónde se fue</h3>' +
        '<div class="tb-flujo"><div class="tb-flujo-l">Entró</div>' + pila(ingresos, colIng) +
        '<ul class="tb-leyenda tb-leyenda-chica">' + ingresos.map((x, i) => '<li><span class="tb-sw" style="background:' + colIng[i % colIng.length] + '"></span><span class="tb-ley-n">' + esc(x.nombre) + "</span><b>" + $0(x.monto) + "</b></li>").join("") + "</ul></div>" +
        '<div class="tb-flujo"><div class="tb-flujo-l">Salió</div>' + pila(m.grupos, colEgr) +
        '<ul class="tb-leyenda tb-leyenda-chica">' + m.grupos.filter(g => g.monto > 0.5).map((g, i) => '<li><span class="tb-sw" style="background:' + colEgr[m.grupos.indexOf(g) % colEgr.length] + '"></span><span class="tb-ley-n">' + esc(g.nombre) + "</span><b>" + $0(g.monto) + "</b></li>").join("") + "</ul></div></section>";

      /* Gastos con su desglose, cada grupo se abre con un toque. */
      const gastos = '<section class="tb-panel"><h3>En qué se gastó' + (m.carpeta ? ' <a class="tb-link-chico" href="' + esc(m.carpeta) + '" target="_blank" rel="noopener">comprobantes del mes ↗</a>' : "") + "</h3>" +
        m.grupos.map((g, gi) => {
          const its = g.items.slice().sort((a, b) => b.monto - a.monto);
          return '<details class="tb-grupo"' + (gi === 0 ? " open" : "") + '><summary><span class="tb-sw" style="background:' + colEgr[gi % colEgr.length] + '"></span><span class="tb-grupo-n">' + esc(g.nombre) + '</span><span class="tb-grupo-c">' + plural(its.length, "gasto", "gastos") + "</span><b>" + $0(g.monto) + "</b></summary>" +
            (its.length ? '<ul class="tb-items">' + its.map(it => '<li><div class="tb-item-t"><span>' + esc(it.concepto) + "</span>" + (it.detalle ? "<small>" + esc(it.detalle) + "</small>" : "") + "</div>" +
              '<div class="tb-item-m">' + $2(it.monto) + (esLiga(it.liga) ? '<a class="tb-comprobante" href="' + esc(it.liga) + '" target="_blank" rel="noopener">comprobante ↗</a>' : "") + "</div></li>").join("") + "</ul>"
              : '<p class="tb-nota">' + (g.monto > 0.5 ? "Sin desglose capturado." : "Sin gastos de este tipo en el mes.") + "</p>") + "</details>";
        }).join("") + "</section>";

      /* Cobranza y morosidad del mes */
      const pag = m.cobranza ? m.cobranza.pagaron : 0, U = modelo.unidades;
      let cob = '<section class="tb-panel"><h3>Quién pagó</h3><div class="tb-anillo-fila">' + anillo(U ? pag / U : 0, pag + " de " + U) +
        '<div class="tb-anillo-txt"><div class="tb-big">' + pct(pag, U) + "%</div><div class='tb-d'><b>" + pag + " de " + U + "</b> unidades pagaron su cuota en " + esc(min(m)) + "</div></div></div>";
      if (m.mora && typeof m.mora.acumulada === "number") {
        cob += '<div class="tb-mini-grid"><div><span>Cuotas atrasadas al cierre</span><b class="' + (m.mora.acumulada > 0.5 ? "neg" : "pos") + '">' + $0(m.mora.acumulada) + "</b><small>" + plural(m.mora.unidades, "unidad", "unidades") + "</small></div>" +
          "<div><span>Pagado por adelantado</span><b>" + $0(m.mora.adelantos || 0) + "</b><small>" + plural(m.mora.unidadesAdelanto || 0, "unidad", "unidades") + "</small></div></div>" +
          '<p class="tb-nota">Quien pagó varios meses por adelantado aparece "sin pago" en los meses siguientes, pero no debe nada.</p>';
      }
      if (m.deudaAgua && m.deudaAgua.monto > 0.5) cob += '<p class="tb-nota">Agua pendiente de cobro este mes: <b>' + $0(m.deudaAgua.monto) + "</b> (" + plural(m.deudaAgua.unidades, "unidad", "unidades") + ").</p>";
      cob += "</section>";

      const extra = (m.indicadores && m.indicadores.length) || m.agua
        ? '<section class="tb-panel"><h3>Otros datos del mes</h3><dl class="tb-dl">' +
          (m.agua ? "<div><dt>Agua: cobrado</dt><dd>" + $0(m.agua.cobrado) + "</dd></div><div><dt>Agua: pagado</dt><dd>" + $0(m.agua.pagado) + "</dd></div>" : "") +
          (m.indicadores || []).map(x => "<div><dt>" + esc(x[0]) + "</dt><dd>" + esc(x[1]) + "</dd></div>").join("") + "</dl></section>" : "";

      return cabecera(m.nombre + " " + m.anio + (m.enCurso ? " · en curso" : ""), (m.enCurso ? "El mes todavía no cierra: las cifras son el avance al día de hoy. " : "") + (m.vivo ? "En vivo desde la hoja de captura." : "")) + nav +
        '<div class="tb-swipe" data-ant="' + (ant ? ant.id : "") + '" data-sig="' + (sig ? sig.id : "") + '">' + tres + flujo +
        '<div class="tb-dos">' + gastos + '<div class="tb-col">' + cob + extra + "</div></div></div>" + nav;
    }

    /* ---------- GRÁFICAS ---------- */
    function vistaGraficas() {
      const M = delAnio();
      return cabecera("Gráficas del año", esc(rango(M)) + ". Toca una barra o un punto para ver la cifra; tócalo otra vez para abrir ese mes.") + chipsAnio("graficas") +
        '<section class="tb-panel"><h3>Entró vs. salió, mes por mes</h3><div class="tb-leyenda-fila"><span><i class="tb-sw" style="background:var(--series-1)"></i>Entró</span><span><i class="tb-sw" style="background:var(--series-2)"></i>Salió</span></div><div class="tb-grafica" data-g="barras"></div></section>' +
        '<section class="tb-panel"><h3>Saldo en caja al cierre de cada mes</h3><div class="tb-grafica" data-g="saldo"></div>' + (T.notaSaldo ? '<p class="tb-nota">' + T.notaSaldo + "</p>" : "") + "</section>" +
        '<section class="tb-panel"><h3>Lo que sobró o faltó cada mes</h3><div class="tb-resultados">' + M.map(m => { const r = resultadoDe(m), t = Math.max(1, ...M.map(x => Math.abs(resultadoDe(x)))); return '<a class="tb-res" href="#mes-' + m.id + '"><span>' + esc(m.corto) + '</span><div class="tb-res-eje"><i class="' + (r >= 0 ? "pos" : "neg") + '" style="--w:' + (Math.abs(r) / t * 50).toFixed(1) + '%"></i></div><b class="' + (r >= 0 ? "pos" : "neg") + '">' + firmado(r) + "</b></a>"; }).join("") + "</div></section>" +
        tablaAnual(M);
    }

    /* ---------- EN QUÉ SE GASTA ---------- */
    function vistaGastos() {
      const M = delAnio();
      const des = desgloseCuota(M);
      const costo = sum(des.map(d => d.valor));
      /* Proveedores/conceptos del año */
      const acc = {};
      M.forEach(m => m.grupos.forEach(g => g.items.forEach(it => {
        const k = (it.concepto || "").trim();
        if (!k) return;
        const c = k.toLowerCase();
        acc[c] = acc[c] || { nombre: k, valor: 0, veces: 0, grupo: g.nombre };
        acc[c].valor += it.monto; acc[c].veces++;
      })));
      const top = Object.keys(acc).map(k => acc[k]).sort((a, b) => b.valor - a.valor);
      const grupos = {};
      M.forEach(m => m.grupos.forEach(g => { grupos[g.nombre] = (grupos[g.nombre] || 0) + g.monto; }));
      const totalG = sum(Object.keys(grupos).map(k => grupos[k]));
      return cabecera("En qué se gasta", esc(rango(M)) + ".") + chipsAnio("gastos") +
        '<section class="tb-panel"><h3>Tu cuota de ' + $0(modelo.cuota) + ", por rubro</h3>" +
        '<p class="tb-nota">Promedio mensual de lo que cuesta operar el condominio, dividido entre las ' + modelo.unidades + " unidades" + (T.notaCuota ? " (" + T.notaCuota + ")" : "") + ". Total: <b>" + $0(costo) + "</b> por unidad al mes.</p>" +
        '<div class="tb-grafica" data-g="cuota"></div></section>' +
        '<section class="tb-panel"><h3>Por tipo de gasto en ' + anio + "</h3>" +
        '<div class="tb-tipos">' + Object.keys(grupos).filter(k => grupos[k] > 0.5).map(k => '<div class="tb-tipo"><span>' + esc(k) + "</span><b>" + $0(grupos[k]) + "</b><small>" + pct(grupos[k], totalG) + "% del total</small></div>").join("") + "</div></section>" +
        '<section class="tb-panel"><h3>A quién se le pagó más en ' + anio + '</h3><div class="tb-grafica" data-g="top"></div>' +
        (top.length > 12 ? '<details class="tb-tabla-det"><summary>Ver los ' + top.length + " conceptos</summary><div class='tb-scroll'><table class='tb-tabla'><thead><tr><th>Concepto</th><th>Tipo</th><th>Veces</th><th>Total</th></tr></thead><tbody>" + top.map(t => "<tr><td>" + esc(t.nombre) + "</td><td>" + esc(t.grupo) + "</td><td>" + t.veces + "</td><td>" + $0(t.valor) + "</td></tr>").join("") + "</tbody></table></div></details>" : "") +
        "</section>";
    }

    /* ---------- MOROSIDAD ---------- */
    function vistaMorosidad() {
      const M = delAnio();
      const u = M[M.length - 1];
      const conMora = M.filter(m => m.mora && typeof m.mora.acumulada === "number");
      let html = cabecera("Morosidad", T.privacidad || "Siempre agregada: montos y número de unidades, sin identificar a nadie.") + chipsAnio("morosidad");
      if (conMora.length) {
        const mo = conMora[conMora.length - 1].mora;
        html += '<div class="tb-grid tb-grid-3">' +
          '<div class="tb-card"><div class="tb-k">Cuotas atrasadas al cierre de ' + esc(min(conMora[conMora.length - 1])) + '</div><div class="tb-big ' + (mo.acumulada > 0.5 ? "neg" : "pos") + '">' + $0(mo.acumulada) + '</div><div class="tb-d">' + plural(mo.unidades, "unidad", "unidades") + " con cuotas sin pagar" + (T.moraDesde ? " desde " + T.moraDesde : " del año") + "</div></div>" +
          '<div class="tb-card"><div class="tb-k">Pagado por adelantado</div><div class="tb-big">' + $0(mo.adelantos || 0) + '</div><div class="tb-d">' + plural(mo.unidadesAdelanto || 0, "unidad", "unidades") + " con meses ya cubiertos</div></div>" +
          '<div class="tb-card"><div class="tb-k">Sin pago en ' + esc(min(u)) + '</div><div class="tb-big">' + (u.cobranza ? modelo.unidades - u.cobranza.pagaron : "—") + ' <small>de ' + modelo.unidades + '</small></div><div class="tb-d">incluye a quien ya había pagado por adelantado</div></div></div>' +
          '<section class="tb-panel"><h3>Cuotas atrasadas y adelantos al cierre de cada mes</h3><div class="tb-leyenda-fila"><span><i class="tb-sw" style="background:var(--series-2)"></i>Atrasado</span><span><i class="tb-sw" style="background:var(--series-1)"></i>Adelantado</span></div><div class="tb-grafica" data-g="mora"></div>' +
          '<p class="tb-nota"><b>Cómo se lee.</b> Para cada unidad se compara lo pagado en el año contra las cuotas transcurridas. Si pagó de menos, la diferencia es "atrasado"; si pagó meses por adelantado, es "adelantado". Solo se publican las sumas.</p></section>';
      }
      if (modelo.morosidadFoto) {
        const f = modelo.morosidadFoto;
        html += '<section class="tb-panel"><h3>' + esc(f.titulo || "Foto de adeudos al " + f.fecha) + "</h3>" +
          '<div class="tb-tipos">' + '<div class="tb-tipo"><span>Unidades con algún adeudo</span><b>' + f.unidades + " de " + modelo.unidades + "</b><small>al " + esc(f.fecha) + "</small></div>" +
          '<div class="tb-tipo"><span>Adeudo total</span><b class="neg">' + $0(f.total) + "</b><small>suma de todos los conceptos</small></div>" +
          f.partes.map(p => '<div class="tb-tipo"><span>' + esc(p.nombre) + "</span><b>" + $0(p.monto) + "</b><small>" + plural(p.unidades, "unidad", "unidades") + (p.nota ? " · " + esc(p.nota) : "") + "</small></div>").join("") + "</div>" +
          (f.nota ? '<p class="tb-nota">' + f.nota + "</p>" : "") + "</section>";
      }
      if (!conMora.length && !modelo.morosidadFoto) html += '<div class="tb-vacio">La morosidad de este año todavía no está calculada.</div>';
      html += '<p class="tb-nota">' + (T.notaMorosidad || "Los adeudos se gestionan de manera directa y confidencial entre la administración y cada unidad.") + "</p>";
      return html;
    }

    /* ---------- AGUA ---------- */
    function vistaAgua() {
      const M = delAnio();
      const a = aguaDel(M);
      const dif = a.cobrado - a.pagado;
      return cabecera(O.agua.titulo || "El agua", esc(O.agua.explica || "")) + chipsAnio("agua") +
        '<div class="tb-grid tb-grid-3">' +
        '<div class="tb-card"><div class="tb-k">Se cobró</div><div class="tb-big">' + $0(a.cobrado) + '</div><div class="tb-d">' + esc(O.agua.cobro || "a los condóminos") + " en " + anio + "</div></div>" +
        '<div class="tb-card"><div class="tb-k">Se pagó</div><div class="tb-big">' + $0(a.pagado) + '</div><div class="tb-d">' + esc(O.agua.gasto || "de agua") + " en " + anio + "</div></div>" +
        '<div class="tb-card"><div class="tb-k">' + (dif >= 0 ? "Sobró" : "Lo puso la cuota de mantenimiento") + '</div><div class="tb-big ' + (dif >= 0 ? "pos" : "neg") + '">' + $0(Math.abs(dif)) + '</div><div class="tb-d">cobertura: ' + pct(a.cobrado, a.pagado) + "%</div></div></div>" +
        '<section class="tb-panel"><h3>Cobrado vs. pagado, mes por mes</h3><div class="tb-leyenda-fila"><span><i class="tb-sw" style="background:var(--series-1)"></i>Cobrado</span><span><i class="tb-sw" style="background:var(--series-2)"></i>Pagado</span></div><div class="tb-grafica" data-g="agua"></div>' +
        (O.agua.nota ? '<p class="tb-nota">' + O.agua.nota + "</p>" : "") + "</section>";
    }

    /* ---------- PROYECTOS ---------- */
    function vistaProyectos() {
      return cabecera("Proyectos", esc(T.notaProyectos || "Trabajos y obras del condominio.")) +
        '<div class="tb-proyectos">' + (modelo.proyectos || []).map(p => '<article class="tb-proy"><h3>' + esc(p.nombre) + "</h3>" +
          (p.estado ? '<p class="tb-proy-e">' + esc(p.estado) + "</p>" : "") +
          '<div class="tb-proy-pie">' + (p.monto ? "<b>" + $0(p.monto) + "</b>" + (p.montoEtiqueta ? " <small>" + esc(p.montoEtiqueta) + "</small>" : "") : p.avance ? "<b>" + esc(p.avance) + "</b>" : "<small>monto por definir</small>") +
          (esLiga(p.liga) ? ' <a href="' + esc(p.liga) + '" target="_blank" rel="noopener">ver avance ↗</a>' : "") + "</div>" +
          (p.nota ? '<p class="tb-nota">' + esc(p.nota) + "</p>" : "") + "</article>").join("") + "</div>";
    }

    /* ---------- REVISIÓN ---------- */
    function vistaRevision() {
      const R = modelo.revision || [];
      const n = R.filter(r => r.tipo === "incongruencia").length;
      return cabecera("Revisión de los documentos", esc(T.notaRevision || (n + " incongruencias y " + (R.length - n) + " observaciones."))) +
        '<div class="tb-revision">' + R.map(r => '<details class="tb-issue ' + esc(r.tipo) + '"><summary><span class="tb-pill ' + (r.tipo === "incongruencia" ? "mal" : "neutro") + '">' + (r.tipo === "incongruencia" ? "No cuadra" : "Observación") + "</span><span>" + esc(r.titulo) + "</span></summary><p>" + esc(r.detalle) + "</p></details>").join("") + "</div>";
    }

    /* ---------- ACERCA ---------- */
    function vistaAcerca() {
      return cabecera("Cómo leer esto", "") + fuenteHTML() +
        '<section class="tb-panel tb-texto">' + (T.acerca || "") +
        "<h3>Las palabras</h3><dl class='tb-glosario'>" +
        "<div><dt>Entró</dt><dd>Todo lo que se cobró en el mes: cuotas de mantenimiento y lo demás.</dd></div>" +
        "<div><dt>Salió</dt><dd>Todo lo que se pagó en el mes, con su comprobante cuando existe.</dd></div>" +
        "<div><dt>Saldo en caja</dt><dd>Lo que queda en la cuenta al cierre del mes. Si es negativo, el condominio debe más de lo que tiene.</dd></div>" +
        "<div><dt>Cuotas atrasadas</dt><dd>La suma de lo que deben las unidades que no han pagado todas sus cuotas. Nunca se dice quiénes.</dd></div>" +
        "<div><dt>Tu cuota, por rubro</dt><dd>El gasto promedio del mes dividido entre todas las unidades: lo que a cada quien le toca pagar para que el condominio funcione.</dd></div>" +
        "</dl>" +
        '<p class="tb-nota">🛡️ ' + (T.privacidad || "") + "</p></section>";
    }

    /* ============================ Router ============================ */
    const VISTAS = { inicio: vistaInicio, meses: vistaMeses, graficas: vistaGraficas, gastos: vistaGastos, morosidad: vistaMorosidad, agua: vistaAgua, proyectos: vistaProyectos, revision: vistaRevision, acerca: vistaAcerca };
    let vistaActual = "", hashActual = null;

    function pintar(forzarArriba) {
      if (!modelo) return;
      const h = location.hash.replace(/^#/, "");
      let html = null, nombre = "inicio";
      const mm = /^mes-(\d{4}-\d{2})$/.exec(h);
      if (mm) { html = vistaMes(mm[1]); nombre = "mes"; }
      else if (VISTAS[h] && !(h === "agua" && !O.agua)) { nombre = h; html = VISTAS[h](); }
      if (html == null) { nombre = "inicio"; html = vistaInicio(); }
      const cambio = h !== hashActual;
      hashActual = h; vistaActual = nombre;
      raiz.setAttribute("data-vista", nombre);
      raiz.innerHTML = '<div class="tb-vista">' + html + "</div>";
      dibujar();
      if (cambio) animarCifras(raiz);       // al llegar datos en vivo no se repite la animación
      else raiz.querySelectorAll(".tb-vista").forEach(v => { v.style.animation = "none"; });
      ocultarTip();
      /* La barra "‹ Inicio" se pega justo debajo del encabezado del sitio cuando éste es fijo. */
      const cab = document.querySelector(".site-header");
      const alto = cab && getComputedStyle(cab).position === "sticky" ? cab.offsetHeight : 0;
      raiz.style.setProperty("--tb-arriba", alto + "px");
      if (cambio || forzarArriba) {
        const top = raiz.getBoundingClientRect().top + window.scrollY - alto - 4;
        if (nombre !== "inicio" || window.scrollY > top) window.scrollTo(0, Math.max(0, nombre === "inicio" ? 0 : top));
      }
    }

    /* Dibuja las gráficas de la vista actual (dependen del ancho). */
    function dibujar() {
      const M = delAnio();
      raiz.querySelectorAll(".tb-grafica").forEach(caja => {
        const g = caja.getAttribute("data-g");
        if (!M.length) return;
        if (g === "barras") graficaBarras(caja, M, [{ nombre: "Entró", color: "var(--series-1)", valor: ingresosDe }, { nombre: "Salió", color: "var(--series-2)", valor: egresosDe }],
          { abrir: true, aria: "Ingresos y egresos por mes", pie: m => { const r = resultadoDe(m); return '<div class="tb-tip-sub">' + (r >= 0 ? "sobró " : "faltó ") + $0(Math.abs(r)) + "</div>"; } });
        else if (g === "saldo") graficaSaldo(caja, M);
        else if (g === "mora") { const C = M.filter(m => m.mora); if (C.length) graficaBarras(caja, C, [{ nombre: "Atrasado", color: "var(--series-2)", valor: m => m.mora.acumulada || 0 }, { nombre: "Adelantado", color: "var(--series-1)", valor: m => m.mora.adelantos || 0 }], { abrir: true, alto: 220, aria: "Cuotas atrasadas y adelantadas por mes" }); }
        else if (g === "agua") { const A = M.filter(m => m.agua); if (A.length) graficaBarras(caja, A, [{ nombre: "Cobrado", color: "var(--series-1)", valor: m => m.agua.cobrado }, { nombre: "Pagado", color: "var(--series-2)", valor: m => m.agua.pagado }], { abrir: true, alto: 240, aria: "Agua cobrada y pagada por mes", pie: m => '<div class="tb-tip-sub">cobertura ' + pct(m.agua.cobrado, m.agua.pagado) + "%</div>" }); }
        else if (g === "cuota") graficaHorizontal(caja, desgloseCuota(M), { sufijo: " por unidad al mes" });
        else if (g === "top") {
          const acc = {};
          M.forEach(m => m.grupos.forEach(gr => gr.items.forEach(it => { const k = (it.concepto || "").trim(); if (!k) return; const c = k.toLowerCase(); acc[c] = acc[c] || { nombre: k, valor: 0, n: 0, sub: gr.nombre }; acc[c].valor += it.monto; acc[c].n++; })));
          const lista = Object.keys(acc).map(k => acc[k]).sort((a, b) => b.valor - a.valor).slice(0, 12).map(x => ({ nombre: x.nombre, valor: x.valor, sub: x.sub + " · " + plural(x.n, "pago", "pagos") }));
          graficaHorizontal(caja, lista);
        }
      });
    }

    /* Clics dentro del tablero: atrás, año, navegación de meses sin llenar el historial. */
    raiz.addEventListener("click", e => {
      const atras = e.target.closest("[data-atras]");
      if (atras) {
        e.preventDefault();
        if (navegoDentro && history.length > 1) history.back(); else location.hash = "#inicio";
        return;
      }
      const ch = e.target.closest("[data-anio]");
      if (ch) {
        anio = +ch.getAttribute("data-anio");
        try { sessionStorage.setItem(O.clave + "Anio", anio); } catch (_) { /* sin almacenamiento */ }
        pintar();
        return;
      }
      const rep = e.target.closest("a[data-reemplazar]");
      if (rep) {
        e.preventDefault();
        history.replaceState(null, "", rep.getAttribute("href"));
        pintar(true);
      }
    });
    window.addEventListener("hashchange", () => { navegoDentro = true; pintar(); });
    let espera = null, anchoPrevio = window.innerWidth;
    window.addEventListener("resize", () => {
      if (Math.abs(window.innerWidth - anchoPrevio) < 8) return;
      anchoPrevio = window.innerWidth;
      clearTimeout(espera);
      espera = setTimeout(dibujar, 150);
    });
    /* Deslizar a los lados en el detalle de un mes cambia de mes. */
    let x0 = null, y0 = null;
    raiz.addEventListener("touchstart", e => { if (vistaActual === "mes" && e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    raiz.addEventListener("touchend", e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (e.target.closest(".tb-scroll, .tb-grafica")) return;
      const s = raiz.querySelector(".tb-swipe");
      const id = s && s.getAttribute(dx < 0 ? "data-sig" : "data-ant");
      if (id) { history.replaceState(null, "", "#mes-" + id); pintar(true); }
    }, { passive: true });

    return {
      actualizar(nuevo) {
        /* Un mes futuro (alguien pagó diciembre por adelantado) nunca se muestra como mes. */
        const h = new Date(), hoyId = h.getFullYear() + "-" + String(h.getMonth() + 1).padStart(2, "0");
        nuevo.meses = nuevo.meses.filter(m => m.id <= hoyId).map(m => Object.assign(m, { enCurso: m.id === hoyId }));
        modelo = nuevo;
        const A = anios();
        let guardado = null;
        try { guardado = +sessionStorage.getItem(O.clave + "Anio"); } catch (_) { /* sin almacenamiento */ }
        if (!anio || A.indexOf(anio) < 0) anio = A.indexOf(guardado) >= 0 ? guardado : A[A.length - 1];
        if (A.length && nuevo.fuente && nuevo.fuente.vivo && !guardado) anio = A[A.length - 1];
        pintar();
      },
      modelo: () => modelo
    };
  }

  window.Tablero = { montar: montar, formato: { $0: $0, $2: $2 } };
})();
