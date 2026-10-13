/**
 * Los roles de Solicitudes de Material (SPM).
 *
 * ES UNA APP APARTE, y no un pedazo del OC Tracker, por un motivo concreto: el
 * que PIDE materiales no es el que compra. Piden la oficina tecnica y los jefes
 * de obra; manda a cotizar y elige el que compra. Colgarla del Tracker la
 * dejaba fuera del alcance de la mitad de la gente que la usa.
 *
 * HOY TIENE UN SOLO ROL, Y ES A PROPOSITO. VDV todavia no definio quien puede
 * que: estan preguntadas las dos cosas que importan -quien puede mandarle la
 * solicitud a los proveedores, y si un jefe de obra ve solo su obra o todas-.
 * Inventar tres roles ahora seria decidir por el cliente algo que ya le
 * preguntamos, y despues tener que desarmarlo.
 *
 * Cuando conteste, esto se parte en tres y las pantallas no se tocan: ya
 * preguntan por `puedeCrear` y `puedeEnviar` en vez de mirar el rol a mano.
 *
 *   solicitante -> arma solicitudes y sigue las suyas
 *   comprador   -> ademas manda a cotizar, revisa y elige la ganadora
 *   consulta    -> solo lectura
 */

export const SPM_APP = "spm";

export const SPM_ROLES = [{ value: "usuario", label: "Usuario" }];

/**
 * El panel de whitelist ofrece super_admin/admin para todas las apps, porque
 * las otras tres arrastran asignaciones viejas. Esta app es nueva y no tiene
 * historia, pero si alguien carga uno de esos se lee como usuario en vez de
 * dejar a la persona sin permisos.
 */
const ROLES_LEGADO = { super_admin: "usuario", admin: "usuario" };

export function normalizarRolSpm(appRol) {
  if (!appRol) return null;
  return ROLES_LEGADO[appRol] ?? appRol;
}

export function etiquetaRolSpm(appRol) {
  const rol = normalizarRolSpm(appRol);
  return SPM_ROLES.find((r) => r.value === rol)?.label ?? appRol;
}

/** Los roles que ven la app, legado incluido. Lo usa el menu lateral. */
export const ROLES_QUE_VEN_SPM = [...SPM_ROLES.map((r) => r.value), ...Object.keys(ROLES_LEGADO)];

/**
 * Hoy, quien tiene la app puede todo. Quedan como funciones y no como `true`
 * suelto para que el dia que VDV conteste se cambie ACA, y no haya que ir a
 * buscar los botones repartidos por las pantallas.
 */
export function puedeCrearSolicitud(appRol) {
  return Boolean(normalizarRolSpm(appRol));
}

export function puedeEnviarACotizar(appRol) {
  return Boolean(normalizarRolSpm(appRol));
}

export function puedeDecidirCotizacion(appRol) {
  return Boolean(normalizarRolSpm(appRol));
}
