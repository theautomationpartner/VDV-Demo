/**
 * Comparar personas por nombre, que es lo unico que la app tiene a mano.
 *
 * Las columnas RESPONSABLE y APROBADOR son de tipo persona en monday, pero por
 * la API de tableros llegan como TEXTO ("pablo vergara"), sin el id. Asi que
 * para saber si una orden es tuya hay que comparar ese texto contra tu nombre.
 *
 * El problema es de donde sale "tu nombre": arranca siendo el de la whitelist
 * ("Pablo Vergara") y recien despues lo reemplaza el del perfil de monday
 * ("pablo vergara"). Comparando con === , en el medio -o para siempre, si el
 * perfil no se puede resolver- la persona deja de figurar como aprobador de su
 * propia orden: sin lapiz, sin desplegable de estado, y sin ninguna explicacion
 * en pantalla. Paso en produccion con la OC 2200.
 *
 * Se comparan sin mayusculas, sin espacios de sobra y sin acentos. Los acentos
 * no deberian diferir -los dos nombres salen de monday- pero "Jorge Muñoz"
 * escrito a mano en la whitelist no tiene por que coincidir byte a byte.
 *
 * Esto es un parche sobre el sintoma: dos personas con el mismo nombre en
 * monday siguen siendo indistinguibles. La solucion de fondo es que la API
 * devuelva los ids de las columnas de persona.
 */

function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Si dos nombres de persona son el mismo. */
export function mismoNombre(a, b) {
  const na = normalizar(a);
  return Boolean(na) && na === normalizar(b);
}

/**
 * Si `nombre` esta entre las personas de una columna de monday, que llegan como
 * texto separado por coma cuando hay mas de una.
 */
export function contienePersona(valorColumna, nombre) {
  if (!valorColumna || !nombre) return false;
  return String(valorColumna)
    .split(",")
    .some((parte) => mismoNombre(parte, nombre));
}
