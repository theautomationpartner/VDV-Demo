/**
 * Los roles de Control de Herramientas.
 *
 * Los definio el cliente en la llamada del 07-oct-2026, por rol Y por obra.
 * Son cuatro y cada uno puede todo lo del anterior, salvo una excepcion a
 * proposito: la valorizacion. Ver `puedeVerValorizacion` mas abajo.
 *
 *   jefe_obra       -> ve el listado de SU obra. No modifica nada.
 *   bodeguero       -> ademas registra movimientos, y ve las herramientas de
 *                      TODA la empresa (no solo las de su obra).
 *   oficina_tecnica -> ve todo, incluida la valorizacion. No modifica nada.
 *   administrador   -> todo.
 *
 * Se eligio una clave de app propia ("herramientas") en vez de colgarse de
 * vale-express: son permisos distintos -el bodeguero de materiales no es
 * necesariamente el que maneja herramientas- y mezclarlos obligaria a que
 * cualquiera que carga un vale vea el inventario entero.
 */

export const HERRAMIENTAS_APP = "herramientas";

export const HERRAMIENTAS_ROLES = [
  { value: "administrador", label: "Administrador" },
  { value: "oficina_tecnica", label: "Oficina Técnica" },
  { value: "bodeguero", label: "Bodeguero" },
  { value: "jefe_obra", label: "Jefe de Obra" },
];

/**
 * Las otras dos apps arrastran asignaciones viejas con super_admin/admin. Esta
 * app es nueva y no tiene historia que respetar, pero el panel de whitelist
 * ofrece esos dos roles para todas: si alguien los carga aca, se leen como
 * administrador en vez de dejar a la persona sin permisos.
 */
const ROLES_LEGADO = { super_admin: "administrador", admin: "administrador" };

/** El rol efectivo de una asignacion de Herramientas (traduce los legado). */
export function normalizarRolHerramientas(appRol) {
  if (!appRol) return null;
  return ROLES_LEGADO[appRol] ?? appRol;
}

/** Etiqueta para mostrar, incluidos los roles legado. */
export function etiquetaRolHerramientas(appRol) {
  const rol = normalizarRolHerramientas(appRol);
  return HERRAMIENTAS_ROLES.find((r) => r.value === rol)?.label ?? appRol;
}

/**
 * Puede ver el precio de compra y la depreciacion.
 *
 * Es el unico dato que un rol "mayor" ve y otro no, y por eso rompe la escalera:
 * el bodeguero registra movimientos -que el de oficina tecnica no puede- pero no
 * ve la plata. Textual del cliente: la valorizacion es para contabilidad y para
 * el seguro, y la mira el.
 */
export function puedeVerValorizacion(appRol) {
  const rol = normalizarRolHerramientas(appRol);
  return rol === "administrador" || rol === "oficina_tecnica";
}

/** Puede registrar movimientos, dar de alta y editar una ficha. */
export function puedeModificarHerramientas(appRol) {
  const rol = normalizarRolHerramientas(appRol);
  return rol === "administrador" || rol === "bodeguero";
}

/**
 * Ve el inventario de TODA la empresa, aunque su cuenta este restringida a
 * ciertas obras.
 *
 * Es un pedido explicito del cliente y no un descuido: el bodeguero necesita
 * saber que hay en las otras obras justamente para pedir prestado en vez de
 * arrendar. El jefe de obra no, el ve lo suyo.
 */
export function veTodaLaEmpresa(appRol) {
  const rol = normalizarRolHerramientas(appRol);
  return rol === "administrador" || rol === "oficina_tecnica" || rol === "bodeguero";
}

/** Los roles que ven la app, legado incluido. Lo usa el menu lateral. */
export const ROLES_QUE_VEN_HERRAMIENTAS = [
  ...HERRAMIENTAS_ROLES.map((r) => r.value),
  ...Object.keys(ROLES_LEGADO),
];

/** Los que ademas pueden tocar algo. */
export const ROLES_QUE_MODIFICAN_HERRAMIENTAS =
  ROLES_QUE_VEN_HERRAMIENTAS.filter(puedeModificarHerramientas);
