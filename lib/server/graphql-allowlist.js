import "server-only";

/**
 * Lista blanca de operaciones para /api/monday/graphql.
 *
 * Ese endpoint es un proxy: recibe una query GraphQL del navegador y la reenvia
 * a monday.com firmada con MONDAY_API_TOKEN, que es el token de la cuenta
 * entera. Sin este filtro, cualquier sesion valida podia mandar por ahi
 * CUALQUIER operacion - delete_item, change_multiple_column_values sobre
 * cualquier tablero, delete_column, invitar o desactivar usuarios - o leer
 * tableros que su rol no ve en pantalla. Es decir: el token de monday quedaba
 * de hecho en manos de cualquiera que supiera abrir la consola del navegador.
 * El unico control que habia era `query.includes("move_item_to_group")`, que no
 * mira nada mas.
 *
 * La superficie real que la app usa es minima (inventario completo del codigo,
 * 01-sep-2026): DOS operaciones, y ninguna otra.
 *
 *   1. next_items_page  (lectura)  - paginado de fetchAllItemsWithRelations,
 *      lib/board-sdk.js:359. Solo se dispara de la pagina 2 en adelante, o sea
 *      cuando un tablero pasa los 500 items: hoy OC Tracker (Ordenes y
 *      Facturas), Vale Express -> Stock y el cartel de stock de Solicitud.
 *      OJO: esta llamada manda boardKey = null (board-sdk.js:375 no pasa el
 *      tercer argumento). Cualquier control que EXIJA boardKey rompe la
 *      paginacion de esas pantallas.
 *   2. move_item_to_group (escritura) - un solo boton, "No entregado" de
 *      Vale Express -> Solicitudes Pendientes
 *      (app/vale-express/vales-pendientes/page.jsx:251).
 *
 * Todo el resto de las operaciones contra monday (crear, actualizar, notas,
 * subir archivos, opciones de columna, usuarios) NO pasa por aca: vive
 * server-side en app/api/monday/board|upload|archivo/route.js con queries
 * fijas escritas en el servidor, via mondayFetch.
 *
 * El filtro es por CAMPO RAIZ, no por el texto completo de la query: asi
 * sobrevive a cambios legitimos (la lista de columnas del paginado cambia cada
 * vez que una pantalla pide otra columna) pero igual deja afuera cualquier otra
 * operacion. Si algun dia se agrega una operacion nueva al cliente, hay que
 * sumarla aca o el endpoint la va a rechazar con 403.
 *
 * Las directivas (@include, @skip) tampoco pasan: la app no usa ninguna, y
 * ante algo que este parser no contempla la respuesta es rechazar.
 */

/** Campos raiz permitidos, por tipo de operacion. */
const LECTURAS_PERMITIDAS = new Set(["next_items_page"]);
const ESCRITURAS_PERMITIDAS = new Set(["move_item_to_group"]);

/**
 * El unico grupo al que la app mueve un vale: "VALES RECHAZADOS" del tablero de
 * Vales (constante en vales-pendientes/page.jsx). Se valida, no se reescribe:
 * un rechazo explicito deja el intento a la vista, y un override silencioso
 * podria mover un item a un grupo que no era el que la pantalla queria.
 */
const GRUPO_VALES_RECHAZADOS = "group_mm1bk3ac";

export class GraphQLNoPermitidoError extends Error {
  constructor(message = "Operacion GraphQL no permitida.") {
    super(message);
    this.code = "GRAPHQL_NO_PERMITIDO";
    this.status = 403;
  }
}

const ES_LETRA_IDENT = (c) => /[A-Za-z0-9_]/.test(c);

/**
 * Tipo de operacion y campos raiz de un documento GraphQL.
 *
 * No es un parser completo de GraphQL y no pretende serlo: solo tiene que
 * decidir si lo que llega esta en la lista blanca. Por eso ante cualquier cosa
 * que no entienda devuelve null, y el llamador rechaza. Contempla los trucos
 * con los que se podria intentar esconder una operacion:
 *
 *   - comentarios (# hasta fin de linea)
 *   - strings, comunes y de bloque ("""), que pueden traer llaves adentro
 *   - alias (`x: delete_item(...)`) - el campo real es el de la derecha
 *   - nombres de argumento dentro de (...), que no son campos
 *   - fragmentos y documentos con mas de una operacion
 */
function analizarDocumento(query) {
  const campos = [];
  let profLlaves = 0;
  let profParen = 0;
  let tipoOperacion = null;
  let vioSelectionSet = false;
  let terminoOperacion = false;
  let ident = "";

  const cerrarIdent = (siguienteSignificativo) => {
    if (!ident) return;
    const nombre = ident;
    ident = "";
    // Un identificador seguido de ":" es un alias; el campo real viene despues.
    if (siguienteSignificativo === ":") return;
    if (profLlaves === 1 && profParen === 0 && vioSelectionSet) campos.push(nombre);
    if (!vioSelectionSet && tipoOperacion === null) {
      if (nombre === "query" || nombre === "mutation" || nombre === "subscription") {
        tipoOperacion = nombre;
      } else if (nombre === "fragment") {
        // La app no usa fragmentos con nombre. Rechazar en vez de intentar
        // seguirlos: un fragmento puede esconder campos del tipo raiz.
        tipoOperacion = "fragment";
      }
    }
  };

  for (let i = 0; i < query.length; i++) {
    const c = query[i];

    // Comentario: hasta el fin de linea.
    if (c === "#" && !ident) {
      while (i < query.length && query[i] !== "\n") i++;
      continue;
    }

    // Strings de bloque y comunes: se saltean enteros (pueden traer { } ").
    if (c === '"') {
      cerrarIdent(null);
      if (query.startsWith('"""', i)) {
        const fin = query.indexOf('"""', i + 3);
        if (fin === -1) return null;
        i = fin + 2;
      } else {
        i++;
        while (i < query.length && query[i] !== '"') {
          if (query[i] === "\\") i++;
          i++;
        }
        if (i >= query.length) return null;
      }
      continue;
    }

    if (ES_LETRA_IDENT(c)) {
      ident += c;
      continue;
    }

    // Cierra el identificador que veniamos leyendo, mirando el proximo caracter
    // significativo para distinguir un alias de un campo.
    if (ident) {
      let j = i;
      while (j < query.length && /\s/.test(query[j])) j++;
      cerrarIdent(query[j] ?? null);
    }

    if (c === "(") profParen++;
    else if (c === ")") profParen--;
    else if (c === "{") {
      profLlaves++;
      if (profLlaves === 1) {
        vioSelectionSet = true;
        // Shorthand: `{ ... }` sin la palabra query adelante.
        if (tipoOperacion === null) tipoOperacion = "query";
      }
    } else if (c === "}") {
      profLlaves--;
      if (profLlaves === 0) terminoOperacion = true;
      if (profLlaves < 0) return null;
    } else if (c === "." && query.startsWith("...", i)) {
      // Un spread en la raiz podria traer campos por fragmento. Adentro
      // (`... on BoardRelationValue`) es legitimo y no se toca.
      if (profLlaves === 1) return null;
      i += 2;
    } else if (!/\s|[,:$!\[\]=@]/.test(c)) {
      // Cualquier caracter que este parser no contempla: no arriesgar.
      return null;
    }

    // Contenido despues de que la operacion cerro = segundo documento
    // (otra operacion o un fragmento). Se rechaza entero.
    if (terminoOperacion && profLlaves === 0 && !/\s/.test(c) && c !== "}") return null;
  }
  cerrarIdent(null);

  if (!vioSelectionSet || profLlaves !== 0 || profParen !== 0) return null;
  if (tipoOperacion === "fragment" || tipoOperacion === "subscription") return null;
  if (campos.length === 0) return null;

  return { tipoOperacion, campos };
}

/**
 * Valida la query que llega a /api/monday/graphql. Lanza GraphQLNoPermitidoError
 * si no esta en la lista blanca. Devuelve el analisis para que el llamador
 * aplique los controles de rol que correspondan.
 */
export function verificarQueryPermitida(query, { boardKey, variables } = {}) {
  const analisis = analizarDocumento(String(query ?? ""));
  if (!analisis) {
    throw new GraphQLNoPermitidoError("No se pudo interpretar la consulta enviada.");
  }

  const { tipoOperacion, campos } = analisis;
  const permitidas = tipoOperacion === "mutation" ? ESCRITURAS_PERMITIDAS : LECTURAS_PERMITIDAS;
  const noPermitidos = campos.filter((c) => !permitidas.has(c));
  if (noPermitidos.length > 0) {
    throw new GraphQLNoPermitidoError(
      `Operacion GraphQL no permitida: ${noPermitidos.join(", ")}.`,
    );
  }

  if (campos.includes("move_item_to_group")) {
    // El chequeo de rol de verificarAccesoMoveGroup solo aplica si boardKey es
    // "ValesBoard", y boardKey lo manda el cliente: sin exigirlo aca, mandar
    // cualquier otro valor saltaba el control de rol por completo.
    if (boardKey !== "ValesBoard") {
      throw new GraphQLNoPermitidoError("Mover un item de grupo solo esta permitido sobre Vales.");
    }
    const grupo = variables?.groupId;
    if (grupo !== GRUPO_VALES_RECHAZADOS) {
      throw new GraphQLNoPermitidoError("Solo se puede mover un vale al grupo de rechazados.");
    }
  }

  return analisis;
}

export function graphqlNoPermitidoToResponse(err) {
  if (!(err instanceof GraphQLNoPermitidoError)) throw err;
  return Response.json({ errors: [{ message: err.message }], code: err.code }, { status: err.status });
}
