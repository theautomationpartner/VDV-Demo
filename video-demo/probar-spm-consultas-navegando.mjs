/**
 * Las tres pantallas nuevas de SPM, apretando los botones.
 *
 *   node video-demo/probar-spm-consultas-navegando.mjs
 *
 * ES SOLO LECTURA: no escribe nada en monday y no toca ninguna solicitud.
 *
 * Lo que de verdad hay que comprobar aca no es que carguen: es que los NUMEROS
 * sean los del tablero entero y no los de la pagina que llego primero. La app
 * del cliente dice "6 sin correo en esta vista" sobre los 25 que tiene a mano,
 * y los que no tienen correo son 60. Un numero a medias se lee como el total.
 *
 * Por eso cada comprobacion de conteo se mide contra monday en la misma
 * corrida, no contra una constante escrita aca: si el cliente carga proveedores
 * mañana, el test sigue valiendo.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { levantarApp, cookieSesion } from "./comun.mjs";

const PUERTO = 3098;
const BASE = `http://localhost:${PUERTO}`;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const deEnv = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";
const TOKEN = deEnv("MONDAY_API_TOKEN");
const BOARD_MATERIALES = deEnv("MONDAY_BOARD_BASE_DE_DATOS_MATERIALES");
const BOARD_PROVEEDORES = deEnv("MONDAY_BOARD_PROVEEDORES");

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

// Un servidor de una corrida anterior se queda con el puerto y `levantarApp` no
// falla: encuentra al viejo contestando y mide contra otro build.
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

const { cerrar } = await levantarApp({ puerto: PUERTO });

let browser;
try {
  if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
    throw new Error(`la app no contesta en ${BASE}`);
  }

  // --------------------------------------------- la verdad, sacada de monday
  console.log("\n0. LO QUE DICE MONDAY (contra esto se mide todo)\n");

  const cuenta = async (board) =>
    (await mon(`query($b:[ID!]){ boards(ids:$b){ items_count } }`, { b: [board] })).boards[0].items_count;

  const totalMateriales = await cuenta(BOARD_MATERIALES);
  const totalProveedores = await cuenta(BOARD_PROVEEDORES);

  // Y cuantos proveedores no tienen correo, de verdad, sobre el tablero entero.
  let proveedores = [];
  let cursor = null;
  for (;;) {
    const d = cursor
      ? await mon(
          `query($c:String!){ next_items_page(limit:500,cursor:$c){ cursor items{ id name column_values(ids:["texto4__1"]){ text } } } }`,
          { c: cursor },
        )
      : await mon(
          `query($b:[ID!]){ boards(ids:$b){ items_page(limit:500){ cursor items{ id name column_values(ids:["texto4__1"]){ text } } } } }`,
          { b: [BOARD_PROVEEDORES] },
        );
    const page = cursor ? d.next_items_page : d.boards[0].items_page;
    proveedores = proveedores.concat(page.items);
    cursor = page.cursor;
    if (!cursor) break;
  }
  const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const correoDe = (p) => String(p.column_values[0]?.text ?? "").trim();
  const sinCorreo = proveedores.filter((p) => !correoDe(p)).length;
  const correoRoto = proveedores.filter((p) => {
    const c = correoDe(p);
    return c && !c.split(",").map((m) => m.trim()).every((m) => MAIL.test(m));
  });

  console.log(`  materiales en el tablero : ${totalMateriales}`);
  console.log(`  proveedores en el tablero: ${totalProveedores}`);
  console.log(`  sin correo               : ${sinCorreo}`);
  console.log(`  con el correo roto       : ${correoRoto.length} (${correoRoto.map((p) => p.name).join(", ") || "ninguno"})`);

  browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-CL" });
  await ctx.addCookies([cookieSesion([{ app: "spm", appRol: "usuario" }])]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => falla("error de javascript en la pantalla", e.message.slice(0, 200)));

  const texto = () => page.locator("body").innerText();

  // ------------------------------------------------- 1. el listado con columnas
  console.log("\n1. EL LISTADO, CON LAS COLUMNAS NUEVAS\n");
  await page.goto(`${BASE}/spm`, { waitUntil: "networkidle", timeout: 120_000 });
  await page
    .getByText(/SPM-\d{3}|Todav[ií]a no hay solicitudes/)
    .first()
    .waitFor({ timeout: 90_000 });

  let t = await texto();
  comprobar("la pantalla carga", /Solicitudes de Material/.test(t), t.slice(0, 200));
  comprobar("no muestra el cartel de sin acceso", !/no tiene asignada/i.test(t), t.slice(0, 300));
  /**
   * Las /i no son por prolijidad: el CSS pone las etiquetas en mayuscula y
   * `innerText` devuelve el texto RENDERIZADO, asi que en la pantalla dice
   * "LÍNEAS" aunque el JSX diga "Líneas". Buscar la version del codigo da
   * siempre falso y parece que la cabecera no esta.
   */
  comprobar(
    "están los títulos de columna nuevos",
    /l[ií]neas/i.test(t) && /qui[eé]n la pidi[oó]/i.test(t) && /cotiz\./i.test(t),
    t.slice(0, 800),
  );
  comprobar(
    "cada solicitud dice cuántos contestaron de cuántos",
    /\d+\/\d+/.test(t),
    `no aparece ningun "N/M". Pantalla: ${t.slice(0, 600)}`,
  );
  comprobar("y quién la pidió", /pablo|vergara|sin emisor/i.test(t), t.slice(0, 600));

  // -------------------------------------------------------- 2. los comparativos
  console.log("\n2. COMPARATIVOS\n");
  await page.getByRole("link", { name: /^Comparativos$/ }).first().click();
  await page.waitForURL("**/spm/comparativos", { timeout: 30_000 });
  /**
   * Se espera a que la pantalla DECIDA, no N segundos. Con un waitForTimeout
   * esto pasaba o fallaba segun lo que tardara monday ese dia, que es la peor
   * clase de test: el que no se sabe si encontro algo o llego tarde.
   */
  await page
    .getByText(/SPM-\d{3}|nada para comparar|Ning[uú]n comparativo/)
    .first()
    .waitFor({ timeout: 90_000 });

  t = await texto();
  comprobar("la pantalla carga", /Comparativos/.test(t), t.slice(0, 200));
  comprobar("no muestra el cartel de sin acceso", !/no tiene asignada/i.test(t));
  comprobar(
    "o lista algo para comparar, o dice por qué no hay",
    /SPM-\d{3}/.test(t) || /nada para comparar/i.test(t),
    t.slice(0, 500),
  );
  // No se exige que haya tarjetas: depende del tablero del dia. Lo que si se
  // exige es que si las hay, digan de que se trata.
  if (/SPM-\d{3}/.test(t)) {
    comprobar("la tarjeta dice cuántos contestaron", /contest(ó|aron) \d+ de \d+/.test(t), t.slice(0, 700));
    comprobar("y lleva al cuadro comparativo", await page.getByRole("link", { name: /Ver cuadro comparativo/i }).first().isVisible());
  }
  await page.screenshot({ path: "capturas/spm-comparativos.png", fullPage: true });

  // ------------------------------------------------------- 3. base de materiales
  console.log("\n3. BASE DE MATERIALES\n");
  await page.getByRole("link", { name: /^Base de Materiales$/ }).first().click();
  await page.waitForURL("**/spm/materiales", { timeout: 30_000 });

  // Se espera a que TERMINE de traer las 3 paginas, que es el momento en que la
  // pantalla puede dar un total. Antes de eso dice "hasta ahora" a proposito.
  /*
    `^...$` y `.first()`: desde que existe el boton "Mostrar más", el texto
    "1.186 materiales" tambien aparece dentro de "Se ven 150 de 1.186 materiales
    que coinciden", y el selector pasaba a resolver dos elementos. Playwright
    corta ahi -modo estricto- y la prueba moria sin que nada estuviera roto.
  */
  await page
    .getByText(new RegExp(`^${totalMateriales.toLocaleString("es-CL")} materiales$`))
    .first()
    .waitFor({ timeout: 90_000 });
  t = await texto();

  ok(`muestra el total de verdad del catálogo (${totalMateriales.toLocaleString("es-CL")}), no el de la primera página`);
  comprobar("no se queda en 'hasta ahora'", !/hasta ahora/.test(t), t.slice(0, 400));
  comprobar(
    "avisa cuántos materiales no tienen unidad",
    /\d+ sin unidad \(\d+%\)/.test(t),
    t.slice(0, 500),
  );

  /**
   * El bug concreto de la app del cliente: el buscador dice "por código" y solo
   * mira el nombre, asi que buscar un VD-### no encuentra nada. Se prueba con un
   * codigo sacado del tablero en esta misma corrida.
   */
  const unMaterial = (
    await mon(
      `query($b:[ID!]){ boards(ids:$b){ items_page(limit:1){ items{ name column_values(ids:["pulse_id_mm1h3kva"]){ text } } } } }`,
      { b: [BOARD_MATERIALES] },
    )
  ).boards[0].items_page.items[0];
  const codigo = unMaterial.column_values[0]?.text ?? "";

  await page.getByLabel("Buscar materiales").fill(codigo);
  await page.waitForTimeout(700);
  t = await texto();
  comprobar(
    `buscar por código encuentra el material (${codigo} -> ${unMaterial.name.slice(0, 30)})`,
    t.includes(unMaterial.name),
    `buscando "${codigo}" la pantalla muestra: ${t.slice(0, 500)}`,
  );

  await page.getByLabel("Buscar materiales").fill("");
  await page.getByRole("button", { name: /Sin unidad/i }).click();
  await page.waitForTimeout(700);
  t = await texto();
  comprobar(
    "el filtro de 'sin unidad' deja solo los que no la tienen",
    !/\bUNID\b|\bSC\b|\bTINETA\b/.test(t.split("Categoría")[1] ?? ""),
    t.slice(0, 600),
  );
  await page.screenshot({ path: "capturas/spm-materiales.png", fullPage: true });

  // ---------------------------------------------------------- 4. los proveedores
  console.log("\n4. MAESTRO DE PROVEEDORES\n");
  await page.getByRole("link", { name: /^Proveedores$/ }).first().click();
  await page.waitForURL("**/spm/proveedores", { timeout: 30_000 });
  await page
    .getByText(new RegExp(`^${totalProveedores.toLocaleString("es-CL")} proveedores$`))
    .first()
    .waitFor({ timeout: 90_000 });
  t = await texto();

  ok(`muestra el total de verdad del maestro (${totalProveedores})`);
  comprobar(
    `el aviso cuenta los ${sinCorreo} sin correo del tablero ENTERO`,
    new RegExp(`${sinCorreo}\\s*proveedores sin correo`).test(t),
    `esto es lo que la app del cliente hace mal. Pantalla: ${t.slice(0, 600)}`,
  );

  if (correoRoto.length) {
    comprobar(
      `y separa los ${correoRoto.length} con el correo mal escrito`,
      new RegExp(`${correoRoto.length}\\s*con el correo mal escrito`).test(t),
      t.slice(0, 600),
    );
    await page.getByRole("button", { name: /^Correo roto$/ }).click();
    await page.waitForTimeout(600);
    t = await texto();
    comprobar(
      `el filtro 'Correo roto' muestra a ${correoRoto[0].name}`,
      t.includes(correoRoto[0].name),
      t.slice(0, 600),
    );
    comprobar("y dice por qué está mal", /no es una dirección de correo/i.test(t), t.slice(0, 600));
  }

  await page.getByRole("button", { name: /^Sin correo$/ }).click();
  await page.waitForTimeout(600);
  t = await texto();
  comprobar(
    "el filtro 'Sin correo' muestra solo los que no lo tienen",
    /No tiene correo cargado/.test(t),
    t.slice(0, 600),
  );

  await page.getByRole("button", { name: /^Todos$/ }).click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: "capturas/spm-proveedores.png", fullPage: true });

  // ------------------------------------------------------------- 5. en celular
  console.log("\n5. EN CELULAR\n");
  const chico = await ctx.newPage();
  await chico.setViewportSize({ width: 390, height: 844 });
  await chico.goto(`${BASE}/spm`, { waitUntil: "networkidle", timeout: 120_000 });
  await chico.waitForTimeout(3000);
  const tChico = await chico.locator("body").innerText();
  comprobar(
    "en celular cada dato lleva su etiqueta, porque no hay cabecera",
    /LÍNEAS|Líneas/i.test(tChico) && /COTIZ|Cotiz/i.test(tChico),
    tChico.slice(0, 500),
  );
  const anchoDoc = await chico.evaluate(() => document.documentElement.scrollWidth);
  comprobar(
    "y la pantalla no se va para el costado",
    anchoDoc <= 400,
    `el documento mide ${anchoDoc}px en una pantalla de 390px`,
  );
  await chico.screenshot({ path: "capturas/spm-listado-celular.png", fullPage: true });
  await chico.close();

  console.log("\n  capturas: spm-comparativos / spm-materiales / spm-proveedores / spm-listado-celular");
} catch (error) {
  falla("se cortó la prueba", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
