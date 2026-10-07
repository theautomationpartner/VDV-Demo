/**
 * Comprueba las reglas de permisos de Control de Herramientas sin levantar la
 * app ni tocar la base.
 *
 *   npm run probar-permisos-herramientas
 *
 * Por que hace falta: las dos reglas que decide este modulo -quien ve el precio
 * de compra y quien ve herramientas de otra obra- no se pueden probar entrando
 * a la app, porque haria falta una cuenta por cada rol. Aca se arma la sesion a
 * mano y se llama a la funcion que el servidor usa de verdad.
 *
 * No necesita token ni red: son funciones puras sobre la sesion y los items.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Va antes del import del modulo del servidor, y por eso ese import es
// dinamico: los estaticos se resuelven todos juntos antes de correr esta linea.
register("./alias-loader.mjs", pathToFileURL(import.meta.filename));

const { quitarColumnasRestringidas, filtrarPorObrasPermitidas } = await import(
  "../lib/server/board-access-policy.js"
);

const sesion = (app, appRol, appConfig) => ({ asignaciones: [{ app, appRol, appConfig }] });

const UNA = [
  {
    id: "1",
    name: "TALADRO",
    codigo: "HRR-0001",
    valorCompra: 699990,
    fechaCompra: "2026-01-02",
    ubicacionActual: "M388",
  },
];

let fallas = 0;
function caso(nombre, fn) {
  try {
    fn();
    console.log("  ok    " + nombre);
  } catch (error) {
    fallas += 1;
    console.log("  FALLA " + nombre + "\n        " + error.message.split("\n")[0]);
  }
}

console.log("\nVALORIZACION - quien ve el precio de compra");
const ve = (s) => "valorCompra" in quitarColumnasRestringidas(s, "ControlHerramientasBoard", UNA)[0];
caso("Administrador la ve", () => assert.equal(ve(sesion("herramientas", "administrador")), true));
caso("Oficina Tecnica la ve", () => assert.equal(ve(sesion("herramientas", "oficina_tecnica")), true));
caso("super_admin legado la ve", () => assert.equal(ve(sesion("herramientas", "super_admin")), true));
caso("Bodeguero NO la ve", () => assert.equal(ve(sesion("herramientas", "bodeguero")), false));
caso("Jefe de Obra NO la ve", () => assert.equal(ve(sesion("herramientas", "jefe_obra")), false));
caso("sin la app NO la ve", () => assert.equal(ve(sesion("vale-express", "super_admin")), false));
caso("sin sesion NO la ve", () => assert.equal(ve(null), false));
caso("tampoco la fecha de compra", () =>
  assert.equal(
    "fechaCompra" in
      quitarColumnasRestringidas(sesion("herramientas", "bodeguero"), "ControlHerramientasBoard", UNA)[0],
    false,
  ));
caso("no toca otros tableros", () =>
  assert.equal(
    "valorCompra" in quitarColumnasRestringidas(sesion("herramientas", "jefe_obra"), "ValesBoard", UNA)[0],
    true,
  ));
caso("no muta el original", () => assert.equal(UNA[0].valorCompra, 699990));

console.log("\nOBRAS - quien ve herramientas de otra obra");
const TRES = [
  { id: "1", ubicacionActual: "M388" },
  { id: "2", ubicacionActual: "FORESTAL" },
  { id: "3", ubicacionActual: "BODEGA CENTRAL" },
];
const cuantas = (s) => filtrarPorObrasPermitidas(s, "ControlHerramientasBoard", TRES).length;
const soloM388 = { obras: ["M388"], restrictObras: true };
caso("Jefe de Obra acotado ve solo la suya", () =>
  assert.equal(cuantas(sesion("herramientas", "jefe_obra", soloM388)), 1));
// Pedido explicito del cliente: necesita ver que hay en las otras obras para
// pedir prestado en vez de arrendar.
caso("Bodeguero acotado ve TODA la empresa", () =>
  assert.equal(cuantas(sesion("herramientas", "bodeguero", soloM388)), 3));
caso("Oficina Tecnica acotada ve todo", () =>
  assert.equal(cuantas(sesion("herramientas", "oficina_tecnica", soloM388)), 3));
caso("Administrador ve todo", () => assert.equal(cuantas(sesion("herramientas", "administrador", soloM388)), 3));
caso("Jefe de Obra sin restringir ve todo", () =>
  assert.equal(cuantas(sesion("herramientas", "jefe_obra", { obras: ["M388"], restrictObras: false })), 3));
// Una consulta que se olvide de pedir `ubicacionActual` no puede devolver todo:
// se descarta la fila y se avisa en el log. Ver filtrarPorObrasPermitidas.
caso("fila sin obra se descarta", () =>
  assert.equal(
    filtrarPorObrasPermitidas(sesion("herramientas", "jefe_obra", soloM388), "ControlHerramientasBoard", [
      { id: "9" },
    ]).length,
    0,
  ));

console.log(fallas ? `\n>>> ${fallas} FALLAS` : "\n>>> todo pasa");
process.exit(fallas ? 1 : 0);
