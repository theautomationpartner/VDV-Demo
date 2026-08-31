"use client";

import {
  OrdenesDeCompraMaxxaBoard,
  ProveedoresBoard,
  BaseDeDatosMaterialesBoard,
  SubelementosDeOrdenesDeCompraMaxxaBoard,
} from "@/lib/board-sdk";
import { resolveColumnId } from "@/lib/board-schemas";
import { conCache, limpiarCache } from "./cache";
import { codificarLinea, decodificarLinea } from "./linea-oc";
import { calcularCodigoValidacion, codificarLineaCodigo } from "./firma";
import {
  parseComentarios,
  interpretarDespacho,
  interpretarPago,
  codificarLineaAprobacion,
  codificarLineaEdicion,
} from "./comentarios-oc";

/**
 * Todo lo que el Generador de OC le pide a monday.
 *
 * En la Vibe original esto vivia en funciones de servidor (createServerFn). Aca
 * corre en el cliente contra /api/monday/board, igual que el resto de la app: es
 * esa ruta la unica que conoce el token, y la que aplica los permisos
 * (lib/server/board-access-policy.js). El resultado para el usuario es el mismo.
 */

const GRUPO_OC_EMITIDAS = "topics"; // "oc emitidas desde maxxa"
const GRUPO_MATERIALES = "group_mm1hfvp7";

const ocBoard = new OrdenesDeCompraMaxxaBoard();
const proveedoresBoard = new ProveedoresBoard();
const materialesBoard = new BaseDeDatosMaterialesBoard();
const lineasBoard = new SubelementosDeOrdenesDeCompraMaxxaBoard();

const COLUMNAS_OC = [
  "numeroOc",
  "docOc",
  "obra",
  "validezDocumento",
  "moneda",
  "monto",
  "responsable",
  "aprobador",
  "proveedores",
  "estadoDocumento",
  "comentarios",
  "condicionDeCompra",
  "comentariosInternos",
];

const COLUMNAS_PROVEEDOR = [
  "rut",
  "digitoVerificador",
  "rutEmpresa",
  "contacto",
  "mail",
  "fonoContacto",
  "banco",
  "cuentaCorriente",
  "nombreCuentaCorriente",
  "direccionEmpresa",
  "nombreRepresentanteLegal",
  "rutRepresentanteLegal",
  "correoRepLegal",
  "mailRepresentanteLegal",
  "categoria",
];

// ---------------------------------------------------------------- numeracion

/**
 * Un salto de mas de este tamano respecto del siguiente numero no es una orden
 * real: es un tipeo o un item de prueba. La numeracion de VDV es correlativa y
 * avanza de a uno.
 */
const SALTO_IMPLAUSIBLE = 100;

/**
 * Descarta los numeros disparatados y devuelve el mayor que queda.
 *
 * Hace falta de verdad: el tablero tiene hoy una orden numerada 999001 (el item
 * de prueba ZZ TEST PROVEEDOR). Sin este filtro la proxima orden emitida seria
 * la 999002 en vez de la 2189, y la numeracion del cliente quedaria rota para
 * siempre. Un solo numero mal cargado alcanza para arruinarla.
 *
 * Se van descartando de arriba hacia abajo mientras el salto al siguiente sea
 * mayor a SALTO_IMPLAUSIBLE, asi que aguanta varios outliers seguidos.
 */
function mayorNumeroPlausible(numeros) {
  const ordenados = [...new Set(numeros)].sort((a, b) => b - a);
  for (let i = 0; i < ordenados.length - 1; i++) {
    if (ordenados[i] - ordenados[i + 1] <= SALTO_IMPLAUSIBLE) return ordenados[i];
  }
  // Una sola orden en el tablero, o todas separadas entre si: no hay con que
  // comparar, se usa la mas alta tal cual.
  return ordenados[0] ?? 0;
}

/**
 * El proximo numero de OC.
 *
 * Mira las 100 ordenes creadas mas recientemente, no las 430 del tablero: la
 * numeracion avanza con el tiempo, asi que el maximo siempre esta ahi, y con
 * 100 sobra para reconocer los numeros absurdos.
 *
 * NO se cachea, a proposito. Es el unico dato del Generador donde estar
 * desactualizado significa emitir una orden con un numero ya usado.
 */
export async function getNextOcNumber() {
  try {
    const { items } = await ocBoard
      .items()
      .withColumns(["numeroOc"])
      .orderBy({ column: "createdAt", direction: "desc" })
      .withPagination({ limit: 100 })
      .execute();

    const numeros = (items ?? [])
      .map((item) => parseInt(String(item.numeroOc ?? "").trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (numeros.length === 0) return 1;
    return mayorNumeroPlausible(numeros) + 1;
  } catch (error) {
    console.error("[generador-oc] No se pudo calcular el próximo número de OC:", error);
    throw new Error("No se pudo calcular el número de la orden. Recargá la página.");
  }
}

// ---------------------------------------------------------------- opciones

/**
 * Obras y condiciones de compra salen de los labels reales de la columna en
 * monday, no de los valores ya usados ni de una lista copiada en el codigo: si
 * el cliente agrega una obra, aparece sola (ver handleColumnOptions).
 *
 * Las cinco listas de esta seccion se cachean 5 minutos (ver ./cache): son
 * etiquetas de columna, cambian cada varios meses, y el historial y el
 * formulario piden varias de ellas a la vez.
 */
export function getObrasOc() {
  return conCache("obras", () => ocBoard.columnOptions("obra"));
}

export function getCondicionesOc() {
  return conCache("condiciones", () => ocBoard.columnOptions("condicionDeCompra"));
}

export function getMaterialOptions() {
  return conCache("opcionesMaterial", async () => {
    const [unidades, categorias] = await Promise.all([
      materialesBoard.columnOptions("unidad").catch(() => []),
      materialesBoard.columnOptions("categoriaMaterial").catch(() => []),
    ]);
    return { unidades, categorias };
  });
}

/**
 * Centros de costo para imputar cada linea. Se unen los del tablero de lineas
 * con los de la propia OC, porque son dos desplegables distintos en monday y no
 * siempre tienen las mismas etiquetas.
 */
export function getCentrosCosto() {
  return conCache("centrosCosto", async () => {
    const [deLineas, deOcs] = await Promise.all([
      lineasBoard.columnOptions("centroCosto").catch(() => []),
      ocBoard.columnOptions("centroCosto").catch(() => []),
    ]);
    return [...new Set([...deLineas, ...deOcs])].sort((a, b) => a.localeCompare(b, "es"));
  });
}

// ---------------------------------------------------------------- proveedores

/** Formatea un RUT chileno como 12.345.678-9 a partir del cuerpo y su DV. */
function formatearRut(cuerpo, dv) {
  const limpio = (cuerpo || "").replace(/[^0-9kK]/g, "");
  if (!limpio) return "";

  let base = limpio;
  let digito = (dv || "").replace(/[^0-9kK]/g, "");
  if (!digito && limpio.length > 1) {
    base = limpio.slice(0, -1);
    digito = limpio.slice(-1);
  }

  const conPuntos = base.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return digito ? `${conPuntos}-${digito.toUpperCase()}` : conPuntos;
}

/** Una fila del tablero PROVEEDORES convertida en la ficha que usa la app. */
function mapearProveedor(item) {
  const rutDirecto = String(item.rutEmpresa ?? "").trim();
  const rut = rutDirecto || formatearRut(item.rut ?? "", item.digitoVerificador ?? "");
  const razonSocial = String(item.nombreCuentaCorriente ?? "").trim();

  return {
    id: item.id,
    name: item.name ?? "",
    // Sin razon social cargada se usa el nombre del elemento del tablero.
    nombreComercial: razonSocial || (item.name ?? ""),
    rut,
    contacto: String(item.contacto ?? "").trim(),
    mail: String(item.mail ?? "").trim() || String(item.mailRepresentanteLegal ?? "").trim(),
    fono: String(item.fonoContacto ?? "").trim(),
    banco: String(item.banco ?? "").trim(),
    cuentaCorriente: String(item.cuentaCorriente ?? "").trim(),
    nombreCuentaCorriente: razonSocial,
    direccionEmpresa: String(item.direccionEmpresa ?? "").trim(),
    representanteLegal: String(item.nombreRepresentanteLegal ?? "").trim(),
    rutRepresentanteLegal: String(item.rutRepresentanteLegal ?? "").trim(),
    correoRepLegal:
      String(item.correoRepLegal ?? "").trim() || String(item.mailRepresentanteLegal ?? "").trim(),
    categoria: String(item.categoria ?? "").trim(),
  };
}

export async function searchProveedores(termino) {
  try {
    const { items } = await proveedoresBoard
      .items()
      .withColumns(COLUMNAS_PROVEEDOR)
      .where({ name: termino })
      .withPagination({ limit: 25 })
      .execute();
    return (items ?? []).map(mapearProveedor);
  } catch (error) {
    console.error("[generador-oc] Error al buscar proveedores:", error);
    return [];
  }
}

export async function getProveedor(id) {
  try {
    const item = await proveedoresBoard.get(id).withColumns(COLUMNAS_PROVEEDOR).execute();
    return item ? mapearProveedor(item) : null;
  } catch (error) {
    console.error("[generador-oc] Error al cargar el proveedor:", error);
    return null;
  }
}

/** Separa un RUT escrito libremente ("77.137.860-9") en cuerpo y DV. */
function partirRut(valor) {
  const limpio = (valor || "").replace(/[^0-9kK]/g, "");
  if (limpio.length < 2) return { cuerpo: limpio, dv: "" };
  return { cuerpo: limpio.slice(0, -1), dv: limpio.slice(-1).toUpperCase() };
}

/**
 * Completa o corrige la ficha de un proveedor. Solo se escriben los campos que
 * vienen, para no borrar lo que ya estaba cargado.
 */
export async function actualizarProveedor(datos) {
  const valores = {};

  if (datos.nombreComercial !== undefined) {
    valores.nombreCuentaCorriente = datos.nombreComercial.trim();
  }
  if (datos.rut !== undefined && datos.rut.trim()) {
    const { cuerpo, dv } = partirRut(datos.rut);
    valores.rut = cuerpo;
    valores.digitoVerificador = dv;
  }
  if (datos.contacto !== undefined) valores.contacto = datos.contacto.trim();
  if (datos.mail !== undefined) valores.mail = datos.mail.trim();
  if (datos.cuentaCorriente !== undefined) valores.cuentaCorriente = datos.cuentaCorriente.trim();
  if (datos.banco !== undefined && datos.banco.trim()) valores.banco = datos.banco.trim();
  if (datos.fono !== undefined && datos.fono.trim()) {
    valores.fonoContacto = { phone: datos.fono.trim(), country: "CL" };
  }

  if (Object.keys(valores).length === 0) {
    return { ok: false, proveedor: null, motivo: "No hay cambios que guardar." };
  }

  try {
    await proveedoresBoard.item(datos.id).update(valores).execute();
    // Se relee la ficha para devolver exactamente lo que quedo guardado.
    return { ok: true, proveedor: await getProveedor(datos.id), motivo: null };
  } catch (error) {
    console.error("[generador-oc] Error al actualizar el proveedor:", error);
    return {
      ok: false,
      proveedor: null,
      motivo: error?.message || "No se pudieron guardar los datos del proveedor.",
    };
  }
}

export function getBancoOptions() {
  return conCache("bancos", () => proveedoresBoard.columnOptions("banco")).catch(() => []);
}

// ---------------------------------------------------------------- materiales

export async function buscarMateriales(termino) {
  const term = (termino ?? "").trim();
  if (term.length < 2) return [];

  try {
    // Si el termino es solo numeros se busca por codigo interno; si no, por nombre.
    const where = /^\d+$/.test(term) ? { codigoInterno: { contains: term } } : { name: term };
    const { items } = await materialesBoard
      .items()
      .withColumns(["unidad", "precioLista", "codigoInterno", "categoriaMaterial"])
      .where(where)
      .withPagination({ limit: 20 })
      .execute();

    return (items ?? []).map((m) => ({
      id: m.id,
      nombre: m.name,
      codigo: m.codigoInterno ? String(m.codigoInterno) : m.id,
      unidad: String(m.unidad ?? ""),
      precioLista: Number(m.precioLista ?? 0),
      categoria: String(m.categoriaMaterial ?? ""),
    }));
  } catch (error) {
    console.error("[generador-oc] Error al buscar materiales:", error);
    return [];
  }
}

export async function crearMaterial({ nombre, unidad, precioLista, categoria, comentarios }) {
  const creado = await materialesBoard
    .item()
    .create({
      name: nombre.trim(),
      unidad: [unidad],
      precioLista,
      categoriaMaterial: categoria ? [categoria] : [],
      comentarios: comentarios ?? "",
    })
    .returnColumns(["unidad", "precioLista", "codigoInterno"])
    .inGroup(GRUPO_MATERIALES)
    .execute();

  // El material nuevo puede estrenar una unidad o una categoria: si quedaran
  // las opciones cacheadas, el proximo formulario no las ofreceria.
  limpiarCache("opcionesMaterial");

  return {
    id: creado.id,
    nombre: nombre.trim(),
    codigo: creado.codigoInterno ? String(creado.codigoInterno) : creado.id,
    unidad,
    precioLista,
    categoria: categoria ?? "",
  };
}

// ---------------------------------------------------------------- usuarios

/**
 * Los usuarios de la cuenta de monday.
 *
 * Una sola consulta para los dos usos que tiene: saber tu cargo al entrar
 * (useSesionOc) y armar la lista de aprobadores del formulario. Antes eran dos
 * consultas identicas al mismo tablero, una de 500 y otra de 200.
 */
export function getUsuariosMonday() {
  return conCache("usuarios", async () => {
    const usuarios = await ocBoard.users.withPagination({ limit: 500 }).execute();
    return (usuarios ?? []).map((u) => ({
      id: Number(u.id ?? 0),
      name: u.name ?? "",
      email: u.email ?? "",
      cargo: u.title ?? null,
      telefono: (u.mobile_phone || u.phone || "").trim(),
      foto: u.photo_thumb ?? null,
    }));
  });
}

/**
 * Quienes pueden quedar como aprobadores. Se excluye al emisor: nadie aprueba
 * su propia orden.
 */
export async function getUsuariosAprobadores(excluirId) {
  try {
    const usuarios = await getUsuariosMonday();
    return usuarios
      .filter((u) => u.id > 0 && u.name && u.email && u.id !== Number(excluirId))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } catch (error) {
    console.error("[generador-oc] Error al cargar aprobadores:", error);
    return [];
  }
}

// ---------------------------------------------------------------- emitir

/**
 * Crea la Orden de Compra en monday: el item, sus lineas como subelementos y el
 * aviso al aprobador.
 *
 * Devuelve tambien el codigo de validacion y la fecha con la que se calculo,
 * porque el PDF los necesita para estampar la firma y el QR.
 */
export async function createOc(data) {
  const numeroOc = String(await getNextOcNumber());

  let neto = 0;
  for (const item of data.items) {
    neto += item.cantidad * item.precioUnitario * (1 - (item.descuento ?? 0) / 100);
  }
  const iva = data.afectaIva ? neto * 0.19 : 0;
  const total = neto + iva;

  const fechaFirma = new Date();
  const codigoValidacion = calcularCodigoValidacion({
    numeroOc,
    total,
    userId: data.responsableId,
    fechaIso: fechaFirma.toISOString(),
  });

  // El tablero no tiene columna para tipo de orden, despacho, forma de pago ni
  // contacto del emisor: van como encabezado legible dentro de COMENTARIOS.
  const notasCabecera = [
    data.tipoOc === "SERVICIOS" ? "Tipo de orden: Servicios" : null,
    data.pagoTexto ? `Forma de pago: ${data.pagoTexto}` : null,
    data.despachoTexto ? `Despacho: ${data.despachoTexto}` : null,
    data.contactoEmisor?.email || data.contactoEmisor?.telefono
      ? `Contacto emisor: ${[data.contactoEmisor?.email, data.contactoEmisor?.telefono].filter(Boolean).join(" · ")}`
      : null,
    codificarLineaCodigo(codigoValidacion),
  ].filter(Boolean);
  const comentariosFinal = [...notasCabecera, data.comentarios?.trim() || null]
    .filter(Boolean)
    .join("\n");

  // Los centros de costo imputados en las lineas, consolidados en la OC.
  const centrosCosto = [
    ...new Set(data.items.map((l) => l.centroCosto?.trim()).filter(Boolean)),
  ];

  const nombreProveedor = data.proveedor.nombreComercial || data.proveedor.name;

  const item = await ocBoard
    .item()
    .create({
      name: `OC ${numeroOc} - ${nombreProveedor}`,
      numeroOc,
      obra: data.obra,
      validezDocumento: { from: data.validezDesde, to: data.validezHasta },
      moneda: [data.moneda],
      monto: Math.round(total),
      responsable: [{ id: data.responsableId, kind: "person" }],
      aprobador: [{ id: data.aprobador.id, kind: "person" }],
      proveedores: { linkedItems: [{ id: data.proveedor.id }] },
      // Queda esperando al aprobador designado.
      estadoDocumento: "PENDIENTE",
      comentarios: comentariosFinal,
      condicionDeCompra: [data.condicionDeCompra],
      ...(centrosCosto.length > 0 ? { centroCosto: centrosCosto } : {}),
    })
    .inGroup(GRUPO_OC_EMITIDAS)
    .execute();

  // Cada linea queda como subelemento. Ademas de ser el detalle de la orden, es
  // la fuente del historial de precios de las OC emitidas.
  for (const linea of data.items) {
    if (!linea.descripcion.trim() || linea.precioUnitario <= 0) continue;
    const centro = linea.centroCosto?.trim();
    try {
      await ocBoard.createSubitem({
        parentItemId: item.id,
        subBoardKey: "SubelementosDeOrdenesDeCompraMaxxaBoard",
        name: codificarLinea(linea, data.moneda),
        values: centro ? { centroCosto: [centro] } : {},
      });
    } catch (error) {
      // Una linea que no se pudo registrar no invalida la orden ya creada.
      console.error("[generador-oc] No se pudo registrar una línea de la OC:", error);
    }
  }

  // Aviso al aprobador. Si falla, la orden ya esta emitida igual.
  try {
    const montoTexto =
      data.moneda === "CLP"
        ? `$${Math.round(total).toLocaleString("es-CL")}`
        : `${data.moneda} ${total.toFixed(2)}`;
    await ocBoard.notify({
      userId: data.aprobador.id,
      itemId: item.id,
      text: `Tienes la OC ${numeroOc} pendiente de aprobación — ${nombreProveedor}, ${data.obra}, ${montoTexto}`,
    });
  } catch (error) {
    console.error("[generador-oc] La OC se creó pero no se pudo notificar al aprobador:", error);
  }

  return {
    itemId: item.id,
    numeroOc,
    neto,
    iva,
    total,
    codigoValidacion,
    fechaFirmaIso: fechaFirma.toISOString(),
  };
}

/** Adjunta el PDF en la columna DOC OC de la orden. */
export async function uploadOcPdf(itemId, file) {
  return ocBoard.item(itemId).uploadFile({
    columnId: resolveColumnId("OrdenesDeCompraMaxxaBoard", "docOc"),
    file,
  });
}

// ---------------------------------------------------------------- historial

/**
 * Las ordenes del tablero, de la mas nueva a la mas vieja, con los filtros del
 * historial. Los tres filtros se resuelven en monday, no sobre la pagina ya
 * traida: con 2.000 ordenes, filtrar en el cliente solo miraria las primeras 25.
 */
export async function getOcs({ limit = 25, cursor, search, obra, estadoDocumento } = {}) {
  let query = ocBoard.items().withColumns(COLUMNAS_OC).withRelations();

  if (!cursor) {
    // El orden y los filtros solo aplican en la primera pagina: monday los
    // mantiene al paginar por cursor.
    query = query.orderBy({ column: "createdAt", direction: "desc" });
    if (search?.trim()) query = query.where({ numeroOc: { contains: search.trim() } });
    if (obra) query = query.where({ obra: { eq: obra } });
    if (estadoDocumento) query = query.where({ estadoDocumento: { eq: estadoDocumento } });
  }

  const res = await query.withPagination({ limit, cursor }).execute();
  return { items: res.items ?? [], cursor: res.cursor ?? null };
}

// ---------------------------------------------------------------- una orden

/**
 * Reconstruye una orden ya emitida con todo lo necesario para volver a generar
 * su PDF (al aprobarla, para estampar la segunda firma) o para prellenar el
 * formulario de edicion.
 *
 * Se arma de tres fuentes: las columnas del tablero, los subelementos (las
 * lineas) y el encabezado codificado adentro de COMENTARIOS - que es donde
 * viven el tipo de orden, el despacho, la forma de pago, el contacto del emisor
 * y el codigo de validacion, porque el tablero no tiene columnas para eso.
 */
export async function getOcCompleta(itemId) {
  const item = await ocBoard
    .get(itemId)
    .withColumns(COLUMNAS_OC)
    .withSubItems("SubelementosDeOrdenesDeCompraMaxxaBoard", ["centroCosto"])
    .execute();

  if (!item) throw new Error("No se encontró la Orden de Compra");

  const parsed = parseComentarios(item.comentarios);

  // El tablero de OCs solo guarda el vinculo al proveedor: la ficha completa
  // (RUT, banco, contacto) hay que traerla del tablero PROVEEDORES.
  const proveedorId = item.proveedores?.linkedItems?.[0]?.id;
  const proveedor = proveedorId ? await getProveedor(proveedorId) : null;

  // El cargo de responsable y aprobador vive en el perfil de monday, no en la
  // orden. Se resuelve contra la lista de usuarios, que ya esta cacheada.
  const usuarios = await getUsuariosMonday().catch(() => []);
  const persona = (columna) => {
    const nombre = String(item[columna] ?? "").split(",")[0]?.trim();
    if (!nombre) return null;
    const u = usuarios.find((x) => x.name === nombre);
    return { id: u?.id ?? 0, name: nombre, cargo: u?.cargo ?? null };
  };

  const items = (item.subitems ?? [])
    .map((sub) => {
      const linea = decodificarLinea(sub.name);
      if (!linea) return null;
      return {
        subitemId: sub.id,
        codigo: "",
        descripcion: linea.descripcion,
        cantidad: linea.cantidad,
        unidad: linea.unidad,
        precioUnitario: linea.precioUnitario,
        descuento: linea.descuento || undefined,
        centroCosto: sub.centroCosto ?? undefined,
      };
    })
    .filter(Boolean);

  const neto = items.reduce(
    (sum, l) => sum + l.cantidad * l.precioUnitario * (1 - (l.descuento ?? 0) / 100),
    0,
  );
  const total = item.monto ?? 0;
  // El tablero no guarda si la orden afecta IVA: se deduce comparando el total
  // contra el neto de las lineas.
  const afectaIva = total > neto * 1.05;
  const validez = String(item.validezDocumento ?? "").split(" - ");

  return {
    itemId: item.id,
    numeroOc: item.numeroOc ?? "",
    estadoDocumento: item.estadoDocumento ?? "PENDIENTE",
    obra: item.obra ?? "",
    moneda: item.moneda ?? "CLP",
    condicionDeCompra: item.condicionDeCompra ?? "",
    tipoOc: parsed.esServicio ? "SERVICIOS" : "MATERIALES",
    validezDesde: validez[0] ?? "",
    validezHasta: validez[1] ?? "",
    proveedor,
    responsable: persona("responsable") ?? { id: 0, name: "", cargo: null },
    aprobador: persona("aprobador"),
    contactoEmisor: { email: parsed.contactoEmail, telefono: parsed.contactoTelefono },
    despacho: interpretarDespacho(parsed.despachoTexto),
    pago: interpretarPago(parsed.pagoTexto),
    despachoTexto: parsed.despachoTexto ?? "",
    pagoTexto: parsed.pagoTexto ?? "",
    comentarios: parsed.observaciones,
    comentariosInternos: item.comentariosInternos ?? "",
    items,
    neto,
    iva: afectaIva ? total - neto : 0,
    total,
    afectaIva,
    codigoValidacion: parsed.codigoValidacion ?? "",
    fechaEmisionIso: item.createdAt
      ? new Date(item.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

/**
 * Cierra el ciclo de la orden. El PDF con la segunda firma ya se genero y se
 * subio desde la pantalla; aca queda marcarla APROBADA y dejar el registro de
 * quien la aprobo dentro de COMENTARIOS.
 *
 * Quien puede hacerlo NO lo decide esta pantalla: lo verifica el servidor
 * contra el tablero (ver lib/server/board-access-policy.js).
 */
export async function aprobarOc({ itemId, quienAprueba }) {
  const item = await ocBoard.get(itemId).withColumns(["comentarios", "estadoDocumento"]).execute();
  if (!item) throw new Error("No se encontró la Orden de Compra");
  if (item.estadoDocumento === "APROBADO") return { yaAprobada: true };

  const fechaHora = new Date().toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const comentarios = [
    item.comentarios?.trim() || null,
    codificarLineaAprobacion(quienAprueba, fechaHora),
  ]
    .filter(Boolean)
    .join("\n");

  await ocBoard.item(itemId).update({ estadoDocumento: "APROBADO", comentarios }).execute();
  return { yaAprobada: false };
}

/** Rechazar una orden, o reabrir una rechazada. Nunca una ya aprobada. */
export async function actualizarEstadoOc({ itemId, estado }) {
  const item = await ocBoard.get(itemId).withColumns(["estadoDocumento"]).execute();
  if (!item) throw new Error("No se encontró la Orden de Compra");
  if (item.estadoDocumento === "APROBADO") {
    throw new Error("Esta orden ya fue aprobada y no puede cambiar de estado");
  }
  await ocBoard.item(itemId).update({ estadoDocumento: estado }).execute();
}

/**
 * Edita una orden ya emitida: obra, aprobador, despacho, forma de pago,
 * observaciones, notas internas y las lineas. El proveedor y la condicion de
 * compra no se tocan, y una orden aprobada queda bloqueada.
 */
export async function editarOc(datos) {
  const item = await ocBoard
    .get(datos.itemId)
    .withColumns(["estadoDocumento", "comentarios", "moneda", "aprobador"])
    .withSubItems("SubelementosDeOrdenesDeCompraMaxxaBoard", ["centroCosto"])
    .execute();
  if (!item) throw new Error("No se encontró la Orden de Compra");
  if (item.estadoDocumento === "APROBADO") {
    throw new Error("Esta orden ya fue firmada por ambos y no puede modificarse");
  }

  const parsed = parseComentarios(item.comentarios);
  const fechaHora = new Date().toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // El encabezado se rearma entero: si se escribiera solo lo editado se
  // perderian el codigo de validacion y la nota de aprobacion, que viven en la
  // misma columna de comentarios.
  const notasCabecera = [
    parsed.esServicio ? "Tipo de orden: Servicios" : null,
    `Forma de pago: ${datos.pagoTexto}`,
    `Despacho: ${datos.despachoTexto}`,
    parsed.contactoEmail || parsed.contactoTelefono
      ? `Contacto emisor: ${[parsed.contactoEmail, parsed.contactoTelefono].filter(Boolean).join(" · ")}`
      : null,
    parsed.codigoValidacion ? codificarLineaCodigo(parsed.codigoValidacion) : null,
    parsed.aprobacionTexto ? `Aprobación: ${parsed.aprobacionTexto}` : null,
    codificarLineaEdicion(datos.editorNombre, fechaHora),
  ].filter(Boolean);

  const comentarios = [...notasCabecera, datos.comentarios?.trim() || null]
    .filter(Boolean)
    .join("\n");

  const moneda = item.moneda ?? "CLP";
  const lineas = datos.items ?? [];
  let montoUpdate = {};
  let centrosUpdate = {};

  if (lineas.length > 0) {
    const neto = lineas.reduce(
      (sum, l) => sum + l.cantidad * l.precioUnitario * (1 - (l.descuento ?? 0) / 100),
      0,
    );
    montoUpdate = { monto: Math.round(neto + (datos.afectaIva ? neto * 0.19 : 0)) };

    const centros = [...new Set(lineas.map((l) => l.centroCosto?.trim()).filter(Boolean))];
    if (centros.length > 0) centrosUpdate = { centroCosto: centros };

    // Los subelementos se sincronizan por posicion: se actualizan los que ya
    // estan, se crean los que falten, y los que sobran de una edicion anterior
    // se renombran para que decodificarLinea los descarte.
    const actuales = item.subitems ?? [];
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const nombre = codificarLinea(linea, moneda);
      const centro = linea.centroCosto?.trim();
      const valores = centro ? { centroCosto: [centro] } : {};
      try {
        if (actuales[i]) {
          await lineasBoard
            .item(actuales[i].id)
            .update({ name: nombre, ...valores })
            .execute();
        } else {
          await ocBoard.createSubitem({
            parentItemId: datos.itemId,
            subBoardKey: "SubelementosDeOrdenesDeCompraMaxxaBoard",
            name: nombre,
            values: valores,
          });
        }
      } catch (error) {
        console.error("[generador-oc] No se pudo sincronizar una línea:", error);
      }
    }
    for (let i = lineas.length; i < actuales.length; i++) {
      try {
        await lineasBoard.item(actuales[i].id).update({ name: "Línea eliminada" }).execute();
      } catch (error) {
        console.error("[generador-oc] No se pudo limpiar una línea sobrante:", error);
      }
    }
  }

  const aprobadorAnterior = String(item.aprobador ?? "").split(",")[0]?.trim();
  const aprobadorCambio = aprobadorAnterior !== datos.aprobador.name;

  await ocBoard
    .item(datos.itemId)
    .update({
      obra: datos.obra,
      aprobador: [{ id: datos.aprobador.id, kind: "person" }],
      comentarios,
      comentariosInternos: datos.comentariosInternos ?? "",
      ...montoUpdate,
      ...centrosUpdate,
    })
    .execute();

  if (aprobadorCambio) {
    try {
      await ocBoard.notify({
        userId: datos.aprobador.id,
        itemId: datos.itemId,
        text: "Te asignaron como aprobador de una Orden de Compra editada. Revisala en el Generador de OC.",
      });
    } catch (error) {
      console.error("[generador-oc] No se pudo notificar al nuevo aprobador:", error);
    }
  }
}
