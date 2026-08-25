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
  if (boardKey === "BaseDeDatosMaterialesBoard" && op === "itemCreate") {
    requireVeRole(sesion, MATERIAL_WRITE_ROLES, { allowMissingRole: true });
  }
}

/** Llamar antes de subir un archivo (upload/route.js). */
export function verificarAccesoUpload(sesion, boardKey) {
  if (boardKey === "IngresosBoard") {
    requireVeRole(sesion, INGRESO_ROLES);
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
