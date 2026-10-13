/**
 * Los roles de Solicitudes de Material (SPM).
 *
 * ES UNA APP APARTE, y no un pedazo del OC Tracker, por un motivo concreto: el
 * que PIDE materiales no es el que compra. Piden la oficina tecnica y los jefes
 * de obra; manda a cotizar y elige el que compra. Colgarla del Tracker la
 * dejaba fuera del alcance de la mitad de la gente que la usa.
 *
 * SON TRES ROLES, Y EL CORTE ESTA DONDE SALE LA PLATA Y EL CORREO:
 *
 *   solicitante  arma solicitudes y sigue las suyas. NO manda a cotizar.
 *   comprador    ademas manda a cotizar y elige la cotizacion ganadora.
 *   consulta     solo mira.
 *
 * La linea entre "solicitante" y "comprador" no es jerarquia, es consecuencia:
 * mandar a cotizar despierta a Make y salen correos de verdad a proveedores,
 * desde una casilla de VDV, y no se puede deshacer. Elegir la ganadora decide
 * una compra. Las dos cosas las hace la misma persona -quien compra-, y armar
 * la solicitud la hace cualquiera de la obra. Por eso el corte va ahi y no en
 * "editar / ver".
 *
 * "consulta" existe para el que necesita mirar precios sin poder pedir nada:
 * administracion, el jefe de un area que no compra. Sin ese rol, la unica forma
 * de darle acceso de lectura es darle tambien el poder de crear.
 */

export const SPM_APP = "spm";

export const SPM_ROLES = [
  { value: "solicitante", label: "Solicitante" },
  { value: "comprador", label: "Comprador" },
  { value: "consulta", label: "Consulta" },
];

/**
 * Los roles viejos y los genericos del panel de whitelist.
 *
 * El panel ofrece super_admin/admin para todas las apps porque las otras tres
 * arrastran asignaciones historicas. Y `usuario` era el unico rol que tenia
 * esta app antes de partirse en tres. Los tres caen en "comprador" -el mas
 * amplio- a proposito: quien ya tenia la app entera no puede perder permisos
 * de golpe por un cambio nuestro. Lo que no puede pasar es lo contrario, que un
 * rol desconocido se lea como mas poder del que le dieron, y eso no pasa: lo
 * que no esta en esta tabla ni en SPM_ROLES no es ningun rol.
 */
const ROLES_LEGADO = { super_admin: "comprador", admin: "comprador", usuario: "comprador" };

export function normalizarRolSpm(appRol) {
  if (!appRol) return null;
  const rol = ROLES_LEGADO[appRol] ?? appRol;
  return SPM_ROLES.some((r) => r.value === rol) ? rol : null;
}

export function etiquetaRolSpm(appRol) {
  const rol = normalizarRolSpm(appRol);
  return SPM_ROLES.find((r) => r.value === rol)?.label ?? appRol;
}

/** Los roles que ven la app, legado incluido. Lo usa el menu lateral. */
export const ROLES_QUE_VEN_SPM = [...SPM_ROLES.map((r) => r.value), ...Object.keys(ROLES_LEGADO)];

/**
 * Armar una solicitud. No manda nada ni compromete plata: queda en Borrador.
 */
export function puedeCrearSolicitud(appRol) {
  const rol = normalizarRolSpm(appRol);
  return rol === "solicitante" || rol === "comprador";
}

/**
 * Mandarla a cotizar. ES EL PERMISO CARO: salen correos de verdad a proveedores
 * desde una casilla de VDV y no hay vuelta atras.
 */
export function puedeEnviarACotizar(appRol) {
  return normalizarRolSpm(appRol) === "comprador";
}

/** Elegir o descartar una cotizacion. Es la decision de compra. */
export function puedeDecidirCotizacion(appRol) {
  return normalizarRolSpm(appRol) === "comprador";
}

/**
 * Por que no se puede, para poder decirlo en pantalla en vez de esconder un
 * boton. Esconder algo sin explicar por que es lo que genera el llamado.
 */
export function porQueNoPuedeEnviar(appRol) {
  const rol = normalizarRolSpm(appRol);
  if (rol === "comprador") return null;
  if (rol === "solicitante") {
    return "Tu rol arma solicitudes pero no las manda a cotizar. Avisale a quien compra.";
  }
  if (rol === "consulta") return "Tu rol es de consulta: podés mirar, no pedir.";
  return "Tu cuenta no tiene un rol válido en Solicitudes de Material.";
}
