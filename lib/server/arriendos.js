import "server-only";

import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { itemDeEquipoVdv } from "@/lib/server/equipo-vdv";
import { reservarFolioArriendo, liberarFolioArriendo, formatearCodigo } from "@/lib/server/folios-arriendo";
import { decodificarLinea } from "@/lib/generador-oc/linea-oc";
import { TIPO_TARIFA, ITEM_ACTIVO, ESTADO_ARRIENDO } from "@/lib/arriendos/dominio";

const MAESTRO = "ControlArriendosBoard";
const ITEMS = "ControlArriendosItemsBoard";
const OC = "OrdenesDeCompraMaxxaBoard";

export class ArriendoError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.status = status;
  }
}

const idDeBoard = (boardKey) => getBoardIdOrThrow(getBoardSchema(boardKey), boardKey);
const col = (boardKey, clave) => resolveColumnId(boardKey, clave);

// ------------------------------------------------------- leer la orden de compra

/**
 * Trae una OC con sus lineas, para precargar el arriendo.
 *
 * Las lineas de una OC viven como subelementos y toda la linea -descripcion,
 * cantidad, precio- viaja codificada en el NOMBRE del subelemento. Por eso se
 * decodifica con la misma funcion que usa el Generador de OC en vez de leer
 * columnas que no existen.
 */
export async function leerOrdenDeCompra(ocItemId) {
  const data = await mondayFetch(
    `query ($ids: [ID!]) {
      items (ids: $ids) {
        id
        name
        column_values (ids: ["${col(OC, "numeroOc")}", "${col(OC, "obra")}", "${col(OC, "proveedores")}"]) {
          id
          text
          ... on BoardRelationValue { display_value linked_item_ids }
        }
        subitems { id name }
      }
    }`,
    { ids: [String(ocItemId)] },
  );

  const item = data.items?.[0];
  if (!item) throw new ArriendoError("No se encontró esa orden de compra.", 404);

  const valor = (clave) => {
    const c = item.column_values.find((x) => x.id === col(OC, clave));
    // OJO: en una columna de vinculo `text` viene SIEMPRE en null; el dato esta
    // en display_value. Es la trampa de monday que ya nos costo tres veces.
    return c?.display_value ?? c?.text ?? null;
  };

  const lineas = (item.subitems ?? [])
    .map((s) => ({ id: s.id, ...(decodificarLinea(s.name) ?? {}) }))
    .filter((l) => l.descripcion);

  return {
    id: item.id,
    name: item.name,
    numeroOc: valor("numeroOc"),
    obra: valor("obra"),
    proveedor: valor("proveedores"),
    proveedorIds:
      item.column_values.find((x) => x.id === col(OC, "proveedores"))?.linked_item_ids ?? [],
    lineas,
  };
}

// --------------------------------------------------------------- crear el arriendo

function validar({ nombre, obra, tipoTarifa, items, ocItemId, excepcion }) {
  if (!nombre?.trim()) throw new ArriendoError("Falta el nombre del equipo arrendado.");
  if (!obra) throw new ArriendoError("Falta decir a qué obra va.");

  /**
   * El tipo de tarifa es obligatorio, y no es burocracia.
   *
   * Sin el, el costo no se puede calcular y no hay default honesto: para un
   * equipo de $15.000 que lleva 19 dias, suponer "fija" da $15.000 y suponer
   * "por dia" da $285.000. De los cuatro arriendos que hay cargados a mano en
   * el tablero, TRES no lo tienen y por eso figuran sin costo. Exigirlo aca es
   * lo que evita que el problema se repita con los que entren por la app.
   */
  if (!tipoTarifa || !Object.values(TIPO_TARIFA).includes(tipoTarifa)) {
    throw new ArriendoError("Falta el tipo de tarifa, que es lo que define cómo se cobra el arriendo.");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ArriendoError("Un arriendo necesita al menos un ítem.");
  }
  for (const [i, item] of items.entries()) {
    if (!item.nombre?.trim()) throw new ArriendoError(`El ítem ${i + 1} no tiene nombre.`);
    if (!(Number(item.cantidad) > 0)) throw new ArriendoError(`El ítem "${item.nombre}" no tiene cantidad.`);
    if (!(Number(item.precioUnitario) > 0)) throw new ArriendoError(`El ítem "${item.nombre}" no tiene precio.`);
  }

  /**
   * La regla de Pablo, textual de la llamada del 07-oct: "la idea mia es que no
   * se hagan arriendos sin orden de compra". Se permite la excepcion porque el
   * mismo tablero la contempla -a veces el equipo llega antes que el papel-,
   * pero hay que autorizarla y decir por que.
   */
  if (!ocItemId && !excepcion?.motivo?.trim()) {
    throw new ArriendoError(
      "Un arriendo se da de alta desde su orden de compra. Si todavía no hay OC, " +
        "marcá la excepción y escribí el motivo.",
    );
  }
}

/** Las columnas del encabezado, en el formato que espera monday. */
function valoresDelMaestro({ codigo, obra, categoria, tipoTarifa, iva, unidadDeCobro, fechaInicio, fechaFin, marca, modelo, nSerie, custodio, observaciones, nGuia, fechaGuia, cantidadTotal, oc, excepcion, fichaResponsable }) {
  const v = {};
  const poner = (clave, valor) => {
    if (valor === null || valor === undefined || valor === "") return;
    v[col(MAESTRO, clave)] = valor;
  };

  poner("codigoArriendo", codigo);
  poner("obra", { label: obra });
  poner("categoria", categoria ? { labels: [categoria] } : null);
  poner("tipoTarifa", { label: tipoTarifa });
  poner("iva", { label: iva || "NETO" });
  poner("unidadDeCobro", unidadDeCobro ? { labels: [unidadDeCobro] } : null);
  poner("fechaInicioArriendo", fechaInicio ? { date: fechaInicio } : null);
  poner("fechaFinArriendo", fechaFin ? { date: fechaFin } : null);
  poner("fechaIngresoObraActual", fechaInicio ? { date: fechaInicio } : null);
  poner("marca", marca);
  poner("modelo", modelo);
  poner("nSerie", nSerie);
  poner("custodioActual", custodio);
  poner("observaciones", observaciones);
  poner("nGuiaIngreso", nGuia);
  poner("fechaGuiaIngreso", fechaGuia ? { date: fechaGuia } : null);
  poner("cantidadInicial", cantidadTotal);
  poner("cantidadActiva", cantidadTotal);
  poner("cantidadDevuelta", 0);
  poner("estadoArriendo", { label: ESTADO_ARRIENDO.ACTIVO });

  if (oc?.id) {
    poner("ordenDeCompra", { item_ids: [Number(oc.id)] });
    if (oc.proveedorIds?.length) {
      poner("proveedor", { item_ids: oc.proveedorIds.map(Number) });
    }
  }

  // La excepcion se guarda SIEMPRE que exista, aunque despues aparezca la OC:
  // es la constancia de que alguien la autorizo y por que.
  if (excepcion?.motivo) {
    poner("excepcionSinOc", { label: "SÍ AUTORIZADA" });
    poner("motivoExcepcion", excepcion.motivo);
  }

  // Quien dio de alta, contra el directorio. Mismo criterio que los movimientos
  // de herramientas: si la persona no tiene ficha, el arriendo se crea igual
  // pero queda sin firma -frenar el alta por eso seria peor-.
  if (fichaResponsable) {
    poner("responsableVdv", { item_ids: [Number(fichaResponsable)] });
  }

  return v;
}

/**
 * Da de alta un arriendo con sus items.
 *
 * El orden importa: primero se reserva el numero, despues se crea el
 * encabezado, y recien ahi los items. Si algo falla despues de crear el
 * encabezado NO se borra -un arriendo a medias se puede completar, pero uno
 * borrado se pierde-; se devuelve que quedo incompleto para que la pantalla lo
 * diga.
 */
export async function crearArriendo({ datos, quien }) {
  validar(datos);

  const oc = datos.ocItemId ? await leerOrdenDeCompra(datos.ocItemId) : null;

  // La obra sale de la OC si la tiene: es la fuente, no lo que se tipee.
  const obra = oc?.obra || datos.obra;

  // Devuelve el ID del item del directorio, no un objeto.
  const fichaId = quien?.email ? await itemDeEquipoVdv(quien.email).catch(() => null) : null;

  const numero = await reservarFolioArriendo();
  const codigo = formatearCodigo(numero);

  const cantidadTotal = datos.items.reduce((t, i) => t + (Number(i.cantidad) || 0), 0);

  let arriendoId = null;
  try {
    const creado = await mondayFetch(
      `mutation ($boardId: ID!, $name: String!, $values: JSON!) {
        create_item (board_id: $boardId, item_name: $name, column_values: $values) { id }
      }`,
      {
        boardId: idDeBoard(MAESTRO),
        name: datos.nombre.trim().slice(0, 255),
        values: JSON.stringify(
          valoresDelMaestro({
            ...datos,
            codigo,
            obra,
            cantidadTotal,
            oc,
            fichaResponsable: fichaId ?? null,
          }),
        ),
      },
    );
    arriendoId = creado.create_item?.id;
    if (!arriendoId) throw new ArriendoError("monday no devolvió el arriendo creado.", 502);

    const fallidos = [];
    for (const item of datos.items) {
      try {
        await crearItem(arriendoId, item, datos);
      } catch (error) {
        console.error("[arriendos] no se pudo crear un item:", error?.message);
        fallidos.push(item.nombre);
      }
    }

    return { id: arriendoId, codigo, numero, fallidos };
  } catch (error) {
    // El numero vuelve a estar disponible SOLO si no llegamos a crear nada.
    if (!arriendoId) await liberarFolioArriendo(numero).catch(() => {});
    throw error;
  }
}

async function crearItem(arriendoId, item, datos) {
  const v = {};
  const poner = (clave, valor) => {
    if (valor === null || valor === undefined || valor === "") return;
    v[col(ITEMS, clave)] = valor;
  };
  poner("cantidad", Number(item.cantidad));
  poner("precioUnitario", Number(item.precioUnitario));
  poner("precioTarifa", Number(item.cantidad) * Number(item.precioUnitario));
  poner("tipoTarifa", { label: item.tipoTarifa || datos.tipoTarifa });
  poner("inicio", datos.fechaInicio ? { date: datos.fechaInicio } : null);
  poner("termino", datos.fechaFin ? { date: datos.fechaFin } : null);
  poner("estado", { label: ITEM_ACTIVO });

  await mondayFetch(
    `mutation ($parentId: ID!, $name: String!, $values: JSON!) {
      create_subitem (parent_item_id: $parentId, item_name: $name, column_values: $values) { id }
    }`,
    {
      parentId: String(arriendoId),
      // monday rechaza nombres de mas de 255: la OC 2201 perdio una linea de
      // $8.008.000 asi. Se corta antes de mandarlo.
      name: item.nombre.trim().slice(0, 255),
      values: JSON.stringify(v),
    },
  );
}

/**
 * Las ordenes de compra entre las que elegir al dar de alta.
 *
 * Va por aca y no por /api/monday/board porque el tablero de OC esta cerrado a
 * los roles del OC Tracker: un Bodeguero no puede leerlo, y es justamente quien
 * da de alta los arriendos. Esta ruta le muestra lo justo -numero, proveedor,
 * obra y fecha- sin abrirle el tablero entero.
 */
export async function listarOrdenesDeCompra({ limite = 100 } = {}) {
  const data = await mondayFetch(
    `query ($boardId: ID!, $ids: [String!]) {
      boards (ids: [$boardId]) {
        items_page (limit: ${Number(limite)}, query_params: { order_by: [{ column_id: "__creation_log__", direction: desc }] }) {
          items {
            id
            name
            created_at
            column_values (ids: $ids) {
              id
              text
              ... on BoardRelationValue { display_value }
            }
          }
        }
      }
    }`,
    {
      boardId: idDeBoard(OC),
      ids: [col(OC, "numeroOc"), col(OC, "obra"), col(OC, "proveedores")],
    },
  );

  return (data.boards?.[0]?.items_page?.items ?? []).map((item) => {
    const valor = (clave) => {
      const c = item.column_values.find((x) => x.id === col(OC, clave));
      // En una columna de vinculo `text` viene SIEMPRE null: el dato esta en
      // display_value. Ya nos costo tres veces darnos cuenta.
      return c?.display_value ?? c?.text ?? null;
    };
    return {
      id: item.id,
      name: item.name,
      numeroOc: valor("numeroOc"),
      obra: valor("obra"),
      proveedor: valor("proveedores"),
      createdAt: item.created_at,
    };
  });
}
