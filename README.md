# Condominio La Valetta · sitio informativo

Sitio estático (GitHub Pages) para residentes: reglas de convivencia, áreas
comunes y rendición de cuentas, sobre `css/styles.css`: `index.html`, `reglamento.html`,
`areas-comunes.html`, `finanzas.html` (con clave), `casa-club.html` (calendario), `correo.html`
(recibe el reporte), `emergencias.html` (qué hacer si…), `contactos.html`, `bienvenida.html`,
`privacidad.html` y `llms.txt`. En todas: menú en celular y botón «Aa» (`js/comun.js`) y ventanas
emergentes (`js/ventana.js`). El servidor de correos, reporte, semáforo y casa club es
`apps-script/Vecinos.gs` (instalación en `apps-script/INSTALAR.md`).

## Finanzas en vivo desde Google Sheets

`finanzas.html` se protege con clave (hash SHA-256 en `js/finanzas.js`) y se
alimenta de la hoja **"Valetta-Captura-Mensual"** de la Administración, que
tiene una pestaña por mes (ENERO, FEBRERO, …) con la misma plantilla.

### Camino recomendado: el Apps Script de la hoja

`apps-script/Code.gs` se pega dentro de la hoja (Extensiones → Apps Script) y
se publica como aplicación web; su URL se pega en `API_URL` de
`js/finanzas.js`. Pasos completos en `apps-script/INSTALAR.md`.

- El script lee las pestañas mensuales por su nombre (`OCTUBRE`, `ENERO 2027`)
  y busca cada dato por su etiqueta, así que aguanta filas movidas.
- Devuelve solo agregados por mes: saldos, ingresos, egresos, cobranza, mora
  acumulada y adelantos (calculados unidad por unidad dentro del script), el
  desglose de gastos con su liga de comprobante y los proyectos en curso.
- Un mes aparece en el sitio en cuanto su pestaña tiene cobros o gastos; una
  pestaña en blanco se ignora. Por eso `instalar()` deja creadas por
  adelantado las pestañas que faltan hasta diciembre, copiadas del último mes
  y encadenadas por saldo.
- La respuesta se guarda en caché cinco minutos (`?fresh=1` la fuerza).

### Cómo se ve: el tablero

`finanzas.html` es solo el portón y un contenedor; la pantalla la dibuja
`js/tablero.js` con `css/tablero.css`, el mismo motor que usan los sitios de
Lahia y Las Misiones (si se cambia en uno, copiarlo a los otros dos).
`js/finanzas.js` pone la clave, pide los datos al script y los traduce al
formato del tablero.

- La portada muestra **seis indicadores**: saldo en caja (con su tendencia),
  si alcanzó el último mes, quién pagó su cuota, cuotas atrasadas, cuántos
  días aguanta la caja y en qué se va cada peso de la cuota.
- Todo lo demás vive en secciones a las que se entra con un toque: mes por
  mes, detalle de cada mes (`#mes-2026-08`), gráficas del año, en qué se gasta,
  morosidad, proyectos y cómo leer los datos. Cada sección tiene su dirección,
  así el botón "atrás" del celular funciona.
- Los rubros de "¿en qué se va tu cuota?" se definen en `OPCIONES.rubros` de
  `js/finanzas.js` (una expresión por rubro; lo que no encaja va a "Otros").

### Regla de privacidad

**Nunca publicar ni devolver la pestaña de un mes**: trae los cobros por
departamento. Lo que entrega el script lo puede leer cualquiera
con la URL; la clave del sitio no lo protege. Solo agregados.

Mientras el script no responda, la página muestra la copia de `js/data.js`
(enero–septiembre 2026) y la etiqueta de arriba dice "Copia guardada".

## Vista local

```
python3 -m http.server 4176 --directory .
```
