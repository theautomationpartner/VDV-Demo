import "server-only";
import { resolveColumnId, getBoardSchema } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { itemDeEquipoVdv } from "@/lib/server/equipo-vdv";
import { reservarFolioSpm, liberarFolioSpm, formatearNumero } from "@/lib/server/folios-spm";

const SPM = "SpmVdvBoard";
const LINEAS = "SpmVdvItemsBoard";

/** El grupo del tablero. Es el unico que tiene, y se llama "Spm IA". */
const GRUPO = "topics";

export class SpmError extends Error {
  constructor(mensaje, status = 400) {
    super(mensaje);
    this.name = "SpmError";
    this.status = status;
  }
}

const idDe = (clave) => getBoardIdOrThrow(getBoardSchema(clave), clave);
const col = (clave, campo) => resolveColumnId(clave, campo);

// ------------------------------------------------------------ destinatarios

/**
 * La lista que lee Make, una linea por proveedor:
 *
 *   Nombre | correo1, correo2 | ocasional
 *
 * EL FORMATO NO SE TOCA. El escenario 1 la parsea con expresiones regulares y
 * cambiarlo lo rompe. Lo que cambia es QUIEN LA ESCRIBE: hasta ahora la tipeaba
 * una persona en un campo de texto largo de monday, y una linea mal escrita
 * dejaba a ese proveedor sin recibir el correo -el aviso quedaba en una nota
 * que nadie mira-. Desde aca la arma la app con lo que eligio de la lista de
 * proveedores, asi que no hay forma de escribirla mal.
 *
 * El nombre se limpia de `|` porque es el separador: un proveedor que se llame
 * "Perez | Hnos" partiria la linea en dos y Make leeria cualquier cosa.
 */
export function serializarDestinatarios(destinatarios) {
  return (destinatarios ?? [])
    .map((d) => {
      const nombre = String(d?.nombre ?? "").replace(/\|/g, "/").trim();
      const mails = [...new Set((d?.mails ?? []).map((m) => String(m).trim().toLowerCase()).filter(Boolean))];
      if (!mails.length) return null;
      const tags = d?.ocasional ? " | ocasional" : "";
      return `${nombre || mails[0]} | ${mails.join(", ")}${tags}`;
    })
    .filter(Boolean)
    .join("\n");
}

/** Un correo que monday y Make van a poder usar. */
const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// ------------------------------------------------------------------- alta

/**
 * Crea la solicitud con sus lineas.
 *
 * Tres cosas se hacen distinto de la app del cliente, y las tres son
 * correcciones, no gusto:
 *
 * 1. El NUMERO sale de nuestra base (ver folios-spm.js). La app lo calculaba
 *    leyendo el tablero entero y buscando el maximo, que es una carrera.
 * 2. El EMISOR sale de la sesion, no de un desplegable opcional. Si quien pide
 *    no tiene ficha en Equipo VDV se corta ACA, antes de reservar el numero:
 *    sin emisor el correo al proveedor sale sin firma y Make lo marca error.
 * 3. Los DESTINATARIOS se arman desde los proveedores elegidos, no se tipean.
 *
 * Si algo falla despues de reservar el numero, se devuelve. Un numero perdido
 * no rompe nada, pero un hueco en la numeracion le hace perder tiempo a alguien
 * buscando la solicitud que no existe.
 */
export async function crearSolicitud(datos, quien) {
  const obra = String(datos?.obra ?? "").trim();
  const centroCosto = String(datos?.centroCosto ?? "").trim();
  const lineas = Array.isArray(datos?.lineas) ? datos.lineas : [];
  const destinatarios = Array.isArray(datos?.destinatarios) ? datos.destinatarios : [];

  if (!obra) throw new SpmError("Falta decir para qué obra es.");
  if (!centroCosto) throw new SpmError("Falta el centro de costo.");
  if (!lineas.length) throw new SpmError("La solicitud no tiene ningún material.");
  for (const l of lineas) {
    if (!String(l?.nombre ?? "").trim()) throw new SpmError("Hay una línea sin material.");
    if (!String(l?.cantidad ?? "").trim()) throw new SpmError(`Falta la cantidad de "${l.nombre}".`);
  }
  if (!destinatarios.length) throw new SpmError("Falta decir a qué proveedores pedirles cotización.");
  for (const d of destinatarios) {
    const mails = (d?.mails ?? []).filter((m) => MAIL.test(String(m).trim()));
    if (!mails.length) {
      throw new SpmError(`"${d?.nombre ?? "Un proveedor"}" no tiene un correo válido, así que no recibiría nada.`);
    }
  }

  // El emisor, antes de reservar el numero: si falta, no se gasta un folio.
  const fichaEmisor = quien?.email ? await itemDeEquipoVdv(quien.email) : null;
  if (!fichaEmisor) {
    throw new SpmError(
      "Tu cuenta no figura en el tablero Equipo VDV, así que la solicitud saldría sin remitente. " +
        "Pedile a un administrador que te agregue con tu mail.",
      403,
    );
  }

  const folio = await reservarFolioSpm();
  const numero = formatearNumero(folio);

  try {
    const valores = {
      [col(SPM, "numero")]: numero,
      [col(SPM, "obra")]: { label: obra },
      [col(SPM, "centroCosto")]: { labels: [centroCosto] },
      [col(SPM, "fecha")]: { date: new Date().toISOString().slice(0, 10) },
      [col(SPM, "estado")]: { label: "En curso" },
      // "Borrador" y no "Por enviar": crear la solicitud NO la manda. Mandarla
      // es un segundo paso a proposito -ver marcarParaEnviar-.
      [col(SPM, "envioCotizacion")]: { label: "Borrador" },
      [col(SPM, "emisorVdv")]: { item_ids: [Number(fichaEmisor)] },
      [col(SPM, "destinatarios")]: serializarDestinatarios(destinatarios),
    };

    const delMaestro = destinatarios.filter((d) => !d.ocasional && d.id).map((d) => Number(d.id));
    if (delMaestro.length) valores[col(SPM, "proveedores")] = { item_ids: delMaestro };

    const ocasionales = destinatarios.filter((d) => d.ocasional);
    if (ocasionales.length) {
      valores[col(SPM, "proveedoresOcasionales")] = serializarDestinatarios(ocasionales);
    }

    /**
     * El nombre lleva el numero adelante.
     *
     * La app del cliente lo dejaba en "obra | centro de costo", y por eso su
     * propio buscador no encontraba "SPM-002": buscaba en el nombre. Make no
     * lee el nombre del item -busca por la columna del numero-, asi que esto no
     * lo afecta, y el tablero pasa a ser legible de un vistazo.
     */
    const nombre = `${numero} · ${obra} | ${centroCosto}`;

    const creado = await mondayFetch(
      `mutation ($boardId: ID!, $grupo: String!, $name: String!, $values: JSON!) {
        create_item (board_id: $boardId, group_id: $grupo, item_name: $name, column_values: $values, create_labels_if_missing: false) { id }
      }`,
      { boardId: idDe(SPM), grupo: GRUPO, name: nombre, values: JSON.stringify(valores) },
    );
    const spmId = creado.create_item?.id;
    if (!spmId) throw new SpmError("monday no devolvió la solicitud creada.", 502);

    for (const linea of lineas) {
      await crearLinea(spmId, linea);
    }

    console.log(
      "[spm]",
      JSON.stringify({
        evento: "solicitud-creada",
        numero,
        spmId: String(spmId),
        obra,
        lineas: lineas.length,
        proveedores: destinatarios.length,
        quien: quien?.email ?? null,
      }),
    );

    return { ok: true, id: String(spmId), numero, nombre };
  } catch (error) {
    await liberarFolioSpm(folio).catch(() => {});
    if (error instanceof SpmError) throw error;
    console.error("[spm] No se pudo crear la solicitud:", error?.message);
    throw new SpmError("No se pudo crear la solicitud. Probá de nuevo.", 502);
  }
}

/**
 * Una linea de material.
 *
 * Lo que NO esta en el catalogo lleva el prefijo `[SC]` y la unidad dentro del
 * nombre. No es un capricho del cliente: la unidad es un espejo del material
 * vinculado, asi que una linea sin material no tiene donde guardarla, y el
 * proveedor necesita verla igual.
 */
async function crearLinea(spmId, linea) {
  const sinCatalogo = !linea.materialId;
  const unidad = String(linea.unidad ?? "").trim();
  const nombre = sinCatalogo
    ? `[SC] ${linea.nombre}${unidad ? ` (${unidad})` : ""}`
    : String(linea.nombre);

  const valores = { [col(LINEAS, "cantidad")]: String(linea.cantidad) };
  if (!sinCatalogo) valores[col(LINEAS, "material")] = { item_ids: [Number(linea.materialId)] };

  await mondayFetch(
    `mutation ($parent: ID!, $name: String!, $values: JSON!) {
      create_subitem (parent_item_id: $parent, item_name: $name, column_values: $values, create_labels_if_missing: false) { id }
    }`,
    { parent: String(spmId), name: nombre, values: JSON.stringify(valores) },
  );
}

// ------------------------------------------------------------------ envio

/** Lo que devuelve monday para decidir si se puede mandar. */
async function leerParaEnviar(spmId) {
  const claves = ["numero", "envioCotizacion", "destinatarios"];
  const ids = claves.map((c) => col(SPM, c));
  const datos = await mondayFetch(
    `query ($itemId: [ID!], $ids: [String!]) {
      items (ids: $itemId) { id name column_values (ids: $ids) { id text } }
    }`,
    { itemId: [String(spmId)], ids },
  );
  const item = datos.items?.[0];
  if (!item) throw new SpmError("No se encontró esa solicitud.", 404);
  const porId = Object.fromEntries((item.column_values ?? []).map((c) => [c.id, c.text]));
  const fila = { id: String(item.id), name: item.name };
  for (const clave of claves) fila[clave] = porId[col(SPM, clave)] ?? null;
  return fila;
}

/**
 * Deja la solicitud lista para que Make mande los correos.
 *
 * Lo unico que hace es poner la columna en "Por enviar". El webhook del
 * escenario 1 ve ese cambio y manda. No hay forma de mandar el correo desde
 * aca, y es correcto que asi sea mientras el correo viva en Make.
 *
 * EL FRENO AL REENVIO ES EL PUNTO. En la app del cliente el boton queda activo
 * despues de enviada, y cada vez que la columna vuelve a "Por enviar" Make
 * reenvia a todos los proveedores. Paso de verdad en las pruebas del 24 y el 25
 * de septiembre. Aca solo se puede mandar lo que esta en Borrador o lo que
 * fallo.
 */
export async function marcarParaEnviar(spmId, quien) {
  const sol = await leerParaEnviar(spmId);

  if (sol.envioCotizacion === "Enviado") {
    throw new SpmError(
      `${sol.numero || "Esta solicitud"} ya se envió. Si hay que pedir cotización de nuevo, creá una solicitud nueva.`,
      409,
    );
  }
  if (sol.envioCotizacion === "Por enviar") {
    throw new SpmError("Ya está saliendo. Esperá unos segundos y refrescá.", 409);
  }
  if (!String(sol.destinatarios ?? "").trim()) {
    throw new SpmError("La solicitud no tiene destinatarios, así que no hay a quién mandarle.");
  }

  await mondayFetch(
    `mutation ($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values (board_id: $boardId, item_id: $itemId, column_values: $values) { id }
    }`,
    {
      boardId: idDe(SPM),
      itemId: String(spmId),
      values: JSON.stringify({ [col(SPM, "envioCotizacion")]: { label: "Por enviar" } }),
    },
  );

  console.log(
    "[spm]",
    JSON.stringify({ evento: "marcada-para-enviar", numero: sol.numero, spmId: String(spmId), quien: quien?.email ?? null }),
  );

  return { ok: true, numero: sol.numero };
}
