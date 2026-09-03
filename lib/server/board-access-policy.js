import "server-only";

import { resolveColumnId } from "@/lib/board-schemas";
import { mondayFetch } from "@/lib/server/monday-client";
import { proveedorDeColumna, coincideConFiltro } from "@/lib/server/filtro-proveedor";
// Modulo sin estado ni dependencias del navegador: esta bajo hooks/ solo por
// donde nacio. Se importa aca para que el filtro por alias del servidor use
// exactamente la misma tabla que usaba el cliente.
import { getAllVariants } from "@/hooks/portal-proveedor/providerAliases";

/**
 * Autorizacion server-side para las mutaciones que board/route.js, graphql/route.js
 * y upload/route.js ejecutan contra monday.com. verificarAcceso() (auth-guard.js)
 * solo confirma que la sesion sea valida - esto ademas confirma que esa sesion
 * tenga el rol correcto para el board/operacion puntual que esta pidiendo, usando
 * la asignacion {app, appRol} que ya viaja firmada en el JWT de sesion (session.js)
 * y que el propio cliente usa para decidir que mostrar en pantalla (useUserRole.js).
 * Sin esto, cualquier sesion valida (de cualquier rol, de cualquier app) podia
 * ejecutar cualquier mutacion contra cualquier board via /api/monday/*.
 */

const VALE_EXPRESS_APP = "vale-express";
const PORTAL_APP = "portal-proveedor";
const OC_GENERATOR_APP = "generador-oc";

// Que columna de VB puede escribir cada rolContrato. La pantalla ya lo controla,
// pero eso es cosmetico: sin este check, cualquier sesion valida podia escribir
// los cinco vistos buenos de cualquier contrato llamando a /api/monday/board
// directo.
const COLUMNA_POR_ROL_CONTRATO = {
  ot: "vbOt",
  apr: "vpApr",
  administrador: "vbAdministrador",
  abogado: "vbAbogado",
  rep_legal: "vbRepLegal",
};
const COLUMNAS_VB = Object.values(COLUMNA_POR_ROL_CONTRATO);

const INGRESO_ROLES = ["super_admin", "admin", "bodeguero"];
const SOLICITUD_ROLES = ["super_admin", "admin", "jefe_obra", "apr"];
const EDIT_VALES_ROLES = ["super_admin", "admin", "bodeguero"];
const MATERIAL_WRITE_ROLES = ["super_admin", "admin", "bodeguero", "jefe_obra", "apr"];

export class BoardAccessError extends Error {
  constructor(message = "Tu cuenta no tiene permiso para esta operacion.") {
    super(message);
    this.code = "SIN_PERMISO";
    this.status = 403;
  }
}

function veAsignacion(sesion) {
  return sesion?.asignaciones?.find((a) => a.app === VALE_EXPRESS_APP) ?? null;
}

/**
 * Solo se puede tocar TU columna de VB, y ninguna otra del contrato. Si el
 * payload trae cualquier otra clave se rechaza entero: es mas seguro que
 * filtrar en silencio, porque deja el intento a la vista.
 */
function requireRolContrato(sesion, values = {}) {
  const asignacion = sesion?.asignaciones?.find((a) => a.app === PORTAL_APP) ?? null;
  if (!asignacion) throw new BoardAccessError("Tu cuenta no tiene acceso al Portal Proveedores.");

  const rol = asignacion.appConfig?.rolContrato;
  const permitida = rol ? COLUMNA_POR_ROL_CONTRATO[rol] : null;
  if (!permitida) {
    throw new BoardAccessError("Tu cuenta no tiene asignado un paso de aprobacion de contratos.");
  }

  const claves = Object.keys(values);
  const ajenas = claves.filter((k) => k !== permitida);
  if (ajenas.length > 0 || claves.length === 0) {
    throw new BoardAccessError("Solo podes dar el visto bueno que te corresponde.");
  }
}

/**
 * El Generador de OC no tiene roles internos: quien tiene la app asignada puede
 * emitir. Lo que si esta restringido -y se controla en el propio flujo, contra
 * monday- es aprobar: solo el aprobador designado de esa orden o el Gerente
 * General. Aca solo se exige que la sesion tenga la app.
 */
function requireGeneradorOc(sesion) {
  const asignacion = sesion?.asignaciones?.find((a) => a.app === OC_GENERATOR_APP) ?? null;
  if (!asignacion) throw new BoardAccessError("Tu cuenta no tiene acceso al Generador de OC.");
  return asignacion;
}

function tieneGeneradorOc(sesion) {
  return Boolean(sesion?.asignaciones?.some((a) => a.app === OC_GENERATOR_APP));
}

/** El id de monday con el que esta persona emite ordenes, o null. */
function mondayUserIdDeSesion(sesion) {
  const asignacion = sesion?.asignaciones?.find((a) => a.app === OC_GENERATOR_APP) ?? null;
  const id = asignacion?.appConfig?.mondayUserId;
  return id ? Number(id) : null;
}

/** Los ids de las personas cargadas en una columna de tipo people. */
function idsDePersonas(valorCrudo) {
  try {
    const parsed = JSON.parse(valorCrudo || "{}");
    return (parsed.personsAndTeams ?? []).map((p) => Number(p.id));
  } catch {
    return [];
  }
}

/**
 * Quien puede tocar UNA orden de compra puntual.
 *
 * Las reglas son las de la Vibe original, y no alcanza con que la pantalla las
 * respete: sin este control, cualquiera con la app asignada podia aprobar
 * cualquier orden llamando a /api/monday/board directo.
 *
 *   aprobar            -> solo el aprobador designado de ESA orden, o el
 *                         Gerente General
 *   rechazar / reabrir  -> ademas, quien la emitio
 *   editar              -> idem
 *   una orden APROBADA  -> nadie, ya la firmaron los dos
 *
 * Cuesta una consulta a monday por escritura, que se paga solo en las ordenes
 * ya emitidas (emitir una nueva no pasa por aca).
 */
async function requireGestionOc(sesion, itemId, values = {}) {
  requireGeneradorOc(sesion);

  const miId = mondayUserIdDeSesion(sesion);
  if (!miId) {
    throw new BoardAccessError(
      "Tu cuenta no esta vinculada a un usuario de monday, asi que no puede gestionar ordenes.",
    );
  }
  if (!itemId) throw new BoardAccessError("Falta la orden sobre la que se quiere operar.");

  const col = (clave) => resolveColumnId("OrdenesDeCompraMaxxaBoard", clave);
  const ids = [col("responsable"), col("aprobador"), col("estadoDocumento")];

  let datos;
  try {
    datos = await mondayFetch(
      `query ($itemId: [ID!], $userId: [ID!]) {
        items(ids: $itemId) { column_values(ids: ${JSON.stringify(ids)}) { id text value } }
        users(ids: $userId) { id title }
      }`,
      { itemId: [String(itemId)], userId: [String(miId)] },
    );
  } catch (error) {
    console.error("[generador-oc] No se pudo verificar el permiso sobre la orden:", error?.message);
    throw new BoardAccessError("No se pudo verificar tu permiso sobre esta orden.");
  }

  const item = datos.items?.[0];
  if (!item) throw new BoardAccessError("No se encontro esa orden de compra.");

  const valor = (columnId) => item.column_values.find((c) => c.id === columnId);
  const responsables = idsDePersonas(valor(col("responsable"))?.value);
  const aprobadores = idsDePersonas(valor(col("aprobador"))?.value);
  const estado = valor(col("estadoDocumento"))?.text ?? "";

  const esGerenteGeneral =
    (datos.users?.[0]?.title ?? "").trim().toLowerCase() === "gerente general";

  if (estado === "APROBADO") {
    throw new BoardAccessError("Esta orden ya fue aprobada y no se puede modificar.");
  }

  const quiereAprobar = values?.estadoDocumento === "APROBADO";
  if (quiereAprobar) {
    if (!aprobadores.includes(miId) && !esGerenteGeneral) {
      throw new BoardAccessError("Solo la persona asignada como aprobador puede aprobar esta orden.");
    }
    return;
  }

  if (!responsables.includes(miId) && !aprobadores.includes(miId) && !esGerenteGeneral) {
    throw new BoardAccessError("Solo quien emitio la orden o quien debe aprobarla pueden modificarla.");
  }
}

function requireVeRole(sesion, allowedRoles, { allowMissingRole = false } = {}) {
  const asignacion = veAsignacion(sesion);
  if (!asignacion) throw new BoardAccessError("Tu cuenta no tiene acceso a Vale Express.");

  const rol = asignacion.appRol;
  if (!rol) {
    if (allowMissingRole) return;
    throw new BoardAccessError("Tu cuenta todavia no tiene un rol asignado en Vale Express.");
  }
  if (!allowedRoles.includes(rol)) {
    throw new BoardAccessError("Tu rol en Vale Express no tiene permiso para esta operacion.");
  }
}

// ValesBoard.itemUpdate cubre dos flujos con permisos distintos (crear/completar
// una solicitud vs. entregar/rechazar un vale ya creado) - se distinguen por las
// columnas en "values", ya que boardKey/op son los mismos para los dos. Ver
// auditoria (Puntos de cambio, hallazgo #2). OJO: solicitud/page.jsx tiene un
// fallback columna-por-columna (si el update en batch falla) que puede mandar
// {cantidad: N} solo - payload identico al de la edicion inline de
// vales-pendientes/page.jsx, asi que ESE caso puntual no se puede distinguir por
// forma y se trata como "solicitud" (rol mas permisivo) para no romper el
// fallback legitimo. Solo el cambio de estado a ENTREGADA/NO ENTREGADA es
// exclusivo de vales-pendientes y se puede identificar con certeza.
function clasificarActualizacionVale(values = {}) {
  if (values.estado === "ENTREGADA" || values.estado === "NO ENTREGADA") return "edicion";
  return "solicitud";
}

/**
 * Llamar antes de ejecutar itemCreate/itemUpdate en board/route.js. No lanza nada
 * para boards sin regla especifica (mismo comportamiento que antes de este check:
 * solo se exige sesion valida, via verificarAcceso).
 */
export async function verificarAccesoMutacion(sesion, boardKey, { op, values, itemId } = {}) {
  if (boardKey === "IngresosBoard") {
    requireVeRole(sesion, INGRESO_ROLES);
    return;
  }
  if (boardKey === "ValesBoard") {
    if (op === "itemCreate") {
      requireVeRole(sesion, SOLICITUD_ROLES, { allowMissingRole: true });
      return;
    }
    const tipo = clasificarActualizacionVale(values);
    if (tipo === "solicitud") {
      requireVeRole(sesion, SOLICITUD_ROLES, { allowMissingRole: true });
    } else {
      requireVeRole(sesion, EDIT_VALES_ROLES);
    }
    return;
  }
  if (boardKey === "FlujoContratacionSubcontratoBoard") {
    // Los contratos no se crean desde el Portal: solo se aprueban.
    if (op !== "itemUpdate") throw new BoardAccessError("Operacion no permitida sobre contratos.");
    requireRolContrato(sesion, values);
    return;
  }
  if (boardKey === "SubelementosDeOrdenesDeCompraMaxxaBoard") {
    requireGeneradorOc(sesion);
    return;
  }
  if (boardKey === "OrdenesDeCompraMaxxaBoard") {
    // Emitir una orden nueva: alcanza con tener la app.
    if (op === "itemCreate") {
      requireGeneradorOc(sesion);
      return;
    }

    // Sobre este tablero escriben dos pantallas distintas, y la regla depende
    // del VALOR que se escribe, no de que apps tenga quien escribe:
    //
    //  - Aprobar una orden (estadoDocumento = APROBADO) es la unica decision
    //    con consecuencia real: cierra el ciclo y deja la orden inmutable.
    //    Solo el aprobador designado o el Gerente General.
    //  - Cualquier otro cambio de solo el estado (rechazar, reabrir) lo hace
    //    tambien OC Tracker / Control General, que no tiene asignacion propia
    //    en la whitelist y hoy funciona para cualquier sesion valida. Se deja
    //    como estaba: restringirlo aca romperia esa pantalla.
    //  - Un payload con mas columnas es una edicion de la orden, y esa si pasa
    //    por las reglas.
    //
    // OJO con la version anterior de esto: condicionaba por "si tenes el
    // Generador asignado", y eso rompia OC Tracker justo para las cuentas que
    // tienen las dos apps.
    const claves = Object.keys(values ?? {});
    const soloEstado = op === "itemUpdate" && claves.length === 1 && claves[0] === "estadoDocumento";
    const quiereAprobar = values?.estadoDocumento === "APROBADO";

    if (soloEstado && !quiereAprobar) return;

    await requireGestionOc(sesion, itemId, values);
    return;
  }
  if (boardKey === "ProveedoresBoard") {
    // Completar la ficha del proveedor es parte de emitir la orden (sin RUT ni
    // datos bancarios el documento sale incompleto).
    requireGeneradorOc(sesion);
    return;
  }
  if (boardKey === "BaseDeDatosMaterialesBoard" && op === "itemCreate") {
    // Dar de alta un material lo hace tanto quien carga un vale como quien emite
    // una orden y no encuentra el material en la base.
    if (tieneGeneradorOc(sesion)) return;
    requireVeRole(sesion, MATERIAL_WRITE_ROLES, { allowMissingRole: true });
  }
}

/**
 * Llamar antes de subir un archivo (upload/route.js).
 *
 * Cerrado por defecto: antes, un boardKey que no fuera uno de estos dos salia
 * sin lanzar nada, asi que cualquier sesion valida podia adjuntar archivos en
 * tableros sin regla. La app solo sube en dos lados -la foto del ingreso
 * (ingreso/page.jsx) y el PDF de la orden (uploadOcPdf en generador-oc/datos.js)-
 * asi que rechazar el resto no saca nada que se use hoy.
 *
 * Ademas se valida que columnId sea una columna declarada de ESE tablero. Venia
 * crudo del cliente, y de paso es lo que ata la subida al tablero correcto: los
 * ids de columna de monday son propios de cada tablero, asi que un itemId de
 * otro tablero (el boardKey lo manda el cliente y no se verificaba contra el
 * item) no tiene esta columna y la subida no puede aterrizar ahi.
 */
const COLUMNAS_UPLOAD_PERMITIDAS = {
  IngresosBoard: "foto",
  OrdenesDeCompraMaxxaBoard: "docOc",
};

export function verificarAccesoUpload(sesion, boardKey, { columnId } = {}) {
  if (boardKey === "IngresosBoard") {
    requireVeRole(sesion, INGRESO_ROLES);
  } else if (boardKey === "OrdenesDeCompraMaxxaBoard") {
    // El PDF de la orden se adjunta en la columna DOC OC del tablero de OCs.
    requireGeneradorOc(sesion);
  } else {
    throw new BoardAccessError("No se pueden subir archivos a ese tablero.");
  }

  const clavePermitida = COLUMNAS_UPLOAD_PERMITIDAS[boardKey];
  if (columnId !== resolveColumnId(boardKey, clavePermitida)) {
    throw new BoardAccessError("Esa columna no admite archivos desde la app.");
  }
}

/**
 * Llamar antes de entregar un archivo adjunto (archivo/route.js).
 *
 * Ese endpoint resuelve el `public_url` del asset, que es una URL firmada que
 * abre sin sesion de monday: quien la recibe se lleva el archivo. Antes solo
 * exigia sesion valida, de cualquier app y cualquier rol, sobre cualquier
 * boardKey/itemId/columna - asi que un bodeguero de Vale Express podia bajar
 * los contratos de los subcontratistas sabiendo el id.
 *
 * Hoy la app lo usa en un solo lugar: "Ver contrato firmado" del Portal
 * (ContractDetail.jsx), siempre sobre el tablero de contratos.
 *
 * Ademas verifica que ESE contrato sea del proveedor que lo pide. Antes no lo
 * hacia -el itemId viaja en la query string, asi que un subcontratista que
 * supiera el id se bajaba el contrato de cualquier otro-. Se resolvio contra el
 * nombre y no contra un id de proveedor en el JWT, que es lo que faltaba:
 * `filtroPortalDeSesion` ya sabe traducir la sesion a nombre + alias, y
 * `coincideConFiltro` es la MISMA comparacion que filtra las pantallas.
 *
 * Cuesta una consulta a monday por descarga, y solo para quien tiene filtro:
 * un admin o super admin sin filtro sale antes de pedirla.
 */
export async function verificarAccesoArchivo(sesion, boardKey, { itemId } = {}) {
  if (boardKey !== "FlujoContratacionSubcontratoBoard") {
    throw new BoardAccessError("No se pueden descargar archivos de ese tablero.");
  }

  // Valida de paso que la sesion tenga el Portal, y que un subcontratista tenga
  // proveedor asignado.
  const filtro = filtroPortalDeSesion(sesion);
  if (filtro.tipo === "todo") return;

  if (!itemId) throw new BoardAccessError("Falta el contrato sobre el que se pide el archivo.");

  const columnId = resolveColumnId("FlujoContratacionSubcontratoBoard", "proveedores");
  let datos;
  try {
    datos = await mondayFetch(
      `query ($itemId: [ID!]) {
        items(ids: $itemId) { column_values(ids: ${JSON.stringify([columnId])}) { id text value } }
      }`,
      { itemId: [String(itemId)] },
    );
  } catch (error) {
    console.error("[archivo] No se pudo verificar el proveedor del contrato:", error?.message);
    throw new BoardAccessError("No se pudo verificar tu permiso sobre este contrato.");
  }

  const columna = datos.items?.[0]?.column_values?.[0];
  if (!columna) throw new BoardAccessError("No se encontro ese contrato.");

  if (!coincideConFiltro(proveedorDeColumna(columna), filtro)) {
    throw new BoardAccessError("Ese contrato no es de tu proveedor.");
  }
}

/**
 * Llamar antes de entregar el PDF de una orden (generador-oc/documento/route.js).
 * Lo usa un solo boton, "Ver documento" del historial del Generador de OC
 * (OcHistorial.jsx -> VerDocumentoOc.jsx). Antes alcanzaba con tener sesion, de
 * cualquier app: se podia bajar el PDF de cualquier orden sabiendo el id.
 */
export function verificarAccesoDocumentoOc(sesion) {
  requireGeneradorOc(sesion);
}

/**
 * Que filas del Portal puede ver esta sesion.
 *
 * Este es el control que faltaba. Hasta ahora el filtro "este proveedor ve lo
 * suyo" lo armaba el NAVEGADOR y el servidor lo ejecutaba tal cual: editando
 * localStorage se podian pedir los datos de otro proveedor. Ahora sale de la
 * asignacion firmada en el JWT, que es el MISMO dato que el cliente venia
 * usando (buildPpSession copia appConfig.proveedorName a pp_session) - o sea
 * que no cambia lo que ve nadie, cambia quien lo decide.
 *
 * Devuelve:
 *   { tipo: "todo" }                    sin filtro
 *   { tipo: "id", id }                  por id de item de proveedor
 *   { tipo: "variantes", variantes }    por nombre, con los alias
 *
 * `pedido` es lo que manda la pantalla: solo se le hace caso a un super_admin,
 * que es el unico rol que legitimamente mira los datos de otro proveedor (su
 * pantalla de aterrizaje es justamente elegir cual, ver super-admin-filter).
 */
export function filtroPortalDeSesion(sesion, pedido = {}) {
  const asignacion = sesion?.asignaciones?.find((a) => a.app === PORTAL_APP) ?? null;
  if (!asignacion) throw new BoardAccessError("Tu cuenta no tiene acceso al Portal Proveedores.");

  const rol = asignacion.appRol;

  if (rol === "subcontratista") {
    const nombre = asignacion.appConfig?.proveedorName;
    if (!nombre) {
      throw new BoardAccessError("Tu cuenta no tiene un proveedor asignado. Avisale a un administrador.");
    }
    // Un subcontratista queda atado a SU proveedor pase lo que pase: lo que
    // mande la pantalla no se mira.
    return { tipo: "variantes", variantes: getAllVariants(nombre) };
  }

  if (rol === "super_admin") {
    if (pedido.proveedorId) return { tipo: "id", id: pedido.proveedorId };
    if (pedido.proveedor) return { tipo: "variantes", variantes: getAllVariants(pedido.proveedor) };
    return { tipo: "todo" };
  }

  // admin ve todos los proveedores por diseño. Un rol desconocido o sin rol cae
  // aca tambien: hoy el cliente hace lo mismo (getCacheKey devuelve 'all' y no
  // filtra), y endurecerlo dejaria afuera a cuentas que hoy entran sin
  // problema. Lo que este control cierra es que un SUBCONTRATISTA pueda pedir
  // lo de otro, que es el caso que importaba.
  return { tipo: "todo" };
}

/**
 * Las obras que esta sesion puede ver en Vale Express, o `null` si no tiene
 * restriccion. Es el equivalente server-side de getAllowedObras
 * (hooks/vale-express/useUserRole.js), con sus mismos casos permisivos: sin rol,
 * o con `restrictObras` apagado, se ve todo. Se replican a proposito - endurecer
 * eso aca dejaria afuera a cuentas que hoy entran sin problema.
 */
export function obrasPermitidas(sesion) {
  const asignacion = veAsignacion(sesion);
  if (!asignacion) return null;

  const rol = asignacion.appRol;
  if (!rol || rol === "super_admin" || rol === "admin") return null;

  const config = asignacion.appConfig ?? {};
  if (config.restrictObras !== true) return null;

  return Array.isArray(config.obras) ? config.obras : [];
}

/**
 * En que columna vive la obra, por tablero. Solo estos dos tienen filas que
 * pertenezcan a una obra puntual.
 */
const COLUMNA_OBRA = {
  ValesBoard: "obra",
  IngresosBoard: "obrabodega",
};

/**
 * Saca de la respuesta las filas de obras que esta sesion no tiene permitidas.
 *
 * El cliente pidio esta restriccion dos veces y fue explicito en que no era solo
 * para el desplegable: "que se aplique a todos los menus, vales, ingresos, etc"
 * y "que solo puedan visualizar las obras que tienen a su cargo". Hasta ahora se
 * aplicaba en el NAVEGADOR (vales-pendientes bajaba la pagina completa y despues
 * escondia lo ajeno), asi que los datos de las otras obras igual llegaban.
 *
 * Las tres lecturas que hoy tocan estos tableros piden la columna de obra, asi
 * que se puede filtrar por valor. OJO: una lectura nueva que NO la pida va a
 * quedar sin filas para un usuario restringido - por eso se avisa en el log en
 * vez de dejarlo pasar en silencio.
 */
export function filtrarPorObrasPermitidas(sesion, boardKey, items) {
  const columna = COLUMNA_OBRA[boardKey];
  if (!columna || !Array.isArray(items)) return items;

  const permitidas = obrasPermitidas(sesion);
  if (permitidas === null) return items;

  return items.filter((item) => {
    const obra = item[columna];
    if (obra === undefined) {
      console.warn(
        `[permisos] ${boardKey}: la consulta no pidio la columna "${columna}", ` +
          "asi que no se puede saber de que obra es la fila y se descarta. " +
          "Agregala a withColumns.",
      );
      return false;
    }
    return permitidas.includes(obra);
  });
}

/**
 * Llamar antes de devolver datos de UNA obra puntual (stock/route.js).
 *
 * Hasta ahora la restriccion por obra era solo cosmetica: llenaba el
 * desplegable de la pantalla, pero el servidor mandaba los datos de todas las
 * obras a cualquier sesion valida. Como el desplegable ya ofrece unicamente las
 * obras permitidas, exigirlo aca no cambia nada para quien usa la app
 * normalmente; cierra el paso a pedirla a mano.
 */
export function verificarAccesoObra(sesion, obra) {
  const permitidas = obrasPermitidas(sesion);
  if (permitidas === null) return;
  if (!permitidas.includes(obra)) {
    throw new BoardAccessError("Tu cuenta no tiene acceso a esa obra.");
  }
}

/** Llamar antes de un move_item_to_group crudo (graphql/route.js). */
export function verificarAccesoMoveGroup(sesion, boardKey) {
  if (boardKey === "ValesBoard") {
    requireVeRole(sesion, EDIT_VALES_ROLES);
  }
}

export function accesoBoardErrorToResponse(err) {
  if (!(err instanceof BoardAccessError)) throw err;
  return Response.json({ error: err.message, code: err.code }, { status: err.status });
}
