/**
 * Comprueba que se guarda lo correcto en `appConfig` para cada app.
 *
 *   npm run probar-appconfig
 *
 * Por que hace falta: esto estaba escrito como un encadenado de ternarios en el
 * medio del guardado, donde toda app que no fuera Vale Express ni el OC Tracker
 * caia en el caso del Portal. Cuando se sumo Herramientas, las obras elegidas en
 * el selector se descartaban al guardar y un Jefe de Obra seguia viendo el
 * inventario entero -lo encontro Mateo probando en Preview, no ningun test.
 *
 * No necesita red ni base: es una funcion pura.
 */
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-loader.mjs", pathToFileURL(import.meta.filename));
const { appConfigDeAsignacion } = await import("../lib/whitelist-appconfig.js");

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

console.log("\nLAS DOS APPS QUE ACOTAN POR OBRA");
for (const app of ["vale-express", "herramientas"]) {
  const r = appConfigDeAsignacion({ app, obras: "M388, FORESTAL", restrictObras: true });
  caso(`${app}: guarda las obras como lista`, () => assert.deepEqual(r.obras, ["M388", "FORESTAL"]));
  caso(`${app}: guarda que esta restringido`, () => assert.equal(r.restrictObras, true));
  caso(`${app}: NO guarda cosas del Portal`, () => assert.equal("proveedorName" in r, false));

  const sinObras = appConfigDeAsignacion({ app, obras: "", restrictObras: false });
  caso(`${app}: sin obras queda la lista vacia`, () => assert.deepEqual(sinObras.obras, []));
  caso(`${app}: sin obras no esta restringido`, () => assert.equal(sinObras.restrictObras, false));

  // Una obra con espacios de mas no puede quedar guardada con los espacios: el
  // recorte compara el texto exacto contra lo que dice la columna de monday.
  const conEspacios = appConfigDeAsignacion({ app, obras: "  M388 ,, FORESTAL  ", restrictObras: true });
  caso(`${app}: limpia espacios y entradas vacias`, () =>
    assert.deepEqual(conEspacios.obras, ["M388", "FORESTAL"]));
}

console.log("\nEL OC TRACKER");
const oc = appConfigDeAsignacion({ app: "generador-oc", mondayUserId: "123", apruebaCualquierOrden: true });
caso("guarda el usuario de monday como numero", () => assert.equal(oc.mondayUserId, 123));
caso("guarda si aprueba cualquier orden", () => assert.equal(oc.apruebaCualquierOrden, true));
caso("NO guarda obras", () => assert.equal("obras" in oc, false));

console.log("\nEL PORTAL");
const portal = appConfigDeAsignacion({ app: "portal-proveedor", proveedorName: " ACME ", pasosContrato: [{ paso: "x" }] });
caso("guarda el proveedor sin espacios", () => assert.equal(portal.proveedorName, "ACME"));
caso("guarda los pasos de contrato", () => assert.equal(portal.pasosContrato.length, 1));
caso("NO guarda obras", () => assert.equal("obras" in portal, false));

console.log(fallas ? `\n>>> ${fallas} FALLAS` : "\n>>> todo pasa");
process.exit(fallas ? 1 : 0);
