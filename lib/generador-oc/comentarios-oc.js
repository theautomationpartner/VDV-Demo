import { MARCA_CODIGO } from "./firma";

/**
 * El tablero de OCs no tiene columna propia para el tipo de orden, la forma de
 * pago, el despacho, el contacto del emisor, el codigo de validacion ni la
 * nota de aprobacion. Todo eso viaja como lineas de encabezado adentro de
 * COMENTARIOS. Estas utilidades arman y desarman ese encabezado, que es lo que
 * permite reconstruir la orden completa al aprobarla o editarla.
 *
 * Es la solucion que ya venia de la Vibe: se mantiene igual a proposito, para
 * que las OCs emitidas antes de la migracion se sigan leyendo bien.
 */

const MARCA_TIPO_SERVICIOS = "Tipo de orden: Servicios";
const PREFIJO_PAGO = "Forma de pago:";
const PREFIJO_DESPACHO = "Despacho:";
const PREFIJO_CONTACTO = "Contacto emisor:";
const PREFIJO_APROBACION = "Aprobación:";
const PREFIJO_EDICION = "Última edición:";

function extraerLinea(lineas, prefijo) {
  const linea = lineas.find((l) => l.startsWith(prefijo));
  if (!linea) return null;
  return linea.slice(prefijo.length).trim();
}

export function parseComentarios(comentarios) {
  const lineas = (comentarios ?? "").split("\n").map((l) => l.trim());

  const esServicio = lineas.includes(MARCA_TIPO_SERVICIOS);
  const pagoTexto = extraerLinea(lineas, PREFIJO_PAGO);
  const despachoTexto = extraerLinea(lineas, PREFIJO_DESPACHO);
  const contactoTexto = extraerLinea(lineas, PREFIJO_CONTACTO);
  const aprobacionTexto = extraerLinea(lineas, PREFIJO_APROBACION);
  const edicionTexto = extraerLinea(lineas, PREFIJO_EDICION);
  const codigoLinea = lineas.find((l) => l.startsWith(MARCA_CODIGO));
  const codigoValidacion = codigoLinea ? codigoLinea.slice(MARCA_CODIGO.length).trim() : null;

  const [contactoEmail, contactoTelefono] = (contactoTexto ?? "").split("·").map((s) => s.trim());

  const marcasConocidas = [
    MARCA_TIPO_SERVICIOS,
    PREFIJO_PAGO,
    PREFIJO_DESPACHO,
    PREFIJO_CONTACTO,
    PREFIJO_APROBACION,
    PREFIJO_EDICION,
    MARCA_CODIGO,
  ];
  const observaciones = lineas
    .filter((l) => l && !marcasConocidas.some((m) => l.startsWith(m)))
    .join("\n")
    .trim();

  return {
    esServicio,
    pagoTexto,
    despachoTexto,
    contactoEmail: contactoEmail || "",
    contactoTelefono: contactoTelefono || "",
    aprobacionTexto,
    edicionTexto,
    codigoValidacion,
    observaciones,
  };
}

/** Separa el texto de despacho guardado en tipo + direccion. */
export function interpretarDespacho(texto) {
  if (!texto) return { tipo: "RETIRO_CLIENTE" };
  if (texto.startsWith("Por cuenta del proveedor")) {
    const match = texto.match(/Dirección:\s*(.*)$/);
    const direccion = match?.[1]?.trim();
    return {
      tipo: "PROVEEDOR",
      direccion: direccion && direccion !== "No especificada" ? direccion : "",
    };
  }
  if (texto.startsWith("No genera despacho")) return { tipo: "SIN_DESPACHO" };
  return { tipo: "RETIRO_CLIENTE" };
}

/** Separa el texto de forma de pago guardado en credito/contado + plazo. */
export function interpretarPago(texto) {
  if (!texto) return { credito: false, dias: 30 };
  const match = texto.match(/Crédito\s+(\d+)\s+días/i);
  if (match) {
    const dias = Number(match[1]);
    return { credito: true, dias: dias === 60 ? 60 : 30 };
  }
  return { credito: false, dias: 30 };
}

export function codificarLineaAprobacion(nombre, fechaHora) {
  return `${PREFIJO_APROBACION} aprobada por ${nombre} el ${fechaHora}`;
}

export function codificarLineaEdicion(nombre, fechaHora) {
  return `${PREFIJO_EDICION} ${nombre}, ${fechaHora}`;
}

export {
  MARCA_TIPO_SERVICIOS,
  PREFIJO_PAGO,
  PREFIJO_DESPACHO,
  PREFIJO_CONTACTO,
  PREFIJO_APROBACION,
  PREFIJO_EDICION,
};
