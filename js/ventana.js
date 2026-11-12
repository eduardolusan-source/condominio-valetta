/* La Valetta · ventana emergente sencilla (desglose, explicaciones). Se abre desde abajo en el
   celular, se cierra con «Entendido», tocando fuera o con Esc. Accesible: <dialog> nativo. */
(function () {
  "use strict";
  const css = document.createElement("style");
  css.textContent = "dialog.ve{border:0;padding:0;margin:auto auto 0;width:100%;max-width:560px;border-radius:22px 22px 0 0;background:var(--surface);color:var(--ink);box-shadow:0 -10px 40px rgba(0,0,0,.3);max-height:88vh}" +
    "@media (min-width:640px){dialog.ve{margin:auto;border-radius:22px}}dialog.ve::backdrop{background:rgba(0,0,0,.5)}" +
    ".ve-c{padding:1.1rem 1.2rem 1.2rem;overflow:auto;max-height:88vh}.ve-t{display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start;margin:0 0 .6rem}.ve-t h2{font-size:1.25rem;margin:0;line-height:1.25}" +
    ".ve-x{font:inherit;font-size:1.4rem;line-height:1;border:0;background:none;color:var(--muted);cursor:pointer;padding:.2rem .4rem}" +
    ".ve-ok{display:block;width:100%;margin-top:1rem;font:inherit;font-weight:800;font-size:1.05rem;min-height:52px;border:0;border-radius:14px;background:var(--accent);color:#fff;cursor:pointer}" +
    ".ve .cuenta-l{display:flex;justify-content:space-between;gap:.8rem;padding:.55rem 0;border-bottom:1px dashed var(--grid);font-variant-numeric:tabular-nums}.ve .cuenta-l.tot{border-bottom:0;border-top:2px solid var(--ink);font-weight:800;font-size:1.1rem;margin-top:.2rem}" +
    ".ve-ok.sec{background:var(--page);color:var(--ink);border:1px solid var(--border)}.ve .exp{color:var(--ink-2);font-size:.95rem;line-height:1.55}.ve .acc{display:grid;gap:.5rem;margin-top:.9rem}.ve .acc a{display:block;text-align:center;text-decoration:none;font-weight:800;padding:.85rem;border-radius:14px;border:1px solid var(--border);color:var(--ink);background:var(--page)}" +
    ".ve .acc a.p{background:var(--accent);border-color:var(--accent);color:#fff}@media (prefers-color-scheme:dark){.ve-ok,.ve .acc a.p{color:#0d0d0d}}";
  document.head.appendChild(css);
  const d = document.createElement("dialog");
  d.className = "ve"; d.setAttribute("aria-labelledby", "veT");
  d.innerHTML = '<div class="ve-c"><div class="ve-t"><h2 id="veT"></h2><button type="button" class="ve-x" aria-label="Cerrar">✕</button></div><div id="veB"></div><button type="button" class="ve-ok">Entendido</button></div>';
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(d));
  if (document.body) document.body.appendChild(d);
  const cerrar = () => { try { d.close(); } catch (e) { d.removeAttribute("open"); } };
  d.querySelector(".ve-x").onclick = cerrar; d.querySelector(".ve-ok").onclick = cerrar;
  d.addEventListener("click", e => { if (e.target === d) cerrar(); });
  window.ventana = function (titulo, html, boton) {
    d.querySelector("#veT").textContent = titulo; d.querySelector("#veB").innerHTML = html;
    const ok = d.querySelector(".ve-ok"); ok.textContent = boton || "Entendido"; ok.classList.toggle("sec", !!boton);
    try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
    d.querySelector(".ve-c").scrollTop = 0;
  };
})();
