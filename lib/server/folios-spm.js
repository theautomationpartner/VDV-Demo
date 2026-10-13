import "server-only";
import { sql } from "@/lib/server/db";
import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";

const BOARD_KEY = "SpmVdvBoard";

/** El formato del numero de solicitud: SPM-001. Tres digitos, como el cliente. */
export const PREFIJO = "SPM-";
export const formatearNumero = (n) => `${PREFIJO}${String(n).padStart(3, "0")}`;

/**
 * El numero de solicitud sale de NUESTRA base, no de contar lo que hay en
 * monday.
 *
 * Hoy lo hacen dos lugares a la vez y los dos mal: la app del cliente lee el
 * tablero entero y busca el maximo, y el escenario 4 de Make hace exactamente
 * lo mismo por las dudas. Entre leer y escribir no hay nada que impida que otra
 * persona tome el mismo numero, y la lista de items de monday ademas es
 * "eventually consistent": un item recien creado tarda segundos en aparecer en
 * las consultas. Asi fue como el 08-sep dos ordenes de compra con dos segundos
 * de diferencia sacaron las dos el 2215.
 *
 * monday sigue mandando como PISO: si alguien carga una solicitud a mano con un
 * numero mas alto, el contador salta hasta ahi.
 *
 * El escenario 4 de Make no estorba: su propio codigo dice que si el item ya
 * trae un numero valido no hace nada. Igual conviene apagarlo cuando esto este
 * en produccion, para que haya una sola fuente.
 */

/** El mayor numero que hay hoy en el tablero. Es el piso, no el numero. */
async function pisoDesdeMonday() {
  const boardId = getBoardIdOrThrow(getBoardSchema(BOARD_KEY), BOARD_KEY);
  const columna = resolveColumnId(BOARD_KEY, "numero");

  const data = await mondayFetch(
    `query ($boardId: ID!, $ids: [String!]) {
      boards (ids: [$boardId]) {
        items_page (limit: 100, query_params: { order_by: [{ column_id: "__creation_log__", direction: desc }] }) {
          items { column_values (ids: $ids) { text } }
        }
      }
    }`,
    { boardId, ids: [columna] },
  );

  // Solo se miran los numeros con NUESTRO formato: un texto suelto en esa
  // columna no puede mover el contador.
  const numeros = (data.boards?.[0]?.items_page?.items ?? [])
    .map((item) => String(item.column_values?.[0]?.text ?? "").trim().toUpperCase())
    .map((texto) => (texto.startsWith(PREFIJO) ? parseInt(texto.slice(PREFIJO.length), 10) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);

  return numeros.length ? Math.max(...numeros) : 0;
}

async function reservar(piso) {
  const filas = await sql`
    INSERT INTO spm_folios (id, ultimo) VALUES (1, ${piso + 1})
    ON CONFLICT (id) DO UPDATE
      SET ultimo = GREATEST(spm_folios.ultimo + 1, ${piso + 1}),
          actualizado = now()
    RETURNING ultimo
  `;
  return Number(filas[0].ultimo);
}

/**
 * Reserva el proximo numero y lo devuelve.
 *
 * Dos llamadas al mismo tiempo devuelven numeros distintos: el INSERT ... ON
 * CONFLICT toma el candado de la fila y la segunda espera a la primera.
 */
export async function reservarFolioSpm() {
  const piso = await pisoDesdeMonday();
  try {
    return await reservar(piso);
  } catch (error) {
    // La tabla se crea sola la primera vez: `npm run migrate` no se puede
    // correr contra produccion porque DATABASE_URL es Sensitive en Vercel.
    if (!/spm_folios.*does not exist|relation .* does not exist/i.test(error?.message ?? "")) {
      throw error;
    }
    await sql`
      CREATE TABLE IF NOT EXISTS spm_folios (
        id           INTEGER PRIMARY KEY,
        ultimo       INTEGER NOT NULL,
        actualizado  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT spm_folios_una_sola_fila CHECK (id = 1)
      )
    `;
    return await reservar(piso);
  }
}

/**
 * Devuelve el numero cuando el alta no se pudo completar.
 *
 * Solo si sigue siendo el ultimo: si mientras tanto alguien reservo el
 * siguiente, bajar el contador repartiria un numero ya usado. En ese caso no
 * hace nada y el numero queda como hueco, que es lo unico correcto.
 */
export async function liberarFolioSpm(numero) {
  const n = Number(numero);
  if (!Number.isFinite(n) || n <= 0) return false;
  const filas = await sql`
    UPDATE spm_folios SET ultimo = ultimo - 1, actualizado = now()
    WHERE id = 1 AND ultimo = ${n}
    RETURNING ultimo
  `;
  return filas.length > 0;
}
