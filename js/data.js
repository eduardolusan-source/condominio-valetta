/* Datos financieros — Condominio La Valetta, enero–agosto 2026.
   Fuente: hoja "Valetta · Captura mensual de cuentas" de la Administración
   (Google Sheets). Esta copia sirve de respaldo: si js/finanzas.js tiene
   configurada la URL de la hoja publicada, los meses se leen de ahí en cada
   carga y lo de este archivo solo se usa cuando la hoja no responde.
   La morosidad se publica SIEMPRE agregada (sin identificar unidades).
   "mora" es el saldo acumulado del año por unidad (pagado menos cuotas
   transcurridas): acumulada = suma de saldos en contra; adelantos = suma de
   saldos a favor de quienes pagaron meses por adelantado. */
const VALETTA = {
  unidades: 32,
  composicion: "27 departamentos (A 01 a A 37) y 5 penthouses (PH 41 a PH 45)",
  cuota: 1100,
  anio: 2026,
  meses: [
    {
      id: "2026-01", nombre: "Enero", corto: "Ene",
      saldoIni: 6549.88, saldoFin: 4747.62,
      ingresos: { manto: 35200, agua: 0, casaClub: 0 },
      egresos: { fijos: 24978.22, variables: 12024.04 },
      cobranza: { pagaron: 32, pct: 100, morosos: 0 },
      mora: { acumulada: 0, unidades: 0, adelantos: 0, unidadesAdelanto: 0 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 6.50]
        ],
        variables: [
          ["Refacción para elevador", 3480],
          ["Mantenimiento de elevador", 4000],
          ["Compra de pintura, pasillo de planta baja", 1733.81],
          ["Cubeta de pintura y rodillo", 2012.41],
          ["Artículos de limpieza", 797.82]
        ]
      }
    },
    {
      id: "2026-02", nombre: "Febrero", corto: "Feb",
      saldoIni: 4747.62, saldoFin: 1104.90,
      ingresos: { manto: 35200, agua: 0, casaClub: 0 },
      egresos: { fijos: 24984.72, variables: 13858 },
      cobranza: { pagaron: 32, pct: 100, morosos: 0 },
      mora: { acumulada: 0, unidades: 0, adelantos: 0, unidadesAdelanto: 0 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 13]
        ],
        variables: [
          ["Luz de áreas comunes (CFE)", 4907],
          ["Luz del elevador (CFE)", 769],
          ["Mantenimiento del sistema de riego de áreas comunes", 1682],
          ["Mano de obra: pintura y resane, pasillo de planta baja y 2º nivel", 6500]
        ]
      }
    },
    {
      id: "2026-03", nombre: "Marzo", corto: "Mar",
      saldoIni: 1104.90, saldoFin: 506.68,
      ingresos: { manto: 35200, agua: 0, casaClub: 0 },
      egresos: { fijos: 24978.22, variables: 10820 },
      cobranza: { pagaron: 32, pct: 100, morosos: 0 },
      mora: { acumulada: 0, unidades: 0, adelantos: 0, unidadesAdelanto: 0 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 6.50]
        ],
        variables: [
          ["Servicio de poda de la barda perimetral", 4500],
          ["Mantenimiento del elevador", 2320],
          ["Servicio de pintura de áreas comunes", 4000]
        ]
      }
    },
    {
      id: "2026-04", nombre: "Abril", corto: "Abr",
      saldoIni: 506.68, saldoFin: -2273.54,
      ingresos: { manto: 35200, agua: 0, casaClub: 0 },
      egresos: { fijos: 24991.22, variables: 12989 },
      cobranza: { pagaron: 32, pct: 100, morosos: 0 },
      mora: { acumulada: 0, unidades: 0, adelantos: 0, unidadesAdelanto: 0 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 19.50]
        ],
        variables: [
          ["Luz de áreas comunes (CFE)", 4335],
          ["Luz del elevador (CFE)", 794],
          ["Mano de obra: cambio de válvula", 4360],
          ["Mano de obra: pintura de la barda principal", 3500]
        ]
      }
    },
    {
      id: "2026-05", nombre: "Mayo", corto: "May",
      saldoIni: -2273.54, saldoFin: 3076.71,
      ingresos: { manto: 35200, agua: 0, casaClub: 0 },
      egresos: { fijos: 24978.22, variables: 4871.53 },
      cobranza: { pagaron: 32, pct: 100, morosos: 0 },
      mora: { acumulada: 0, unidades: 0, adelantos: 0, unidadesAdelanto: 0 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 6.50]
        ],
        variables: [
          ["Mantenimiento del elevador", 2320],
          ["Mantenimiento del sistema de riego", 1856],
          ["Artículos de limpieza: escoba y recogedor", 357],
          ["Focos para pasillos de áreas comunes", 338.53]
        ]
      }
    },
    {
      id: "2026-06", nombre: "Junio", corto: "Jun",
      saldoIni: 3076.71, saldoFin: 12638.49,
      ingresos: { manto: 41800, agua: 0, casaClub: 0 },
      egresos: { fijos: 24978.22, variables: 7260 },
      cobranza: { pagaron: 32, pct: 100, morosos: 0 },
      mora: { acumulada: 0, unidades: 0, adelantos: 6600, unidadesAdelanto: 2 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 6.50]
        ],
        variables: [
          ["Luz de áreas comunes (CFE)", 4104],
          ["Luz del elevador (CFE)", 836],
          ["Mantenimiento del elevador", 2320]
        ]
      }
    },
    {
      id: "2026-07", nombre: "Julio", corto: "Jul",
      saldoIni: 12638.49, saldoFin: 15760.27,
      ingresos: { manto: 34100, agua: 0, casaClub: 500 },
      egresos: { fijos: 24978.22, variables: 6500 },
      cobranza: { pagaron: 29, pct: 90.6, morosos: 3 },
      mora: { acumulada: 1100, unidades: 1, adelantos: 6600, unidadesAdelanto: 2 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 6.50]
        ],
        variables: [
          ["Trabajos de mantenimiento general en el edificio", 6500]
        ]
      }
    },
    {
      id: "2026-08", nombre: "Agosto", corto: "Ago",
      saldoIni: 15760.27, saldoFin: 3481.05,
      ingresos: { manto: 30800, agua: 0, casaClub: 0 },
      egresos: { fijos: 24978.22, variables: 18101 },
      cobranza: { pagaron: 28, pct: 87.5, morosos: 4 },
      mora: { acumulada: 3300, unidades: 2, adelantos: 4400, unidadesAdelanto: 2 },
      detalle: {
        fijos: [
          ["Servicios de asistencia administrativa", 23973.72],
          ["Telmex casa club", 549],
          ["Telmex caseta de vigilancia", 449],
          ["Comisiones bancarias", 6.50]
        ],
        variables: [
          ["Luz de áreas comunes (CFE)", 3985],
          ["Luz del elevador (CFE)", 816],
          ["Mantenimiento de la cerca electrificada", 3800],
          ["Mano de obra: flotador de la cisterna", 3500],
          ["Flotador y conexiones", 1500],
          ["Poda de maleza en la barda exterior", 4500]
        ]
      }
    }
  ],
  proyectos: [
    { nombre: "Pintura de pasillos y bardas", estado: "Realizado entre enero y abril (planta baja, 2º nivel y barda principal)", presupuesto: 17746 },
    { nombre: "Cisterna: flotador y conexiones", estado: "Realizado en agosto", presupuesto: 5000 },
    { nombre: "Cerca electrificada", estado: "Mantenimiento realizado en agosto", presupuesto: 3800 }
  ]
};
