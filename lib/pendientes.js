/**
 * "Mis Pendientes": lo que espera una accion de ESTA persona, en un solo lugar.
 *
 * ## El problema, medido
 *
 * Sobre el tablero real de contratos: 83 contratos, 13 con algun visto bueno
 * pendiente, y uno de ellos parado 181 dias esperando el VB de Rep. Legal. No
 * es que nadie quiera darlo - es que para enterarte hay que entrar a Contratos,
 * elegir una obra, y desplegar los contratos de a uno, porque el panel de VB
 * solo existe adentro de la tarjeta abierta.
 *
 * ## El molde
 *
 * Cada FUENTE de pendientes contesta dos preguntas:
 *
 *   puedeDeber<X>(sesion)        -> esta persona, alguna vez, debe algo de esto
 *   pendientesDe<X>(datos, ...)  -> que debe hoy
 *
 * y devuelve items con la misma forma, para que la pantalla no sepa de donde
 * vienen. Hoy hay una sola fuente -contratos-, pero las otras dos ya estan
 * pedidas por los datos: ordenes de compra por aprobar, y los cinco VB de
 * estados de pago (290 de 291 tienen los tres primeros dados, o sea que el
 * circuito se usa de verdad). Entran sin tocar la pantalla.
 *
 * ## La regla que no se negocia
 *
 * Se lista SOLO lo que tiene un dueño designado.
 *
 * Nunca "todo lo que esta en estado pendiente". En el tablero de ordenes hay
 * 160 en PENDIENTE y 159 NO tienen aprobador asignado: son anteriores al
 * Generador. Listarlas seria reproducir en la home el mismo monton indistinto
 * del que el cliente se queja, y la pantalla se muere el primer dia. Lo que
 * esta pendiente pero sin dueño es un problema de datos y va aparte.
 *
 * ## Quien decide que me toca
 *
 * Las mismas funciones que dibujan el boton de aprobar: lib/contratos-vb.js,
 * compartido con el guardia del servidor. Si esta pantalla se armara su propio
 * criterio, en algun momento se separan y termina ofreciendo cosas que despues
 * no se pueden aprobar - o peor, escondiendo las que si.
 */

import {
  APROBADO,
  CON_OBS,
  mismaObra,
  esSuperAprobador,
  motivoBloqueo,
  pasoHabilitado,
  pasosAsignados,
  pasosEnContrato,
} from "@/lib/contratos-vb";
import { puedeAprobarOc, puedeEmitirOc } from "@/lib/oc-roles";

export const FUENTE_CONTRATOS = "contratos";
export const FUENTE_OC = "oc";

/** Un contrato dado de baja no le debe nada a nadie. */
function estaCerrado(contrato) {
  return /SIN EFECTO|CANCEL|FAILED/.test(String(contrato?.estadoContrato ?? "").toUpperCase());
}

function valorDelPaso(contrato, paso) {
  return String(contrato?.[paso.campo] ?? "").trim().toUpperCase();
}

function yaAprobado(contrato, paso) {
  return valorDelPaso(contrato, paso) === APROBADO;
}

/**
 * Ya lo revisaste y lo devolviste con observaciones.
 *
 * No es lo mismo que no haberlo mirado: la pelota esta del otro lado hasta que
 * el proveedor conteste. Salio de los datos reales - dos contratos de M388
 * estaban en CON OBS hace 32 dias y aparecian en "Para hacer ahora" igual que
 * uno recien llegado, sin ninguna diferencia en pantalla.
 */
function fueObservado(contrato, paso) {
  return valorDelPaso(contrato, paso) === CON_OBS;
}

/**
 * Hace cuantos dias que no se toca. Es el dato que convierte una lista en una
 * alarma: "VB Administrador" no dice nada, "VB Administrador, 74 dias" si.
 *
 * `updatedAt` puede llegar como Date (reviveDates lo convierte al leer la foto
 * del servidor) o como texto, segun quien lo pase.
 */
export function diasSinMovimiento(item) {
  const valor = item?.updatedAt ?? item?.updated_at;
  if (!valor) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - fecha.getTime()) / 86400000));
}

/**
 * Si esta persona puede deber un VB de contrato, sin mirar ningun contrato.
 *
 * Es a proposito independiente de la obra: sirve para decidir si mostrarle la
 * seccion, y no queremos recorrer los 83 contratos para saber si le ponemos un
 * link en el menu. Un subcontratista da false, que es lo que evita que la
 * bandeja sea su pantalla de entrada y este siempre vacia.
 */
export function puedeDeberContratos(sesionPortal) {
  if (!sesionPortal) return false;
  return esSuperAprobador(sesionPortal) || pasosAsignados(sesionPortal).length > 0;
}

/**
 * Lo que esta persona tiene que aprobar en contratos: UNA entrada por contrato.
 *
 * No una por paso. Se probo contra el tablero real y la diferencia decide si la
 * pantalla sirve: al super aprobador -que da los cinco VB y ademas puede
 * saltear el orden- le salian 37 filas para 13 contratos, con el mismo contrato
 * repetido tres veces (Administrador, Abogado, Rep. Legal). Eso es exactamente
 * el monton indistinto del que el cliente se queja.
 *
 * Como el circuito es secuencial, lo unico accionable en cada momento es el
 * paso que sigue: ese es el que se muestra. Si a la misma persona le tocan mas
 * pasos de ese contrato -pasa en las obras chicas, donde una sola persona es OT
 * y Administrador- se cuentan en `pasosExtra`, y con un clic los da todos
 * juntos: la pantalla de contratos ya dibuja una tarjeta por cada paso suyo.
 */
export function pendientesDeContratos(contratos, sesionPortal) {
  if (!puedeDeberContratos(sesionPortal)) return [];

  const items = [];
  for (const contrato of contratos ?? []) {
    if (estaCerrado(contrato)) continue;

    const mios = pasosEnContrato(sesionPortal, contrato.obra).filter(
      (paso) => !yaAprobado(contrato, paso),
    );
    if (mios.length === 0) continue;

    // PASOS_VB esta en orden, y pasosEnContrato lo respeta: el primero que
    // queda es el que sigue en el circuito.
    const paso = mios[0];
    const obra = contrato.obra || "Sin obra";
    items.push({
      clave: `contrato:${contrato.id}`,
      fuente: FUENTE_CONTRATOS,
      app: "portal-proveedor",
      titulo: contrato.name,
      obra,
      paso: paso.paso,
      accion: paso.label,
      pasosExtra: mios.length - 1,
      observado: fueObservado(contrato, paso),
      habilitado: pasoHabilitado(contrato, paso, sesionPortal),
      motivo: motivoBloqueo(contrato, paso, sesionPortal),
      dias: diasSinMovimiento(contrato),
      monto: Number(contrato.montoContratoBruto) || 0,
      // Abre la pantalla de contratos ya parada en la obra y con este
      // contrato desplegado: sin esto la bandeja te dice que hacer pero te
      // deja buscandolo a mano entre los contratos de la obra.
      href: `/portal-proveedor/contratos?obra=${encodeURIComponent(obra)}&contrato=${encodeURIComponent(contrato.id)}`,
    });
  }
  return ordenarPendientes(items);
}

/**
 * Los contratos que ya tienen sus cinco vistos buenos y esperan la firma.
 *
 * Sin esto el contrato DESAPARECE de la bandeja en cuanto se da el ultimo VB,
 * aunque el circuito no haya terminado: es lo que reporto Valentina. Hoy hay
 * dos asi, los dos con el documento ya abierto por el proveedor y sin firmar.
 *
 * No es un pendiente de quien mira: la firma la hace el representante legal del
 * proveedor, en una herramienta externa. Va en su propio grupo, marcado como no
 * accionable, por la misma razon que los devueltos con observaciones - una
 * bandeja que ofrece cosas que no se pueden hacer deja de mirarse, que es
 * exactamente como murio el dashboard general de contratos.
 */
export function contratosEsperandoFirma(contratos, sesionPortal) {
  if (!puedeDeberContratos(sesionPortal)) return [];

  const items = [];
  for (const contrato of contratos ?? []) {
    if (estaCerrado(contrato)) continue;

    // El MISMO criterio que usa la ficha del contrato en el Portal para dibujar
    // "Pendiente de firma": hay un documento mandado a firmar y todavia no
    // volvio firmado. No alcanza con que esten los cinco VB dados - el
    // documento se genera despues, y entre una cosa y la otra el contrato no
    // esta esperando al proveedor, esta esperando a VDV.
    //
    // La primera version pedia solo "mis pasos aprobados" y metia en este grupo
    // contratos en EN REVISION que ni siquiera se habian mandado: 10 filas
    // donde habia 2 reales.
    if (!contrato.contratoParaFirma) continue;
    if (contrato.contratoFirmado) continue;

    // Solo los que me tocan a mi: si no tuve nada que ver con ese contrato, su
    // firma tampoco es asunto mio.
    const mios = pasosEnContrato(sesionPortal, contrato.obra);
    if (mios.length === 0) continue;

    const obra = contrato.obra || "Sin obra";
    items.push({
      clave: `firma:${contrato.id}`,
      fuente: FUENTE_CONTRATOS,
      app: "portal-proveedor",
      titulo: contrato.name,
      obra,
      paso: "firma",
      accion: "Esperando la firma del proveedor",
      pasosExtra: 0,
      observado: false,
      habilitado: false,
      esperandoFirma: true,
      // Lo que dice GetSign: "Viewed by ..." es que lo abrio y no lo firmo.
      motivo: contrato.estadoFirmas ? `Estado de firma: ${contrato.estadoFirmas}` : null,
      dias: diasSinMovimiento(contrato),
      monto: Number(contrato.montoContratoBruto) || 0,
      href: `/portal-proveedor/contratos?obra=${encodeURIComponent(obra)}&contrato=${encodeURIComponent(contrato.id)}`,
    });
  }
  return items;
}

/**
 * Si esta persona puede tener ordenes de compra esperandola.
 *
 * Hace falta el vinculo con monday: la columna APROBADOR del tablero guarda un
 * usuario de monday, asi que sin `mondayUserId` no hay forma de saber cuales
 * son suyas.
 */
export function puedeDeberOc(sesionOc) {
  if (!sesionOc) return false;
  if (!(Number(sesionOc.mondayUserId) > 0)) return false;
  return puedeAprobarOc(sesionOc.role) || sesionOc.apruebaCualquierOrden === true;
}

/**
 * Si vale la pena traer las ordenes para esta persona.
 *
 * Mas amplio que puedeDeberOc a proposito: quien emite o edita ordenes no
 * aprueba ninguna, pero es exactamente quien puede entrar a las 160 sin
 * aprobador y designarles uno. Sin esto el aviso no le llegaria justamente a
 * claudio y a Isabel, que emitieron 140 de esas.
 */
export function puedeVerOc(sesionOc) {
  // Sin sesion de OC no hay nada que ver, punto. `puedeEmitirOc(undefined)`
  // daria true -normalizarRolOc trata un rol vacio como "aprobador", una
  // regla pensada para asignaciones VIEJAS que tenian appRol en null, no para
  // "no hay sesion"- y eso disparaba un pedido a /api/oc-tracker/datos para
  // cuentas que no tienen el OC Tracker asignado (el caso de Santiago, que
  // solo tiene el Portal).
  if (!sesionOc) return false;
  return puedeDeberOc(sesionOc) || puedeEmitirOc(sesionOc.role);
}

/**
 * Las ordenes que esperan la firma de esta persona.
 *
 * Solo donde figura como APROBADOR DESIGNADO. Quien tiene el comodin de
 * "aprobar cualquier orden" no ve aca las 160 en PENDIENTE: 159 no tienen
 * aprobador cargado -son anteriores al Generador- y listarlas seria devolver a
 * la home el mismo monton del que el cliente se queja. El comodin sirve para
 * poder firmar una orden ajena cuando hace falta, no para que le caigan todas.
 */
export function pendientesDeOc(ordenes, sesionOc) {
  if (!puedeDeberOc(sesionOc)) return [];
  const yo = String(sesionOc.mondayUserId);

  const items = [];
  for (const oc of ordenes ?? []) {
    if (String(oc.estadoDocumento ?? "").trim().toUpperCase() !== "PENDIENTE") continue;
    const aprobadores = oc.aprobadorIds ?? [];
    if (!aprobadores.includes(yo)) continue;

    const numero = String(oc.numeroOc ?? "").trim();
    items.push({
      clave: `oc:${oc.id}`,
      fuente: FUENTE_OC,
      app: "generador-oc",
      titulo: numero ? `OC ${numero} — ${oc.proveedores || "Sin proveedor"}` : oc.name,
      obra: oc.obra || "Sin obra",
      paso: "aprobar",
      accion: "Aprobar y firmar",
      pasosExtra: 0,
      observado: false,
      habilitado: true,
      motivo: null,
      dias: diasSinMovimiento(oc),
      monto: Number(oc.monto) || 0,
      moneda: oc.moneda || "CLP",
      // Deja el historial filtrado en esa orden: sin esto la bandeja te dice
      // cual firmar y te deja buscandola entre 452.
      href: numero ? `/generador-oc?oc=${encodeURIComponent(numero)}` : "/generador-oc",
    });
  }
  return items;
}

/**
 * Cuantas ordenes estan en PENDIENTE sin aprobador designado.
 *
 * Medido el 09-sep: de 161 en PENDIENTE, **160 no tienen aprobador**. Unas 138
 * son anteriores al Generador y 21 se emitieron entre el 20-ago y el 2-sep,
 * antes de que elegir aprobador fuera obligatorio. Nadie las tiene asignadas,
 * asi que nadie las va a firmar nunca por su cuenta.
 *
 * Se devuelve el NUMERO, no las filas. Listarlas seria volcar 160 lineas en la
 * bandeja de quien puede aprobar cualquier orden - exactamente el monton del
 * que el cliente se queja. Un renglon que dice cuantas son y lleva al Tracker
 * cuenta el problema sin tapar lo que si hay que hacer hoy.
 *
 * Lo ve quien puede hacer algo al respecto: quien aprueba cualquier orden -que
 * puede firmarlas- y quien emite o edita ordenes, que puede entrar a cada una y
 * designarle un aprobador. Un rol de Consulta no lo ve: seria un cartel de
 * alarma sobre algo que no puede tocar.
 *
 * Importa quien: Valentina, que fue la que reporto "tengo OC pendientes de
 * aprobar y no me aparecen", NO tiene el comodin. Con la regla acotada a los
 * comodines se habria quedado sin ver ni siquiera la explicacion.
 */
export function ocSinAprobador(ordenes, sesionOc) {
  // Mismo cuidado que en puedeVerOc: sin sesion, no.
  if (!sesionOc) return 0;
  const puede = sesionOc.apruebaCualquierOrden === true || puedeEmitirOc(sesionOc.role);
  if (!puede) return 0;
  return (ordenes ?? []).filter(
    (oc) =>
      String(oc.estadoDocumento ?? "").trim().toUpperCase() === "PENDIENTE" &&
      (oc.aprobadorIds ?? []).length === 0,
  ).length;
}

/**
 * Primero lo que se puede hacer ahora, y dentro de eso lo mas viejo arriba.
 *
 * Despues lo devuelto con observaciones -ya lo miraste, espera al proveedor- y
 * al final lo bloqueado por un paso anterior. Los dos se muestran igual, porque
 * sirven para ver donde esta trabado el circuito, pero no compiten por la
 * atencion con lo que si hay que hacer hoy.
 */
function prioridad(item) {
  if (item.esperandoFirma) return 2;
  if (!item.habilitado) return 3;
  return item.observado ? 1 : 0;
}

/**
 * Lo que de verdad hay que hacer hoy: ni lo devuelto con observaciones -espera
 * al proveedor- ni lo que todavia depende de un paso anterior.
 *
 * Vive aca y no en cada pantalla porque son dos los que lo cuentan: la bandeja
 * y el numero del menu lateral. Ya se separaron una vez -el menu decia 5 y la
 * pantalla 3- y es el tipo de diferencia que hace que nadie le crea al numero.
 */
export function paraHacerAhora(items) {
  return (items ?? []).filter((i) => i.habilitado && !i.observado);
}

export function ordenarPendientes(items) {
  return [...items].sort((a, b) => {
    const diferencia = prioridad(a) - prioridad(b);
    if (diferencia !== 0) return diferencia;
    return (b.dias ?? 0) - (a.dias ?? 0);
  });
}

/**
 * Si ALGUIEN -que no sea el super aprobador- tiene asignado ese paso en esa
 * obra. `cobertura` es lo que devuelve /api/contratos/cobertura.
 */
export function alguienCubre(cobertura, pasoClave, obra) {
  const entrada = cobertura?.pasos?.[pasoClave];
  if (!entrada) return false;
  if (entrada.todas) return true;
  return (entrada.obras ?? []).some((o) => mismaObra(o, obra));
}

/**
 * Marca los pendientes que estan cayendo en esta bandeja porque NADIE tiene ese
 * paso asignado en esa obra.
 *
 * Solo le pueden aparecer al super aprobador, y no hace falta comprobarlo: si
 * alguien mas ve el item es porque tiene el paso para esa obra, o sea que hay
 * cobertura por definicion. Cuando la consulta no se pudo hacer -o en demo, sin
 * base de usuarios- no se marca nada: decir "no lo tiene nadie" sin haberlo
 * podido verificar es peor que no decir nada.
 */
export function marcarSinCobertura(items, cobertura) {
  if (!cobertura || cobertura.sinRestriccion) return items;
  return items.map((item) =>
    alguienCubre(cobertura, item.paso, item.obra) ? item : { ...item, sinCobertura: true },
  );
}
