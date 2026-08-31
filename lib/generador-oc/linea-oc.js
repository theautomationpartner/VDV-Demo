/**
 * Cada linea de una OC vive como subelemento en monday, con un nombre
 * estructurado y legible. Asi el historial de precios se arma desde las
 * ordenes realmente emitidas, sin agregarle tableros ni columnas al cliente.
 *
 * Formato:  DESCRIPCION | 10 SC | 8990 CLP | 5%
 *           (el tramo de descuento se omite cuando es 0)
 */

const SEP = " | ";

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
