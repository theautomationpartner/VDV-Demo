/**
 * Reglas de numeracion de las Ordenes de Compra, compartidas por el navegador y
 * el servidor. Sin "use client" a proposito: la reserva de folio vive en una
 * route handler y necesita exactamente el mismo criterio.
 */

/**
 * Un salto de mas de este tamano respecto del siguiente numero no es una orden
 * real: es un tipeo o un item de prueba. La numeracion de VDV es correlativa y
 * avanza de a uno.
 */
export const SALTO_IMPLAUSIBLE = 100;

/**
 * Descarta los numeros disparatados y devuelve el mayor que queda.
 *
 * Hace falta de verdad: el tablero llego a tener una orden numerada 999001 (un
 * item de prueba). Sin este filtro la proxima orden emitida seria la 999002 y la
 * numeracion del cliente quedaria rota para siempre. Un solo numero mal cargado
 * alcanza para arruinarla.
 *
 * Se van descartando de arriba hacia abajo mientras el salto al siguiente sea
 * mayor a SALTO_IMPLAUSIBLE, asi que aguanta varios outliers seguidos.
 */
export function mayorNumeroPlausible(numeros) {
  const ordenados = [...new Set(numeros)].sort((a, b) => b - a);
  for (let i = 0; i < ordenados.length - 1; i++) {
    if (ordenados[i] - ordenados[i + 1] <= SALTO_IMPLAUSIBLE) return ordenados[i];
  }
  // Una sola orden en el tablero, o todas separadas entre si: no hay con que
  // comparar, se usa la mas alta tal cual.
  return ordenados[0] ?? 0;
}
