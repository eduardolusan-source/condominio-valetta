/* La Valetta · piezas de todas las páginas: menú en celular y botón «Aa» de letra grande
   (se recuerda en este navegador). */
(function () {
  "use strict";
  const inner = document.querySelector(".site-header .inner"), nav = inner && inner.querySelector("nav.main");
  if (!inner || !nav) return;
  const aa = document.createElement("button");
  aa.type = "button"; aa.className = "vl-letra"; aa.textContent = "Aa"; aa.title = "Letra más grande"; aa.setAttribute("aria-label", "Letra más grande");
  const poner = on => { document.documentElement.classList.toggle("vl-grande", on); aa.setAttribute("aria-pressed", on); };
  try { poner(localStorage.getItem("valetta.letra") === "1"); } catch (e) { poner(false); }
  aa.onclick = () => { const on = !document.documentElement.classList.contains("vl-grande"); poner(on); try { localStorage.setItem("valetta.letra", on ? "1" : "0"); } catch (e) {} };
  const menu = document.createElement("button");
  menu.type = "button"; menu.className = "vl-menu"; menu.setAttribute("aria-expanded", "false"); menu.innerHTML = "☰ Menú";
  menu.onclick = () => { const a = nav.classList.toggle("abierto"); menu.setAttribute("aria-expanded", a); };
  inner.insertBefore(aa, nav); inner.insertBefore(menu, nav);
})();
