# Condominio La Valetta · sitio informativo

Sitio estático (GitHub Pages) para residentes: reglas de convivencia, áreas
comunes y rendición de cuentas. Cuatro páginas sobre `css/styles.css`:
`index.html`, `reglamento.html`, `areas-comunes.html` y `finanzas.html`.

## Finanzas en vivo desde Google Sheets

`finanzas.html` se protege con clave (hash SHA-256 en `js/finanzas.js`) y se
alimenta de la hoja **"Valetta · Captura mensual de cuentas"**. Para que las
métricas cambien solas cuando la Administración mueve la hoja:

1. **Crear en la hoja una pestaña `Resumen`** con una fila por mes y estos
   encabezados (el orden no importa):

   | Mes ID | Mes | Corto | Saldo inicial | Saldo final | Mantenimiento cobrado | Agua cobrada | Casa club cobrada | Gastos fijos | Gastos variables | Unidades que pagaron | % cobranza | Unidades morosas |
   |---|---|---|---|---|---|---|---|---|---|---|---|---|
   | 2026-08 | Agosto | Ago | =… | =… | =… | =… | =… | =… | =… | =… | =… | =… |

   Cada celda puede ser una fórmula que busque el dato en la pestaña del mes
   por su etiqueta, así no importa si las filas se mueven. Por ejemplo, para
   la pestaña `ago-26`:

   ```
   =INDEX('ago-26'!C:C; MATCH("SALDO FINAL DEL MES"; 'ago-26'!B:B; 0))
   =INDEX('ago-26'!C:C; MATCH("(+) Mantenimiento cobrado"; 'ago-26'!B:B; 0))
   =INDEX('ago-26'!C:C; MATCH("(−) Egresos fijos"; 'ago-26'!B:B; 0))
   =INDEX('ago-26'!C:C; MATCH("Unidades morosas (mantenimiento)"; 'ago-26'!B:B; 0))
   ```
   (Si la hoja usa coma como separador de argumentos, cambiar `;` por `,`.
   Los egresos pueden ir negativos: el sitio toma el valor absoluto.)

   **Para que un mes nuevo aparezca solo:** dejar en Resumen las doce filas
   del año desde el principio, cada una apuntando a la pestaña que le
   corresponde (`sep-26`, `oct-26`, …) y envolviendo cada fórmula en
   `IFERROR(...; "")`. Mientras la pestaña no exista, la fila queda vacía y
   el sitio la ignora; en cuanto la Administración duplica la plantilla con
   ese nombre y la llena, la fila se completa y el mes aparece en la página.
   La única condición es respetar el nombre de la pestaña.

   ```
   =IFERROR(INDEX('sep-26'!C:C; MATCH("SALDO FINAL DEL MES"; 'sep-26'!B:B; 0)); "")
   ```

2. **Opcional: una pestaña `Detalle`** con el desglose por concepto, una fila
   por gasto: `Mes ID | Tipo | Concepto | Monto | Comprobante` (Tipo es
   `fijo` o `variable`; Comprobante, la liga de Drive si la hay). Sin esta
   pestaña, el desglose de los meses nuevos aparece como "pendiente".

3. **Publicar solo esas pestañas**: Archivo → Compartir → Publicar en la web →
   elegir la pestaña → *Valores separados por comas (.csv)* → Publicar.
   Copiar cada URL en `RESUMEN_URL` y `DETALLE_URL` de `js/finanzas.js`.

4. Regla de privacidad: **nunca publicar la pestaña de un mes** (trae los
   cobros por departamento). Lo publicado lo puede leer cualquiera con la URL;
   la clave del sitio no lo protege. Solo agregados.

Mientras las URLs estén vacías o la hoja no responda, la página muestra la
copia de `js/data.js` (enero–agosto 2026).

## Vista local

```
python3 -m http.server 4176 --directory .
```
