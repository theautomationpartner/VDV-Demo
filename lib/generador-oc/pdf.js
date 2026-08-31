"use client";

import QRCode from "qrcode";
import { EMPRESA, FACTURACION } from "./empresa";

/**
 * El PDF de la Orden de Compra. Es el documento que ve el proveedor, asi que el
 * layout se mantiene igual al de la Vibe original, campo por campo: mismos
 * bloques, mismos tamanos, mismos colores.
 *
 * pdfmake se carga con import() dinamico y solo en el navegador: son ~2 MB
 * entre la libreria y las fuentes, y no tienen por que estar en el bundle de
 * quien nunca emite una orden.
 */
let pdfMakePromise = null;

async function getPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const [{ default: pdfMake }, { default: vfs }] = await Promise.all([
        import("pdfmake/build/pdfmake"),
        import("pdfmake/build/vfs_fonts"),
      ]);
      // pdfmake 0.3 registra las fuentes asi. El modulo de fuentes intenta
      // hacerlo solo cuando `pdfMake` ya es global, cosa que con imports ESM no
      // pasa: sin esta llamada el documento sale sin fuente y falla.
      if (typeof pdfMake.addVirtualFileSystem === "function") {
        pdfMake.addVirtualFileSystem(vfs);
      } else if (!pdfMake.vfs) {
        pdfMake.vfs = vfs;
      }
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

/** El logo se descarga en el servidor: pdfmake no baja imagenes remotas. */
let logoCache = null;
let logoEnCurso = null;

export function cargarLogo() {
  if (logoCache) return Promise.resolve(logoCache);
  if (!logoEnCurso) {
    logoEnCurso = fetch("/api/generador-oc/logo")
      .then((r) => (r.ok ? r.json() : { dataUrl: null }))
      .then((j) => {
        logoCache = j?.dataUrl ?? null;
        return logoCache;
      })
      .catch((error) => {
        // Sin logo la orden se emite igual: es preferible a bloquear la emision.
        console.error("No se pudo cargar el logo para el documento:", error);
        return null;
      })
      .finally(() => {
        logoEnCurso = null;
      });
  }
  return logoEnCurso;
}

/** Total de una linea: cantidad x precio unitario, menos el descuento (%). */
export function calcularTotalLinea(item) {
  const bruto = (item.cantidad ?? 0) * (item.precioUnitario ?? 0);
  const descuento = item.descuento ?? 0;
  return bruto * (1 - descuento / 100);
}

/**
 * Arma la firma para mostrarla en el documento. El codigo ya viene calculado al
 * emitir y quedo guardado en la OC; aca solo se formatea con la MISMA fecha con
 * la que se calculo, para que siga siendo reproducible desde /validar.
 */
export function buildFirmaDigital({ nombre, cargo, codigo, fechaIso, imagen }) {
  const fecha = new Date(fechaIso);
  return {
    nombre,
    cargo,
    fechaHora: fecha.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    codigo,
    imagen,
  };
}

export function formatCurrency(value, currency) {
  if (currency === "CLP") {
    return `$ ${value.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (currency === "UF") {
    return `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === "USD") {
    return `USD ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

export async function generateOcPdf(data) {
  const pdfMake = await getPdfMake();
  const logo = await cargarLogo();

  // El QR lleva a la pagina publica de validacion de esa orden.
  let qrCode = null;
  if (data.urlValidacion) {
    try {
      qrCode = await QRCode.toDataURL(data.urlValidacion, { margin: 0, width: 200 });
    } catch (error) {
      console.error("No se pudo generar el QR de validación:", error);
    }
  }

  const columnasEncabezado = [];

  if (logo) {
    columnasEncabezado.push({ width: 54, image: logo, fit: [54, 54], margin: [0, 0, 12, 0] });
  }

  columnasEncabezado.push(
    {
      width: "*",
      margin: [0, 8, 0, 0],
      stack: [
        { text: EMPRESA.nombre, style: "companyName" },
        { text: `RUT: ${EMPRESA.rut}`, style: "companyInfo" },
      ],
    },
    {
      width: "auto",
      alignment: "right",
      margin: [0, 8, 0, 0],
      stack: [
        { text: "ORDEN DE COMPRA", style: "docTitle" },
        { text: `N° ${data.numeroOc}`, style: "docNumber" },
      ],
    },
  );

  if (qrCode) {
    columnasEncabezado.push({
      width: 58,
      margin: [10, 0, 0, 0],
      stack: [
        { image: qrCode, width: 50, height: 50 },
        { text: "Validar documento", style: "qrCaption", alignment: "center" },
      ],
    });
  }

  const docDefinition = {
    pageSize: "LETTER",
    pageMargins: [40, 100, 40, 118],

    header: { margin: [40, 18, 40, 10], columns: columnasEncabezado },

    footer: (currentPage, pageCount) => ({
      margin: [40, 8, 40, 16],
      stack: [
        // Los datos de facturacion van en TODAS las paginas.
        {
          table: {
            widths: ["*"],
            body: [
              [
                {
                  stack: [
                    { text: "FAVOR FACTURAR A", style: "footerFacturacionTitulo" },
                    {
                      columns: [
                        {
                          width: "50%",
                          stack: [
                            { text: `RUT: ${FACTURACION.rut}`, style: "footerFacturacion" },
                            { text: `Nombre: ${FACTURACION.nombre}`, style: "footerFacturacion" },
                            {
                              text: `Dirección: ${FACTURACION.direccion} — ${FACTURACION.ciudad}`,
                              style: "footerFacturacion",
                            },
                          ],
                        },
                        {
                          width: "50%",
                          stack: [
                            { text: `Giro: ${FACTURACION.giro}`, style: "footerFacturacion" },
                            { text: `Email: ${FACTURACION.email}`, style: "footerFacturacion" },
                            {
                              text: `Teléfono: ${FACTURACION.telefono}`,
                              style: "footerFacturacion",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                  margin: [8, 6, 8, 6],
                  fillColor: "#f7f7f7",
                  border: [false, true, false, false],
                  borderColor: ["#dddddd", "#dddddd", "#dddddd", "#dddddd"],
                },
              ],
            ],
          },
          layout: {
            hLineWidth: (i) => (i === 0 ? 1 : 0),
            vLineWidth: () => 0,
            hLineColor: () => "#cccccc",
          },
        },
        {
          margin: [0, 5, 0, 0],
          columns: [
            { width: "*", text: EMPRESA.nombre, style: "footer" },
            {
              width: "auto",
              text: `Página ${currentPage} de ${pageCount}`,
              style: "footer",
              alignment: "right",
            },
          ],
        },
      ],
    }),

    content: [
      {
        margin: [0, 0, 0, 15],
        columns: [
          {
            width: "50%",
            stack: [
              { text: "FECHA DE EMISIÓN", style: "sectionLabel" },
              { text: data.fechaEmision, style: "sectionValue" },
            ],
          },
          {
            width: "50%",
            stack: [
              { text: "VALIDEZ HASTA", style: "sectionLabel" },
              { text: data.validezHasta, style: "sectionValue" },
            ],
          },
        ],
      },

      {
        margin: [0, 0, 0, 15],
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  { text: "PROVEEDOR", style: "sectionLabel", margin: [5, 5, 5, 2] },
                  { text: data.proveedor.nombre, style: "proveedorName", margin: [5, 0, 5, 2] },
                  {
                    text: `RUT: ${data.proveedor.rut || "—"}`,
                    style: "sectionValue",
                    margin: [5, 0, 5, 2],
                  },
                  ...(data.proveedor.direccion
                    ? [
                        {
                          text: data.proveedor.direccion,
                          style: "sectionValue",
                          margin: [5, 0, 5, 2],
                        },
                      ]
                    : []),
                  ...(() => {
                    const contacto = [
                      data.proveedor.contacto,
                      data.proveedor.mail,
                      data.proveedor.fono,
                    ]
                      .filter(Boolean)
                      .join("  ·  ");
                    return contacto
                      ? [
                          {
                            text: `Contacto: ${contacto}`,
                            style: "sectionValue",
                            margin: [5, 0, 5, 2],
                          },
                        ]
                      : [];
                  })(),
                  ...(() => {
                    const cuenta = [data.proveedor.banco, data.proveedor.cuentaCorriente]
                      .filter(Boolean)
                      .join("  ·  ");
                    return cuenta
                      ? [{ text: `Cuenta: ${cuenta}`, style: "sectionValue", margin: [5, 0, 5, 2] }]
                      : [];
                  })(),
                  { text: "", margin: [5, 0, 5, 3] },
                ],
                fillColor: "#f5f5f5",
              },
            ],
          ],
        },
        layout: "noBorders",
      },

      {
        margin: [0, 0, 0, 15],
        columns: [
          {
            width: "50%",
            stack: [
              { text: "OBRA", style: "sectionLabel" },
              { text: data.obra, style: "sectionValue" },
            ],
          },
          {
            width: "25%",
            stack: [
              { text: "RESPONSABLE", style: "sectionLabel" },
              { text: data.responsable, style: "sectionValue" },
              ...(data.responsableEmail
                ? [{ text: data.responsableEmail, style: "sectionContacto" }]
                : []),
              ...(data.responsableTelefono
                ? [{ text: data.responsableTelefono, style: "sectionContacto" }]
                : []),
            ],
          },
          {
            width: "25%",
            stack: [
              { text: "APROBADOR", style: "sectionLabel" },
              { text: data.aprobador || "No asignado", style: "sectionValue" },
            ],
          },
        ],
      },

      {
        margin: [0, 0, 0, 15],
        columns: [
          {
            width: "34%",
            stack: [
              { text: "CONDICIÓN DE COMPRA", style: "sectionLabel" },
              { text: data.condicionDeCompra, style: "sectionValue" },
            ],
          },
          {
            width: "26%",
            stack: [
              { text: "FORMA DE PAGO", style: "sectionLabel" },
              { text: data.pago, style: "sectionValue" },
            ],
          },
          {
            width: "40%",
            stack: [
              { text: "DESPACHO", style: "sectionLabel" },
              { text: data.despacho, style: "sectionValue" },
            ],
          },
        ],
      },

      {
        margin: [0, 0, 0, 10],
        table: {
          headerRows: 1,
          widths: [52, "*", 34, 40, 66, 34, 74],
          body: [
            [
              { text: "CÓDIGO", style: "tableHeader" },
              { text: "MATERIAL", style: "tableHeader" },
              { text: "CANT.", style: "tableHeader", alignment: "center" },
              { text: "UNIDAD", style: "tableHeader", alignment: "center" },
              { text: "P. UNITARIO", style: "tableHeader", alignment: "right" },
              { text: "DCTO.", style: "tableHeader", alignment: "center" },
              { text: "TOTAL", style: "tableHeader", alignment: "right" },
            ],
            ...data.items.map((item) => [
              { text: item.codigo || "—", style: "tableCode" },
              {
                // La descripcion incluye el centro de costo imputado a la linea.
                stack: [
                  { text: item.descripcion, style: "tableCell" },
                  ...(item.centroCosto
                    ? [{ text: `C. COSTO: ${item.centroCosto}`, style: "tableCentroCosto" }]
                    : []),
                ],
              },
              { text: item.cantidad.toString(), style: "tableCell", alignment: "center" },
              { text: item.unidad, style: "tableCell", alignment: "center" },
              {
                text: formatCurrency(item.precioUnitario, data.moneda),
                style: "tableCell",
                alignment: "right",
              },
              {
                text: item.descuento ? `${item.descuento}%` : "—",
                style: "tableCell",
                alignment: "center",
              },
              {
                text: formatCurrency(calcularTotalLinea(item), data.moneda),
                style: "tableCell",
                alignment: "right",
              },
            ]),
          ],
        },
        layout: {
          fillColor: (rowIndex) => (rowIndex === 0 ? "#e0e0e0" : null),
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#cccccc",
          vLineColor: () => "#cccccc",
        },
      },

      {
        margin: [0, 10, 0, 15],
        table: {
          widths: ["*", 90],
          body: [
            [
              {
                text: "NETO:",
                style: "totalLabel",
                alignment: "right",
                border: [false, false, false, false],
              },
              {
                text: formatCurrency(data.neto, data.moneda),
                style: "totalValue",
                alignment: "right",
                border: [false, false, false, false],
              },
            ],
            [
              {
                text: data.afectaIva ? "IVA 19%:" : "EXENTO IVA:",
                style: "totalLabel",
                alignment: "right",
                border: [false, false, false, false],
              },
              {
                text: formatCurrency(data.iva, data.moneda),
                style: "totalValue",
                alignment: "right",
                border: [false, false, false, false],
              },
            ],
            [
              {
                text: "TOTAL:",
                style: "totalLabelBold",
                alignment: "right",
                border: [false, true, false, false],
                borderColor: ["#000000", "#000000", "#000000", "#000000"],
              },
              {
                text: formatCurrency(data.total, data.moneda),
                style: "totalValueBold",
                alignment: "right",
                border: [false, true, false, false],
                borderColor: ["#000000", "#000000", "#000000", "#000000"],
              },
            ],
          ],
        },
        layout: "noBorders",
      },

      ...(data.observaciones
        ? [
            {
              margin: [0, 10, 0, 0],
              stack: [
                { text: "OBSERVACIONES", style: "sectionLabel" },
                { text: data.observaciones, style: "observaciones" },
              ],
            },
          ]
        : []),

      // Firmas digitales: quien emite y quien aprueba, lado a lado.
      ...(data.firma
        ? [
            {
              unbreakable: true,
              margin: [0, 30, 0, 0],
              columns: [
                {
                  width: "*",
                  table: {
                    widths: ["*"],
                    body: [
                      [
                        {
                          fillColor: "#fafafa",
                          border: [true, true, true, true],
                          stack: [
                            { text: "QUIEN EMITE", style: "firmaTitle", margin: [8, 8, 8, 6] },
                            data.firma.imagen
                              ? { image: data.firma.imagen, fit: [180, 54], margin: [8, 0, 8, 4] }
                              : {
                                  canvas: [
                                    {
                                      type: "line",
                                      x1: 0,
                                      y1: 30,
                                      x2: 206,
                                      y2: 30,
                                      lineWidth: 0.5,
                                      lineColor: "#cccccc",
                                    },
                                  ],
                                  margin: [8, 0, 8, 4],
                                },
                            { text: data.firma.nombre, style: "firmaName", margin: [8, 0, 8, 1] },
                            ...(data.firma.cargo
                              ? [{ text: data.firma.cargo, style: "firmaMeta", margin: [8, 0, 8, 4] }]
                              : [{ text: "", margin: [8, 0, 8, 2] }]),
                            {
                              text: `Firmado electrónicamente el ${data.firma.fechaHora}`,
                              style: "firmaMeta",
                              margin: [8, 0, 8, 3],
                            },
                            {
                              text: "Código de validación",
                              style: "firmaMetaLabel",
                              margin: [8, 0, 8, 1],
                            },
                            { text: data.firma.codigo, style: "firmaCode", margin: [8, 0, 8, 8] },
                          ],
                        },
                      ],
                    ],
                  },
                  layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => "#cccccc",
                    vLineColor: () => "#cccccc",
                  },
                },
                { width: 14, text: "" },
                {
                  width: "*",
                  table: {
                    widths: ["*"],
                    body: [
                      [
                        {
                          fillColor: "#fafafa",
                          border: [true, true, true, true],
                          stack: [
                            { text: "QUIEN APRUEBA", style: "firmaTitle", margin: [8, 8, 8, 6] },
                            data.firmaAprobador?.imagen
                              ? {
                                  image: data.firmaAprobador.imagen,
                                  fit: [180, 54],
                                  margin: [8, 0, 8, 4],
                                }
                              : {
                                  canvas: [
                                    {
                                      type: "line",
                                      x1: 0,
                                      y1: 30,
                                      x2: 206,
                                      y2: 30,
                                      lineWidth: 0.5,
                                      lineColor: "#cccccc",
                                    },
                                  ],
                                  margin: [8, 0, 8, 4],
                                },
                            {
                              text: data.firmaAprobador?.nombre || data.aprobador || "No asignado",
                              style: "firmaName",
                              margin: [8, 0, 8, 1],
                            },
                            ...(data.firmaAprobador?.cargo
                              ? [
                                  {
                                    text: data.firmaAprobador.cargo,
                                    style: "firmaMeta",
                                    margin: [8, 0, 8, 4],
                                  },
                                ]
                              : [{ text: "", margin: [8, 0, 8, 2] }]),
                            {
                              text: data.firmaAprobador?.imagen
                                ? `Firmado electrónicamente el ${data.firma.fechaHora}`
                                : "Pendiente de firma",
                              style: "firmaMeta",
                              margin: [8, 0, 8, 8],
                            },
                          ],
                        },
                      ],
                    ],
                  },
                  layout: {
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => "#cccccc",
                    vLineColor: () => "#cccccc",
                  },
                },
              ],
            },
            {
              text: "Documento emitido y firmado digitalmente. Su autenticidad puede verificarse con el código de validación indicado.",
              style: "firmaLegal",
              margin: [0, 8, 0, 0],
            },
          ]
        : []),
    ],

    styles: {
      companyName: { fontSize: 14, bold: true, color: "#1a1a1a" },
      companyInfo: { fontSize: 9, color: "#666666", margin: [0, 1, 0, 0] },
      docTitle: { fontSize: 16, bold: true, color: "#1a1a1a" },
      docNumber: { fontSize: 14, bold: true, color: "#2563eb", margin: [0, 2, 0, 0] },
      sectionLabel: { fontSize: 9, bold: true, color: "#666666", margin: [0, 0, 0, 2] },
      sectionValue: { fontSize: 11, color: "#1a1a1a" },
      sectionContacto: { fontSize: 8, color: "#666666", margin: [0, 1, 0, 0] },
      proveedorName: { fontSize: 12, bold: true, color: "#1a1a1a" },
      tableHeader: { fontSize: 9, bold: true, color: "#1a1a1a", margin: [5, 5, 5, 5] },
      tableCell: { fontSize: 10, color: "#1a1a1a", margin: [5, 4, 5, 4] },
      tableCode: { fontSize: 9, color: "#555555", margin: [5, 4, 5, 4] },
      tableCentroCosto: { fontSize: 7, color: "#777777", margin: [5, 1, 5, 4] },
      totalLabel: { fontSize: 10, color: "#1a1a1a", margin: [0, 3, 10, 3] },
      totalValue: { fontSize: 10, color: "#1a1a1a", margin: [0, 3, 0, 3] },
      totalLabelBold: { fontSize: 11, bold: true, color: "#1a1a1a", margin: [0, 5, 10, 5] },
      totalValueBold: { fontSize: 11, bold: true, color: "#2563eb", margin: [0, 5, 0, 5] },
      observaciones: { fontSize: 10, color: "#1a1a1a", margin: [0, 5, 0, 0], lineHeight: 1.3 },
      footer: { fontSize: 8, color: "#999999" },
      qrCaption: { fontSize: 6, color: "#999999", margin: [0, 2, 0, 0] },
      footerFacturacionTitulo: {
        fontSize: 7.5,
        bold: true,
        color: "#1a1a1a",
        characterSpacing: 0.5,
        margin: [0, 0, 0, 3],
      },
      footerFacturacion: { fontSize: 7.5, color: "#444444", lineHeight: 1.15 },
      firmaTitle: { fontSize: 8, bold: true, color: "#666666", characterSpacing: 0.5 },
      firmaName: { fontSize: 11, bold: true, color: "#1a1a1a" },
      firmaMeta: { fontSize: 8, color: "#666666" },
      firmaMetaLabel: { fontSize: 7, bold: true, color: "#999999" },
      firmaCode: { fontSize: 8, bold: true, color: "#2563eb" },
      firmaLegal: { fontSize: 7, color: "#999999", alignment: "right" },
    },

    defaultStyle: { font: "Roboto" },
  };

  return generarBlob(pdfMake, docDefinition);
}

/** Tope de espera. Si se supera, se avisa; nunca se queda esperando de por vida. */
const LIMITE_MS = 60_000;

/**
 * Convierte la definicion del documento en un archivo.
 *
 * OJO CON LA VERSION DE PDFMAKE: en la 0.2 `getBlob(cb)` avisaba por callback,
 * y asi lo hacia la Vibe original. En la 0.3, que es la que usamos, `getBlob()`
 * devuelve una promesa y el callback se ignora por completo. Pasarle un
 * callback no da error: simplemente no llama a nadie nunca, y la pantalla se
 * queda en "Generando OC..." para siempre.
 *
 * Se soportan las dos formas por si la libreria cambia de version, y ademas hay
 * un tope de tiempo: si algo se traba, el usuario ve un error y no una espera
 * infinita.
 */
function generarBlob(pdfMake, docDefinition) {
  const documento = pdfMake.createPdf(docDefinition);

  const archivo = new Promise((resolve, reject) => {
    try {
      const resultado = documento.getBlob((blob) => resolve(blob));
      // pdfmake 0.3: promesa. Si tambien llamo al callback, el primero que
      // llegue gana y el otro no hace nada.
      if (typeof resultado?.then === "function") resultado.then(resolve, reject);
    } catch (error) {
      reject(error);
    }
  });

  const tope = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("La generacion del PDF tardo demasiado")), LIMITE_MS);
  });

  return Promise.race([archivo, tope]);
}

export function downloadPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
