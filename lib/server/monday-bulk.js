import "server-only";

import { BOARD_SCHEMAS } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { demoHandleItems } from "@/lib/server/demo-data";

const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * Misma conversion que hace la ruta que ya usaban las pantallas
 * (coerceColumnValue en app/api/monday/board/route.js). Se replica -y no se
 * importa, porque aquella es interna de esa ruta- para que los datos que salen
 * de aca sean indistinguibles de los que ya consumen los hooks.
 *
 * Las dos conversiones que importan:
 *  - las columnas de numeros vuelven como NUMERO. Si volvieran como texto, una
 *    suma como `total + monto` concatenaria en vez de sumar.
 *  - las fechas se anclan al mediodia UTC. new Date("2026-08-05") es medianoche
 *    UTC, y formateada en Chile cae el dia anterior: se veia el 04-08.
 */
function convertirValor(cv) {
  const { text, column } = cv;
  if (text == null || text === "") return null;

  if (column?.type === "numbers") {
    const n = Number(text);
    return Number.isNaN(n) ? text : n;
  }

  if (column?.type === "date") {
    const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (soloFecha) {
      const [, anio, mes, dia] = soloFecha;
      return new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia), 12));
    }
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? text : d;
  }

  return text;
}

/**
 * Traer un tablero ENTERO desde el servidor.
 *
 * Es el equivalente server-side de fetchAllItemsWithRelations del SDK cliente,
 * y existe para lo mismo que aquel: las columnas de vinculo (board_relation)
 * traen `text` en null, el dato real esta en `linked_items`. Aca ademas no hay
 * limite de complejidad que esquivar con esperas escalonadas, porque esto no
 * corre en el camino de nadie: lo usan los recalculos periodicos que dejan el
 * resultado ya guardado (lib/server/*-snapshot.js).
 *
 * Devuelve las filas con las claves "amigables" del schema, y las columnas de
 * vinculo como `{ linkedItems: [...] }` - la misma forma que ya consumen las
 * pantallas, para que mover el calculo al servidor no obligue a reescribirlas.
 */
export async function traerTodoElTablero(boardKey, claves) {
  // El link publico de demo no tiene ni token de monday ni base: las fixtures ya
  // vienen con esta misma forma, asi que quien llame a esto funciona igual.
  if (DEMO_MODE) return demoHandleItems(boardKey, { limit: 100000 }).items;

  const schema = BOARD_SCHEMAS[boardKey];
  const boardId = getBoardIdOrThrow(schema, boardKey);

  const idPorClave = {};
  for (const clave of claves) idPorClave[clave] = schema.columns[clave];
  const ids = Object.values(idPorClave);
  const clavePorId = Object.fromEntries(Object.entries(idPorClave).map(([k, v]) => [v, k]));

  const campos = `items {
    id
    name
    created_at
    updated_at
    group { id title }
    column_values(ids: ${JSON.stringify(ids)}) {
      id
      text
      column { type }
      ... on BoardRelationValue { display_value linked_items { id name board { id } } }
    }
  }`;

  const mapear = (item) => {
    // Las claves son las que ya consumen las pantallas: createdAt/updatedAt en
    // camelCase, group como objeto, y las columnas por su nombre amigable.
    const fila = {
      id: String(item.id),
      name: item.name,
      createdAt: item.created_at ?? null,
      updatedAt: item.updated_at ?? null,
      group: item.group ?? null,
    };
    for (const cv of item.column_values ?? []) {
      const clave = clavePorId[cv.id];
      if (!clave) continue;

      if (cv.linked_items && cv.linked_items.length > 0) {
        fila[clave] = {
          linkedItems: cv.linked_items.map((li) => ({
            id: li.id,
            name: li.name,
            sourceBoardId: li.board?.id,
          })),
        };
      } else if (cv.display_value) {
        fila[clave] = cv.display_value;
      } else {
        fila[clave] = convertirValor(cv);
      }
    }
    return fila;
  };

  const datos = await mondayFetch(
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) { items_page(limit: 500) { cursor ${campos} } }
    }`,
    { boardId },
  );

  let pagina = datos.boards?.[0]?.items_page;
  if (!pagina) return [];
  let filas = pagina.items.map(mapear);

  while (pagina.cursor) {
    const siguiente = await mondayFetch(
      `query ($cursor: String!) { next_items_page(limit: 500, cursor: $cursor) { cursor ${campos} } }`,
      { cursor: pagina.cursor },
    );
    pagina = siguiente.next_items_page;
    filas = filas.concat(pagina.items.map(mapear));
  }

  return filas;
}
