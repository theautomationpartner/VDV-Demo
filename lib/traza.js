/**
 * El hilo que une todas las lineas de log de una misma operacion.
 *
 * Una emision de OC son ocho o nueve llamadas distintas al servidor -crear el
 * item, cada linea, subir el PDF, la copia, la firma, el aviso-, y hasta ahora
 * cada una dejaba su rastro por separado. Cuando el cliente avisaba que "una
 * orden salio mal" no habia forma de juntar las piezas: en los logs de Vercel
 * quedaban mezcladas con las de todos los demas.
 *
 * Ahora el navegador saca una traza al empezar la operacion y la manda en la
 * cabecera de cada pedido. El servidor la escribe en cada linea, asi que
 * buscarla en Vercel -> Logs devuelve la historia completa de esa orden y
 * nada mas.
 *
 * Son 8 caracteres a proposito: alcanzan de sobra para no repetirse dentro de
 * la ventana de un dia que guarda Vercel, y son cortos para leerlos de un
 * vistazo o dictarlos por telefono.
 */
export const CABECERA_TRAZA = "x-vdv-traza";

/** Solo hex, para poder validarla sin sorpresas del lado del servidor. */
export const FORMA_TRAZA = /^[0-9a-f]{8}$/;

export function nuevaTraza() {
  try {
    // randomUUID solo existe en contexto seguro: en https y en localhost si,
    // pero NO al abrir la app por IP de red local, que es como se prueba desde
    // el celular. Ahi cae al Math.random de abajo, que para un id de log
    // alcanza -no es un secreto ni una clave-.
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  }
}
