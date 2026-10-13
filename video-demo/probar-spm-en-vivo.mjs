/**
 * Que las solicitudes de SPM lleguen al navegador con la forma que espera
 * `pendientesDeSpm`, leyendolas por donde las va a leer la app de verdad.
 *
 *   node video-demo/probar-spm-en-vivo.mjs
 *
 * Es solo LECTURA: no escribe nada en monday.
 *
 * Lo que no pueden probar los tests de arriba es exactamente esto: que
 * `emisorVdv` venga con `linkedItems` y que `updatedAt` llegue. De esos dos
 * campos dependen las dos decisiones del modulo -de quien es la solicitud, y
 * hace cuanto esta colgada-, y los dos se pierden facil: en una columna de
 * conexion `text` y `value` vienen SIEMPRE null, asi que leerla como una
 * columna comun devuelve vacio sin dar ningun error.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { levantarApp, cookieSesion } from "./comun.mjs";

const PUERTO = 3097;
const BASE = `http://localhost:${PUERTO}`;

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };
const comprobar = (n, cond, d) => (cond ? ok(n) : falla(n, d));

// Un servidor de una corrida anterior se queda con el puerto y `levantarApp`
// no falla: encuentra al viejo contestando y mide contra otro build.
try {
  const s = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  for (const pid of new Set(s.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()))) {
    if (pid && pid !== "0") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch { /* nadie escuchando */ }

const { cerrar } = await levantarApp({ puerto: PUERTO });

try {
  if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
    throw new Error(`la app no contesta en ${BASE}`);
  }

  const galleta = cookieSesion([{ app: "spm", appRol: "usuario" }]);
  const pedir = (cuerpo) =>
    fetch(`${BASE}/api/monday/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `${galleta.name}=${galleta.value}` },
      body: JSON.stringify(cuerpo),
    });

  const COLS = ["numero", "obra", "envioCotizacion", "comparacion", "fechaEnvio", "emisorVdv"];
  const r = await pedir({
    boardKey: "SpmVdvBoard",
    op: "items",
    // `withRelations` es el que hace que la conexion vuelva con el id del item
    // en vez de solo el nombre. Es exactamente lo que pide el hook.
    params: { columns: COLS, withRelations: true, limit: 300 },
  });
  const json = await r.json().catch(() => ({}));
  comprobar("el tablero se puede leer", r.status === 200, `${r.status} ${JSON.stringify(json).slice(0, 200)}`);

  const items = json?.result?.items ?? json?.items ?? [];
  comprobar("devuelve solicitudes", items.length > 0, `vinieron ${items.length}`);
  if (!items.length) throw new Error("sin solicitudes no se puede comprobar la forma del dato");

  // Y la contracara: SIN withRelations la conexion vuelve como texto. Se
  // comprueba a proposito, porque es el modo por defecto y es el que dejaria la
  // bandeja vacia en silencio.
  const sinRel = await pedir({ boardKey: "SpmVdvBoard", op: "items", params: { columns: COLS, limit: 5 } })
    .then((x) => x.json())
    .catch(() => ({}));
  const muestraSinRel = (sinRel?.result?.items ?? [])[0]?.emisorVdv;
  comprobar(
    "sin withRelations la conexion vuelve como texto (por eso hay que pedirlo)",
    typeof muestraSinRel === "string" || muestraSinRel == null,
    `vino ${JSON.stringify(muestraSinRel)}`,
  );

  const conEmisor = items.filter((i) => (i.emisorVdv?.linkedItems?.length ?? 0) > 0);
  comprobar(
    "el emisor llega como VINCULO, no como texto",
    conEmisor.length > 0,
    `de ${items.length} solicitudes, ${conEmisor.length} traen linkedItems. Muestra: ${JSON.stringify(items[0]?.emisorVdv)}`,
  );
  comprobar(
    "y el vinculo trae el id de la ficha",
    /^\d{6,}$/.test(String(conEmisor[0]?.emisorVdv?.linkedItems?.[0]?.id ?? "")),
    JSON.stringify(conEmisor[0]?.emisorVdv?.linkedItems?.[0]),
  );

  const conFecha = items.filter((i) => i.updatedAt && !Number.isNaN(Date.parse(i.updatedAt)));
  comprobar(
    "updatedAt llega y es una fecha de verdad",
    conFecha.length === items.length,
    `${conFecha.length} de ${items.length}. Muestra: ${JSON.stringify(items[0]?.updatedAt)}`,
  );

  comprobar(
    "los estados llegan como texto de la etiqueta",
    items.every((i) => i.envioCotizacion === null || typeof i.envioCotizacion === "string"),
    JSON.stringify(items.map((i) => i.envioCotizacion)),
  );

  /**
   * El modulo en si (`pendientesDeSpm`) no se importa aca: usa los alias `@/`
   * y este script corre fuera del build, asi que el import falla en silencio.
   * De eso se encarga `npm run probar-pendientes-spm`, que si levanta el
   * loader de alias. Aca lo unico que se comprueba es la FORMA DEL DATO, que
   * es lo que ese otro test no puede ver.
   */
  console.log("\n  estado actual de las solicitudes:");
  for (const i of items) {
    console.log(`     ${String(i.numero ?? "-").padEnd(9)} envio=${String(i.envioCotizacion ?? "-").padEnd(16)} comparacion=${String(i.comparacion ?? "-").padEnd(18)} emisor=${i.emisorVdv?.linkedItems?.[0]?.name ?? "-"}`);
  }
} catch (error) {
  falla("se corto la prueba", error.message);
} finally {
  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
