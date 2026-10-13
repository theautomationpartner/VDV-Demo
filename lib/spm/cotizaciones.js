/**
 * Las reglas de las cotizaciones que contestan los proveedores.
 *
 * Casi todo lo que hay en estos tableros lo escribio MAKE: el escenario 2 lee
 * el correo, se lo pasa a la IA y crea la cotizacion con sus lineas. La app
 * cambia el estado y poco mas. Por eso aca casi no hay calculo: hay lectura.
 */

export const ESTADO = {
  PENDIENTE: "Pendiente",
  RECIBIDA: "Recibida",
  REVISAR: "Revisar",
  SELECCIONADA: "Seleccionada",
  DESCARTADA: "Descartada",
  VENCIDA: "Vencida",
};

/** Los estados a los que una persona puede mover una cotizacion. */
export const ESTADOS_ELEGIBLES = [
  ESTADO.RECIBIDA,
  ESTADO.REVISAR,
  ESTADO.SELECCIONADA,
  ESTADO.DESCARTADA,
  ESTADO.VENCIDA,
];

export const TONO_ESTADO = {
  [ESTADO.PENDIENTE]: "neutro",
  [ESTADO.RECIBIDA]: "ok",
  [ESTADO.REVISAR]: "aviso",
  [ESTADO.SELECCIONADA]: "ok",
  [ESTADO.DESCARTADA]: "neutro",
  [ESTADO.VENCIDA]: "error",
};

/**
 * Como se corresponde cada linea cotizada con lo que se pidio. Lo decide la IA.
 *
 * Es el dato que hace que comparar sirva: sin esto, dos totales distintos
 * pueden ser dos cosas distintas y el mas barato puede no ser lo que se pedia.
 */
export const HOMOLOGACION = {
  EXACTO: "Exacto",
  EQUIVALENTE: "Equivalente",
  DUDOSO: "Dudoso",
  DISTINTO: "Distinto",
  NO_SOLICITADO: "No solicitado",
};

export const TONO_HOMOLOGACION = {
  [HOMOLOGACION.EXACTO]: "ok",
  [HOMOLOGACION.EQUIVALENTE]: "ok",
  [HOMOLOGACION.DUDOSO]: "aviso",
  [HOMOLOGACION.DISTINTO]: "error",
  [HOMOLOGACION.NO_SOLICITADO]: "neutro",
};

/** Lo que hay que mirar antes de confiar en un total. */
export const HOMOLOGACION_DUDOSA = [HOMOLOGACION.DUDOSO, HOMOLOGACION.DISTINTO];

export const COLUMNAS_COTIZACION = [
  "spm",
  "proveedor",
  "numeroCotizacion",
  "fechaCotizacion",
  "validaHasta",
  "precioTotal",
  "moneda",
  "plazoEntrega",
  "condicionDePago",
  "estado",
  "origen",
  "obra",
  "centroCosto",
  "notasLectura",
  "remitente",
];

export const COLUMNAS_LINEA_COTIZADA = [
  "material",
  "cantidad",
  "precioUnitario",
  "subtotal",
  "descripcionProveedor",
  "homologacion",
  "lineaSpm",
  "justificacion",
];

/** Quien cotizo: la ficha del maestro si esta, y si no el correo que contesto. */
export function quienCotizo(cotizacion) {
  const delMaestro = cotizacion?.proveedor?.linkedItems?.[0]?.name;
  if (delMaestro) return { nombre: delMaestro, enElMaestro: true };
  const remitente = String(cotizacion?.remitente ?? "").trim();
  return {
    nombre: remitente || cotizacion?.name || "Proveedor sin identificar",
    enElMaestro: false,
  };
}

/**
 * Cuantas lineas de esta cotizacion hay que mirar antes de comparar.
 *
 * Una cotizacion con el total mas bajo pero con tres lineas "Distinto" no es la
 * mas barata: es otra cosa. El numero va arriba del total a proposito.
 */
export function lineasDudosas(cotizacion) {
  return (cotizacion?.subitems ?? []).filter((l) =>
    HOMOLOGACION_DUDOSA.includes(l?.homologacion),
  ).length;
}

/**
 * Si el total se puede comparar con el de otra cotizacion.
 *
 * No se puede si el proveedor cotizo MENOS lineas de las que se pidieron: ahi
 * el total mas bajo lo es porque le falta algo. El listado del cliente comparaba
 * totales sin mirar esto y marcaba como "menor precio" al que menos cotizo.
 */
export function totalConfiable(cotizacion, lineasPedidas) {
  const cotizadas = (cotizacion?.subitems ?? []).filter(
    (l) => l?.homologacion !== HOMOLOGACION.NO_SOLICITADO,
  ).length;
  if (!lineasPedidas) return true;
  return cotizadas >= lineasPedidas;
}

const MONEDAS = { CLP: "$", USD: "US$", UF: "UF" };

export function formatearPrecio(valor, moneda = "CLP") {
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return "—";
  const simbolo = MONEDAS[moneda] ?? "$";
  const decimales = moneda === "UF" ? 2 : 0;
  return `${simbolo} ${n.toLocaleString("es-CL", { maximumFractionDigits: decimales })}`;
}

/** Si la oferta ya vencio. Se compara en dias de calendario de Chile. */
const DIA_EN_CHILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function estaVencida(cotizacion) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(cotizacion?.validaHasta ?? ""));
  if (!partes) return false;
  const limite = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  const [a, m, d] = DIA_EN_CHILE.format(new Date()).split("-").map(Number);
  return Date.UTC(a, m - 1, d) > limite;
}

/** Agrupa las cotizaciones por la solicitud a la que contestan. */
export function agruparPorSolicitud(cotizaciones) {
  const grupos = new Map();
  for (const c of cotizaciones ?? []) {
    const spm = c?.spm?.linkedItems?.[0];
    // Una cotizacion sin solicitud es real: queda cuando alguien borra el SPM.
    const clave = spm?.id ? String(spm.id) : "sin-solicitud";
    if (!grupos.has(clave)) {
      grupos.set(clave, { id: spm?.id ?? null, nombre: spm?.name ?? null, cotizaciones: [] });
    }
    grupos.get(clave).cotizaciones.push(c);
  }
  return [...grupos.values()];
}
