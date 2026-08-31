import "server-only";

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
export function verificarAccesoMutacion(sesion, boardKey, { op, values } = {}) {
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
    // Dos escritores legitimos sobre el mismo tablero, con alcances distintos:
    //
    //  - OC Tracker (Control General) cambia SOLO el estado del documento, y no
    //    tiene asignacion propia en la whitelist: lo ve cualquier sesion valida.
    //    Se sigue permitiendo tal cual estaba, si no se rompe una pantalla que
    //    hoy funciona.
    //  - El Generador de OC crea la orden entera y toca todo lo demas.
    //
    // Se distinguen por las columnas del payload, que es el unico dato que
    // llega: si viene algo mas que `estadoDocumento`, hace falta la app.
    const claves = Object.keys(values ?? {});
    const soloEstado = op === "itemUpdate" && claves.length === 1 && claves[0] === "estadoDocumento";
    if (!soloEstado) requireGeneradorOc(sesion);
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

/** Llamar antes de subir un archivo (upload/route.js). */
export function verificarAccesoUpload(sesion, boardKey) {
  if (boardKey === "IngresosBoard") {
    requireVeRole(sesion, INGRESO_ROLES);
  }
  // El PDF de la orden se adjunta en la columna DOC OC del tablero de OCs.
  if (boardKey === "OrdenesDeCompraMaxxaBoard") {
    requireGeneradorOc(sesion);
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
