/**
 * Que el desplegable de custodio mande la FICHA y no el nombre escrito.
 *
 *   node video-demo/probar-custodio-navegando.mjs
 *
 * Es lo unico de este cambio que no se puede probar llamando al servidor: el
 * desplegable vive en la pantalla, y lo que se arreglo es justamente que el
 * `value` de cada opcion dejara de ser el nombre para pasar a ser el id de la
 * ficha en Equipo VDV. Un test contra la API seguiria pasando con el
 * desplegable roto, porque el servidor acepta las dos formas.
 *
 * De paso comprueba lo que motivo todo el cambio: que el nombre que queda
 * guardado sea el DEL DIRECTORIO y no el que diga la pantalla.
 *
 * ESCRIBE EN MONDAY DE VERDAD y borra lo que crea, falle o no.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { levantarApp, cookieSesion } from "./comun.mjs";

const PUERTO = 3097;
const BASE = `http://localhost:${PUERTO}`;
const MAESTRO = "18430928907";
const MOVIMIENTOS = "18430928943";
const COL = {
  codigo: "text_mm7687am",
  estado: "color_mm76r560",
  tipoUbic: "color_mm765ngx",
  ubic: "color_mm76ncrk",
  categoria: "dropdown_mm76v0b9",
  custodio: "text_mm764j8g",
  custodioVdv: "board_relation_mm79270j",
};
const IDMAESTRO_EN_MOVIMIENTO = "text_mm761181";

/**
 * La persona con la que se prueba. En Equipo VDV figura en MINUSCULA, y eso es
 * a proposito: la pantalla muestra lo que diga el directorio, y lo que tiene
 * que quedar guardado es eso mismo, no una variante.
 */
const PERSONA = { nombre: "claudio leyton", ficha: "13070169485" };
const OBRA = "M388";

const TOKEN =
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .match(/^MONDAY_API_TOKEN=(.*)$/m)?.[1]
    ?.replace(/^"|"$/g, "") ?? "";

async function mon(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };
const comparar = (n, real, esp) =>
  String(real) === String(esp) ? ok(n) : falla(n, `esperaba ${JSON.stringify(esp)}, quedo ${JSON.stringify(real)}`);

// Si quedo un servidor de una corrida anterior, el nuevo muere con EADDRINUSE
// y el bucle de espera encuentra al VIEJO: la prueba corre contra otro build.
try {
  const s = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  for (const pid of new Set(s.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()))) {
    if (pid && pid !== "0") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch { /* nadie escuchando */ }

const aBorrar = [];
const { cerrar } = await levantarApp({ puerto: PUERTO });
let browser;

try {
  if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
    throw new Error(`la app no contesta en ${BASE}`);
  }

  const creada = await mon(
    `mutation($b:ID!,$n:String!,$v:JSON!){ create_item(board_id:$b,item_name:$n,column_values:$v){ id } }`,
    {
      b: MAESTRO,
      n: `ZZ TEST custodio ${Date.now()} (borrar)`,
      v: JSON.stringify({
        [COL.codigo]: "ZZ-CUST",
        [COL.estado]: { label: "DISPONIBLE" },
        [COL.tipoUbic]: { label: "BODEGA" },
        [COL.ubic]: { label: "BODEGA CENTRAL" },
        [COL.categoria]: { labels: ["Taladro"] },
      }),
    },
  );
  const herramientaId = creada.create_item.id;
  aBorrar.push(herramientaId);
  console.log(`  herramienta de prueba: ${herramientaId}\n`);

  browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-CL" });
  await ctx.addCookies([cookieSesion()]);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("hr_session", JSON.stringify({ role: "administrador", obras: [], restrictObras: false }));
    } catch { /* almacenamiento bloqueado */ }
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => falla("error de javascript en la pantalla", e.message.slice(0, 200)));

  await page.goto(`${BASE}/herramientas/${herramientaId}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(5000);

  await page.getByRole("button", { name: /Registrar salida/i }).first().click();
  await page.waitForTimeout(1500);

  // El desplegable tiene que estar cargado con la gente del directorio.
  const opciones = page.locator("#mov-custodio option");
  await opciones.nth(1).waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
  const cuantas = await opciones.count();
  cuantas > 1 ? ok(`el desplegable lista ${cuantas - 1} personas del directorio`) : falla("el desplegable", "quedo vacio");

  /**
   * LA COMPROBACION DEL CAMBIO: el `value` de cada opcion tiene que ser el id
   * de la ficha, no el nombre. Si volviera a ser el nombre, todo lo demas
   * seguiria funcionando igual y nadie se enteraria hasta que renombren a
   * alguien, que es cuando ya es tarde.
   */
  const valores = await opciones.evaluateAll((os) => os.slice(1).map((o) => o.value));
  const todosSonIds = valores.length > 0 && valores.every((v) => /^\d{6,}$/.test(v));
  todosSonIds
    ? ok("cada opcion vale el ID de la ficha, no el nombre")
    : falla("las opciones del desplegable", `valores: ${JSON.stringify(valores.slice(0, 4))}`);

  await page.locator("#mov-custodio").selectOption(PERSONA.ficha);
  await page.locator("select").filter({ hasText: OBRA }).first().selectOption(OBRA).catch(async () => {
    // El de destino no siempre es el primero; se busca por su opcion.
    const sels = page.locator("dialog select, [role=dialog] select");
    const n = await sels.count();
    for (let i = 0; i < n; i += 1) {
      const tiene = await sels.nth(i).locator(`option[value="${OBRA}"]`).count();
      if (tiene) { await sels.nth(i).selectOption(OBRA); return; }
    }
  });
  await page.waitForTimeout(500);

  const guardar = page.getByRole("button", { name: /Registrar|Confirmar|Guardar/i }).last();
  await guardar.click();
  await page.waitForTimeout(7000);

  // monday tarda en devolver lo recien escrito.
  await new Promise((r) => setTimeout(r, 5000));

  const leida = await mon(
    `query($i:[ID!]){ items(ids:$i){ column_values(ids:["${COL.custodio}","${COL.custodioVdv}"]){
       id text ... on BoardRelationValue { linked_item_ids } } } }`,
    { i: [String(herramientaId)] },
  );
  const cv = Object.fromEntries(leida.items[0].column_values.map((c) => [c.id, c]));

  comparar("el texto guarda el nombre DEL DIRECTORIO", cv[COL.custodio]?.text, PERSONA.nombre);
  comparar(
    "y el vinculo apunta a su ficha de Equipo VDV",
    (cv[COL.custodioVdv]?.linked_item_ids ?? []).join(","),
    PERSONA.ficha,
  );
} catch (error) {
  falla("se corto la prueba", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  try {
    const sobrantes = await mon(
      `query($b:ID!){ boards(ids:[$b]){ items_page(limit:200){ items{ id
         column_values(ids:["${IDMAESTRO_EN_MOVIMIENTO}"]){ text } } } } }`,
      { b: MOVIMIENTOS },
    );
    const mios = new Set(aBorrar.map(String));
    for (const it of sobrantes.boards[0].items_page.items) {
      if (mios.has(String(it.column_values[0]?.text ?? ""))) aBorrar.push(it.id);
    }
  } catch { /* se borra lo anotado */ }
  for (const id of new Set(aBorrar.map(String))) {
    await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: id })
      .then(() => console.log(`  borrado ${id}`))
      .catch((e) => console.log(`  NO SE PUDO BORRAR ${id}: ${e.message}`));
  }
  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
