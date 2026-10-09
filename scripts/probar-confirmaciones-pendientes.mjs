/**
 * Comprueba la fuente nueva de "Mis Pendientes": las herramientas que llegaron
 * a una obra y nadie confirmo que recibio.
 *
 *   npm run probar-confirmaciones
 *
 * Lo que de verdad hay que proteger aca son dos cosas:
 *
 * 1. Que no le aparezca a quien NO puede confirmar. El Jefe de Obra ve el
 *    inventario pero no tiene el boton: ponerselo en la bandeja seria mandarlo
 *    a una pantalla donde no puede hacer nada.
 * 2. Que al Bodeguero le caigan las de SUS obras y no las de las ocho. El ve el
 *    inventario de toda la empresa -pedido del cliente- pero eso es para poder
 *    pedir prestado, no para hacerse cargo de todo. Es el mismo recorte que ya
 *    hace la alerta de arriendos.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-loader.mjs", pathToFileURL(import.meta.filename));

const {
  confirmacionesPendientes,
  puedeDeberConfirmaciones,
  ordenarPendientes,
  paraHacerAhora,
  FUENTE_HERRAMIENTAS,
} = await import("../lib/pendientes.js");

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };
const comparar = (n, real, esperado) =>
  real === esperado ? ok(n) : falla(n, `esperaba ${JSON.stringify(esperado)}, vino ${JSON.stringify(real)}`);

/** La sesion de Herramientas tal cual la guarda el login en `hr_session`. */
const sesion = (role, extra = {}) => ({ role, ...extra });

const ADMIN = sesion("administrador");
const BODEGUERO = sesion("bodeguero");
const BODEGUERO_M388 = sesion("bodeguero", { restrictObras: true, obras: ["M388"] });
const JEFE_OBRA = sesion("jefe_obra");
const OFICINA = sesion("oficina_tecnica");
const LEGADO = sesion("super_admin");

/**
 * Un dia de calendario chileno, no "ahora menos N por 86400000": si no, el
 * resultado del test cambia segun la hora a la que se corra, porque
 * `toISOString()` da el dia UTC y en Chile eso ya es mañana despues de las 20.
 */
const DIA_EN_CHILE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const hace = (dias) => {
  const [a, m, d] = DIA_EN_CHILE.format(new Date()).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
};

/** Un movimiento como lo devuelve la API, ya filtrado por recepcion=Pendiente. */
const movimiento = (extra = {}) => ({
  id: "100",
  idMaestro: "900",
  codigo: "HRR-0042",
  herramienta: "Taladro Bosch GSB 13 RE",
  tipoMovimiento: "Salida",
  fechaMovimiento: hace(3),
  obra: "M388",
  origen: "Bodega Central",
  destino: "M388",
  recibeCustodio: "Claudio Leyton",
  recepcion: "Pendiente",
  ...extra,
});

console.log("\nQUIEN PUEDE DEBER UNA CONFIRMACION\n");

comparar("el administrador si", puedeDeberConfirmaciones(ADMIN), true);
comparar("el bodeguero si", puedeDeberConfirmaciones(BODEGUERO), true);
comparar("oficina tecnica NO (no puede confirmar)", puedeDeberConfirmaciones(OFICINA), false);
comparar("el jefe de obra NO (no puede confirmar)", puedeDeberConfirmaciones(JEFE_OBRA), false);
comparar("super_admin legado si", puedeDeberConfirmaciones(LEGADO), true);
comparar("sin sesion no", puedeDeberConfirmaciones(null), false);

console.log("\nQUE LE LLEGA A CADA UNO\n");

const tres = [
  movimiento({ id: "1", destino: "M388", obra: "M388" }),
  movimiento({ id: "2", destino: "RAFAEL CAÑAS", obra: "RAFAEL CAÑAS" }),
  movimiento({ id: "3", destino: "FORESTAL", obra: "FORESTAL" }),
];

comparar("el administrador ve las tres", confirmacionesPendientes(tres, ADMIN).length, 3);
comparar("el bodeguero sin restriccion ve las tres", confirmacionesPendientes(tres, BODEGUERO).length, 3);

const delBodegueroM388 = confirmacionesPendientes(tres, BODEGUERO_M388);
comparar("el bodeguero de M388 ve solo la suya", delBodegueroM388.length, 1);
comparar("y es la de su obra", delBodegueroM388[0]?.obra, "M388");

comparar("al jefe de obra no le llega ninguna", confirmacionesPendientes(tres, JEFE_OBRA).length, 0);
comparar("a oficina tecnica tampoco", confirmacionesPendientes(tres, OFICINA).length, 0);
comparar("sin sesion, ninguna", confirmacionesPendientes(tres, null).length, 0);
comparar("sin movimientos, ninguna", confirmacionesPendientes([], ADMIN).length, 0);
comparar("con undefined, ninguna", confirmacionesPendientes(undefined, ADMIN).length, 0);

console.log("\nLO QUE YA ESTA CONFIRMADO NO ENTRA\n");

/**
 * El filtro del servidor ya los deja afuera, pero se vuelve a mirar aca: una
 * fila confirmada colada en la bandeja manda a alguien a apretar un boton que
 * ya no existe, que es justo lo que esta bandeja intenta no hacer nunca.
 */
comparar(
  "una confirmada no entra",
  confirmacionesPendientes([movimiento({ recepcion: "Confirmada" })], ADMIN).length,
  0,
);
comparar(
  "una con la celda vacia tampoco",
  confirmacionesPendientes([movimiento({ recepcion: null })], ADMIN).length,
  0,
);
comparar(
  "ni una con el texto en blanco",
  confirmacionesPendientes([movimiento({ recepcion: "" })], ADMIN).length,
  0,
);

console.log("\nCOMO SE VE LA FILA\n");

const [fila] = confirmacionesPendientes([movimiento()], ADMIN);

comparar("la fuente la identifica", fila.fuente, FUENTE_HERRAMIENTAS);
comparar("el titulo lleva la herramienta y el codigo", fila.titulo, "Taladro Bosch GSB 13 RE — HRR-0042");
comparar("la accion dice que hacer", fila.accion, "Confirmar que llegó");
comparar("la obra es el destino", fila.obra, "M388");
comparar("lleva los dias desde el movimiento", fila.dias, 3);
comparar("el link va a la ficha de la herramienta", fila.href, "/herramientas/900");
comparar("esta habilitada", fila.habilitado, true);
comparar("no es una observacion", fila.observado, false);
comparar("no muestra plata", fila.monto, 0);
fila.motivo.includes("Bodega Central") && fila.motivo.includes("Claudio Leyton")
  ? ok("el motivo dice de donde vino y a nombre de quien")
  : falla("el motivo dice de donde vino y a nombre de quien", fila.motivo);

/** Sin custodio -una devolucion a bodega- el motivo no puede quedar colgado. */
const [sinCustodio] = confirmacionesPendientes(
  [movimiento({ tipoMovimiento: "Devolución", recibeCustodio: null, destino: "Bodega Central", origen: "M388" })],
  ADMIN,
);
sinCustodio.motivo.includes("a nombre de")
  ? falla("sin custodio el motivo no inventa un nombre", sinCustodio.motivo)
  : ok("sin custodio el motivo no inventa un nombre");
comparar("y la obra es la bodega", sinCustodio.obra, "Bodega Central");

/** Sin herramienta ni codigo no puede quedar un titulo vacio. */
const [pelado] = confirmacionesPendientes([movimiento({ herramienta: null, codigo: null })], ADMIN);
comparar("sin nombre ni codigo, titulo generico", pelado.titulo, "Herramienta");
comparar("sin idMaestro, link al listado", confirmacionesPendientes([movimiento({ idMaestro: null })], ADMIN)[0].href, "/herramientas");

console.log("\nCASOS BORDE\n");

/**
 * Un movimiento sin obra NO se esconde. Hoy no deberia pasar -las tres acciones
 * que piden confirmacion piden destino- pero si pasara, esconderselo al unico
 * que puede arreglarlo es peor que mostrarselo de mas.
 */
comparar(
  "un pendiente sin obra igual aparece",
  confirmacionesPendientes([movimiento({ obra: null, destino: null })], BODEGUERO_M388).length,
  1,
);

comparar(
  "sin fecha, los dias quedan en null y no en 0",
  confirmacionesPendientes([movimiento({ fechaMovimiento: null })], ADMIN)[0].dias,
  null,
);
comparar(
  "una fecha rota tampoco inventa un numero",
  confirmacionesPendientes([movimiento({ fechaMovimiento: "ayer" })], ADMIN)[0].dias,
  null,
);
comparar(
  "el mismo dia son 0 dias",
  confirmacionesPendientes([movimiento({ fechaMovimiento: hace(0) })], ADMIN)[0].dias,
  0,
);

/** Dos movimientos de la misma herramienta son dos filas distintas. */
const dos = confirmacionesPendientes(
  [movimiento({ id: "7" }), movimiento({ id: "8" })],
  ADMIN,
);
comparar("dos movimientos, dos filas", dos.length, 2);
comparar("con claves distintas", new Set(dos.map((f) => f.clave)).size, 2);

console.log("\nSE MEZCLA BIEN CON EL RESTO DE LA BANDEJA\n");

const otros = [
  { clave: "c:1", titulo: "Contrato viejo", habilitado: true, observado: false, dias: 90 },
  { clave: "c:2", titulo: "Observado", habilitado: true, observado: true, dias: 200 },
  { clave: "c:3", titulo: "Bloqueado", habilitado: false, observado: false, dias: 300 },
];
const todo = ordenarPendientes([...otros, ...confirmacionesPendientes([movimiento()], ADMIN)]);

comparar("lo bloqueado y lo observado quedan abajo", todo.at(-1).clave, "c:3");
comparar("cuenta para 'hacer ahora'", paraHacerAhora(todo).some((i) => i.fuente === FUENTE_HERRAMIENTAS), true);
comparar("el contador suma 2 (el contrato y la confirmacion)", paraHacerAhora(todo).length, 2);

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
