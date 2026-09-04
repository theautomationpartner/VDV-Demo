/**
 * El circuito de vistos buenos de un contrato: quien da cual, en que obras, y
 * en que orden.
 *
 * Vive aca -y no en el hook- porque lo necesitan los dos lados: la pantalla,
 * para no ofrecer lo que va a fallar, y el servidor, para hacerlo cumplir.
 *
 * ## Como se configura
 *
 * En la asignacion de Portal Proveedor de cada persona (Usuarios y Roles):
 *
 *   appConfig.pasosContrato  -> [{ paso: "ot", obras: ["M388", "FORESTAL"] }, ...]
 *   appConfig.superAprobador -> true / false
 *
 * `obras: []` significa TODAS. Es lo normal para APR, Abogado y Rep. Legal, que
 * segun el cliente son siempre la misma persona sea cual sea la obra; OT y
 * Administrador cambian por obra, y ahi la lista se llena.
 *
 * ## El super aprobador
 *
 * Puede dar los cinco pasos, en cualquier obra, y ademas SALTEAR EL ORDEN. Es
 * la excepcion que pidio el cliente para casos especiales, y hoy le corresponde
 * al Gerente General. Es una casilla y no una persona fija a proposito: el
 * requerimiento habla de "perfiles" en plural.
 */

/**
 * Los cinco vistos buenos, EN ORDEN.
 *
 * El orden no es una suposicion: se verifico contra los contratos del tablero y
 * ninguno tiene un VB dado antes que el anterior. Por eso un paso se habilita
 * solo si los anteriores ya estan en VB - asi nadie aprueba de mas por error al
 * ver los cinco juntos.
 *
 * `paso` es lo que se guarda en la asignacion del usuario; `campo` es la clave
 * de la columna en el schema del board.
 */
export const PASOS_VB = [
  { paso: "ot", campo: "vbOt", label: "VB Obra / Terreno" },
  { paso: "apr", campo: "vpApr", label: "VP Aprobación" },
  { paso: "administrador", campo: "vbAdministrador", label: "VB Administrador" },
  { paso: "abogado", campo: "vbAbogado", label: "VB Abogado" },
  { paso: "rep_legal", campo: "vbRepLegal", label: "VB Rep. Legal" },
];

export const APROBADO = "VB";
export const CON_OBS = "CON OBS";

/** El paso por su clave, o null. */
export function pasoPorClave(clave) {
  return PASOS_VB.find((p) => p.paso === clave) ?? null;
}

/** La columna del board que escribe cada paso. */
export function columnaDelPaso(clave) {
  return pasoPorClave(clave)?.campo ?? null;
}

export function esSuperAprobador(appConfig) {
  return appConfig?.superAprobador === true;
}

/**
 * Los pasos que tiene asignados una persona, normalizados.
 *
 * Acepta la forma vieja -`rolContrato`, un solo paso y todas las obras- para no
 * tener que migrar las asignaciones de produccion: se lee como un unico paso
 * sin restriccion de obra, que es exactamente lo que permitia. Al editar a esa
 * persona se guarda ya en la forma nueva.
 */
export function pasosAsignados(appConfig) {
  if (Array.isArray(appConfig?.pasosContrato)) {
    return appConfig.pasosContrato
      .filter((p) => p && pasoPorClave(p.paso))
      .map((p) => ({ paso: p.paso, obras: Array.isArray(p.obras) ? p.obras.filter(Boolean) : [] }));
  }
  const legado = appConfig?.rolContrato;
  if (legado && pasoPorClave(legado)) return [{ paso: legado, obras: [] }];
  return [];
}

/** Comparar obras sin que un espacio o una mayuscula decidan un permiso. */
function mismaObra(a, b) {
  return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
}

/**
 * Los pasos que esta persona puede dar EN ESTE CONTRATO, en el orden del
 * circuito.
 *
 * El super aprobador los tiene todos. Para el resto, un paso cuenta si esta
 * asignado y la obra del contrato entra en su lista (o la lista esta vacia, que
 * es "todas").
 */
export function pasosEnContrato(appConfig, obraDelContrato) {
  if (esSuperAprobador(appConfig)) return [...PASOS_VB];

  const asignados = pasosAsignados(appConfig).filter(
    (a) => a.obras.length === 0 || a.obras.some((o) => mismaObra(o, obraDelContrato)),
  );
  return PASOS_VB.filter((p) => asignados.some((a) => a.paso === p.paso));
}

/** true si ese VB ya esta dado. */
function yaAprobado(contrato, paso) {
  return String(contrato?.[paso.campo] ?? "").trim().toUpperCase() === APROBADO;
}

/**
 * Un paso se puede tocar si todavia no esta aprobado y todos los anteriores ya
 * estan en VB. El super aprobador se saltea lo segundo - es justamente para lo
 * que existe.
 */
export function pasoHabilitado(contrato, paso, appConfig) {
  if (!paso || !contrato) return false;
  if (yaAprobado(contrato, paso)) return false;
  if (esSuperAprobador(appConfig)) return true;

  const idx = PASOS_VB.findIndex((p) => p.paso === paso.paso);
  return PASOS_VB.slice(0, idx).every((p) => yaAprobado(contrato, p));
}

/** Por que NO se puede aprobar todavia - para explicarlo en pantalla. */
export function motivoBloqueo(contrato, paso, appConfig) {
  if (!paso) return null;
  if (yaAprobado(contrato, paso)) return "Ya diste tu visto bueno.";
  if (esSuperAprobador(appConfig)) return null;

  const idx = PASOS_VB.findIndex((p) => p.paso === paso.paso);
  const pendiente = PASOS_VB.slice(0, idx).find((p) => !yaAprobado(contrato, p));
  return pendiente ? `Falta el paso anterior: ${pendiente.label}.` : null;
}
