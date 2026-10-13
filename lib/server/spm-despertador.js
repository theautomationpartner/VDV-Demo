import "server-only";
import { traerTodoElTablero } from "@/lib/server/monday-bulk";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { resolveColumnId } from "@/lib/board-schemas";
import { COMPARACION, ENVIO } from "@/lib/spm/dominio";

const SPM = "SpmVdvBoard";

/**
 * Reemplaza al escenario 3b de Make ("Marcar para comparar a las 24 h").
 *
 * QUE HACIA EL DE MAKE, y por que se trae: cada hora leia las PRIMERAS 200
 * solicitudes del tablero, se quedaba con las enviadas que todavia nadie
 * comparo, y a las que llevaban mas de un dia les escribia "Por comparar" -que
 * es lo que despierta al escenario 3, el que compara-.
 *
 * Dos motivos para traerlo:
 *
 *   1. EL TOPE DE 200. Hoy hay 2 solicitudes y no se nota, pero el dia que VDV
 *      tenga 250, las ultimas 50 no las mira NUNCA y se quedan sin comparar sin
 *      que nadie se entere. Aca se trae el tablero entero, con paginas.
 *   2. EL RELOJ CUESTA. Se despertaba cada hora haya trabajo o no: ~1.440
 *      operaciones por mes de la cuota del cliente para mirar la hora. La app
 *      ya tiene tareas programadas andando, asi que sumarle esto sale gratis.
 *
 * LO QUE NO CAMBIA: sigue siendo Make el que compara. Esto solo levanta la
 * mano; el escenario 3 hace el trabajo.
 */

/**
 * Cuantos dias de CALENDARIO en Chile tienen que pasar.
 *
 * El de Make habla de "24 horas", pero la columna `Fecha envío SPM` es una
 * fecha SIN HORA: no hay forma de saber si salio a las 9 o a las 19. Asi que
 * "24 horas" en realidad siempre significo "al dia siguiente", y eso es lo que
 * se hace aca, contando dias de calendario en Chile. Comparar contra un
 * instante da un dia de diferencia segun la hora en que corra.
 */
const DIAS_DE_ESPERA = 1;

const DIA_EN_CHILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function diasDesde(valor, ahora) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ""));
  if (!partes) return null;
  const dia = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  const [a, m, d] = DIA_EN_CHILE.format(new Date(ahora)).split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - dia) / 86400000);
}

/**
 * Cuales hay que despertar.
 *
 * Es una funcion pura para poder probar los bordes sin tocar monday: la
 * recien enviada, la que ya esta comparando, la que no tiene fecha.
 */
export function aDespertar(solicitudes, { ahora = Date.now() } = {}) {
  return (solicitudes ?? []).filter((s) => {
    if (s?.envioCotizacion !== ENVIO.ENVIADO) return false;

    /**
     * Solo las que nadie toco. Si ya dice "Por comparar", volver a escribirlo
     * DISPARA A MAKE DE NUEVO -el escenario 3 mira el cambio de la columna-, y
     * una comparacion repetida pisa la recomendacion que ya estaba.
     */
    const comparacion = String(s?.comparacion ?? "").trim();
    if (comparacion && comparacion !== COMPARACION.PENDIENTE) return false;

    // Sin fecha de envio no se sabe cuanto espero. No se inventa.
    const dias = diasDesde(s?.fechaEnvio, ahora);
    return dias !== null && dias >= DIAS_DE_ESPERA;
  });
}

/** Lee el tablero ENTERO -sin tope- y marca las que corresponda. */
export async function despertarComparaciones({ simular = false } = {}) {
  const solicitudes = await traerTodoElTablero(SPM, [
    "numero",
    "envioCotizacion",
    "comparacion",
    "fechaEnvio",
  ]);

  const candidatas = aDespertar(solicitudes);
  const resultado = {
    revisadas: solicitudes.length,
    despertadas: candidatas.map((s) => ({ id: String(s.id), numero: s.numero ?? null })),
    simulado: simular,
  };

  if (simular || candidatas.length === 0) {
    console.log("[spm]", JSON.stringify({ evento: "despertador", ...resultado }));
    return resultado;
  }

  const boardId = getBoardIdOrThrow(SPM);
  const columna = resolveColumnId(SPM, "comparacion");

  for (const s of candidatas) {
    await mondayFetch(
      `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
        change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $values) { id }
      }`,
      {
        boardId,
        itemId: String(s.id),
        values: JSON.stringify({ [columna]: { label: COMPARACION.POR_COMPARAR } }),
      },
    );
  }

  console.log("[spm]", JSON.stringify({ evento: "despertador", ...resultado }));
  return resultado;
}
