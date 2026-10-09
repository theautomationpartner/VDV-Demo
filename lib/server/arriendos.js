import "server-only";

import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { itemDeEquipoVdv } from "@/lib/server/equipo-vdv";
import { reservarFolioArriendo, liberarFolioArriendo, formatearCodigo } from "@/lib/server/folios-arriendo";
import { decodificarLinea } from "@/lib/generador-oc/linea-oc";
import {
  TIPO_TARIFA,
  ITEM_ACTIVO,
  ITEM_DEVUELTO,
  ITEM_DANADO,
  ITEM_PERDIDO,
  ESTADO_ARRIENDO,
} from "@/lib/arriendos/dominio";

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
        column_values (ids: ["${col(OC, "numeroOc")}", "${col(OC, "obra")}", "${col(OC, "proveedores")}", "${col(OC, "monto")}"]) {
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
    // El monto de la OC se muestra al cargar los items, para poder comparar
    // contra lo que se pidio. Es lo que hace la app de monday vibe.
    monto: Number(valor("monto")) || 0,
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
              ... on BoardRelationValue {
                display_value
                linked_items { id column_values (ids: ["${col("ProveedoresBoard", "rut")}"]) { text } }
              }
            }
          }
        }
      }
    }`,
    {
      boardId: idDeBoard(OC),
      ids: [col(OC, "numeroOc"), col(OC, "obra"), col(OC, "proveedores"), col(OC, "monto"), col(OC, "estadoDocumento")],
    },
  );

  return (data.boards?.[0]?.items_page?.items ?? []).map((item) => {
    const valor = (clave) => {
      const c = item.column_values.find((x) => x.id === col(OC, clave));
      // En una columna de vinculo `text` viene SIEMPRE null: el dato esta en
      // display_value. Ya nos costo tres veces darnos cuenta.
      return c?.display_value ?? c?.text ?? null;
    };
    const rel = item.column_values.find((x) => x.id === col(OC, "proveedores"));
    const prov = rel?.linked_items?.[0] ?? null;
    return {
      id: item.id,
      name: item.name,
      numeroOc: valor("numeroOc"),
      obra: valor("obra"),
      proveedor: valor("proveedores"),
      // El id del proveedor agrupa bien aunque dos se llamen parecido; el RUT es
      // lo que la gente reconoce y es como lo muestra la app de monday vibe.
      proveedorId: prov?.id ?? null,
      proveedorRut: prov?.column_values?.[0]?.text || null,
      monto: Number(valor("monto")) || 0,
      estadoDocumento: valor("estadoDocumento"),
      createdAt: item.created_at,
    };
  });
}

// ----------------------------------------------------------------- devolucion

/**
 * Registra la devolucion de uno o varios items.
 *
 * La devolucion es POR ITEM y no por arriendo entero: una guia de andamios
 * puede traer 2000 piezas y vuelven de a tandas. Cada item vuelve con su propio
 * estado -devuelto, danado o perdido- y su propia fecha, que es la que corta su
 * reloj de costo.
 *
 * El encabezado se recalcula despues: cantidad activa, cantidad devuelta y el
 * estado del arriendo salen de lo que digan sus items, nunca de lo que mande el
 * navegador. Mismo criterio que los movimientos de herramientas.
 */
export async function devolverItems({ arriendoId, devoluciones, nota, quien }) {
  if (!arriendoId) throw new ArriendoError("Falta el arriendo.");
  if (!Array.isArray(devoluciones) || devoluciones.length === 0) {
    throw new ArriendoError("No hay ítems para devolver.");
  }

  const estadosValidos = new Set([ITEM_DEVUELTO, ITEM_DANADO, ITEM_PERDIDO]);
  for (const d of devoluciones) {
    if (!d.itemId) throw new ArriendoError("Falta el ítem que se devuelve.");
    if (!estadosValidos.has(d.estado)) {
      throw new ArriendoError(`"${d.estado}" no es un estado de devolución válido.`);
    }
  }

  /**
   * La foto de devolucion es obligatoria, y se comprueba ACA.
   *
   * El cliente la sube antes de llamar a esta ruta, asi que normalmente ya
   * esta. Se vuelve a mirar en el servidor porque es la unica evidencia de en
   * que estado volvio el equipo: sin ella, una discusion con el proveedor por
   * un andamio danado se pierde sola. La app de Pablo tampoco deja cerrar sin
   * foto ("faltan 1 foto(s) para cerrarlo") y Mateo confirmo el 09-oct que se
   * mantenga igual.
   */
  const conFoto = await itemsConFoto(arriendoId);
  const sinFoto = devoluciones.filter((d) => !conFoto.has(String(d.itemId)));
  if (sinFoto.length) {
    throw new ArriendoError(
      sinFoto.length === 1
        ? "Falta la foto de devolución de ese ítem. Es la constancia de cómo volvió."
        : `Faltan las fotos de devolución de ${sinFoto.length} ítems. Son la constancia de cómo volvieron.`,
    );
  }

  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

  const fallidos = [];
  for (const d of devoluciones) {
    const v = {
      [col(ITEMS, "estado")]: { label: d.estado },
      [col(ITEMS, "fechaDevolucion")]: { date: d.fecha || hoy },
    };
    try {
      await mondayFetch(
        `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
          change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $values) { id }
        }`,
        { boardId: idDeBoard(ITEMS), itemId: String(d.itemId), values: JSON.stringify(v) },
      );
    } catch (error) {
      console.error("[arriendos] no se pudo devolver un item:", error?.message);
      fallidos.push(d.itemId);
    }
  }

  /**
   * La nota se AGREGA a Observaciones, no la pisa.
   *
   * El tablero no tiene una columna de nota por devolucion -y crear columnas en
   * el tablero del cliente no esta a nuestro alcance desde aca-, asi que queda
   * anotada con su fecha en el campo que ya existe. Pisar lo que habia seria
   * perder lo anterior.
   */
  if (nota?.trim()) {
    try {
      await agregarObservacion(arriendoId, `Devolución ${hoy}: ${nota.trim()}`);
    } catch (error) {
      console.error("[arriendos] no se pudo guardar la nota:", error?.message);
    }
  }

  // Y ahora el encabezado, recalculado desde los items que quedaron.
  const aplicadas = devoluciones.filter((d) => !fallidos.includes(d.itemId));
  const resumen = await recalcularEncabezado(arriendoId, { quien, aplicadas });

  return { ok: true, fallidos, ...resumen };
}

/**
 * Pone el encabezado al dia con lo que dicen sus items.
 *
 * Se relee monday -si una escritura fallo, el encabezado tiene que reflejar la
 * realidad y no lo que quisimos hacer- PERO se le superpone lo que acabamos de
 * escribir con exito (`aplicadas`).
 *
 * Esa superposicion no es una comodidad: sin ella el encabezado queda MAL. La
 * lista de monday es eventually consistent, asi que al releer los subelementos
 * un segundo despues de actualizarlos todavia vuelven con el estado viejo.
 * Medido devolviendo dos items a la vez: los dos quedaban "Devuelto" y el
 * encabezado decia ACTIVO con 0 devueltas, o sea que el arriendo seguia
 * cobrando algo que ya estaba en el deposito del proveedor.
 */
async function recalcularEncabezado(arriendoId, { quien, aplicadas = [] } = {}) {
  const recienEscrito = new Map(aplicadas.map((d) => [String(d.itemId), d.estado]));
  const data = await mondayFetch(
    `query ($ids: [ID!]) {
      items (ids: $ids) {
        id
        subitems {
          id
          column_values (ids: ["${col(ITEMS, "estado")}", "${col(ITEMS, "cantidad")}"]) { id text }
        }
      }
    }`,
    { ids: [String(arriendoId)] },
  );

  const subs = data.items?.[0]?.subitems ?? [];
  const leer = (s, clave) => s.column_values.find((c) => c.id === col(ITEMS, clave))?.text ?? "";

  let activas = 0;
  let devueltas = 0;
  let conDano = 0;
  let perdidos = 0;
  let enObra = 0;

  for (const s of subs) {
    // Lo recien escrito manda sobre lo que devuelve la consulta.
    const estado = recienEscrito.get(String(s.id)) ?? leer(s, "estado");
    const cantidad = Number(leer(s, "cantidad")) || 0;
    if (estado === ITEM_DANADO) conDano += 1;
    if (estado === ITEM_PERDIDO) perdidos += 1;
    if (estado === ITEM_DEVUELTO || estado === ITEM_DANADO || estado === ITEM_PERDIDO) {
      devueltas += cantidad;
    } else {
      activas += cantidad;
      enObra += 1;
    }
  }

  let estado;
  if (enObra > 0) estado = ESTADO_ARRIENDO.ACTIVO;
  else if (perdidos > 0) estado = ESTADO_ARRIENDO.PERDIDO;
  else if (conDano > 0) estado = ESTADO_ARRIENDO.CON_OBSERVACION;
  else estado = ESTADO_ARRIENDO.DEVUELTO;

  const v = {
    [col(MAESTRO, "cantidadActiva")]: activas,
    [col(MAESTRO, "cantidadDevuelta")]: devueltas,
    [col(MAESTRO, "estadoArriendo")]: { label: estado },
  };

  // Quien registro la devolucion, contra el directorio.
  if (quien?.email) {
    const fichaId = await itemDeEquipoVdv(quien.email).catch(() => null);
    if (fichaId) v[col(MAESTRO, "responsableVdv")] = { item_ids: [Number(fichaId)] };
  }

  await mondayFetch(
    `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $values) { id }
    }`,
    { boardId: idDeBoard(MAESTRO), itemId: String(arriendoId), values: JSON.stringify(v) },
  );

  return { estado, activas, devueltas, enObra };
}

/** El encabezado de un arriendo. Lo usa el guard de obra antes de escribir. */
export async function leerArriendo(arriendoId) {
  if (!arriendoId) return null;
  const data = await mondayFetch(
    `query ($ids: [ID!]) {
      items (ids: $ids) {
        id
        name
        column_values (ids: ["${col(MAESTRO, "obra")}"]) { id text }
      }
    }`,
    { ids: [String(arriendoId)] },
  );
  const item = data.items?.[0];
  if (!item) return null;
  return { id: item.id, name: item.name, obra: item.column_values?.[0]?.text || null };
}

/** Los ids de los items de un arriendo que ya tienen foto de devolucion. */
async function itemsConFoto(arriendoId) {
  const data = await mondayFetch(
    `query ($ids: [ID!]) {
      items (ids: $ids) {
        subitems {
          id
          column_values (ids: ["${col(ITEMS, "fotoDevolucion")}"]) { id text }
        }
      }
    }`,
    { ids: [String(arriendoId)] },
  );
  const con = new Set();
  for (const s of data.items?.[0]?.subitems ?? []) {
    // Una columna de archivo vacia devuelve "" o null; con archivo trae el JSON
    // de los assets. No hace falta parsearlo: alcanza con que traiga algo.
    if ((s.column_values?.[0]?.text ?? "").trim()) con.add(String(s.id));
  }
  return con;
}

/** Suma una linea a Observaciones sin borrar lo que ya estaba. */
async function agregarObservacion(arriendoId, linea) {
  const data = await mondayFetch(
    `query ($ids: [ID!]) {
      items (ids: $ids) { column_values (ids: ["${col(MAESTRO, "observaciones")}"]) { text } }
    }`,
    { ids: [String(arriendoId)] },
  );
  const previo = (data.items?.[0]?.column_values?.[0]?.text ?? "").trim();
  const texto = previo ? `${previo}
${linea}` : linea;

  await mondayFetch(
    `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $values) { id }
    }`,
    {
      boardId: idDeBoard(MAESTRO),
      itemId: String(arriendoId),
      values: JSON.stringify({ [col(MAESTRO, "observaciones")]: texto }),
    },
  );
}
