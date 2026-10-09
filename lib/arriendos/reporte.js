/**
 * El documento de un arriendo: sus items, fechas, estados y lo que lleva
 * gastado. Sirve de reporte mientras esta activo y de guia de devolucion
 * cuando se cierra -que es lo que pidio Pablo: "generar una devolucion y que me
 * sacara una guia de devolucion"-.
 *
 * Reusa el cargador de pdfmake y el logo del Generador de OC para que los dos
 * documentos de la empresa salgan iguales y la libreria se baje una sola vez.
 */
import { getPdfMake, cargarLogo, downloadPdf, generarBlob } from "@/lib/generador-oc/pdf";
import { EMPRESA } from "@/lib/generador-oc/empresa";
import { formatearMonto, formatearFecha } from "@/lib/herramientas/inventario";
import { ESTADOS_CERRADOS } from "@/lib/arriendos/dominio";

const GRIS = "#6b7280";
const TINTA = "#111827";

const fecha = (v) => (v ? formatearFecha(v) : "—");

/** Arma el documento. Se separa de la descarga para poder probarlo. */
export function documentoDeArriendo(arriendo, { logo = null, verCostos = true } = {}) {
  const r = arriendo.resumen;
  const cerrado = r.cerrado;

  const encabezado = [];
  if (logo) encabezado.push({ width: 54, image: logo, fit: [54, 54], margin: [0, 0, 12, 0] });
  encabezado.push(
    {
      width: "*",
      margin: [0, 6, 0, 0],
      stack: [
        { text: EMPRESA.nombre, fontSize: 12, bold: true, color: TINTA },
        { text: `RUT: ${EMPRESA.rut}`, fontSize: 8, color: GRIS },
      ],
    },
    {
      width: "auto",
      alignment: "right",
      margin: [0, 6, 0, 0],
      stack: [
        { text: cerrado ? "GUÍA DE DEVOLUCIÓN" : "REPORTE DE ARRIENDO", fontSize: 12, bold: true, color: TINTA },
        { text: arriendo.codigoArriendo || "sin código", fontSize: 14, bold: true, color: TINTA },
      ],
    },
  );

  const dato = (etiqueta, valor) => [
    { text: etiqueta, fontSize: 7, color: GRIS, margin: [0, 0, 0, 1] },
    { text: valor ?? "—", fontSize: 9, color: TINTA },
  ];

  const filasItems = [
    [
      { text: "ÍTEM", style: "th" },
      { text: "CANT.", style: "th", alignment: "right" },
      { text: "DESDE", style: "th" },
      { text: "DEVOLUCIÓN", style: "th" },
      { text: "DÍAS", style: "th", alignment: "right" },
      { text: "ESTADO", style: "th" },
      ...(verCostos ? [{ text: "NETO", style: "th", alignment: "right" }] : []),
    ],
    ...r.items.map((item) => [
      { text: item.name || "Sin nombre", fontSize: 8 },
      { text: String(item.calculo.cantidad), fontSize: 8, alignment: "right" },
      { text: fecha(item.inicio), fontSize: 8 },
      { text: ESTADOS_CERRADOS.has(item.estado) ? fecha(item.fechaDevolucion || item.termino) : "en obra", fontSize: 8 },
      { text: String(item.calculo.dias), fontSize: 8, alignment: "right" },
      { text: item.estado || "Activo", fontSize: 8 },
      ...(verCostos
        ? [
            {
              text: item.calculo.confiable ? formatearMonto(item.calculo.neto) : "sin datos",
              fontSize: 8,
              alignment: "right",
            },
          ]
        : []),
    ]),
  ];

  const cuerpo = [
    { columns: encabezado, margin: [0, 0, 0, 14] },
    {
      table: {
        widths: ["*", "*", "*", "*"],
        body: [
          [
            { stack: dato("EQUIPO", arriendo.name) },
            { stack: dato("OBRA", arriendo.obra) },
            { stack: dato("PROVEEDOR", arriendo.proveedor) },
            { stack: dato("ESTADO", arriendo.estadoReal) },
          ],
          [
            { stack: dato("DESDE", fecha(arriendo.fechaInicioArriendo)) },
            { stack: dato("HASTA (PACTADO)", fecha(arriendo.fechaFinArriendo)) },
            { stack: dato("PERMANENCIA", r.permanencia == null ? "—" : `${r.permanencia} día(s)`) },
            { stack: dato("TIPO DE TARIFA", arriendo.tipoTarifa) },
          ],
          [
            { stack: dato("GUÍA DE INGRESO", arriendo.nGuiaIngreso) },
            { stack: dato("A CARGO DE", arriendo.custodioActual) },
            { stack: dato("UNIDADES", `${r.unidadesDevueltas} devueltas de ${r.unidades}`) },
            { stack: dato("ÍTEMS", `${r.devueltos} de ${r.total} devueltos`) },
          ],
        ],
      },
      layout: "noBorders",
      margin: [0, 0, 0, 14],
    },
    { text: "Detalle de ítems", fontSize: 10, bold: true, color: TINTA, margin: [0, 0, 0, 6] },
    {
      table: { headerRows: 1, widths: verCostos ? ["*", 34, 54, 62, 30, 58, 62] : ["*", 40, 64, 72, 36, 70], body: filasItems },
      layout: {
        hLineWidth: (i) => (i === 0 || i === 1 ? 0.6 : 0.3),
        vLineWidth: () => 0,
        hLineColor: () => "#e5e7eb",
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    },
  ];

  if (verCostos) {
    cuerpo.push({
      margin: [0, 12, 0, 0],
      columns: [
        { width: "*", text: "" },
        {
          width: "auto",
          table: {
            body: [
              [
                { text: "Neto", fontSize: 9, color: GRIS },
                { text: r.confiable ? formatearMonto(r.neto) : "sin datos", fontSize: 9, alignment: "right" },
              ],
              [
                { text: "Total con IVA", fontSize: 10, bold: true, color: TINTA },
                {
                  text: r.confiable ? formatearMonto(r.conIva) : "sin datos",
                  fontSize: 10,
                  bold: true,
                  alignment: "right",
                },
              ],
            ],
          },
          layout: "noBorders",
        },
      ],
    });

    if (!r.confiable) {
      cuerpo.push({
        text: `No se pudo calcular el costo: falta ${r.faltan.join(", ")}.`,
        fontSize: 8,
        color: "#b45309",
        margin: [0, 6, 0, 0],
      });
    }
  }

  cuerpo.push({
    // Sin punto propio: en es-CL `toLocaleString` ya termina en "a. m." y
    // agregarle otro daba "11:38:29 a. m.." en un documento que ve el proveedor.
    text: `Emitido el ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })} · ` +
      "el acumulado se calcula según los días transcurridos hasta la devolución de cada ítem.",
    fontSize: 7,
    color: GRIS,
    margin: [0, 16, 0, 0],
  });

  return {
    pageSize: "LETTER",
    pageMargins: [36, 32, 36, 36],
    defaultStyle: { font: "Roboto", color: TINTA },
    styles: { th: { fontSize: 7, bold: true, color: GRIS } },
    content: cuerpo,
  };
}

/** Genera y descarga el PDF. */
export async function descargarReporteArriendo(arriendo, { verCostos = true } = {}) {
  const pdfMake = await getPdfMake();
  const logo = await cargarLogo().catch(() => null);
  const doc = documentoDeArriendo(arriendo, { logo, verCostos });
  const nombre = `${arriendo.codigoArriendo || "arriendo"}-${arriendo.resumen.cerrado ? "devolucion" : "reporte"}.pdf`;

  /**
   * Se usa `generarBlob` del Generador de OC y no `getBlob(callback)`.
   *
   * La trampa ya estaba anotada ahi y aca se cayo igual: en pdfmake 0.2
   * `getBlob(cb)` avisaba por callback, y en la 0.3 -que es la que usamos-
   * devuelve una promesa y el callback NO se llama nunca. El resultado no era
   * un error sino algo peor: la funcion quedaba colgada para siempre, sin
   * descarga y sin un mensaje. `generarBlob` contempla las dos formas y ademas
   * corta si tarda demasiado.
   */
  const blob = await generarBlob(pdfMake, doc);
  downloadPdf(blob, nombre);
}
