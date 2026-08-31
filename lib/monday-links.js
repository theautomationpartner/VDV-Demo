/**
 * Links a un item de monday.
 *
 * El subdominio de la cuenta NO es opcional: sin el, monday.com lleva a la
 * pagina de marketing. Y el formato "view.monday.com/<tablero>-<item>" es para
 * vistas compartidas de un tablero, no para un item: da "Oops... we couldn't
 * find what you were looking for".
 *
 * El formato bueno lo dice la propia API de monday en el campo `url` del item:
 * https://vergaradelvalle.monday.com/boards/<tablero>/pulses/<item>
 */
const CUENTA = "vergaradelvalle";

/** El tablero Ordenes de Compra Maxxa. */
export const BOARD_OC = "18409929921";

export function urlItemMonday(itemId, boardId = BOARD_OC) {
  if (!itemId) return null;
  return `https://${CUENTA}.monday.com/boards/${boardId}/pulses/${itemId}`;
}
