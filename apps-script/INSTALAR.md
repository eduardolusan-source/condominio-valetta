# Finanzas en vivo · instalación (una sola vez)

La hoja de Google **Valetta-Captura-Mensual** es la fuente de verdad. Un script
que vive dentro de la hoja entrega al sitio las cifras agregadas de cada mes, y
`finanzas.html` las lee cada vez que alguien la abre. Después de estos pasos no
hay que tocar nada cada mes: en cuanto la Administración llena la pestaña de un
mes, ese mes aparece en el sitio (a más tardar cinco minutos después).

## 1. Pegar el script
1. Abrir la hoja y entrar a **Extensiones → Apps Script**.
2. Borrar lo que aparezca en `Código.gs` y pegar el contenido completo de
   `apps-script/Code.gs`.
3. Guardar (icono de disquete). Arriba, junto a "Ejecutar", elegir la función
   **instalar** y pulsar **Ejecutar**.
4. La primera vez pide permisos: "Revisar permisos" → tu cuenta → "Avanzado" →
   "Ir a … (no seguro)" → Permitir. Es normal: el script es tuyo y solo pide
   leer y escribir en esta hoja.
5. Al terminar, la hoja muestra un aviso con las pestañas que creó: **OCTUBRE,
   NOVIEMBRE y DICIEMBRE**, copiadas de SEPTIEMBRE y en blanco (conservan los
   departamentos, los conceptos de gasto fijo y las fórmulas; el saldo inicial
   ya apunta al saldo final del mes anterior).

## 2. Publicar el servicio
1. Botón azul **Implementar → Nueva implementación**.
2. Engrane → tipo **Aplicación web**.
3. Descripción: "Finanzas La Valetta". Ejecutar como: **Yo**. Quién tiene
   acceso: **Cualquier persona**. → **Implementar**.
4. Copiar la **URL de la aplicación web** (termina en `/exec`).

## 3. Conectar la página
En `js/finanzas.js`, pegar esa URL en `API_URL` (va vacía) y subir el sitio.

## 4. Probar
- Abrir la URL del script en el navegador: debe responder un texto JSON que
  empieza con `{"ok":true,"servicio":"valetta-finanzas"…` y trae los meses.
- Abrir `finanzas.html` con la clave: la etiqueta de arriba debe decir
  **"Datos en vivo desde la hoja de la Administración · enero a septiembre de 2026"**
  (con punto verde). Si dice "Copia local", revisar la consola del navegador.
- Para forzar una lectura sin caché: agregar `?fresh=1` a la URL del script.

## Después
- **Cada mes:** nada. La Administración captura en la pestaña del mes y listo.
  Una pestaña se publica cuando tiene cobros o gastos; mientras esté en blanco
  el sitio la ignora.
- **Año que entra:** en el editor del script, ejecutar **crearSiguienteMes**
  (crea "ENERO 2027" copiando DICIEMBRE) o volver a ejecutar **instalar** tras
  crear enero a mano. El sitio muestra el año más reciente que tenga meses.
- **Si cambias el script:** Implementar → Administrar implementaciones → lápiz →
  Versión: **Nueva versión** → Implementar. La URL no cambia.
- **Comprobantes:** si en la columna "Comprobante (Drive)" de un gasto se pega
  la liga de Drive (o se inserta un vínculo), el sitio muestra "comprobante"
  junto a ese gasto.
- **Proyectos:** lo que se escriba en "PROYECTOS EN CURSO" (proyecto, estado,
  avance o liga) aparece en la tabla "Trabajos y proyectos".

## Qué sale y qué no sale del script
Salen solo **agregados**: saldos, totales de ingresos y egresos, número de
unidades que pagaron, mora acumulada y pagos adelantados sumados, y el desglose
de gastos por concepto. **Nunca salen los cobros por departamento**: la mora se
calcula dentro del script (pagado en el año menos cuotas transcurridas, unidad
por unidad) y solo se publican las sumas y los conteos. Cualquiera con la URL
del script puede leer esos agregados; la clave del sitio no los protege.
