/**
 * Los tres caminos de SPM que ESCRIBEN: crear, mandar a cotizar y decidir.
 *
 *   npm run probar-spm-escrituras
 *
 * ESCRIBE EN MONDAY DE VERDAD. Crea una solicitud, la manda a cotizar, cambia
 * el estado de una cotizacion y lo deja todo como estaba.
 *
 * ================== EL FRENO ==================
 *
 * Mandar a cotizar despierta al escenario 1 de Make, que manda correos de
 * verdad desde heather@vergaradelvalle.com a proveedores de VDV. Por eso lo
 * PRIMERO que hace esta prueba es preguntarle a Make si ese escenario esta
 * apagado, y si esta prendido NO HACE NADA y lo dice.
 *
 * No alcanza con acordarse: ya salieron dos correos asi el 13-oct a las 9:32.
 *
 * Para correrla: apagar el switch en
 * https://us2.make.com/1848048/scenarios/6404553/edit
 * y volver a prenderlo al terminar.
 *
 * Lo que SI tiene que seguir prendido es el escenario 4 (correlativo), porque
 * parte de lo que se mide aca es si pelea con el numero que asigna la app.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { levantarApp, cookieSesion, CUENTA_TAP } from "./comun.mjs";

const PUERTO = 3096;
const BASE = `http://localhost:${PUERTO}`;

const SPM_BOARD = "18407094103";
const MAKE_TOKEN = "4d9fcef3-a1b8-4073-9fda-a20bd9f92535";
const ESCENARIO_QUE_MANDA_CORREOS = 6404553;
const ESCENARIO_CORRELATIVO = 6423446;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const deEnv = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";
const TOKEN = deEnv("MONDAY_API_TOKEN");

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

async function make(ruta) {
  const r = await fetch(`https://us2.make.com/api/v2${ruta}`, {
    headers: { Authorization: `Token ${MAKE_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Make ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${String(d).slice(0, 600)}` : ""}`); };
const comprobar = (n, cond, d) => (cond ? ok(n) : falla(n, d));
const titulo = (n) => console.log(`\n${n}\n`);

// ======================================================== EL FRENO, PRIMERO
titulo("0. EL FRENO: ¿está apagado el escenario que manda correos?");

const esc = await make(`/scenarios/${ESCENARIO_QUE_MANDA_CORREOS}`).then((d) => d.scenario ?? d);
if (esc.isActive) {
  console.log(`
  ABORTADO. El escenario "${esc.name}" está PRENDIDO.

  Si sigo, apretar "Mandar a cotizar" manda correos de verdad desde
  heather@vergaradelvalle.com a proveedores de VDV.

  Apagalo acá y volvé a correr:
  https://us2.make.com/1848048/scenarios/${ESCENARIO_QUE_MANDA_CORREOS}/edit
`);
  process.exit(1);
}
ok(`"${esc.name}" está apagado`);

const correlativo = await make(`/scenarios/${ESCENARIO_CORRELATIVO}`).then((d) => d.scenario ?? d);
comprobar(
  "y el del correlativo sigue prendido (se quiere ver si pelea con nuestro número)",
  correlativo.isActive,
  "está apagado: no se va a poder ver si sobrescribe el N° SPM",
);

/**
 * La ULTIMA corrida de un escenario, identificada por su id.
 *
 * Contar el largo de la lista no sirve: viene con tope (`pg[limit]`), asi que
 * cuando el escenario ya tiene mas corridas que el tope el numero no se mueve
 * nunca y la comparacion "antes vs despues" da siempre igual. Comparar el id
 * de la mas reciente si dice si hubo una nueva.
 */
const ultimaCorrida = async (id) => {
  const d = await make(`/scenarios/${id}/logs?pg[limit]=10`);
  const corridas = d.scenarioLogs ?? [];
  return corridas.length ? `${corridas[0].id}|${corridas[0].timestamp}` : null;
};

const corridasAntes = await ultimaCorrida(ESCENARIO_QUE_MANDA_CORREOS);
const correlativoAntes = await ultimaCorrida(ESCENARIO_CORRELATIVO);

// Como estaba el tablero antes de tocar nada.
const antes = await mon(
  `query($b:[ID!]){ boards(ids:$b){ items_count items_page(limit:100){ items{ id name } } } }`,
  { b: [SPM_BOARD] },
);
const idsAntes = new Set((antes.boards[0].items_page.items ?? []).map((i) => i.id));
console.log(`  (el tablero tiene ${antes.boards[0].items_count} solicitudes antes de empezar)`);

try {
  const s = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const pids = s.trim().split(String.fromCharCode(10)).map((l) => l.trim().split(" ").filter(Boolean).pop());
  for (const pid of new Set(pids)) {
    if (pid && pid !== "0") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch { /* nadie escuchando */ }

// Con la base de verdad: el numero sale de Neon y los permisos tambien.
const { cerrar } = await levantarApp({ puerto: PUERTO, conBaseReal: true });

let browser;
const creados = [];
let cotizacionTocada = null;

try {
  if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
    throw new Error(`la app no contesta en ${BASE}`);
  }

  browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-CL" });
  await ctx.addCookies([cookieSesion([{ app: "spm", appRol: "comprador" }], CUENTA_TAP)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => falla("error de javascript", e.message.slice(0, 200)));
  const texto = () => page.locator("body").innerText();

  // ===================================================== 1. CREAR
  titulo("1. CREAR UNA SOLICITUD");

  await page.goto(`${BASE}/spm/nueva`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByLabel("Buscar un material del catálogo").waitFor({ timeout: 60_000 });

  await page.locator("#spm-obra").selectOption("ZZ");
  await page.locator("#spm-cc").selectOption("MATERIALES GENERALES");

  // Un material del catalogo, buscado por CODIGO: es el camino nuevo.
  const unMaterial = (
    await mon(
      `query($b:[ID!]){ boards(ids:$b){ items_page(limit:1){ items{ name column_values(ids:["pulse_id_mm1h3kva"]){ text } } } } }`,
      { b: [deEnv("MONDAY_BOARD_BASE_DE_DATOS_MATERIALES")] },
    )
  ).boards[0].items_page.items[0];
  const codigo = unMaterial.column_values[0]?.text ?? "";

  const buscador = page.getByLabel("Buscar un material del catálogo");
  await buscador.fill(unMaterial.name.split(" ")[0]);
  const opcion = page
    .getByRole("button", { name: new RegExp(unMaterial.name.slice(0, 10).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
    .first();
  await opcion.waitFor({ timeout: 30_000 });
  await opcion.click();
  comprobar(`agrega "${unMaterial.name.slice(0, 28)}" del catálogo`, (await texto()).includes(unMaterial.name));

  await page.getByLabel(/Cantidad de/i).first().fill("7");

  // Un proveedor ocasional con un correo que NO es de nadie: si algun dia este
  // test corre con el escenario prendido, el correo no llega a un proveedor.
  await page.getByRole("button", { name: /Proveedor ocasional/i }).click();
  await page.waitForTimeout(400);
  await page.getByLabel(/Nombre del proveedor ocasional/i).fill("ZZ TEST No Enviar");
  await page.getByLabel(/Correos de ZZ TEST No Enviar/i).fill("zz-test-no-enviar@example.com");
  await page.waitForTimeout(500);

  const guardar = page.getByRole("button", { name: /Guardar borrador/i });
  comprobar("con todo completo el botón habilita", !(await guardar.isDisabled()));

  await guardar.click();
  await page.waitForURL(/\/spm\/\d+$/, { timeout: 90_000 });
  const idNuevo = page.url().split("/").pop();
  creados.push(idNuevo);
  ok(`la solicitud se creó y abre su ficha (${idNuevo})`);

  await page.getByText(/Materiales pedidos/).first().waitFor({ timeout: 60_000 });
  let t = await texto();
  const numeroEnPantalla = (t.match(/SPM-\d{3}/) ?? [])[0] ?? null;
  comprobar("tiene número", Boolean(numeroEnPantalla), t.slice(0, 300));
  comprobar("la línea de material está", t.includes(unMaterial.name), t.slice(0, 600));
  comprobar("con su cantidad", /\b7\b/.test(t));
  comprobar("y el destinatario con su correo", /zz-test-no-enviar@example\.com/.test(t));
  comprobar("queda en Borrador: no sale sola", /Borrador/.test(t));

  // ============================== 1b. ¿EL ESCENARIO 4 PISA NUESTRO NÚMERO?
  titulo("1b. ¿MAKE LE PISA EL NÚMERO?");

  const leerNumeros = async () =>
    (
      await mon(
        `query($i:[ID!]){ items(ids:$i){ column_values(ids:["text_mm7eawn","pulse_id_mm7ckn0j"]){ id text } } }`,
        { i: [idNuevo] },
      )
    ).items[0].column_values.reduce((o, c) => ({ ...o, [c.id]: c.text }), {});

  const recienCreado = await leerNumeros();
  console.log(`  apenas creada:  NUMERO SPM="${recienCreado.text_mm7eawn}"  N° SPM="${recienCreado.pulse_id_mm7ckn0j}"`);
  await new Promise((r) => setTimeout(r, 25_000)); // que corra el escenario 4
  const despues = await leerNumeros();
  console.log(`  25 s después:   NUMERO SPM="${despues.text_mm7eawn}"  N° SPM="${despues.pulse_id_mm7ckn0j}"`);

  /*
    Primero hay que comprobar que Make CORRIO. Sin esto la comprobacion de
    abajo es hueca: si el escenario no se desperto, el numero obviamente sigue
    igual y el test diria "ok" sin haber probado nada.
  */
  const correlativoDespues = await ultimaCorrida(ESCENARIO_CORRELATIVO);
  comprobar(
    "el escenario del correlativo se despertó al crear el item",
    correlativoDespues !== correlativoAntes,
    `la última corrida sigue siendo ${correlativoAntes}: no corrió, así que no se probó si pisa el número`,
  );
  comprobar(
    "y aun así NO pisó el número que puso la app",
    recienCreado.text_mm7eawn === despues.text_mm7eawn && despues.text_mm7eawn === numeroEnPantalla,
    `la app puso "${numeroEnPantalla}", en monday quedó "${despues.text_mm7eawn}"`,
  );

  // ===================================================== 2. MANDAR A COTIZAR
  titulo("2. MANDAR A COTIZAR (con Make apagado: no sale ningún correo)");

  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText(/Materiales pedidos/).first().waitFor({ timeout: 60_000 });

  const mandar = page.getByRole("button", { name: /Mandar a cotizar/i });
  comprobar("el botón está disponible para el rol comprador", await mandar.isVisible());
  await mandar.click();
  await page.waitForTimeout(6000);
  t = await texto();

  const enMonday = (
    await mon(`query($i:[ID!]){ items(ids:$i){ column_values(ids:["color_mm7fnd78"]){ text } } }`, { i: [idNuevo] })
  ).items[0].column_values[0].text;
  comprobar(`en monday la columna quedó en "Por enviar"`, enMonday === "Por enviar", `quedó en "${enMonday}"`);
  comprobar("y la pantalla lo muestra", /Por enviar/.test(t), t.slice(0, 600));

  // EL FRENO AL REENVIO: cada vez que la columna vuelve a "Por enviar", Make
  // reenvia a TODOS los proveedores. Paso en las pruebas del cliente.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText(/Materiales pedidos/).first().waitFor({ timeout: 60_000 });
  t = await texto();
  comprobar(
    "ya enviada, el botón de mandar desaparece y lo explica",
    !(await page.getByRole("button", { name: /^Mandar a cotizar$/i }).count()) &&
      /est[aá] saliendo|Ya se envi[oó]/i.test(t),
    t.slice(-500),
  );

  // Y que de verdad no se desperto Make.
  const corridasDespues = await ultimaCorrida(ESCENARIO_QUE_MANDA_CORREOS);
  comprobar(
    "NO se despertó Make: cero correos",
    corridasDespues === corridasAntes,
    `la última corrida era ${corridasAntes} y ahora es ${corridasDespues}: corrió, pudo haber salido un correo`,
  );

  // ================================================ 3. DECIDIR UNA COTIZACIÓN
  titulo("3. CAMBIAR EL ESTADO DE UNA COTIZACIÓN");

  await page.goto(`${BASE}/spm/cotizaciones`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByText(/Cotizaciones recibidas/).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(4000);

  const selector = page.locator("select[aria-label^='Estado de la cotización']").first();
  if (!(await selector.count())) {
    ok("no hay ninguna cotización cargada, así que no hay nada que decidir");
  } else {
    const etiqueta = await selector.getAttribute("aria-label");
    const original = await selector.inputValue();
    cotizacionTocada = { etiqueta, original };
    console.log(`  tocando: ${etiqueta} (estaba en "${original}")`);

    const nuevo = original === "Revisar" ? "Recibida" : "Revisar";
    await selector.selectOption(nuevo);
    await page.waitForTimeout(5000);
    const quedo = await page.locator(`select[aria-label="${etiqueta}"]`).inputValue();
    comprobar(`el estado cambia a "${nuevo}"`, quedo === nuevo, `quedó en "${quedo}"`);

    // Y se escribio en monday, no solo en la pantalla.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByText(/Cotizaciones recibidas/).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
    const trasRecargar = await page.locator(`select[aria-label="${etiqueta}"]`).inputValue();
    comprobar("y queda guardado después de recargar", trasRecargar === nuevo, `quedó en "${trasRecargar}"`);

    // Dejarlo como estaba.
    await page.locator(`select[aria-label="${etiqueta}"]`).selectOption(original);
    await page.waitForTimeout(5000);
    const vuelto = await page.locator(`select[aria-label="${etiqueta}"]`).inputValue();
    comprobar(`se devuelve a "${original}"`, vuelto === original, `quedó en "${vuelto}"`);
    cotizacionTocada = vuelto === original ? null : cotizacionTocada;
  }
} catch (error) {
  falla("se cortó la prueba", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});

  console.log("\n=== LIMPIEZA ===");
  for (const id of new Set(creados.map(String))) {
    await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: id })
      .then(() => console.log(`  borrada la solicitud ${id}`))
      .catch((e) => console.log(`  NO SE PUDO BORRAR ${id}: ${e.message.slice(0, 100)}`));
  }
  if (cotizacionTocada) {
    console.log(`  ATENCION: quedó una cotización en otro estado: ${cotizacionTocada.etiqueta} (era "${cotizacionTocada.original}")`);
    mal += 1;
  }

  const final = await mon(
    `query($b:[ID!]){ boards(ids:$b){ items_count items_page(limit:100){ items{ id name } } } }`,
    { b: [SPM_BOARD] },
  ).catch(() => null);
  const quedaron = (final?.boards?.[0]?.items_page?.items ?? []).filter((i) => !idsAntes.has(i.id));
  quedaron.length
    ? falla("quedó basura en el tablero", quedaron.map((i) => `${i.id} ${i.name}`).join(", "))
    : ok(`el tablero quedó como estaba (${final?.boards?.[0]?.items_count} solicitudes)`);

  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas`);
console.log(`\nACORDATE DE VOLVER A PRENDER:\nhttps://us2.make.com/1848048/scenarios/${ESCENARIO_QUE_MANDA_CORREOS}/edit\n`);
process.exit(mal === 0 ? 0 : 1);
