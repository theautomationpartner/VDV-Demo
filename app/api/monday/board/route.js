import { getBoardSchema, resolveColumnId } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  verificarAccesoMutacion,
  verificarAccesoLectura,
  filtrarPorObrasPermitidas,
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
    // monday manda la fecha como "YYYY-MM-DD" (a veces con hora detras).
    // new Date("2026-08-05") la interpreta como medianoche UTC, y al formatearla
    // en un navegador al oeste de Greenwich cae el dia anterior: en Chile se veia
    // el 04-08. Se ancla al mediodia UTC, que cae en el mismo dia calendario para
    // cualquier huso entre UTC-11 y UTC+11.
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
    } else if (cv.display_value) {
      // board_relation sin withRelations: el nombre del vinculado, como string.
      // Es lo que esperan los consumidores (`oc.proveedores` para mostrar,
      // `item.proveedores.split(",")` en la pantalla Usuarios).
      mapped[friendlyKey] = cv.display_value;
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
  const {
    columns = [],
    where = {},
    limit = 100,
    cursor = null,
    withRelations = false,
    orderBy = null,
    subBoardKey = null,
    subColumns = [],
  } = params;

  const columnIds = columns.map((key) => resolveColumnId(boardKey, key));
  const columnIdToFriendly = invertColumns(schema.columns);

  // Solo cuando el caller lo pide (fetchAllItemsWithRelations): trae los
  // linked_items de las columnas board_relation. Fragmento identico al que ya
  // usa fetchNextPageWithRelations en board-sdk.js, verificado contra el
  // esquema real de la API. No se agrega por defecto para no cambiar la forma
  // del dato de los demas consumidores (useOCData, usePaymentData, etc.).
  //
  // display_value va SIEMPRE, con o sin withRelations: es el nombre del/los item
  // vinculado(s) que monday ya calcula, y sin el las columnas board_relation
  // llegaban con text = null. Por eso el Portal mostraba "Sin proveedor" en cada
  // orden de compra, y la pantalla Usuarios se quedaba sin lista de proveedores
  // para dar de alta un subcontratista. La Vibe original lee
  // `oc.proveedores?.linkedItems?.[0]?.name`; esto da el mismo nombre sin tener
  // que pedir los linked_items completos en cada pantalla.
  // Las columnas espejo (mirror) tienen el mismo problema que las de vinculo:
  // `text` viene null y el dato real esta en display_value. Sin esto, CORREO REP
  // LEGAL y REP LEGAL del tablero de contratos llegaban vacios.
  const mirrorFragment = "... on MirrorValue { display_value }";
  const relFragment = withRelations
    ? `... on BoardRelationValue { display_value linked_items { id name board { id name } } } ${mirrorFragment}`
    : `... on BoardRelationValue { display_value } ${mirrorFragment}`;
  const cvFields = `column_values { id text value column { type } ${relFragment} }`;

  // Subelementos junto con los items, en la misma consulta. Lo necesita el
  // historial de precios del Generador de OC: cada linea de una orden vive como
  // subelemento, y pedirlos orden por orden serian 150 consultas encadenadas.
  let subFields = "";
  let subIdToFriendly = {};
  if (subBoardKey) {
    const subSchema = getBoardSchema(subBoardKey);
    subIdToFriendly = invertColumns(subSchema.columns);
    const subIds = subColumns.map((key) => resolveColumnId(subBoardKey, key));
    const subCv = subIds.length
      ? `column_values(ids: ${JSON.stringify(subIds)}) { id text value column { type } }`
      : "";
    subFields = `subitems { id name created_at updated_at ${subCv} }`;
  }

  const mapear = (it) => {
    const item = mapItemColumns(it, columnIdToFriendly);
    if (subBoardKey) {
      item.subitems = (it.subitems ?? []).map((sub) => mapItemColumns(sub, subIdToFriendly));
    }
    return item;
  };

  // Filtro por nombre de item. ANTES solo se filtraba client-side sobre la
  // pagina ya traida: como el buscador de materiales pide limit:15, la busqueda
  // solo miraba los primeros 15 items del board - de 1008 materiales, 993 eran
  // inencontrables (y lo mismo en Ingreso de Materiales, que usa el mismo hook).
  // monday SI soporta el filtro server-side con column_id "name" + contains_text;
  // verificado en vivo: es substring exacto e insensible a mayusculas, la misma
  // semantica que el filtro de abajo, que se deja como red de seguridad y para
  // las paginas que llegan por next_items_page.
  const nameFilter = typeof where.name === "string" ? where.name.toLowerCase() : null;

  const rules = [];
  if (typeof where.name === "string" && where.name.trim()) {
    rules.push({ column_id: "name", compare_value: [where.name], operator: "contains_text" });
  }
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
      //
      // OJO CON EL TIPO: el id va como NUMERO, no como string. Con el id entre
      // comillas monday no tira error, devuelve 0 resultados en silencio - y eso
      // dejaba TODO el Portal Proveedores en cero para cualquier subcontratista
      // (pagos, contratos y estados de pago). Verificado en vivo contra la API,
      // con el proveedor de prueba y con uno real: string -> 0, numero -> los
      // que corresponden.
      const linkedId = Number(cond.linkedItemId);
      if (Number.isFinite(linkedId)) {
        rules.push({ column_id: columnId, compare_value: [linkedId], operator: "any_of" });
      }
    }
  }

  let data;
  if (cursor) {
    data = await mondayFetch(
      `query ($cursor: String!, $limit: Int!) {
        next_items_page(cursor: $cursor, limit: $limit) {
          cursor
          items { id name created_at updated_at group { id title } ${cvFields} ${subFields} }
        }
      }`,
      { cursor, limit }
    );
    const page = data.next_items_page;
    let items = page.items.map(mapear);
    if (nameFilter) items = items.filter((it) => it.name?.toLowerCase().includes(nameFilter));
    return { items, cursor: page.cursor };
  }

  // Orden del tablero. monday no ordena por defecto: devuelve los items en el
  // orden en que estan en el board, que no es el de creacion. El historial de
  // Ordenes de Compra necesita la mas nueva primero, y con paginacion no
  // alcanza con ordenar la pagina ya traida.
  //
  // "createdAt" se traduce a la columna virtual __creation_log__, que es como
  // monday expone la fecha de creacion en query_params (verificado en vivo).
  let orderByRule = null;
  if (orderBy?.column) {
    const columnaOrden =
      orderBy.column === "createdAt" ? "__creation_log__" : resolveColumnId(boardKey, orderBy.column);
    orderByRule = [{ column_id: columnaOrden, direction: orderBy.direction === "asc" ? "asc" : "desc" }];
  }

  const queryParams =
    rules.length || orderByRule
      ? { ...(rules.length ? { rules } : {}), ...(orderByRule ? { order_by: orderByRule } : {}) }
      : undefined;
  data = await mondayFetch(
    `query ($boardId: ID!, $limit: Int!, $queryParams: ItemsQuery) {
      boards(ids: [$boardId]) {
        items_page(limit: $limit, query_params: $queryParams) {
          cursor
          items { id name created_at updated_at group { id title } ${cvFields} ${subFields} }
        }
      }
    }`,
    { boardId, limit, queryParams }
  );
  const page = data.boards?.[0]?.items_page;
  if (!page) return { items: [], cursor: null };
  let items = page.items.map(mapear);
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
 * Hay tipos de columna que change_simple_column_value directamente no sabe
 * escribir: hay que mandarlos como JSON por change_multiple_column_values.
 * Antes esto no hacia falta porque ninguna pantalla escribia esas columnas.
 * El Generador de OC si: la orden lleva Responsable y APROBADOR (people) y
 * VALIDEZ DOCUMENTO (timeline). Sin esto, String({from,to}) mandaba
 * "[object Object]" y la columna quedaba vacia sin ningun error visible.
 *
 * Se reconocen por la FORMA del valor, que es la misma que usaba el SDK de
 * monday Vibe, para que el codigo migrado no tenga que cambiar:
 *   people   -> [{ id, kind: "person" }]
 *   timeline -> { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
 *   phone    -> { phone, country }
 *   email    -> { email, text }
 */
function esPersonas(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => v && typeof v === "object" && !Array.isArray(v) && v.id != null)
  );
}

function esObjetoPlano(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function esRango(value) {
  return esObjetoPlano(value) && ("from" in value || "to" in value);
}

function esTelefono(value) {
  return esObjetoPlano(value) && "phone" in value;
}

function esEmail(value) {
  return esObjetoPlano(value) && "email" in value;
}

/** Devuelve el JSON que espera change_multiple_column_values, o null si no aplica. */
function valorComplejo(value) {
  if (esPersonas(value)) {
    return {
      personsAndTeams: value.map((p) => ({ id: Number(p.id), kind: p.kind ?? "person" })),
    };
  }
  if (esRango(value)) {
    const desde = normalizarFecha(value.from);
    const hasta = normalizarFecha(value.to);
    return desde || hasta ? { from: desde || hasta, to: hasta || desde } : {};
  }
  if (esTelefono(value)) {
    // Solo digitos. La columna telefono de monday rechaza el "+" y los espacios
    // con "invalid value, please check our API documentation" - y el propio
    // formulario sugiere "+56 9 1234 5678" en su placeholder, o sea que guiaba
    // al usuario justo al formato que falla. Verificado contra la API:
    // "+56 9 0000 0000" rechaza, "56900000000" y "900000000" pasan.
    // El pais viaja aparte, en countryShortName.
    const soloDigitos = String(value.phone ?? "").replace(/\D/g, "");
    return { phone: soloDigitos, countryShortName: value.country ?? "CL" };
  }
  if (esEmail(value)) {
    return { email: String(value.email ?? ""), text: value.text ?? String(value.email ?? "") };
  }
  return null;
}

/** "2026-08-31T00:00:00.000Z" o Date -> "2026-08-31". */
function normalizarFecha(valor) {
  if (!valor) return "";
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
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
    // "name" no es una columna del tablero: es el titulo del item. monday lo
    // renombra con esta misma mutacion usando column_id "name", asi que no hay
    // que buscarlo en el schema. Buscarlo tiraba "columna no mapeada" y se
    // perdia el renombre entero: al editar una Orden de Compra el total
    // cambiaba pero la linea seguia con el precio viejo.
    const columnId = friendlyKey === "name" ? "name" : resolveColumnId(boardKey, friendlyKey);
    if (esRelacion(value)) {
      relaciones[columnId] = { item_ids: value.linkedItems.map((l) => Number(l.id)) };
      continue;
    }
    const complejo = valorComplejo(value);
    if (complejo) {
      relaciones[columnId] = complejo;
      continue;
    }
    simples.push([columnId, serializarValorColumna(value)]);
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
  // Mismo problema que en handleUsersList: `photo_url` NO existe en el tipo User
  // de monday y pedirlo hace fallar la query entera ("Cannot query field
  // photo_url on type User"). Verificado en vivo. Nadie llamaba a esta operacion
  // todavia, asi que no habia sintoma; el Generador de OC si la necesita.
  //
  // `title` es el cargo del perfil de monday: es lo que se imprime debajo de la
  // firma en la Orden de Compra, y lo que decide si alguien es Gerente General.
  const data = await mondayFetch(
    `{ me { id name email title phone mobile_phone photo_original photo_thumb } }`,
  );
  const me = data.me;
  if (!me) return null;
  const original = me.photo_original || me.photo_thumb || null;
  return {
    ...me,
    photo_url: original ? { original, thumb: me.photo_thumb ?? null } : null,
  };
}

/**
 * Un item puntual por id, con sus columnas y -si se pide- sus subelementos.
 *
 * Hasta ahora todo se leia con handleItems(), que trae una pagina del tablero:
 * para "dame ESTA orden de compra" eso significa pedir hasta 500 items y
 * descartar 499. Con el id, monday responde solo ese.
 */
async function handleItemById(boardKey, schema, params) {
  const { itemId, columns = [], subBoardKey = null, subColumns = [] } = params;
  if (!itemId) throw new Error("Falta 'itemId'");
  getBoardIdOrThrow(schema, boardKey);

  const columnIds = columns.map((key) => resolveColumnId(boardKey, key));
  const columnIdToFriendly = invertColumns(schema.columns);
  const cvFields = columnIds.length
    ? `column_values(ids: ${JSON.stringify(columnIds)}) {
         id text value column { type }
         ... on BoardRelationValue { display_value linked_items { id name board { id name } } }
         ... on MirrorValue { display_value }
       }`
    : "";

  let subFields = "";
  let subIdToFriendly = {};
  if (subBoardKey) {
    const subSchema = getBoardSchema(subBoardKey);
    subIdToFriendly = invertColumns(subSchema.columns);
    const subIds = subColumns.map((key) => resolveColumnId(subBoardKey, key));
    const subCv = subIds.length
      ? `column_values(ids: ${JSON.stringify(subIds)}) { id text value column { type } }`
      : "";
    subFields = `subitems { id name created_at updated_at ${subCv} }`;
  }

  const data = await mondayFetch(
    `query ($itemId: [ID!]) {
      items(ids: $itemId) { id name created_at updated_at group { id title } ${cvFields} ${subFields} }
    }`,
    { itemId: [String(itemId)] },
  );

  const crudo = data.items?.[0];
  if (!crudo) return null;

  const item = mapItemColumns(crudo, columnIdToFriendly);
  if (subBoardKey) {
    item.subitems = (crudo.subitems ?? []).map((sub) => mapItemColumns(sub, subIdToFriendly));
  }
  return item;
}

/**
 * Los subelementos de un item. Cada linea de una Orden de Compra vive como
 * subelemento: es asi como el tablero del cliente guarda el detalle, y es la
 * fuente del historial de precios.
 *
 * Las columnas del subelemento NO son las del tablero padre - viven en el
 * tablero de subelementos - por eso el caller manda `subBoardKey`.
 */
async function handleSubitems(params) {
  const { itemId, subBoardKey, columns = [] } = params;
  if (!itemId || !subBoardKey) throw new Error("Faltan 'itemId' o 'subBoardKey'");

  const subSchema = getBoardSchema(subBoardKey);
  const columnIds = columns.map((key) => resolveColumnId(subBoardKey, key));
  const columnIdToFriendly = invertColumns(subSchema.columns);

  const cvFields = columnIds.length
    ? `column_values(ids: ${JSON.stringify(columnIds)}) { id text value column { type } }`
    : "";

  const data = await mondayFetch(
    `query ($itemId: [ID!]) {
      items(ids: $itemId) {
        subitems { id name created_at updated_at ${cvFields} }
      }
    }`,
    { itemId: [String(itemId)] },
  );

  const subitems = data.items?.[0]?.subitems ?? [];
  return { subitems: subitems.map((it) => mapItemColumns(it, columnIdToFriendly)) };
}

/**
 * Crea un subelemento. No se puede hacer con create_item: monday tiene una
 * mutacion aparte, y el board_id del subelemento es el del tablero de
 * subelementos, no el del padre - de ahi que los valores se resuelvan contra
 * `subBoardKey`.
 */
async function handleSubitemCreate(params) {
  const { parentItemId, subBoardKey, name, values = {} } = params;
  if (!parentItemId || !subBoardKey) throw new Error("Faltan 'parentItemId' o 'subBoardKey'");

  const data = await mondayFetch(
    `mutation ($parentId: ID!, $name: String!) {
      create_subitem(parent_item_id: $parentId, item_name: $name) { id name board { id } }
    }`,
    { parentId: String(parentItemId), name: String(name ?? "") },
  );
  const creado = data.create_subitem;

  if (Object.keys(values).length) {
    const subSchema = getBoardSchema(subBoardKey);
    await handleItemUpdate(subBoardKey, subSchema, { itemId: creado.id, values });
  }

  return { id: creado.id, name: creado.name };
}

/**
 * Notificacion dentro de monday. La usa el Generador de OC para avisarle al
 * aprobador que le quedo una orden esperando: en la Vibe original el aprobador
 * se enteraba asi, y sin esto la orden quedaria pendiente sin que nadie lo sepa.
 * Nunca bloquea la operacion que la dispara.
 */
async function handleNotify(boardKey, schema, params) {
  const { userId, itemId, text } = params;
  if (!userId || !itemId || !text) throw new Error("Faltan 'userId', 'itemId' o 'text'");
  getBoardIdOrThrow(schema, boardKey);

  const data = await mondayFetch(
    `mutation ($userId: ID!, $itemId: ID!, $text: String!) {
      create_notification(user_id: $userId, target_id: $itemId, text: $text, target_type: Project) { id }
    }`,
    { userId: String(userId), itemId: String(itemId), text: String(text) },
  );
  return data.create_notification;
}

async function handleItemNote(params) {
  const { itemId, body } = params;
  if (!itemId || !body) throw new Error("Faltan 'itemId' o 'body'");
  const data = await mondayFetch(
    `mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id } }`,
    { itemId: String(itemId), body: String(body) },
  );
  return data.create_update;
}

async function handleUsersList(params) {
  const { limit = 200 } = params;
  // OJO: el tipo User de la API de monday NO tiene `photo_url`. Pedirlo hacia
  // fallar la query ENTERA ("Cannot query field photo_url on type User"), asi
  // que la lista llegaba vacia: la pantalla Usuarios del Portal mostraba
  // "No se encontro usuario" y no se podia dar de alta a nadie - que es como
  // entra un proveedor al Portal. Los campos reales son photo_original y
  // photo_thumb.
  //
  // Se devuelve photo_url como objeto { original, thumb } para conservar la
  // forma que espera la UI, que es la que da el SDK de monday Vibe
  // (`user.photo_url.original`); photo_thumb suelto queda como fallback.
  //
  // `title` es el cargo del perfil de monday. Lo necesita el Generador de OC:
  // se imprime debajo de la firma en la Orden de Compra y es lo que distingue
  // al Gerente General, que puede aprobar cualquier orden.
  const data = await mondayFetch(
    `query ($limit: Int!) {
      users(limit: $limit) { id name email title phone mobile_phone enabled photo_original photo_thumb }
    }`,
    { limit },
  );
  return (data.users ?? []).map((u) => {
    const original = u.photo_original || u.photo_thumb || null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      title: u.title ?? null,
      phone: u.phone ?? null,
      mobile_phone: u.mobile_phone ?? null,
      enabled: u.enabled ?? true,
      photo_url: original ? { original, thumb: u.photo_thumb ?? null } : null,
      photo_thumb: u.photo_thumb ?? null,
    };
  });
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

    if (op === "items") {
      // Antes que nada: hay tableros que directamente no se pueden leer segun
      // quien pide (los del Portal, para un subcontratista). Va antes de
      // handleItems para no traer de monday algo que no se va a entregar.
      if (AUTH_LAYERS_ENABLED) {
        try {
          verificarAccesoLectura(sesion, boardKey);
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }

      const resultado = await handleItems(boardKey, schema, params);
      // La restriccion por obra se aplica ACA y no en la pantalla: antes el
      // navegador se bajaba la pagina completa y escondia lo ajeno, asi que los
      // datos de las otras obras llegaban igual. Ver filtrarPorObrasPermitidas.
      if (AUTH_LAYERS_ENABLED) {
        resultado.items = filtrarPorObrasPermitidas(sesion, boardKey, resultado.items);
      }
      return Response.json({ result: resultado });
    }

    if (op === "columnOptions")
      return Response.json({ result: await handleColumnOptions(boardKey, schema, params) });

    if (op === "itemUpdate" || op === "itemCreate") {
      if (AUTH_LAYERS_ENABLED) {
        try {
          await verificarAccesoMutacion(sesion, boardKey, {
            op,
            values: params.values,
            itemId: params.itemId,
          });
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }
      if (op === "itemUpdate") return Response.json({ result: await handleItemUpdate(boardKey, schema, params) });
      return Response.json({ result: await handleItemCreate(boardKey, schema, params) });
    }

    // Nota (update) sobre un item. Se usa para dejar el motivo cuando alguien
    // marca un contrato CON OBS: queda en el item, donde el equipo lo busca, sin
    // agregarle columnas al tablero del cliente. Pasa por el mismo guardia que
    // itemUpdate porque escribe en el board del cliente igual.
    if (op === "itemNote") {
      if (AUTH_LAYERS_ENABLED) {
        try {
          await verificarAccesoMutacion(sesion, boardKey, {
            op: "itemUpdate",
            values: params.values ?? {},
            itemId: params.itemId,
          });
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }
      return Response.json({ result: await handleItemNote(params) });
    }

    // "item" y "subitems" son lecturas igual que "items", solo que de a uno:
    // sin el mismo guardia, cerrar "items" no serviria de nada (se piden los
    // ids de a uno y listo).
    if (op === "item" || op === "subitems") {
      if (AUTH_LAYERS_ENABLED) {
        try {
          verificarAccesoLectura(sesion, op === "subitems" ? params.subBoardKey : boardKey);
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }
      if (op === "item") return Response.json({ result: await handleItemById(boardKey, schema, params) });
      return Response.json({ result: await handleSubitems(params) });
    }

    if (op === "subitemCreate") {
      if (AUTH_LAYERS_ENABLED) {
        try {
          await verificarAccesoMutacion(sesion, boardKey, {
            op: "itemCreate",
            values: params.values,
            itemId: params.parentItemId,
          });
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }
      return Response.json({ result: await handleSubitemCreate(params) });
    }

    if (op === "notify") {
      if (AUTH_LAYERS_ENABLED) {
        try {
          await verificarAccesoMutacion(sesion, boardKey, {
            op: "notify",
            values: {},
            itemId: params.itemId,
          });
        } catch (err) {
          if (err instanceof BoardAccessError) return accesoBoardErrorToResponse(err);
          throw err;
        }
      }
      return Response.json({ result: await handleNotify(boardKey, schema, params) });
    }

    if (op === "usersList") return Response.json({ result: await handleUsersList(params) });

    return Response.json({ error: `Operacion desconocida: "${op}"` }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
