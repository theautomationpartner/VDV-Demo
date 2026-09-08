/**
 * Cada linea de una OC vive como subelemento en monday, con un nombre
 * estructurado y legible. Asi el historial de precios se arma desde las
 * ordenes realmente emitidas, sin agregarle tableros ni columnas al cliente.
 *
 * Formato:  DESCRIPCION | 10 SC | 8990 CLP | 5%
 *           (el tramo de descuento se omite cuando es 0)
 */

const SEP = " | ";

/**
 * monday no acepta nombres de item de mas de 255 caracteres. Su respuesta
 * textual es "Validation failed: Name between 1 to 255 characters long".
 *
 * Y como toda la linea -descripcion, cantidad, precio y descuento- viaja en el
 * nombre del subelemento, una descripcion larga hace que monday RECHACE la
 * linea entera.
 *
 * Paso de verdad: la OC 2201 se emitio el 04-sep con 5 lineas y una de ellas
 * -DEPARTAMENTO 103, $8.008.000- tenia 467 caracteres de descripcion. monday la
 * rechazo, la app se comio el error, y en el tablero quedaron 4 lineas con el
 * monto total de 5. El PDF de emision salio bien porque se arma con lo que la
 * persona escribio; el de aprobacion se arma leyendo monday, asi que perdio la
 * linea y metio los $8 millones en el IVA. Pablo firmo un documento distinto al
 * que se emitio.
 */
export const MAX_NOMBRE_MONDAY = 255;

/** Lo que va a medir el nombre del subelemento en monday. */
export function largoNombre(linea, moneda) {
  return codificarLinea(linea, moneda).length;
}

/** Cuantos caracteres de descripcion entran todavia en esta linea. */
export function maxDescripcion(linea, moneda) {
  const sinDescripcion = codificarLinea({ ...linea, descripcion: "" }, moneda);
  return Math.max(0, MAX_NOMBRE_MONDAY - sinDescripcion.length);
}

/**
 * Cuantos caracteres sobran, o 0 si entra. El presupuesto depende de la propia
 * linea: la cantidad, la unidad, el precio y el descuento tambien ocupan.
 */
export function excedeNombre(linea, moneda) {
  return Math.max(0, largoNombre(linea, moneda) - MAX_NOMBRE_MONDAY);
}

function numeroLimpio(texto) {
  const n = parseFloat(
    (texto || "")
      .replace(/[^0-9.,-]/g, "")
      .replace(/\.(?=\d{3}\b)/g, "")
      .replace(",", "."),
  );
  return isFinite(n) ? n : 0;
}

/** Nombre del subelemento a partir de una linea de la OC. */
export function codificarLinea(linea, moneda) {
  const descripcion = linea.descripcion.replace(/\|/g, "/").trim();
  const unidad = (linea.unidad || "un").replace(/\|/g, "").trim();
  const descuento = linea.descuento ?? 0;

  const tramos = [descripcion, `${linea.cantidad} ${unidad}`, `${linea.precioUnitario} ${moneda}`];
  if (descuento > 0) tramos.push(`${descuento}%`);

  return tramos.join(SEP);
}

/** Reconstruye la linea desde el nombre del subelemento; null si no tiene el formato. */
export function decodificarLinea(nombre) {
  if (!nombre || !nombre.includes(SEP)) return null;

  const partes = nombre.split(SEP).map((p) => p.trim());
  const descripcion = partes[0] ?? "";
  if (!descripcion) return null;

  const mCantidad = (partes[1] ?? "").match(/^([\d.,]+)\s*(.*)$/);
  if (!mCantidad) return null;
  const cantidad = numeroLimpio(mCantidad[1] ?? "");
  const unidad = (mCantidad[2] ?? "").trim();

  const mPrecio = (partes[2] ?? "").match(/^([\d.,]+)\s*([A-Za-z]*)$/);
  if (!mPrecio) return null;
  const precioUnitario = numeroLimpio(mPrecio[1] ?? "");
  const moneda = (mPrecio[2] || "CLP").toUpperCase();

  const tramoDescuento = partes[3] ?? "";
  const descuento = tramoDescuento.includes("%") ? numeroLimpio(tramoDescuento) : 0;

  if (precioUnitario <= 0) return null;

  return { descripcion, cantidad, unidad, precioUnitario, descuento, moneda };
}

/** Precio realmente pagado por unidad, con el descuento ya aplicado. */
export function precioFinal(linea) {
  return linea.precioUnitario * (1 - (linea.descuento || 0) / 100);
}
