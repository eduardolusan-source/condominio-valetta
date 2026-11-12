/* Sección financiera — Condominio La Valetta.
   La pantalla la dibuja js/tablero.js (motor común con Lahia y Las Misiones);
   este archivo pone la clave de acceso, consigue los datos y los traduce al
   formato del tablero. */
(function () {
  "use strict";

  /* ---------- Origen de datos en vivo ----------
     El Apps Script de apps-script/Code.gs (pasos en apps-script/INSTALAR.md)
     lee las pestañas mensuales de la hoja "Valetta-Captura-Mensual" y entrega
     las cifras AGREGADAS de cada mes. Un mes aparece en el sitio en cuanto su
     pestaña tiene datos; no hay que tocar nada cada mes.
     Si el script no responde, se muestra la copia de js/data.js.
     REGLA: lo que entrega el script lo puede leer cualquiera con la URL; la
     clave del sitio no lo protege. Por eso solo viajan agregados. */
  /* Implementación publicada el 12 nov 2026 (cambio de año y archivo anual). La anterior
     (…AKfycbzU158…/exec) quedó con el script viejo: si algún día se borra, nada se rompe. */
  const API_URL = "https://script.google.com/macros/s/AKfycbzU158AMEbF-QhMMVPQ4sjREkfEzBT4FYzLsA_Gj3uls50R1d9STamu9FvjVUSb957tvw/exec";

  /* ---------- Portón de acceso ---------- */
  const KEY_HASH = "16740bf13991fe083fbe5820cc8da08a5d88e5a48f44a3cfcc283c27b2797ba7";
  const gate = document.getElementById("gate");
  const content = document.getElementById("content");

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  document.getElementById("gateForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const err = document.getElementById("gateError");
    if (!window.crypto || !crypto.subtle) { err.textContent = "Abre el sitio desde su dirección https para poder validar la clave."; return; }
    const val = document.getElementById("gateKey").value.trim();
    if ((await sha256(val)) === KEY_HASH) abrir();
    else {
      err.textContent = "Clave incorrecta. Solicítala a la Administración.";
      document.getElementById("gateKey").value = "";
      document.getElementById("gateKey").focus();
    }
  });

  /* ---------- Del formato de la hoja al formato del tablero ---------- */
  const NOMBRES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const n = v => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
  const items = lista => (lista || []).map(it => ({ concepto: it[0] || "", detalle: "", monto: n(it[1]), liga: it[2] || "" }));

  function mes(o, vivo) {
    const num = parseInt(o.id.slice(5), 10);
    const nombre = o.nombre || NOMBRES[num - 1];
    const ing = o.ingresos || {}, egr = o.egresos || {}, det = o.detalle || {}, mr = o.mora || null;
    const ingresos = [{ nombre: "Cuotas de mantenimiento", monto: n(ing.manto) }];
    if (n(ing.agua)) ingresos.push({ nombre: "Agua de áreas comunes", monto: n(ing.agua) });
    ingresos.push({ nombre: "Casa club (limpieza y fondo)", monto: n(ing.casaClub) });
    const tieneMora = mr && typeof mr.acumulada === "number";
    return {
      id: o.id, anio: parseInt(o.id.slice(0, 4), 10), nombre: nombre, corto: o.corto || nombre.slice(0, 3), vivo: !!vivo,
      saldoIni: n(o.saldoIni), saldoFin: n(o.saldoFin),
      ingresos: ingresos,
      grupos: [
        { clave: "fijos", nombre: "Gastos fijos (servicios)", monto: Math.abs(n(egr.fijos)), cuota: true, items: items(det.fijos) },
        { clave: "variables", nombre: "Gastos variables", monto: Math.abs(n(egr.variables)), cuota: true, items: items(det.variables) }
      ],
      cobranza: { pagaron: n((o.cobranza || {}).pagaron), pct: n((o.cobranza || {}).pct) },
      mora: tieneMora ? { acumulada: n(mr.acumulada), unidades: n(mr.unidades), adelantos: n(mr.adelantos), unidadesAdelanto: n(mr.unidadesAdelanto) } : null,
      agua: null, indicadores: []
    };
  }

  function proyectos(lista) {
    return (lista || []).map(p => ({ nombre: p.nombre, estado: p.estado, monto: p.presupuesto || null, montoEtiqueta: p.presupuesto ? "ejercido" : "", avance: p.avance || "", liga: p.liga || "" }));
  }
  function rangoTexto(meses) {
    if (!meses.length) return "";
    const a = meses[0], b = meses[meses.length - 1];
    return a.nombre + " a " + b.nombre.toLowerCase() + " de " + b.anio;
  }

  function modeloLocal() {
    const meses = VALETTA.meses.map(m => mes(m, false));
    return { unidades: VALETTA.unidades, cuota: VALETTA.cuota, meses: meses, proyectos: proyectos(VALETTA.proyectos), fuente: { vivo: false, texto: rangoTexto(meses) } };
  }

  /* La última respuesta en vivo se guarda en el teléfono: la siguiente visita la pinta al instante
     y la hoja la actualiza en segundo plano (sin «brincar» desde la copia vieja de data.js). */
  const LS = "valetta.fin.vivo";
  function guardada() { try { const j = JSON.parse(localStorage.getItem(LS) || "null"); return j && j.ok ? j : null; } catch (_) { return null; } }
  async function modeloVivo() {
    if (!API_URL) return null;
    const r = await fetch(API_URL + (API_URL.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now(), { cache: "no-store", redirect: "follow" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j || !j.ok) throw new Error((j && j.error) || "respuesta sin datos");
    try { localStorage.setItem(LS, JSON.stringify(j)); } catch (_) { /* sin espacio */ }
    return deRespuesta(j);
  }
  function deRespuesta(j) {
    const meses = (j.meses || []).filter(m => /^\d{4}-\d{2}$/.test(String(m.id || ""))).map(m => mes(m, true)).sort((a, b) => a.id.localeCompare(b.id));
    if (!meses.length) throw new Error("el script no trae meses capturados");
    return {
      unidades: n(j.unidades) || VALETTA.unidades, cuota: n(j.cuota) || VALETTA.cuota, meses: meses,
      proyectos: Array.isArray(j.proyectos) && j.proyectos.length ? proyectos(j.proyectos) : proyectos(VALETTA.proyectos),
      fuente: { vivo: true, generado: j.generado, texto: rangoTexto(meses) }
    };
  }

  /* ---------- Tablero ---------- */
  const OPCIONES = {
    clave: "valetta",
    sexto: "reserva",
    /* El orden fija el color de cada rubro. */
    rubros: [
      { nombre: "Administración, vigilancia y limpieza", re: /asistencia administrativa|administraci|vigilancia/i },
      { nombre: "Elevador", re: { test: t => /elevador/i.test(t) && !/\bluz\b|cfe/i.test(t) } },   // su recibo de luz cuenta como luz
      { nombre: "Luz (CFE)", re: /\bluz\b|cfe|foco|l[aá]mpara/i },
      { nombre: "Pintura y reparaciones", re: /pintura|resane|mantenimiento general|trabajos|v[aá]lvula|flotador|cisterna|cerca|sensor|conexiones|refacci/i },
      { nombre: "Jardinería y riego", re: /riego|poda|maleza|jard/i },
      { nombre: "Teléfono e internet", re: /telmex|tel[eé]fono|internet/i },
      { nombre: "Artículos de limpieza", re: /limpieza|escoba|recogedor|consumible/i }
    ],
    textos: {
      titulo: "Las cuentas de La Valetta",
      notaSaldo: "La Valetta opera con un colchón de pocos miles de pesos: un gasto extraordinario o una baja en la cobranza se siente de inmediato.",
      notaProyectos: "Trabajos realizados o en curso, según la hoja de la Administración.",
      privacidad: "Por disposición de la Ley de protección de datos personales, la morosidad se informa siempre agregada: montos y número de unidades, sin identificar ningún departamento.",
      notaMorosidad: "Los adeudos se gestionan de manera directa y confidencial entre la Administración y cada unidad.",
      acerca: "<h3>De dónde salen los datos</h3><p>De la hoja de captura mensual de la Administración (Valetta-Captura-Mensual): una pestaña por mes con los cobros, los gastos fijos y variables y, cuando existe, la liga al comprobante en Drive.</p>" +
        "<p>Cuando aparece <b>En vivo</b>, la página lee la hoja cada vez que se abre (puede tardar hasta cinco minutos en reflejar un cambio). Cuando dice <b>Copia guardada</b>, muestra la última copia publicada en el sitio.</p>" +
        "<p>Un mes aparece en cuanto su pestaña tiene cobros o gastos; las pestañas en blanco se ignoran.</p>"
    }
  };

  let tablero = null;
  function abrir() {
    gate.hidden = true;
    content.hidden = false;
    try { localStorage.setItem("valettaFin", "1"); } catch (_) { /* sin almacenamiento */ }
    if (tablero) return;
    tablero = Tablero.montar(document.getElementById("tablero"), OPCIONES);
    let previa = null; try { const g = guardada(); if (g) previa = deRespuesta(g); } catch (_) { previa = null; }
    tablero.actualizar(previa || modeloLocal());
    modeloVivo().then(m => { if (m) tablero.actualizar(m); })
      .catch(e => console.warn("[Valetta] El script de la hoja no respondió (" + e.message + "). Se muestra la copia de js/data.js."));
  }

  let guardado = null;
  try { guardado = localStorage.getItem("valettaFin") || sessionStorage.getItem("valettaFin"); } catch (_) { /* sin almacenamiento */ }
  if (guardado === "1") abrir();
})();
