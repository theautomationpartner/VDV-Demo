/**
 * Los dos tableros de referencia que se consultan antes de pedir: el catalogo
 * de materiales y el maestro de proveedores.
 *
 * No son listines. Cada uno guarda el dato que hace fracasar una solicitud y
 * que hoy solo se descubre tarde:
 *
 *   - un material SIN UNIDAD hace que el proveedor cotice a ciegas (213 de
 *     1.184, medido);
 *   - un proveedor SIN CORREO no recibe nada y nadie se entera hasta que no
 *     contesta (60 de 354, medido).
 *
 * Y hay un tercer caso que la app del cliente no distingue: el correo ESCRITO
 * MAL. Hoy hay uno cargado como `rodrigosilva`, sin arroba. Ahi figura como
 * habilitado, se cita igual, y el envio se pierde sin dejar rastro. Por eso
 * `estadoDelCorreo` tiene tres salidas y no dos.
 */

export const COLUMNAS_MATERIAL = ["codigoInterno", "unidad", "categoriaMaterial"];

/**
 * El precio de lista NO se pide a proposito. Esta pantalla es la vista de
 * especificacion -que se pide y en que unidad-, no una lista de precios: lo
 * que vale el material es lo que cotice el proveedor, y mostrar un precio
 * viejo al lado invita a compararlo contra la oferta.
 */
export const COLUMNAS_PROVEEDOR = ["contacto", "mail", "fonoContacto", "categoria", "rut"];

const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const CORREO = { OK: "ok", SIN: "sin", MALO: "malo" };

/**
 * En que estado esta el correo de cotizacion de un proveedor.
 *
 * `malo` es el caso silencioso: hay algo escrito, asi que cualquier chequeo de
 * "esta cargado" lo da por bueno, pero no es una direccion y el correo rebota.
 */
export function estadoDelCorreo(proveedor) {
  const crudo = String(proveedor?.mail ?? "").trim();
  if (!crudo) return { estado: CORREO.SIN, mails: [] };
  const partes = crudo.split(",").map((m) => m.trim()).filter(Boolean);
  const malos = partes.filter((m) => !MAIL.test(m));
  return {
    estado: malos.length ? CORREO.MALO : CORREO.OK,
    mails: partes,
    malos,
  };
}

/**
 * Las filas que monday deja cuando alguien toca "+ Agregar elemento" y se
 * arrepiente. Son items de verdad -se pueden vincular y citar-, y en los dos
 * tableros hay: "Agregar elemento" entre los proveedores y "AGREGAR CODIGO
 * INTERNO" (dos veces) entre los materiales.
 *
 * No se borran desde aca -el tablero es del cliente-, pero se marcan, porque
 * citar a un proveedor llamado "Agregar elemento" es un error que hoy la
 * pantalla deja cometer sin decir nada.
 */
export function esFilaFantasma(item) {
  return /^agregar\s+(elemento|c[oó]digo)/i.test(String(item?.name ?? "").trim());
}

/** Las categorias que de verdad hay cargadas, ya separadas y ordenadas. */
export function categoriasDe(items, campo) {
  const vistas = new Set();
  for (const i of items ?? []) {
    for (const c of String(i?.[campo] ?? "").split(",")) {
      const limpia = c.trim();
      if (limpia) vistas.add(limpia);
    }
  }
  return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
}

export function tieneCategoria(item, campo, categoria) {
  if (!categoria) return true;
  return String(item?.[campo] ?? "")
    .split(",")
    .some((c) => c.trim() === categoria);
}

const sinTildes = (t) =>
  String(t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Busca en los campos que la gente usa de verdad.
 *
 * El buscador de la app del cliente dice "por código, descripción o categoría"
 * y solo mira el nombre: buscar "VD-832" no encuentra nada. Aca se busca en los
 * tres, y sin tildes, porque medio catalogo esta cargado en mayusculas sin
 * acentos y la gente las escribe.
 */
export function coincideEnCampos(item, campos, termino) {
  const t = sinTildes(termino).trim();
  if (!t) return true;
  return campos.some((c) => sinTildes(item?.[c]).includes(t));
}

export const CAMPOS_MATERIAL = ["name", "codigoInterno", "categoriaMaterial", "unidad"];
export const CAMPOS_PROVEEDOR = ["name", "contacto", "mail", "categoria", "rut", "fonoContacto"];
