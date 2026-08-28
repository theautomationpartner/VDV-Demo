"use client";

/**
 * Reconstruccion de "@api/BoardSDK" y "@api/api-methods" del framework original de
 * monday Vibe. Expone el mismo contrato encadenado que usaban las 3 apps originales
 * (board.items().withColumns().where().withPagination().execute(), board.item(id).update()...,
 * board.item().create().inGroup().returnColumns().execute(), board.users.me().execute(), etc.)
 * pero por debajo le pega a nuestras propias rutas server-side (/api/monday/board y
 * /api/monday/graphql), que son las unicas que conocen el MONDAY_API_TOKEN real.
 *
 * Autenticacion: la sesion viaja en una cookie httpOnly (ver lib/server/session.js)
 * que el navegador manda solo con estos fetch same-origin - no hace falta adjuntar
 * ningun header a mano.
 */

// JSON no tiene tipo Date: el server convierte columnas "date" a Date, pero al
// viajar por la red vuelven a ser un string ISO. Este reviver las reconstruye
// del lado del cliente, para que el codigo migrado pueda seguir llamando
// .toLocaleDateString() directo sobre esos campos, como hacia el original.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function reviveDates(key, value) {
  return typeof value === "string" && ISO_DATE_RE.test(value) ? new Date(value) : value;
}

async function callBoardApi(boardKey, op, params) {
  const res = await fetch("/api/monday/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardKey, op, params }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text, reviveDates);
  } catch {
    json = {};
  }
  if (!res.ok) {
    throw new Error(json.error ?? `Error en /api/monday/board (status ${res.status})`);
  }
  return json.result;
}

export async function executeGraphQL(query, variables = {}, boardKey = null) {
  const res = await fetch("/api/monday/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables, boardKey }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

class ItemsQueryBuilder {
  constructor(boardKey) {
    this.boardKey = boardKey;
    this._columns = [];
    this._where = {};
    this._limit = 100;
    this._cursor = null;
    this._withRelations = false;
  }
  withColumns(columns) {
    this._columns = columns;
    return this;
  }
  where(condition) {
    this._where = { ...this._where, ...condition };
    return this;
  }
  // Pide que las columnas board_relation vuelvan como { linkedItems: [...] }
  // (id real del item vinculado) en vez de solo texto - necesario para cruzar
  // Ingresos/Vales contra materiales por id. Usado por fetchAllItemsWithRelations.
  withRelations(flag = true) {
    this._withRelations = flag;
    return this;
  }
  withPagination({ limit, cursor } = {}) {
    if (limit != null) this._limit = limit;
    if (cursor !== undefined) this._cursor = cursor;
    return this;
  }
  async execute() {
    return callBoardApi(this.boardKey, "items", {
      columns: this._columns,
      where: this._where,
      limit: this._limit,
      cursor: this._cursor,
      withRelations: this._withRelations,
    });
  }
}

class ItemMutator {
  constructor(boardKey, itemId) {
    this.boardKey = boardKey;
    this.itemId = itemId;
    this._values = null;
  }
  update(values) {
    this._values = values;
    return this;
  }
  async execute() {
    return callBoardApi(this.boardKey, "itemUpdate", {
      itemId: this.itemId,
      values: this._values ?? {},
    });
  }
  /** Deja una nota (update) en el item. Ver handleItemNote en la ruta. */
  async addNote(body, { values } = {}) {
    return callBoardApi(this.boardKey, "itemNote", { itemId: this.itemId, body, values });
  }
  async uploadFile({ columnId, file }) {
    const formData = new FormData();
    formData.append("boardKey", this.boardKey);
    formData.append("itemId", String(this.itemId));
    formData.append("columnId", columnId);
    formData.append("file", file);
    const res = await fetch("/api/monday/upload", {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data?.add_file_to_column;
  }
}

class ItemCreator {
  constructor(boardKey) {
    this.boardKey = boardKey;
    this._name = "";
    this._values = {};
    this._groupId = null;
    this._returnColumns = [];
  }
  create(payload) {
    const { name, ...rest } = payload ?? {};
    this._name = name ?? "";
    this._values = rest;
    return this;
  }
  inGroup(groupId) {
    this._groupId = groupId;
    return this;
  }
  returnColumns(columns) {
    this._returnColumns = columns;
    return this;
  }
  async execute() {
    return callBoardApi(this.boardKey, "itemCreate", {
      name: this._name,
      groupId: this._groupId,
      values: this._values,
      returnColumns: this._returnColumns,
    });
  }
}

class UsersQuery {
  constructor(boardKey) {
    this.boardKey = boardKey;
    this._limit = 200;
    this._me = false;
  }
  me() {
    this._me = true;
    return this;
  }
  withPagination({ limit } = {}) {
    if (limit != null) this._limit = limit;
    return this;
  }
  async execute() {
    if (this._me) return callBoardApi(this.boardKey, "usersMe", {});
    return callBoardApi(this.boardKey, "usersList", { limit: this._limit });
  }
}

class BoardBase {
  constructor(boardKey) {
    this.boardKey = boardKey;
  }
  items() {
    return new ItemsQueryBuilder(this.boardKey);
  }
  item(id) {
    return id != null ? new ItemMutator(this.boardKey, id) : new ItemCreator(this.boardKey);
  }
  get users() {
    return new UsersQuery(this.boardKey);
  }
  async executeGraphQL(query, variables) {
    return executeGraphQL(query, variables, this.boardKey);
  }
  // Labels reales de una columna dropdown/status en monday, para poblar un
  // <select> en vez de mantener la lista copiada a mano en el codigo (ver
  // handleColumnOptions en app/api/monday/board/route.js).
  async columnOptions(friendlyKey) {
    const result = await callBoardApi(this.boardKey, "columnOptions", { column: friendlyKey });
    return result?.options ?? [];
  }
}

function defineBoard(boardKey) {
  return class extends BoardBase {
    constructor() {
      super(boardKey);
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esComplejidadExhausta(err) {
  return err?.message?.includes("COMPLEXITY_BUDGET_EXHAUSTED") || err?.code === "COMPLEXITY_BUDGET_EXHAUSTED";
}

/**
 * Trae todas las paginas de un ItemsQueryBuilder (usa .where()/.withColumns()
 * ya encadenados en `builder`), con reintento ante COMPLEXITY_BUDGET_EXHAUSTED.
 * Unico lugar donde vive esta logica - antes cada hook (OC Tracker, Portal
 * Proveedor, Vale Express) la reimplementaba por separado, y solo uno de los
 * tres manejaba el reintento (ver auditoria, Puntos de cambio).
 */
export async function fetchAllItems(builder, { limit = 500, retries = 3, retryWaitMs = 15000 } = {}) {
  let items = [];
  let cursor;
  let hasMore = true;
  let intentos = 0;

  while (hasMore) {
    try {
      const r = await builder.withPagination({ limit, cursor }).execute();
      items = items.concat(r.items ?? []);
      cursor = r.cursor;
      hasMore = !!cursor;
      intentos = 0;
    } catch (err) {
      if (esComplejidadExhausta(err) && intentos < retries) {
        intentos += 1;
        await delay(err?.extensions?.retry_in_seconds ? err.extensions.retry_in_seconds * 1000 : retryWaitMs);
        continue;
      }
      throw err;
    }
  }
  return items;
}

// column_values.text de un board_relation es la lista de nombres separados por
// coma (sin ids) - insuficiente para cruzar contra otro board por id, asi que
// para los boards que necesitan esto (Ingresos/Vales <-> materiales) se pide
// linked_items via GraphQL crudo en vez del endpoint generico /api/monday/board.
function mapRawItem(item, colIdToSdkProp) {
  // OJO: la query de fetchNextPageWithRelations ya pide group/created_at/
  // updated_at, pero esto los descartaba. Resultado: los items de la pagina 2 en
  // adelante volvian sin `group`, y cualquier filtro por grupo (ej. excluir
  // Duplicados en OC Tracker) los dejaba pasar en silencio.
  const mapped = {
    id: item.id,
    name: item.name,
    group: item.group ?? null,
    createdAt: item.created_at ?? null,
    updatedAt: item.updated_at ?? null,
  };
  if (item.column_values) {
    for (const cv of item.column_values) {
      const sdkProp = colIdToSdkProp[cv.id] || cv.id;
      const colType = cv.column?.type;
      if (cv.linked_items && cv.linked_items.length > 0) {
        mapped[sdkProp] = {
          linkedItems: cv.linked_items.map((li) => ({ id: li.id, name: li.name, sourceBoardId: li.board?.id })),
        };
      } else if (colType === "numeric" || colType === "numbers") {
        mapped[sdkProp] = cv.text ? parseFloat(cv.text) : null;
      } else {
        mapped[sdkProp] = cv.text || null;
      }
    }
  }
  return mapped;
}

async function fetchNextPageWithRelations(cursor, columnIds) {
  const colFragment = columnIds.length
    ? `column_values(ids: [${columnIds.map((c) => `"${c}"`).join(",")}]) {
        id text value
        column { title type }
        ... on BoardRelationValue { linked_items { id name board { id name } } }
      }`
    : "";
  const query = `
    query NextPage($cursor: String!) {
      next_items_page(limit: 500, cursor: $cursor) {
        cursor
        items { id name created_at updated_at group { id title } ${colFragment} }
      }
    }
  `;
  const resp = await executeGraphQL(query, { cursor });
  return resp?.next_items_page ?? { cursor: null, items: [] };
}

/**
 * Igual que fetchAllItems, pero para los casos que necesitan los linked_items
 * (id real) de una columna board_relation - la primera pagina va por `builder`
 * (respeta .where()), las siguientes por next_items_page crudo (monday
 * mantiene el mismo filtro de la query original al paginar por cursor, asi que
 * el .where() de la primera pagina sigue aplicando en el resto).
 */
export async function fetchAllItemsWithRelations(builder, columnIds, colIdToSdkProp) {
  // OJO: la primera pagina TAMBIEN tiene que pedir linked_items. Antes iba por
  // el builder sin withRelations, asi que /api/monday/board aplanaba las
  // columnas board_relation a texto (o null) y esos primeros 500 items
  // quedaban sin `.linkedItems` - el calculo de stock los descartaba
  // (`if (!item.material?.linkedItems) continue`), perdiendo ~500 ingresos y
  // ~500 vales y dando un stock/valor total muy por debajo del real.
  const firstResult = await builder.withRelations().withPagination({ limit: 500 }).execute();
  let allItems = [...(firstResult.items || [])];
  let cursor = firstResult.cursor;
  while (cursor) {
    const nextResult = await fetchNextPageWithRelations(cursor, columnIds);
    allItems = allItems.concat((nextResult.items || []).map((item) => mapRawItem(item, colIdToSdkProp)));
    cursor = nextResult.cursor;
  }
  return allItems;
}

export const OrdenesDeCompraMaxxaBoard = defineBoard("OrdenesDeCompraMaxxaBoard");
export const FacturasIaBoard = defineBoard("FacturasIaBoard");
export const BaseDeDatosMaterialesBoard = defineBoard("BaseDeDatosMaterialesBoard");
export const IngresosBoard = defineBoard("IngresosBoard");
export const ValesBoard = defineBoard("ValesBoard");
export const ProveedoresBoard = defineBoard("ProveedoresBoard");
export const PagosVdvBoard = defineBoard("PagosVdvBoard");
export const FlujoContratacionSubcontratoBoard = defineBoard("FlujoContratacionSubcontratoBoard");
export const EstadosDePagoSubcontratosBoard = defineBoard("EstadosDePagoSubcontratosBoard");
