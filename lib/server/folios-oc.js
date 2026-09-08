import "server-only";
import { sql } from "@/lib/server/db";
import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { mayorNumeroPlausible } from "@/lib/generador-oc/numeracion";

const BOARD_KEY = "OrdenesDeCompraMaxxaBoard";

/**
 * El numero de OC deja de calcularse leyendo monday en el momento de emitir.
 *
 * Por que: el 08-sep dos emisiones con dos segundos de diferencia sacaron las
 * DOS el numero 2215. La comprobacion posterior tampoco lo detecto. La causa es
 * que la lista de items de monday es "eventually consistent": un item recien
 * creado tarda unos segundos en aparecer en las consultas. O sea que cualquier
 * defensa basada en leer monday tiene una ventana ciega de varios segundos, y
 * no hay forma de cerrarla desde ahi.
 *
 * La numeracion pasa a vivir en nuestra base, que si sabe dar un numero por vez.
 * monday sigue mandando como PISO: las ordenes que cargan a mano en el tablero
 * no pasan por la app, asi que si alguna quedo mas arriba que el contador, el
 * contador salta hasta ahi.
 */

/** El mayor numero de OC que hay hoy en el tablero. Es el piso, no el numero. */
async function pisoDesdeMonday() {
  const boardId = getBoardIdOrThrow(getBoardSchema(BOARD_KEY), BOARD_KEY);
  const columna = resolveColumnId(BOARD_KEY, "numeroOc");

  // __creation_log__ es como monday expone la fecha de creacion en query_params.
  const data = await mondayFetch(
    `query ($boardId: ID!, $ids: [String!], $queryParams: ItemsQuery) {
      boards (ids: [$boardId]) {
        items_page (limit: 100, query_params: $queryParams) {
          items { column_values (ids: $ids) { text } }
        }
      }
    }`,
    {
      boardId,
      ids: [columna],
      queryParams: { order_by: [{ column_id: "__creation_log__", direction: "desc" }] },
    },
  );

  const numeros = (data.boards?.[0]?.items_page?.items ?? [])
    .map((item) => parseInt(String(item.column_values?.[0]?.text ?? "").trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  return numeros.length ? mayorNumeroPlausible(numeros) : 0;
}

/**
 * Reserva el proximo numero y lo devuelve. Dos llamadas simultaneas devuelven
 * numeros distintos: el INSERT ... ON CONFLICT toma el candado de la fila, asi
 * que la segunda espera a la primera.
 */
export async function reservarFolioOc() {
  const piso = await pisoDesdeMonday();
  try {
    return await reservar(piso);
  } catch (error) {
    // Preview y produccion tienen bases distintas, y la de preview no se toca
    // desde aca. En vez de dejar la app sin poder emitir hasta que alguien corra
    // el schema a mano, la tabla se crea sola la primera vez. Solo se intenta
    // cuando el error es que no existe, no en cada emision.
    if (!/oc_folios.*does not exist|relation .* does not exist/i.test(error?.message ?? "")) {
      throw error;
    }
    await sql`
      CREATE TABLE IF NOT EXISTS oc_folios (
        id                INTEGER PRIMARY KEY,
        ultimo            INTEGER NOT NULL,
        actualizado       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT oc_folios_una_sola_fila CHECK (id = 1)
      )
    `;
    return await reservar(piso);
  }
}

async function reservar(piso) {
  const filas = await sql`
    INSERT INTO oc_folios (id, ultimo) VALUES (1, ${piso + 1})
    ON CONFLICT (id) DO UPDATE
      SET ultimo = GREATEST(oc_folios.ultimo + 1, ${piso + 1}),
          actualizado = now()
    RETURNING ultimo
  `;
  return Number(filas[0].ultimo);
}

/**
 * Devuelve el numero cuando la emision no se pudo completar.
 *
 * Solo si sigue siendo el ultimo: si mientras tanto alguien reservo el
 * siguiente, bajar el contador repartiria un numero ya usado. En ese caso no
 * hace nada y el folio queda como hueco, que es lo unico correcto.
 */
export async function liberarFolioOc(numero) {
  const n = Number(numero);
  if (!Number.isFinite(n) || n <= 0) return false;
  const filas = await sql`
    UPDATE oc_folios SET ultimo = ultimo - 1, actualizado = now()
    WHERE id = 1 AND ultimo = ${n}
    RETURNING ultimo
  `;
  return filas.length > 0;
}
