import { getBoardSchema, resolveColumnId } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoMutacion,
  accesoBoardErrorToResponse,
  BoardAccessError,
} from "@/lib/server/board-access-policy";
import {
  demoHandleItems,
  demoHandleItemUpdate,
  demoHandleItemCreate,
  demoHandleUsersList,
  demoHandleUsersMe,
  demoHandleColumnOptions,
} from "@/lib/server/demo-data";

// Modo demo: no le pega a monday.com en absoluto, sirve datos 100% inventados
// (lib/server/demo-data.js). Pensado para el link publico de prueba - no requiere
// sesion propia ni expone ningun dato real de la cuenta.
const DEMO_MODE = process.env.DEMO_MODE === "true";

// Whitelist de emails + 2FA (login propio, standalone - ver lib/server/auth-guard.js
// y lib/server/session.js). Off por defecto para no romper el desarrollo mientras
// se termina de conectar la base de Neon; se activa recien cuando DATABASE_URL /
// MFA_ENCRYPTION_KEY / MFA_SESSION_SECRET esten listos.
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * monday.com siempre devuelve column_values.text como string plano. Las paginas
 * migradas (igual que el codigo original) esperan numeros reales para columnas de
 * tipo "numbers" y objetos Date para columnas de tipo "date". Antes esto se
 * inferia adivinando por la FORMA del texto (si parecia un numero, se convertia) -
 * eso rompia columnas de tipo texto que solo contienen digitos (ej. "NUMERO OC",
 * que en monday es tipo texto, no numeros): terminaban convertidas a Number y
 * cualquier .trim()/.toLowerCase() de la app migrada explotaba en runtime.
 * Ahora se usa el tipo REAL de columna (column.type, pedido a la API de monday)
 * para decidir la conversion, no una adivinanza.
 */
function coerceColumnValue(cv) {
  const { text, column } = cv;
  if (text == null || text === "") return null;
  if (column?.type === "numbers") {
    const n = Number(text);
    return Number.isNaN(n) ? text : n;
  }
  if (column?.type === "date") {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? text : d;
  }
  return text;
}

function mapItemColumns(item, columnIdToFriendly) {
  // created_at/updated_at son campos nativos del item en monday (no columnas).
  // La app original los pedia y mapeaba a createdAt/updatedAt - se usan p.ej.
  // en el campo "Creado" de vales-pendientes; sin esto quedaba siempre en "-".
  const mapped = {
    id: item.id,
    name: item.name,
    group: item.group ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
  };
  for (const cv of item.column_values ?? []) {
    const friendlyKey = columnIdToFriendly[cv.id];
    if (!friendlyKey) continue;
    // Cuando la query pidio linked_items (withRelations), las columnas
    // board_relation vuelven como { linkedItems: [...] } - misma forma que
    // produce mapRawItem en lib/board-sdk.js para las paginas siguientes, para
    // que fetchAllItemsWithRelations devuelva items homogeneos.
    if (cv.linked_items && cv.linked_items.length > 0) {
      mapped[friendlyKey] = {
        linkedItems: cv.linked_items.map((li) => ({ id: li.id, name: li.name, sourceBoardId: li.board?.id })),
      };
    } else {
      mapped[friendlyKey] = coerceColumnValue(cv);
    }
  }
  return mapped;
}

function invertColumns(columns) {
  const inverted = {};
  for (const [friendly, columnId] of Object.entries(columns)) {
    inverted[columnId] = friendly;
  }
  return inverted;
}

async function handleItems(boardKey, schema, params) {
  const boardId = getBoardIdOrThrow(schema, boardKey);
  const { columns = [], where = {}, limit = 100, cursor = null, withRelations = false } = params;

  const columnIds = columns.map((key) => resolveColumnId(boardKey, key));
  const columnIdToFriendly = invertColumns(schema.columns);

  // Solo cuando el caller lo pide (fetchAllItemsWithRelations): trae los
  // linked_items de las columnas board_relation. Fragmento identico al que ya
  // usa fetchNextPageWithRelations en board-sdk.js, verificado contra el
  // esquema real de la API. No se agrega por defecto para no cambiar la forma
  // del dato de los demas consumidores (useOCData, usePaymentData, etc.).
  const relFragment = withRelations
    ? "... on BoardRelationValue { linked_items { id name board { id name } } }"
    : "";
  const cvFields = `column_values { id text value column { type } ${relFragment} }`;

  // Filtro por nombre de item: la API de monday no soporta esto de forma consistente
  // via query_params, asi que se filtra client-side (post-fetch) sobre la pagina traida.
  const nameFilter = typeof where.name === "string" ? where.name.toLowerCase() : null;

  const rules = [];
  for (const [key, cond] of Object.entries(where)) {
    if (key === "name" || cond == null) continue;
    const columnId = resolveColumnId(boardKey, key);
    if (typeof cond === "object" && Array.isArray(cond.neq)) {
      rules.push({ column_id: columnId, compare_value: cond.neq, operator: "not_any_of" });
    } else if (typeof cond === "object" && typeof cond.eq === "string") {
      // Igualdad sobre columnas status/color (ej. estado='SOLICITADA',
      // obra='PL 46-50' en vales-pendientes). ANTES no habia handler para `eq`,
      // asi que el filtro se ignoraba en silencio y la pantalla mostraba vales
      // de CUALQUIER obra/estado (bug: al filtrar por PL 46-50 salian vales de
      // M388). Para columnas status, `any_of` con el texto del label no filtra
      // (espera indices); `contains_text` con el label si funciona - verificado
      // en vivo contra la API. Los unicos usos de `eq` en la app son estado y
      // obra (ambas status), sin riesgo de substring entre labels reales.
      rules.push({ column_id: columnId, compare_value: [cond.eq], operator: "contains_text" });
    } else if (typeof cond === "object" && typeof cond.contains === "string") {
      rules.push({ column_id: columnId, compare_value: [cond.contains], operator: "contains_text" });
    } else if (typeof cond === "object" && cond.linkedItemId != null) {
      // Filtro por columna board_relation (ej. "proveedores") usando el id real
      // del item vinculado en vez de comparar el texto renderizado - inmune a
      // que el mismo proveedor aparezca con distinto nombre/typo en el board.
      // "any_of" es el operador que monday espera para connect_boards.
      rules.push({ column_id: columnId, compare_value: [String(cond.linkedItemId)], operator: "any_of" });
    }
  }

  let data;
  if (cursor) {
    data = await mondayFetch(
      `query ($cursor: String!, $limit: Int!) {
        next_items_page(cursor: $cursor, limit: $limit) {
          cursor
          items { id name created_at updated_at group { id title } ${cvFields} }
        }
      }`,
      { cursor, limit }
    );
    const page = data.next_items_page;
    let items = page.items.map((it) => mapItemColumns(it, columnIdToFriendly));
    if (nameFilter) items = items.filter((it) => it.name?.toLowerCase().includes(nameFilter));
    return { items, cursor: page.cursor };
  }

  const queryParams = rules.length ? { rules } : undefined;
  data = await mondayFetch(
    `query ($boardId: ID!, $limit: Int!, $queryParams: ItemsQuery) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, query_params: $queryParams) {
          cursor
          items { id name created_at updated_at group { id title } ${cvFields} }
        }
      }
    }`,
    { boardId, limit, queryParams }
  );
  const page = data.boards?.[0]?.items_page;
  if (!page) return { items: [], cursor: null };
  let items = page.items.map((it) => mapItemColumns(it, columnIdToFriendly));
  if (nameFilter) items = items.filter((it) => it.name?.toLowerCase().includes(nameFilter));
  return { items, cursor: page.cursor };
}

/**
 * Labels reales de una columna dropdown/status de monday.com.
 *
 * Las 3 apps originales copiaban estas listas a mano en el codigo (ej. DESTINOS
 * y SOLICITANTES en app/vale-express/solicitud/page.jsx). Cuando el cliente
 * agrega un label en monday, la app no lo ofrece y el usuario no puede cargar el
 * vale - paso con DORM 41 a DORM 46 en "DESTINO DEL MATERIAL". Esto los trae en
 * vivo; el array hardcodeado queda solo como fallback si monday no responde.
 *
 * Soporta las dos formas en que monday devuelve los labels:
 *   dropdown -> settings.labels = [{ id, name }, ...]
 *   status   -> settings.labels = { "1": "NUEVO", "2": "APROBADO", ... }
 */
async function handleColumnOptions(boardKey, schema, params) {
  const boardId = getBoardIdOrThrow(schema, boardKey);
  const columnId = resolveColumnId(boardKey, params.column);

  const data = await mondayFetch(
    `query ($boardId: ID!, $columnIds: [String!]) {
      boards(ids: [$boardId]) { columns(ids: $columnIds) { id type settings_str } }
    }`,
    { boardId, columnIds: [columnId] }
  );

  const columna = data.boards?.[0]?.columns?.[0];
  if (!columna) return { options: [] };

  let settings;
  try {
    settings = JSON.parse(columna.settings_str || "{}");
  } catch {
    return { options: [] };
  }

  const labels = settings.labels;
  const nombres = Array.isArray(labels)
    ? labels.map((l) => l?.name)
    : labels && typeof labels === "object"
      ? Object.values(labels)
      : [];

  // monday permite labels repetidos y vacios (el board VALES tiene varios) - el
  // <select> no los quiere, asi que se deduplica preservando el orden de monday.
  const options = [...new Set(nombres.filter((n) => typeof n === "string" && n.trim() !== ""))];
  return { options };
}

/**
 * Las columnas de vinculo (board_relation) no se pueden escribir con
 * change_simple_column_value: monday responde "column type BoardRelationColumn is
 * not supporting changing the column value with simple column value". Van por
 * change_multiple_column_values con { item_ids: [...] }.
 */
function esRelacion(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Array.isArray(value.linkedItems)
  );
}

/**
 * change_simple_column_value recibe el valor como string, pero monday espera un
 * formato distinto segun el tipo de columna. Antes se hacia String(value) para todo,
 * lo que rompia las fechas: el valor viaja como string ISO (JSON no tiene tipo Date)
 * y la columna espera "YYYY-MM-DD".
 *
 * El resto de los casos da el mismo resultado que antes, asi que esto no cambia el
 * comportamiento de las pantallas que ya funcionaban.
 */
function serializarValorColumna(value) {
  if (value == null) return "";

  // Date real (mismo proceso) o string ISO (lo habitual: viene por la red)
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  // dropdown con una o varias etiquetas
  if (Array.isArray(value)) return value.join(", ");

  return String(value);
}

async function handleItemUpdate(boardKey, schema, params) {
  const boardId = getBoardIdOrThrow(schema, boardKey);
  const { itemId, values = {} } = params;

  const entries = Object.entries(values);
  if (!entries.length) return { id: itemId };

  // Los vinculos van por otra mutacion, ver esRelacion() arriba.
  const simples = [];
  const relaciones = {};
  for (const [friendlyKey, value] of entries) {
    const columnId = resolveColumnId(boardKey, friendlyKey);
    if (esRelacion(value)) {
      relaciones[columnId] = { item_ids: value.linkedItems.map((l) => Number(l.id)) };
    } else {
      simples.push([columnId, serializarValorColumna(value)]);
    }
  }

  if (simples.length) {
    const mutationParts = simples.map(
      ([columnId, valor], i) =>
        `c${i}: change_simple_column_value(item_id: $itemId, board_id: $boardId, column_id: ${JSON.stringify(
          columnId
        )}, value: ${JSON.stringify(valor)}) { id }`
    );
    await mondayFetch(
      `mutation ($itemId: ID!, $boardId: ID!) { ${mutationParts.join("\n")} }`,
      { itemId, boardId }
    );
  }

  if (Object.keys(relaciones).length) {
    await mondayFetch(
      `mutation ($itemId: ID!, $boardId: ID!, $values: JSON!) {
        change_multiple_column_values(item_id: $itemId, board_id: $boardId, column_values: $values) { id }
      }`,
      { itemId, boardId, values: JSON.stringify(relaciones) }
    );
  }

  return { id: itemId };
}

async function handleItemCreate(boardKey, schema, params) {
  const boardId = getBoardIdOrThrow(schema, boardKey);
  const { name, groupId, values = {}, returnColumns = [] } = params;

  const data = await mondayFetch(
    `mutation ($boardId: ID!, $groupId: String, $name: String!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $name) { id name }
    }`,
    { boardId, groupId: groupId ?? null, name }
  );
  const itemId = data.create_item.id;

  const entries = Object.entries(values);
  if (entries.length) {
    await handleItemUpdate(boardKey, schema, { itemId, values });
  }

  if (returnColumns.length) {
    const { items } = await handleItems(boardKey, schema, {
      columns: returnColumns,
      where: {},
      limit: 1,
    });
    const created = items.find((it) => String(it.id) === String(itemId));
    return created ?? { id: itemId, name: data.create_item.name };
  }

  return { id: itemId, name: data.create_item.name };
}

async function handleUsersMe() {
  const data = await mondayFetch(`{ me { id name email photo_url } }`);
  return data.me;
}

async function handleUsersList(params) {
  const { limit = 200 } = params;
  const data = await mondayFetch(`query ($limit: Int!) { users(limit: $limit) { id name email photo_url } }`, {
    limit,
  });
  return data.users;
}

export async function POST(request) {
  let sesion = null;
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      sesion = verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body invalido, se esperaba JSON" }, { status: 400 });
  }

  const { boardKey, op, params = {} } = body ?? {};

  try {
    if (DEMO_MODE) {
      if (op === "usersMe") return Response.json({ result: demoHandleUsersMe() });
      if (op === "usersList") return Response.json({ result: demoHandleUsersList() });
      if (op === "items") return Response.json({ result: demoHandleItems(boardKey, params) });
      if (op === "columnOptions") return Response.json({ result: demoHandleColumnOptions(boardKey, params) });
      if (op === "itemUpdate") return Response.json({ result: demoHandleItemUpdate(boardKey, params) });
      if (op === "itemCreate") return Response.json({ result: demoHandleItemCreate(boardKey, params) });
      return Response.json({ error: `Operacion desconocida: "${op}"` }, { status: 400 });
    }

    if (op === "usersMe") {
      return Response.json({ result: await handleUsersMe() });
    }

    const schema = getBoardSchema(boardKey);

    if (op === "items") return Response.json({ result: await handleItems(boardKey, schema, params) });

    if (op === "columnOptions")
      return Response.json({ result: await handleColumnOptions(boardKey, schema, params) });

    if (op === "itemUpdate" || op === "itemCreate") {
      if (AUTH_LAYERS_ENABLED) {
        try {
          verificarAccesoMutacion(sesion, boardKey, { op, values: params.values });
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }
      if (op === "itemUpdate") return Response.json({ result: await handleItemUpdate(boardKey, schema, params) });
      return Response.json({ result: await handleItemCreate(boardKey, schema, params) });
    }

    if (op === "usersList") return Response.json({ result: await handleUsersList(params) });

    return Response.json({ error: `Operacion desconocida: "${op}"` }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
