/**
 * Las tres pantallas de SPM, apretando los botones.
 *
 *   node video-demo/probar-spm-navegando.mjs
 *
 * No llama a las rutas: usa la pantalla. Es lo que encuentra lo que el build no
 * ve -un import que falta, una lista que queda vacia, un boton que no habilita-
 * y lo que ya me salvo dos veces hoy: `withRelations`, que no falla sino que
 * devuelve otra cosa, y `parentId`, que directamente no existe.
 *
 * ESCRIBE EN MONDAY DE VERDAD y borra al final, pase lo que pase.
 *
 * NUNCA manda una solicitud a cotizar: eso despierta a Make y salen correos de
 * verdad desde heather@vergaradelvalle.com. El boton se comprueba mirando que
 * este, no apretandolo.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { levantarApp, cookieSesion } from "./comun.mjs";

const PUERTO = 3097;
const BASE = `http://localhost:${PUERTO}`;
const SPM = "18407094103";

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
const comprobar = (n, cond, d) => (cond ? ok(n) : falla(n, d));

try {
  const viejo = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const pids = viejo
    .trim()
    .split(String.fromCharCode(10))
    .map((l) => l.trim().split(" ").filter(Boolean).pop());
  for (const pid of new Set(pids)) {
    if (pid && pid !== "0") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch { /* nadie escuchando */ }

// `conBaseReal` porque el numero de solicitud sale de Neon.
const { cerrar } = await levantarApp({ puerto: PUERTO, conBaseReal: true });

const creados = [];
let browser;

try {
  if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
    throw new Error(`la app no contesta en ${BASE}`);
  }

  browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-CL" });
  await ctx.addCookies([
    cookieSesion([{ app: "generador-oc", appRol: "comprador" }], {
      uid: 31,
      email: "clients@theautomationpartner.com",
      nombre: "The Automation Partner",
    }),
  ]);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem(
        "og_session",
        JSON.stringify({ role: "comprador", email: "clients@theautomationpartner.com", userName: "The Automation Partner" }),
      );
    } catch { /* almacenamiento bloqueado */ }
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => falla("error de javascript en la pantalla", e.message.slice(0, 200)));

  // ----------------------------------------------------------- 1. el listado
  console.log("\n1. EL LISTADO\n");
  await page.goto(`${BASE}/spm`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(4000);

  const listado = await page.locator("body").innerText();
  comprobar("la pantalla carga", /Solicitudes de Material/.test(listado), listado.slice(0, 200));
  comprobar("no muestra el cartel de sin acceso", !/no tiene acceso/i.test(listado), listado.slice(0, 200));
  comprobar("lista las solicitudes que ya existen", /SPM-00/.test(listado), listado.slice(0, 300));
  comprobar("y muestra su estado de envio", /Enviado|Borrador/.test(listado));

  // --------------------------------------------------------- 2. el formulario
  console.log("\n2. NUEVA SOLICITUD\n");
  await page.getByRole("link", { name: /Nueva solicitud/i }).first().click();
  await page.waitForURL("**/spm/nueva", { timeout: 30_000 });
  await page.waitForTimeout(3000);

  const obras = page.locator("#spm-obra option");
  await obras.nth(1).waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
  const cuantasObras = await obras.count();
  comprobar(
    `las obras salen del dropdown de monday (${cuantasObras - 1})`,
    cuantasObras > 5,
    `vinieron ${cuantasObras - 1} obras`,
  );
  const cuantosCc = await page.locator("#spm-cc option").count();
  comprobar(`y los centros de costo tambien (${cuantosCc - 1})`, cuantosCc > 5);

  const faltaAlPrincipio = await page.locator("body").innerText();
  comprobar(
    "dice que falta antes de dejar guardar",
    /Falta:/.test(faltaAlPrincipio),
    faltaAlPrincipio.slice(-300),
  );
  comprobar(
    "el boton de guardar arranca deshabilitado",
    await page.getByRole("button", { name: /Guardar borrador/i }).isDisabled(),
  );

  await page.locator("#spm-obra").selectOption("ZZ");
  await page.locator("#spm-cc").selectOption("MATERIALES GENERALES");

  // Una linea que NO esta en el catalogo: es el camino con mas reglas.
  await page.getByRole("button", { name: /no está en el catálogo/i }).click();
  await page.waitForTimeout(400);
  await page.getByLabel(/Nombre del material que no está en el catálogo/i).fill("ZZ TEST cemento");
  await page.getByLabel(/Cantidad de/i).first().fill("12");
  await page.getByLabel("Unidad", { exact: true }).fill("saco");

  await page.getByRole("button", { name: /Proveedor ocasional/i }).click();
  await page.waitForTimeout(400);
  await page.getByLabel(/Nombre del proveedor ocasional/i).fill("ZZ TEST Proveedor");

  const sinCorreo = await page.locator("body").innerText();
  comprobar("avisa que sin correo no recibe nada", /Sin correo no va a recibir nada/.test(sinCorreo));

  await page.getByLabel(/Correos de ZZ TEST Proveedor/i).fill("no-es-un-mail");
  await page.waitForTimeout(300);
  comprobar(
    "y marca el correo mal escrito",
    /Revisá el formato/.test(await page.locator("body").innerText()),
  );

  await page.getByLabel(/Correos de ZZ TEST Proveedor/i).fill("zztest@example.com");
  await page.waitForTimeout(500);

  const guardar = page.getByRole("button", { name: /Guardar borrador/i });
  comprobar("con todo completo el boton habilita", !(await guardar.isDisabled()));

  await guardar.click();
  await page.waitForURL(/\/spm\/\d+$/, { timeout: 60_000 });
  const url = page.url();
  const nuevoId = url.split("/").pop();
  creados.push(nuevoId);
  ok(`la solicitud se creo y abre su ficha (${nuevoId})`);

  // -------------------------------------------------------------- 3. la ficha
  console.log("\n3. LA FICHA\n");
  await page.waitForTimeout(4000);
  const ficha = await page.locator("body").innerText();

  comprobar("muestra el numero", /SPM-\d{3}/.test(ficha), ficha.slice(0, 200));
  comprobar("dice quien la pidio", /la pidió/i.test(ficha), ficha.slice(0, 300));
  comprobar("queda en Borrador, no sale sola", /Borrador/.test(ficha));
  comprobar(
    "LA LINEA DE MATERIAL APARECE",
    /ZZ TEST cemento/.test(ficha),
    `esto es lo que fallaba filtrando por parentId. Pantalla: ${ficha.slice(0, 400)}`,
  );
  comprobar("con su cantidad y unidad en sus columnas", /12/.test(ficha) && /saco/.test(ficha));
  comprobar(
    "el nombre se muestra limpio, sin el prefijo tecnico",
    !/\[SC\]/.test(ficha) && /fuera de catálogo/.test(ficha),
    ficha.slice(0, 400),
  );
  comprobar("y el destinatario con su correo", /zztest@example\.com/.test(ficha));

  /**
   * El boton tiene que ESTAR, pero no se aprieta: apretarlo pone la columna en
   * "Por enviar" y Make manda los correos de verdad.
   */
  const botonMandar = page.getByRole("button", { name: /Mandar a cotizar/i });
  comprobar("el boton de mandar a cotizar esta disponible", await botonMandar.isVisible());
  comprobar(
    "y avisa que no se puede deshacer",
    /No se puede deshacer/i.test(ficha),
    ficha.slice(-300),
  );

  comprobar(
    "la ficha dice que todavia no contesto nadie",
    /Cuando se mande a cotizar/.test(ficha) || /no contestó nadie/i.test(ficha),
    ficha.slice(0, 500),
  );

  await page.screenshot({ path: "capturas/spm-ficha.png", fullPage: true });

  // ------------------------------------------------------- 4. las cotizaciones
  console.log(["", "4. COTIZACIONES", ""].join(String.fromCharCode(10)));
  await page.goto(`${BASE}/spm/cotizaciones`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(4000);
  const cot = await page.locator("body").innerText();

  comprobar("la pantalla carga", /Cotizaciones recibidas/.test(cot), cot.slice(0, 200));
  comprobar("no muestra el cartel de sin acceso", !/no tiene acceso/i.test(cot));
  comprobar(
    "agrupa por solicitud o avisa que no hay ninguna",
    /cotizaci(ó|o)n/i.test(cot),
    cot.slice(0, 400),
  );
  comprobar(
    "las que quedaron sin solicitud se marcan",
    !/Sin solicitud vinculada/.test(cot) || /no se pueden comparar/i.test(cot),
    cot.slice(0, 500),
  );
  await page.screenshot({ path: "capturas/spm-cotizaciones.png", fullPage: true });
  console.log("  captura: capturas/spm-cotizaciones.png");
  console.log("  captura: capturas/spm-ficha.png");
} catch (error) {
  falla("se corto la prueba", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  console.log("\n=== LIMPIEZA ===");
  for (const id of new Set(creados.map(String))) {
    await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: id })
      .then(() => console.log(`  borrada ${id}`))
      .catch((e) => console.log(`  NO SE PUDO BORRAR ${id}: ${e.message.slice(0, 80)}`));
  }
  const quedan = await mon(
    `query($b:[ID!]){ boards(ids:$b){ items_page(limit:200){ items{ id name } } } }`,
    { b: [SPM] },
  ).catch(() => null);
  const basura = (quedan?.boards?.[0]?.items_page?.items ?? []).filter((i) => / ZZ \| /.test(i.name));
  basura.length
    ? falla("quedo basura en el tablero", basura.map((i) => `${i.id} ${i.name}`).join(", "))
    : ok("no quedo ninguna solicitud de prueba");
  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
