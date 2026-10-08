import "server-only";

import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { esDelEquipo } from "@/lib/server/equipo-vdv";
import {
  ACCIONES,
  desfaseConElHistorial,
  RECEPCION_CONFIRMADA,
  RECEPCION_PENDIENTE,
  REQUIEREN_CONFIRMACION,
  accionesDisponibles,
  cambiosEnElMaestro,
} from "@/lib/herramientas/dominio";

const MAESTRO = "ControlHerramientasBoard";
const MOVIMIENTOS = "ControlHerramientasMovimientosBoard";

export class MovimientoError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

function idDeBoard(boardKey) {
  return getBoardIdOrThrow(getBoardSchema(boardKey), boardKey);
}

/**
 * Las columnas tal como las espera `column_values` de monday, por tipo.
 *
 * Se arma a mano y no se reusa el serializador de /api/monday/board porque ahi
 * vive adentro de esa ruta y mezcla dos caminos (simple y multiple). Aca se
 * escriben cuatro tipos y nada mas: texto, estado, fecha y vinculo.
 */
function valorDeColumna(boardKey, clave, valor) {
  const tipo = TIPOS[boardKey]?.[clave] ?? "text";
  if (valor === null || valor === undefined || valor === "") {
    // Vaciar una celda: el status y la fecha quieren {} y el texto "".
    return tipo === "text" ? "" : {};
  }
  if (tipo === "status") return { label: String(valor) };
  if (tipo === "date") return { date: String(valor).slice(0, 10) };
  if (tipo === "relation") return { item_ids: valor.map(Number) };
  return String(valor);
}

/**
 * De que tipo es cada columna que esto escribe. Hay que decirlo porque el
 * schema guarda el id, no el tipo, y monday rechaza un string donde espera un
 * objeto - sin error visible en algunos casos, que es lo peor.
 */
const TIPOS = {
  [MAESTRO]: {
    estadoOperativo: "status",
    tipoUbicacion: "status",
    ubicacionActual: "status",
    condicionFisica: "status",
    custodioActual: "text",
    fechaUltimaSalida: "date",
    fechaUltimaDevolucion: "date",
  },
  [MOVIMIENTOS]: {
    tipoMovimiento: "status",
    obra: "status",
    estadoAlSalir: "status",
    estadoAlRecibir: "status",
    recepcion: "status",
    fechaMovimiento: "date",
    fechaConfirmacion: "date",
    idMaestro: "text",
    codigo: "text",
    herramienta: "text",
    categoria: "text",
    origen: "text",
    destino: "text",
    entrega: "text",
    recibeCustodio: "text",
    confirmadaPor: "text",
    observaciones: "text",
  },
};

function columnValues(boardKey, valores) {
  const salida = {};
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === undefined) continue;
    salida[resolveColumnId(boardKey, clave)] = valorDeColumna(boardKey, clave, valor);
  }
  return JSON.stringify(salida);
}

/** La herramienta, con lo que hace falta para decidir y para copiar al movimiento. */
export async function leerHerramienta(itemId) {
  const claves = ["codigo", "categoria", "ubicacionActual", "custodioActual", "estadoOperativo"];
  const ids = claves.map((c) => resolveColumnId(MAESTRO, c));
  const datos = await mondayFetch(
    `query ($itemId: [ID!], $ids: [String!]) {
      items(ids: $itemId) { id name column_values(ids: $ids) { id text } }
    }`,
    { itemId: [String(itemId)], ids },
  );
  const item = datos.items?.[0];
  if (!item) throw new MovimientoError("No se encontró esa herramienta.", 404);

  const porId = Object.fromEntries((item.column_values ?? []).map((c) => [c.id, c.text]));
  const fila = { id: String(item.id), name: item.name };
  for (const clave of claves) fila[clave] = porId[resolveColumnId(MAESTRO, clave)] ?? null;
  return fila;
}

/**
 * Registra un movimiento y deja la herramienta como corresponde.
 *
 * El orden importa y es el mismo que usa la app del cliente: primero se crea el
 * MOVIMIENTO y despues se actualiza el MAESTRO. Si fallara al reves tendriamos
 * una herramienta que dice estar en una obra sin ningun movimiento que lo
 * explique, que es justamente lo que el historial tiene que evitar. Si falla la
 * segunda parte se devuelve `maestroOk: false` y el movimiento queda igual: la
 * foto de lo que paso no se pierde.
 */
export async function registrarMovimiento({ itemId, accion, datos, quien }) {
  const config = ACCIONES[accion];
  if (!config) throw new MovimientoError(`No existe la acción "${accion}".`);

  const herramienta = await leerHerramienta(itemId);

  // La guarda de integridad: no se saca algo que ya esta afuera, ni se devuelve
  // algo que esta en el taller. Se vuelve a mirar ACA y no solo en la pantalla,
  // porque entre que alguien abrio la ficha y apreto el boton otro pudo haber
  // movido la misma herramienta - el cliente confirmo que dos personas
  // registran al mismo tiempo.
  if (!accionesDisponibles(herramienta.estadoOperativo).includes(accion)) {
    throw new MovimientoError(
      `No se puede ${config.titulo.toLowerCase()}: la herramienta figura como "${herramienta.estadoOperativo ?? "sin estado"}". ` +
        "Puede que alguien la haya movido recién; recargá la ficha.",
      409,
    );
  }

  if (config.pideDestino && !datos.destino) {
    throw new MovimientoError("Falta decir a qué obra o bodega va.");
  }
  if (config.pideCondicion && !datos.condicion) {
    throw new MovimientoError("Falta decir en qué estado está la herramienta.");
  }

  /**
   * El custodio tiene que ser alguien del equipo.
   *
   * Se verifica ACA y no solo en el desplegable: por la API se manda cualquier
   * texto, y un custodio inventado deja una herramienta a cargo de alguien que
   * no existe, que es justo lo que este registro viene a evitar.
   *
   * Si el directorio no contesta se deja pasar: frenar un movimiento real
   * porque monday esta caido es peor que aceptar un nombre sin verificar.
   */
  if (config.pideCustodio && datos.custodio) {
    const esDelEquipoVdv = await esDelEquipo(datos.custodio);
    if (esDelEquipoVdv === false) {
      throw new MovimientoError(
        `"${datos.custodio}" no figura en Equipo VDV. El custodio tiene que ser alguien del equipo; ` +
          "si falta, hay que darlo de alta en el directorio primero.",
      );
    }
  }

  const tipo = config.tipoMovimiento;
  const esperaConfirmacion = REQUIEREN_CONFIRMACION.has(tipo);
  const destino = config.pideDestino ? datos.destino : herramienta.ubicacionActual;

  const valoresMovimiento = {
    idMaestro: String(itemId),
    codigo: herramienta.codigo,
    herramienta: herramienta.name,
    categoria: herramienta.categoria,
    tipoMovimiento: tipo,
    fechaMovimiento: new Date().toISOString().slice(0, 10),
    obra: destino,
    origen: herramienta.ubicacionActual,
    destino,
    // Quien entrega es quien tenia la herramienta hasta ahora.
    entrega: herramienta.custodioActual,
    recibeCustodio: config.pideCustodio ? datos.custodio : undefined,
    // La misma condicion se guarda en una columna o en otra segun si la
    // herramienta esta saliendo o llegando: asi lo tiene armado el tablero.
    estadoAlSalir: accion === "salida" ? datos.condicion : undefined,
    estadoAlRecibir:
      accion === "salida" || !config.pideCondicion ? undefined : datos.condicion,
    observaciones: datos.observaciones || undefined,
    recepcion: esperaConfirmacion ? RECEPCION_PENDIENTE : undefined,
  };

  const creado = await mondayFetch(
    `mutation ($boardId: ID!, $name: String!, $values: JSON!) {
      create_item(board_id: $boardId, item_name: $name, column_values: $values, create_labels_if_missing: false) { id }
    }`,
    {
      boardId: idDeBoard(MOVIMIENTOS),
      name: `${config.titulo}: ${herramienta.name}`,
      values: columnValues(MOVIMIENTOS, valoresMovimiento),
    },
  );
  const movimientoId = creado.create_item?.id;

  console.log(
    "[herramientas]",
    JSON.stringify({
      evento: "movimiento",
      accion,
      itemId: String(itemId),
      movimientoId,
      de: herramienta.ubicacionActual,
      a: destino,
      quien: quien?.email ?? null,
    }),
  );

  const patch = cambiosEnElMaestro(accion, datos);
  const sincronizado = await actualizarMaestro(itemId, patch);

  if (!sincronizado.ok) {
    // La herramienta quedo diciendo donde estaba antes aunque el movimiento ya
    // esta escrito. Se deja constancia en los dos lados donde alguien la puede
    // encontrar despues: el log del servidor y una nota en el item de monday.
    await dejarConstancia(itemId, { accion, movimientoId, motivo: sincronizado.motivo });
  }

  return { ok: true, movimientoId, maestroOk: sincronizado.ok, esperaConfirmacion };
}

/**
 * Cuantas veces se reintenta actualizar la herramienta, y cuanto se espera.
 *
 * Casi todos los fallos contra monday duran menos de un segundo -un 500
 * pasajero, la conexion que se corta-, asi que tres intentos espaciados
 * resuelven la enorme mayoria sin que quien registro el movimiento se entere de
 * nada. Lo que NO se reintenta nunca es la creacion del movimiento: eso
 * duplicaria el historial.
 */
const INTENTOS = 3;
const ESPERA_MS = 900;

async function actualizarMaestro(itemId, patch) {
  let ultimoError = null;
  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    try {
      await mondayFetch(
        `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id }
        }`,
        { boardId: idDeBoard(MAESTRO), itemId: String(itemId), values: columnValues(MAESTRO, patch) },
      );
      if (intento > 1) {
        console.log(
          "[herramientas]",
          JSON.stringify({ evento: "maestro-al-segundo-intento", itemId: String(itemId), intento }),
        );
      }
      return { ok: true };
    } catch (error) {
      ultimoError = error;
      if (intento < INTENTOS) await new Promise((r) => setTimeout(r, ESPERA_MS * intento));
    }
  }
  return { ok: false, motivo: ultimoError?.message ?? "sin detalle" };
}

/**
 * Deja escrito que una herramienta quedo desfasada de su historial.
 *
 * Va a monday y no solo al log por una razon de negocio: los logs de Vercel se
 * borran al dia siguiente y solo los miramos nosotros. Una nota en el item la ve
 * cualquiera que abra la herramienta, y le llega a quien la sigue. Si la nota
 * tampoco se puede escribir -monday sigue caido- al menos queda el log.
 */
async function dejarConstancia(itemId, { accion, movimientoId, motivo }) {
  console.error(
    "[herramientas]",
    JSON.stringify({
      evento: "maestro-desincronizado",
      itemId: String(itemId),
      movimientoId: movimientoId ?? null,
      accion,
      motivo,
    }),
  );

  const texto =
    `⚠️ El movimiento "${accion}" quedó registrado en el historial pero esta ficha no se pudo actualizar ` +
    `(${motivo}). La herramienta figura donde estaba antes. Abrí la ficha en VDV Suite y usá "Poner al día".`;
  try {
    await mondayFetch(
      `mutation ($itemId: ID!, $texto: String!) { create_update(item_id: $itemId, body: $texto) { id } }`,
      { itemId: String(itemId), texto },
    );
  } catch (error) {
    console.error("[herramientas] Tampoco se pudo dejar la nota en monday:", error?.message);
  }
}

/** Un movimiento, con lo que hace falta para decidir si se puede confirmar. */
export async function leerMovimiento(movimientoId) {
  const claves = ["idMaestro", "herramienta", "tipoMovimiento", "destino", "recepcion", "obra"];
  const ids = claves.map((c) => resolveColumnId(MOVIMIENTOS, c));
  const datos = await mondayFetch(
    `query ($itemId: [ID!], $ids: [String!]) {
      items(ids: $itemId) { id name column_values(ids: $ids) { id text } }
    }`,
    { itemId: [String(movimientoId)], ids },
  );
  const item = datos.items?.[0];
  if (!item) throw new MovimientoError("No se encontró ese movimiento.", 404);

  const porId = Object.fromEntries((item.column_values ?? []).map((c) => [c.id, c.text]));
  const fila = { id: String(item.id), name: item.name };
  for (const clave of claves) fila[clave] = porId[resolveColumnId(MOVIMIENTOS, clave)] ?? null;
  return fila;
}

/**
 * El que recibe confirma que la herramienta llego.
 *
 * Es el pedido del cliente del 07-oct: hasta ahora el que entregaba registraba
 * el movimiento y nadie del otro lado decia nada, asi que una herramienta podia
 * figurar en una obra sin que en esa obra la hubieran visto.
 */
export async function confirmarRecepcion({ movimientoId, quien }) {
  const movimiento = await leerMovimiento(movimientoId);

  if (movimiento.recepcion === RECEPCION_CONFIRMADA) {
    throw new MovimientoError("Ese movimiento ya estaba confirmado.", 409);
  }
  if (movimiento.recepcion !== RECEPCION_PENDIENTE) {
    throw new MovimientoError("Ese movimiento no espera confirmación.");
  }

  const nombre = quien?.nombre || quien?.email || "";
  await mondayFetch(
    `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id }
    }`,
    {
      boardId: idDeBoard(MOVIMIENTOS),
      itemId: String(movimientoId),
      values: columnValues(MOVIMIENTOS, {
        recepcion: RECEPCION_CONFIRMADA,
        confirmadaPor: nombre,
        fechaConfirmacion: new Date().toISOString().slice(0, 10),
      }),
    },
  );

  console.log(
    "[herramientas]",
    JSON.stringify({ evento: "recepcion-confirmada", movimientoId: String(movimientoId), quien: quien?.email ?? null }),
  );

  return { ok: true };
}

/**
 * Vuelve a aplicar sobre la herramienta lo que dice su ultimo movimiento.
 *
 * Es la salida cuando la escritura del maestro fallo y el reintento tampoco
 * alcanzo. No recibe nada del navegador: lee el ultimo movimiento del tablero y
 * recalcula, asi que no se puede usar para mover una herramienta a dedo.
 */
export async function ponerAlDia({ itemId, quien }) {
  const herramienta = await leerHerramientaCompleta(itemId);
  const ultimo = await ultimoMovimientoDe(itemId);
  if (!ultimo) throw new MovimientoError("Esta herramienta no tiene movimientos para reaplicar.");

  const desfase = desfaseConElHistorial(herramienta, ultimo);
  if (!desfase) return { ok: true, yaEstaba: true };

  const resultado = await actualizarMaestro(itemId, desfase.esperado);
  if (!resultado.ok) {
    throw new MovimientoError(
      "monday sigue sin aceptar la actualización. Probá de nuevo en un rato; el movimiento no se pierde.",
      502,
    );
  }

  console.log(
    "[herramientas]",
    JSON.stringify({
      evento: "puesta-al-dia",
      itemId: String(itemId),
      movimientoId: ultimo.id,
      corregido: desfase.diferencias.map((d) => d.clave),
      quien: quien?.email ?? null,
    }),
  );
  return { ok: true, corregido: desfase.diferencias };
}

/** La herramienta con las columnas que el desfase compara. */
async function leerHerramientaCompleta(itemId) {
  const claves = ["estadoOperativo", "tipoUbicacion", "ubicacionActual", "custodioActual"];
  const ids = claves.map((c) => resolveColumnId(MAESTRO, c));
  const datos = await mondayFetch(
    `query ($itemId: [ID!], $ids: [String!]) {
      items(ids: $itemId) { id name column_values(ids: $ids) { id text value } }
    }`,
    { itemId: [String(itemId)], ids },
  );
  const item = datos.items?.[0];
  if (!item) throw new MovimientoError("No se encontró esa herramienta.", 404);

  const fila = { id: String(item.id), name: item.name };
  for (const cv of item.column_values ?? []) {
    const clave = claves.find((c) => resolveColumnId(MAESTRO, c) === cv.id);
    // Una columna de estado vacia devuelve el label gris en `text`; solo `value`
    // distingue los dos casos. Ver coerceColumnValue.
    if (clave) fila[clave] = cv.value == null && cv.id.startsWith("color_") ? null : cv.text;
  }
  return fila;
}

/** El movimiento mas reciente de una herramienta, o null. */
async function ultimoMovimientoDe(itemId) {
  const claves = [
    "idMaestro",
    "tipoMovimiento",
    "fechaMovimiento",
    "obra",
    "destino",
    "recibeCustodio",
    "estadoAlSalir",
    "estadoAlRecibir",
  ];
  const ids = claves.map((c) => resolveColumnId(MOVIMIENTOS, c));
  const datos = await mondayFetch(
    `query ($boardId: ID!, $ids: [String!]) {
      boards(ids: [$boardId]) {
        items_page(limit: 500) { items { id created_at column_values(ids: $ids) { id text value } } }
      }
    }`,
    { boardId: idDeBoard(MOVIMIENTOS), ids },
  );

  const mios = (datos.boards?.[0]?.items_page?.items ?? [])
    .map((item) => {
      const fila = { id: String(item.id), createdAt: item.created_at };
      for (const cv of item.column_values ?? []) {
        const clave = claves.find((c) => resolveColumnId(MOVIMIENTOS, c) === cv.id);
        if (clave) fila[clave] = cv.value == null && cv.id.startsWith("color_") ? null : cv.text;
      }
      return fila;
    })
    .filter((m) => m.idMaestro === String(itemId));

  if (!mios.length) return null;
  // Por fecha de creacion y no por "fecha del movimiento": dos movimientos del
  // mismo dia tienen la misma fecha, y lo que vale es cual se escribio ultimo.
  mios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return mios[0];
}
