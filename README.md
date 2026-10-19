# Condominio La Valetta · sitio informativo

Sitio estático (GitHub Pages) para residentes: reglas de convivencia, áreas
comunes y rendición de cuentas. Cuatro páginas sobre `css/styles.css`:
`index.html`, `reglamento.html`, `areas-comunes.html` y `finanzas.html`.

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

### Alternativa sin script: pestañas publicadas como CSV

Si no se quiere el script, se puede crear una pestaña `Resumen` con una fila
por mes y estos encabezados (el orden no importa):

| Mes ID | Mes | Corto | Saldo inicial | Saldo final | Mantenimiento cobrado | Agua cobrada | Casa club cobrada | Gastos fijos | Gastos variables | Unidades que pagaron | % cobranza | Unidades morosas | Mora acumulada | Unidades con mora | Pagos adelantados | Unidades adelantadas |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09 | Septiembre | Sep | =… | =… | =… | =… | =… | =… | =… | =… | =… | =… | =… | =… | =… | =… |

Cada celda es una fórmula que busca el dato en la pestaña del mes por su
etiqueta, envuelta en `IFERROR(...; "")` para que la fila quede vacía mientras
la pestaña no exista:

```
=IFERROR(INDEX(SEPTIEMBRE!C:C; MATCH("SALDO FINAL DEL MES"; SEPTIEMBRE!B:B; 0)); "")
```

Opcionalmente una pestaña `Detalle` (`Mes ID | Tipo | Concepto | Monto |
Comprobante`, Tipo `fijo` o `variable`). Se publican solo esas pestañas
(Archivo → Compartir → Publicar en la web → la pestaña → CSV) y las URLs van en
`RESUMEN_URL` y `DETALLE_URL`. Este camino solo se usa si `API_URL` está vacía
o no responde.

### Regla de privacidad

**Nunca publicar ni devolver la pestaña de un mes**: trae los cobros por
departamento. Lo que entrega el script o lo publicado lo puede leer cualquiera
con la URL; la clave del sitio no lo protege. Solo agregados.

Mientras nada responda, la página muestra la copia de `js/data.js`
(enero–septiembre 2026).

## Vista local

```
python3 -m http.server 4176 --directory .
```
