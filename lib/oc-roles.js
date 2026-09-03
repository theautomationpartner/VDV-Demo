/**
 * Los roles del OC Tracker.
 *
 * En pantalla la app se llama "OC Tracker", pero en `asignaciones` sigue
 * guardada con la clave "generador-oc": renombrarla obligaria a migrar el JSON
 * de todas las cuentas de produccion y a tocar og_session, sin que el cliente
 * vea ninguna diferencia. El nombre visible sale de APP_LABELS en
 * app/admin/whitelist/page.jsx.
 *
 * Tres roles, y cada uno puede todo lo del anterior:
 *
 *   consulta   -> ve las cinco pantallas del Tracker, y nada mas
 *   comprador  -> ademas arma, emite, edita, rechaza y reabre ordenes
 *   aprobador  -> ademas aprueba
 *
 * Aprobar sigue decidiendose ORDEN POR ORDEN: el rol te habilita a ser elegido
 * como aprobador y a firmar, pero no te deja firmar cualquier orden. Esa regla
 * no cambio (requireGestionOc en lib/server/board-access-policy.js), y la
 * excepcion del Gerente General tampoco.
 *
 * Antes de esto la app tenia los mismos super_admin/admin que las otras dos y
 * los tres roles hacian exactamente lo mismo: emitir. Los roles no decidian
 * nada.
 */

export const OC_APP = "generador-oc";

export const OC_ROLES = [
  { value: "aprobador", label: "Aprobador" },
  { value: "comprador", label: "Comprador" },
  { value: "consulta", label: "Consulta" },
];

/**
 * Roles que ya no se ofrecen pero siguen cargados en cuentas de produccion. Se
 * leen como Aprobador -que es exactamente lo que podian hacer antes- asi nadie
 * pierde acceso de un dia para el otro; se van solos la proxima vez que se
 * edite a esa persona.
 *
 * Una asignacion SIN rol cae en el mismo caso, por el mismo motivo: hasta ahora
 * el rol de esta app no decidia nada, asi que puede haber asignaciones viejas
 * sin el.
 */
const ROLES_LEGADO = { super_admin: "aprobador", admin: "aprobador" };

/** El rol efectivo de una asignacion del OC Tracker (traduce los legado). */
export function normalizarRolOc(appRol) {
  if (!appRol) return "aprobador";
  return ROLES_LEGADO[appRol] ?? appRol;
}

/** Etiqueta para mostrar, incluidos los roles legado. */
export function etiquetaRolOc(appRol) {
  const rol = normalizarRolOc(appRol);
  return OC_ROLES.find((r) => r.value === rol)?.label ?? appRol;
}

/** Puede aprobar una orden (si ademas es el aprobador designado de ESA orden). */
export function puedeAprobarOc(appRol) {
  return normalizarRolOc(appRol) === "aprobador";
}

/** Puede emitir, editar, rechazar y reabrir ordenes. Consulta no. */
export function puedeEmitirOc(appRol) {
  const rol = normalizarRolOc(appRol);
  return rol === "aprobador" || rol === "comprador";
}

/**
 * Los valores de appRol que habilitan a emitir, LEGADO INCLUIDO. Es para los
 * lugares que comparan contra una lista en vez de llamar a puedeEmitirOc() -hoy
 * el menu lateral, que trabaja con listas de roles para las tres apps por
 * igual-. Sin los legado, alguien que todavia figura como super_admin se
 * quedaria sin el link para emitir.
 */
export const ROLES_QUE_EMITEN_OC = [
  ...OC_ROLES.map((r) => r.value),
  ...Object.keys(ROLES_LEGADO),
].filter((rol) => puedeEmitirOc(rol));
