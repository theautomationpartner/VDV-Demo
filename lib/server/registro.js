import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { CABECERA_TRAZA, FORMA_TRAZA } from "@/lib/traza";

/**
 * Una linea de log por paso, con la traza de la operacion adentro.
 *
 * El formato es el que ya usaban lib/server/whitelist.js y
 * app/api/generador-oc/incidencia: el marcador AFUERA del JSON para poder
 * filtrar por "[generador-oc]" en Vercel, y todo lo demas adentro como JSON
 * para poder leerlo de un golpe. Lo unico que se agrega es `traza`.
 *
 * Se usa console.log y no console.error a proposito, salvo cuando algo
 * realmente fallo: Vercel marca como "Error" cualquier salida por stderr y
 * eso ensucia el panel de anomalias con pasos que salieron bien. Es el mismo
 * criterio de whitelist.js.
 */

/**
 * La traza vive aca y no en un parametro porque mondayFetch la necesita y esta
 * a cinco llamadas de distancia de la ruta. Pasarla a mano obligaria a tocar
 * los treinta sitios que le hablan a monday, que es justo lo que no queremos.
 *
 * AsyncLocalStorage es seguro aca: todas las rutas de la app corren en runtime
 * Node (ninguna declara `export const runtime = "edge"`).
 */
const contexto = new AsyncLocalStorage();

/** Envuelve el handler de una ruta para que todo lo de adentro vea la traza. */
export function conTraza(request, fn) {
  const cruda = request?.headers?.get?.(CABECERA_TRAZA) ?? "";
  const traza = FORMA_TRAZA.test(cruda) ? cruda : null;
  return contexto.run({ traza }, fn);
}

export function trazaActual() {
  return contexto.getStore()?.traza ?? null;
}

/**
 * Vercel corta cada linea en 256 KB y cada request en 1 MB. Un nombre de
 * material largo o el cuerpo de un error de monday se comen eso rapido, asi
 * que cada valor se recorta antes de escribirlo. Los numeros y booleanos pasan
 * tal cual; lo demas se vuelve texto.
 */
const TOPE_TEXTO = 300;

function acotar(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return texto.length > TOPE_TEXTO ? `${texto.slice(0, TOPE_TEXTO)}…(+${texto.length - TOPE_TEXTO})` : texto;
}

/**
 * @param {string} marca  el prefijo con el que se filtra en Vercel: "[generador-oc]", "[monday]"…
 * @param {string} evento que paso, en snake_case: "oc_item_creado", "linea_rechazada"…
 * @param {object} datos  lo minimo para entenderlo sin abrir el codigo
 */
export function registrar(marca, evento, datos = {}) {
  const cuerpo = { evento, traza: trazaActual() };
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === undefined) continue;
    cuerpo[clave] = acotar(valor);
  }
  console.log(marca, JSON.stringify(cuerpo));
}

/** Igual, pero por stderr: se ve como Error en Vercel y entra en las anomalias. */
export function registrarFalla(marca, evento, datos = {}) {
  const cuerpo = { evento, traza: trazaActual() };
  for (const [clave, valor] of Object.entries(datos)) {
    if (valor === undefined) continue;
    cuerpo[clave] = acotar(valor);
  }
  console.error(marca, JSON.stringify(cuerpo));
}
