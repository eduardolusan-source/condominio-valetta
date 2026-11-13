/* El edificio de noche · cada ventana encendida es un departamento al corriente.
   ANÓNIMO: el servicio (accion=anonimo) solo entrega conteos por mes; las ventanas se encienden en orden,
   de abajo hacia arriba, y su lugar no corresponde a ningún departamento.
   Uso: Noche.montar(elemento, { nombre: "LAHIA", columnas: 5, api: "https://…/exec", llave: "lahia.noche" }) */
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $m = n => "$" + Math.round(n).toLocaleString("es-MX");
  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const nomMes = id => MES[parseInt(id.slice(5), 10) - 1];
  const pl = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  const CATS = [["al", "Al corriente"], ["parte", "Debe parte de una cuota"], ["uno", "Debe 1 mes"], ["dos", "Debe 2 meses"], ["tres", "Debe 3 o más"]];

  function montar(raiz, opc) {
    let J = null, mes = "", animar = true;
    const col = opc.columnas || 4;

    function pintar() {
      if (!J || !J.meses.length) return;
      const M = J.meses.find(x => x.id === mes) || J.meses[J.meses.length - 1], U = M.total || J.unidades;
      const pct = U ? Math.round(M.al / U * 100) : 0, curso = M.enCurso;
      /* Ventanas: primero las encendidas, de abajo hacia arriba */
      const orden = []; CATS.forEach(c => { for (let i = 0; i < (M[c[0]] || 0); i++) orden.push(c[0]); });
      while (orden.length < U) orden.push("nd");
      const pisos = Math.ceil(U / col), filas = [];
      for (let p = 0; p < pisos; p++) filas.push(orden.slice(p * col, p * col + col));
      let edif = "";
      for (let p = pisos - 1; p >= 0; p--) {
        edif += '<div class="nc-piso" style="grid-template-columns:repeat(' + col + ',1fr)">' +
          filas[p].map((c, k) => '<i class="nc-v ' + c + '" style="--i:' + (p * col + k) + '"></i>').join("") + "</div>";
      }
      /* Frase */
      const atras = M.uno + M.dos + M.tres;
      let frase;
      if (curso) frase = "En <b>" + nomMes(M.id) + "</b>, que sigue en curso, ya están al corriente <b>" + M.al + " de " + U + "</b> departamentos. " +
        (atras + M.parte ? pl(M.uno + M.parte, "aún no completa", "aún no completan") + " este mes" + (M.dos + M.tres ? " y " + pl(M.dos + M.tres, "arrastra", "arrastran") + " meses anteriores." : ".") : "¡Todos al día!");
      else frase = "En <b>" + nomMes(M.id) + "</b>, <b>" + M.al + " de " + U + "</b> departamentos estaban al corriente. " +
        (atras + M.parte ? [M.parte ? pl(M.parte, "debía parte de una cuota", "debían parte de una cuota") : "", M.uno ? pl(M.uno, "debía un mes", "debían un mes") : "", M.dos ? pl(M.dos, "debía dos", "debían dos") : "", M.tres ? pl(M.tres, "debía tres o más", "debían tres o más") : ""].filter(Boolean).join(", ").replace(/, ([^,]*)$/, " y $1") + "." : "¡Todo el edificio al día! 🎉");
      /* Tendencia */
      const H = J.hoyDeben || {};
      const ley = CATS.filter(c => M[c[0]]).map(c => '<li><i class="nc-v ' + c[0] + '"></i><span>' + (curso && c[0] === "uno" ? "Aún no paga este mes" : c[1]) + "</span><b>" + M[c[0]] + "</b></li>").join("");
      raiz.innerHTML = '<div class="nc-card">' +
        '<p class="nc-k">' + esc(opc.kicker || "Así va el edificio") + "</p>" +
        '<h2 class="nc-h">Cada ventana encendida es un departamento al corriente</h2>' +
        '<div class="nc-meses">' + J.meses.map(x => '<button type="button" data-mes="' + x.id + '" class="' + (x.id === M.id ? "sel" : "") + '">' + esc(x.nombre.replace(/ \d{4}$/, "")) + (x.enCurso ? " · en curso" : "") + "</button>").join("") + "</div>" +
        '<div class="nc-cols">' +
          '<div class="nc-escena' + (animar ? " nc-anima" : "") + '"><span class="nc-luna"></span><span class="nc-estrellas"></span>' +
            '<div class="nc-edif" style="--col:' + col + '"><div class="nc-azotea"><span>' + esc(opc.nombre || "") + "</span></div>" + edif + '<div class="nc-entrada"><i></i></div></div><div class="nc-calle"></div>' +
            '<div class="nc-cifra"><b>' + M.al + "</b><span>de " + U + "<br>al corriente</span><em>" + pct + "%</em></div></div>" +
          '<div class="nc-datos">' +
            '<p class="nc-frase">' + frase + "</p>" +
            '<ul class="nc-ley">' + ley + "</ul>" +
            '<div class="nc-hoy' + (H.deptos ? "" : " cero") + '"><small>Adeudo vencido hoy</small>' + (H.deptos ? "<b>" + $m(H.monto) + "</b><span>entre " + pl(H.deptos, "departamento", "departamentos") + "</span>" : "<b>$0</b><span>nadie debe cuotas vencidas</span>") +
              (H.aguaDeptos ? '<span class="nc-agua">💧 Agua: ' + pl(H.aguaDeptos, "depto debe", "deptos deben") + " " + $m(H.agua) + "</span>" : "") + "</div>" +
            '<p class="nc-nota">🛡️ Anónimo: las ventanas se encienden en orden y no corresponden a ningún departamento. Para ver tu propia cuenta usa <a href="micuenta.html">Mi cuenta</a>.</p>' +
            '<p class="nc-estado" data-estado>' + esc(opc.estado || "") + "</p>" +
          "</div></div></div>";
      animar = false;
      const s = raiz.querySelector(".nc-meses .sel"); if (s) s.scrollIntoView({ inline: "center", block: "nearest" });
    }
    raiz.addEventListener("click", e => { const b = e.target.closest("[data-mes]"); if (b && J) { mes = b.dataset.mes; animar = true; pintar(); } });

    function usar(j, estado) {
      if (!j || !j.ok || !j.meses || !j.meses.length) return false;
      /* Solo el mes actual y el anterior. */
      J = Object.assign({}, j, { meses: j.meses.filter(x => !j.hoy || x.id <= j.hoy).slice(-2) }); j = J; opc.estado = estado;
      if (!mes || !j.meses.some(x => x.id === mes)) { const cerrados = j.meses.filter(x => !x.enCurso); mes = (cerrados.length ? cerrados : j.meses)[(cerrados.length ? cerrados : j.meses).length - 1].id; }
      raiz.hidden = false; pintar(); return true;
    }
    let visto = false;
    try { visto = usar(JSON.parse(localStorage.getItem(opc.llave) || "null"), "Actualizando…"); } catch (e) {}
    if (!visto) raiz.hidden = true;
    if (!opc.api) return;
    fetch(opc.api + "?accion=anonimo&t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).then(j => {
      if (usar(j, "Actualizado a las " + new Date(j.generado).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }))) { try { localStorage.setItem(opc.llave, JSON.stringify(j)); } catch (e) {} }
    }).catch(() => { const e = raiz.querySelector("[data-estado]"); if (e) e.textContent = visto ? "Sin conexión: se muestran los últimos datos." : ""; });
  }
  window.Noche = { montar: montar };
})();
