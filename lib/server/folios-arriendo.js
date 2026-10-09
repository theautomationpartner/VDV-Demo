import "server-only";
import { sql } from "@/lib/server/db";
import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";

const BOARD_KEY = "ControlArriendosBoard";

/** El formato del codigo: ARR-0001. */
export const PREFIJO = "ARR-";
export const formatearCodigo = (n) => `${PREFIJO}${String(n).padStart(4, "0")}`;

/**
 * El numero de arriendo sale de NUESTRA base, no de contar lo que hay en monday.
 *
 * Es el mismo criterio que la numeracion de las OC, que Pablo pidio
 * explicitamente en la llamada del 07-oct ("se arregla igual que la numeracion
 * de las OC"). El motivo esta documentado en lib/server/folios-oc.js y vale
 * igual aca: la lista de items de monday es "eventually consistent", un item
 * recien creado tarda segundos en aparecer en las consultas, y por eso el
 * 08-sep dos emisiones con dos segundos de diferencia sacaron las dos el numero
 * 2215. Cualquier defensa basada en leer monday tiene esa ventana ciega.
 *
 * monday sigue mandando como PISO: si alguien carga un arriendo a mano en el
 * tablero con un numero mas alto, el contador salta hasta ahi.
 */

/** El mayor numero que hay hoy en el tablero. Es el piso, no el numero. */
async function pisoDesdeMonday() {
  const boardId = getBoardIdOrThrow(getBoardSchema(BOARD_KEY), BOARD_KEY);
  const columna = resolveColumnId(BOARD_KEY, "codigoArriendo");

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

  // Solo se miran los codigos con NUESTRO formato. El tablero tiene codigos
  // cargados a mano que no lo siguen ("000", "Tryr"): tomarlos como numero
  // daria cualquier cosa, y un piso inventado se lleva puesta la numeracion.
  const numeros = (data.boards?.[0]?.items_page?.items ?? [])
    .map((item) => String(item.column_values?.[0]?.text ?? "").trim())
    .map((texto) => (texto.toUpperCase().startsWith(PREFIJO) ? parseInt(texto.slice(PREFIJO.length), 10) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);

  return numeros.length ? Math.max(...numeros) : 0;
}

async function reservar(piso) {
  const filas = await sql`
    INSERT INTO arriendo_folios (id, ultimo) VALUES (1, ${piso + 1})
    ON CONFLICT (id) DO UPDATE
      SET ultimo = GREATEST(arriendo_folios.ultimo + 1, ${piso + 1}),
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
export async function reservarFolioArriendo() {
  const piso = await pisoDesdeMonday();
  try {
    return await reservar(piso);
  } catch (error) {
    // La tabla se crea sola la primera vez: `npm run migrate` no se puede correr
    // contra produccion porque DATABASE_URL es Sensitive en Vercel. Solo se
    // intenta cuando el error es que no existe, no en cada alta.
    if (!/arriendo_folios.*does not exist|relation .* does not exist/i.test(error?.message ?? "")) {
      throw error;
    }
    await sql`
      CREATE TABLE IF NOT EXISTS arriendo_folios (
        id           INTEGER PRIMARY KEY,
        ultimo       INTEGER NOT NULL,
        actualizado  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT arriendo_folios_una_sola_fila CHECK (id = 1)
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
export async function liberarFolioArriendo(numero) {
  const n = Number(numero);
  if (!Number.isFinite(n) || n <= 0) return false;
  const filas = await sql`
    UPDATE arriendo_folios SET ultimo = ultimo - 1, actualizado = now()
    WHERE id = 1 AND ultimo = ${n}
    RETURNING ultimo
  `;
  return filas.length > 0;
}
