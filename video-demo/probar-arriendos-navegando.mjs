/**
 * Recorre Arriendos como lo haria una persona, y despues va a mirar monday.
 *
 *   node probar-arriendos-navegando.mjs
 *
 * No llama a las rutas: aprieta los botones. Eso es lo que lo hace distinto de
 * los otros scripts -que prueban el servidor de a una funcion- y lo que permite
 * encontrar lo que solo se rompe en la pantalla: un boton que no habilita, un
 * paso del asistente que no deja seguir, un cartel que no aparece.
 *
 * ESCRIBE EN MONDAY DE VERDAD y borra al final, pase lo que pase.
 *
 * Los tests van de lo que mas importa a lo que menos:
 *   1. dar de alta desde una orden de compra
 *   2. devolver un item con su foto
 *   3. el aviso de "ya lo tenemos" antes de arrendar
 *   4. el reporte en PDF
 *   5. la alerta en Mis Pendientes
 *   6. lo que ve cada rol
 *   7. el recorte por obra
 */
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { levantarApp, abrirNavegador, cookieSesion, CUENTA_TAP, BASE, APP } from "./comun.mjs";

const NOMBRE = "ZZ PRUEBA - andamio navegado";
const CARPETA = "capturas/navegando";
mkdirSync(CARPETA, { recursive: true });

let bien = 0;
let mal = 0;
const hallazgos = [];
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => {
  mal += 1;
  hallazgos.push(`${n}${d ? ` — ${d}` : ""}`);
  console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`);
};

const env = readFileSync(`${APP}/.env.local`, "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

async function monday(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: de("MONDAY_API_TOKEN"), "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const C = {
  codigo: "text_mm76bm7d", obra: "color_mm77xt1v", categoria: "dropdown_mm76nbyq",
  tipoTarifa: "color_mm769xwd", estado: "color_mm76rmss", cantidadInicial: "numeric_mm76kbyj",
  cantidadActiva: "numeric_mm76jjmq", cantidadDevuelta: "numeric_mm76x7qp",
  oc: "board_relation_mm76vaqe", proveedor: "board_relation_mm76eppy", responsable: "board_relation_mm79bptf",
};
const CI = { estado: "color_mm775j0h", fechaDevolucion: "date_mm77cxq5", foto: "file_mm7c46se", cantidad: "numeric_mm77cw29" };

/** Lee el arriendo de prueba desde monday. */
async function enMonday(id) {
  const d = await monday(
    `query ($ids: [ID!]) { items (ids: $ids) {
       name
       column_values { id text ... on BoardRelationValue { display_value linked_item_ids } }
       subitems { id name column_values { id text } }
     } }`,
    { ids: [String(id)] },
  );
  const item = d.items[0];
  if (!item) return null;
  const val = (cid) => {
    const c = item.column_values.find((x) => x.id === cid);
    return c?.display_value ?? c?.text ?? null;
  };
  return { item, val };
}

const foto = async (page, n) => {
  await page.screenshot({ path: `${CARPETA}/${n}.png`, fullPage: true });
  console.log(`        ↳ ${CARPETA}/${n}.png`);
};

const sesionPantalla = (role, extra = {}) => ({
  role, userId: "db-31", userName: CUENTA_TAP.nombre, email: CUENTA_TAP.email,
  obras: [], restrictObras: false, ...extra,
});

console.log("levantando la app con la base real…");
const { cerrar } = await levantarApp({ conBaseReal: true });

let arriendoId = null;
let browser = null;
let cerrarSegundo = null;

try {
  // ==================================================================== 1
  console.log("\n=== TEST 1 — DAR DE ALTA DESDE UNA ORDEN DE COMPRA ===");
  const admin = await abrirNavegador({
    dejarEscribir: true,
    sesion: cookieSesion([{ app: "herramientas", appRol: "administrador" }], CUENTA_TAP),
    rolEnPantalla: sesionPantalla("administrador"),
  });
  browser = admin.browser;
  const page = admin.page;

  await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(3000);

  const antes = await page.locator("main").innerText();
  if (/Equipos arrendados/.test(antes)) ok("la pantalla carga");
  else falla("la pantalla", "no se ve el listado");

  await page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await page.waitForTimeout(4000);
  const d = page.locator('[role="dialog"]');

  // Paso 1: elegir una OC.
  const ocs = d.locator("button").filter({ hasText: /^OC / });
  const cuantasOc = await ocs.count();
  if (cuantasOc > 0) ok(`el paso 1 lista ${cuantasOc} ordenes de compra`);
  else falla("el paso 1", "no listo ninguna orden");
  const textoOc = (await ocs.first().innerText()).split("\n")[0];
  await ocs.first().click();
  await page.waitForTimeout(2500);
  await foto(page, "01-paso1-oc-elegida");

  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1200);

  // Paso 2: el equipo.
  await d.locator("input").first().fill(NOMBRE);
  await page.waitForTimeout(1200);
  const obraPrecargada = await d.locator("select").first().inputValue();
  if (obraPrecargada) ok(`la obra se precargo sola desde la OC: "${obraPrecargada}"`);
  else falla("la obra", "no se precargo desde la orden de compra");
  await d.locator("select").nth(1).selectOption({ label: "Andamios" });
  await foto(page, "02-paso2-equipo");
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1000);

  // Paso 3: la tarifa. Primero se comprueba que NO deje seguir sin elegirla.
  const continuar = d.locator("button").filter({ hasText: "Continuar" });
  if (await continuar.isDisabled()) ok("sin tipo de tarifa NO deja continuar");
  else falla("la tarifa obligatoria", "dejo continuar sin elegirla");
  await d.locator("select").first().selectOption({ label: "POR DÍA" });
  await page.waitForTimeout(600);
  if (!(await continuar.isDisabled())) ok("al elegirla, habilita");
  else falla("la tarifa", "sigue sin habilitar");
  await foto(page, "03-paso3-tarifa");
  await continuar.click();
  await page.waitForTimeout(1000);

  // Paso 4: los items.
  const filasItem = d.locator('input[placeholder="Descripción del ítem"]');
  const cuantosItems = await filasItem.count();
  console.log(`        (${cuantosItems} item(s) precargados de la OC)`);
  if (!(await filasItem.first().inputValue())) {
    await filasItem.first().fill("ZZ item navegado");
    await d.locator('input[placeholder="Cantidad"]').first().fill("2");
    await d.locator('input[placeholder="Precio unitario"]').first().fill("1000");
  }
  await foto(page, "04-paso4-items");
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1000);

  // Paso 5: confirmar.
  await d.locator('input').filter({ hasNot: page.locator('[type="date"]') }).first().fill("ZZ-NAV-001").catch(() => {});
  await foto(page, "05-paso5-resumen");
  await d.locator("button").filter({ hasText: "Dar de alta" }).click();
  await page.waitForTimeout(9000);
  await foto(page, "06-despues-del-alta");

  // La lista de monday es eventually consistent: lo recien creado tarda unos
  // segundos en aparecer. La pantalla recarga dos veces justamente por eso, asi
  // que aca se le da tiempo a la segunda antes de dar el veredicto.
  let despues = await page.locator("main").innerText();
  if (!despues.includes(NOMBRE)) {
    await page.waitForTimeout(6000);
    despues = await page.locator("main").innerText();
  }
  if (despues.includes(NOMBRE)) ok("el arriendo aparece en el listado");
  else falla("el listado", "no aparece ni despues de que la pantalla recargue sola");

  // Y ahora, a monday.
  const enTablero = await monday(
    `query { boards(ids:["${de("MONDAY_BOARD_CONTROL_ARRIENDOS")}"]) { items_page(limit:50) { items { id name } } } }`,
  ).then((x) => x.boards[0].items_page.items.find((i) => i.name === NOMBRE));

  if (enTablero) {
    arriendoId = enTablero.id;
    ok(`en monday quedo el item ${arriendoId}`);
  } else {
    falla("monday", "el arriendo no aparecio en el tablero");
    throw new Error("sin arriendo en monday no se puede seguir");
  }

  console.log("\n  --- lo que quedo escrito en monday ---");
  const m1 = await enMonday(arriendoId);
  const chequear = (etiqueta, valor, esperado) => {
    if (esperado instanceof RegExp ? esperado.test(valor ?? "") : valor === esperado) ok(`${etiqueta}: ${valor}`);
    else falla(etiqueta, `dice "${valor}", esperaba ${esperado}`);
  };
  chequear("codigo", m1.val(C.codigo), /^ARR-\d{4}$/);
  chequear("obra", m1.val(C.obra), obraPrecargada);
  chequear("categoria", m1.val(C.categoria), "Andamios");
  chequear("tipo tarifa", m1.val(C.tipoTarifa), "POR DÍA");
  chequear("estado", m1.val(C.estado), "ACTIVO");

  const oc = m1.item.column_values.find((c) => c.id === C.oc);
  if (oc?.linked_item_ids?.length) ok(`orden de compra vinculada: ${oc.display_value}`);
  else falla("la orden de compra", "no quedo vinculada");

  const prov = m1.item.column_values.find((c) => c.id === C.proveedor);
  if (prov?.linked_item_ids?.length) ok(`proveedor vinculado: ${prov.display_value}`);
  else falla("el proveedor", `no quedo vinculado (la OC era "${textoOc}")`);

  const resp = m1.item.column_values.find((c) => c.id === C.responsable);
  if (resp?.linked_item_ids?.map(String).includes(CUENTA_TAP.fichaEquipoVdv)) {
    ok(`responsable vinculado a Equipo VDV: ${resp.display_value}`);
  } else {
    falla("el responsable", `no quedo vinculado a la ficha ${CUENTA_TAP.fichaEquipoVdv}`);
  }

  if (m1.item.subitems.length > 0) ok(`${m1.item.subitems.length} item(s) colgando del arriendo`);
  else falla("los items", "no quedo ninguno");

  // ==================================================================== 2
  console.log("\n=== TEST 2 — DEVOLVER UN ITEM CON SU FOTO ===");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(4000);

  const tarjeta = page.locator("div").filter({ hasText: NOMBRE }).last();
  const devolver = page.locator("button").filter({ hasText: "Devolver todo" });
  const cuantosBotones = await devolver.count();
  if (cuantosBotones > 0) ok(`hay ${cuantosBotones} boton(es) de devolver`);
  else falla("el boton de devolver", "no aparece en ninguna tarjeta");

  // El del arriendo nuestro: se busca por su tarjeta.
  const miDevolver = page
    .locator("div.rounded-\\[var\\(--radius-lg\\)\\]")
    .filter({ hasText: NOMBRE })
    .locator("button")
    .filter({ hasText: "Devolver todo" })
    .first();
  await miDevolver.click();
  await page.waitForTimeout(2000);
  const dd = page.locator('[role="dialog"]');
  await foto(page, "07-devolucion-abierta");

  const registrar = dd.locator("button").filter({ hasText: "Registrar devolución" });
  if (await registrar.isDisabled()) ok("sin foto, el boton de registrar esta apagado");
  else falla("la foto obligatoria", "dejo registrar sin foto");

  const textoDevo = await dd.innerText();
  if (/obligatoria/.test(textoDevo)) ok("y la pantalla dice que la foto es obligatoria");
  else falla("el aviso de la foto", "no aparece");

  // Se sube la foto como lo haria una persona: por el input de archivo.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await dd.locator('input[type="file"]').first().setInputFiles({
    name: "zz-prueba.png", mimeType: "image/png", buffer: png,
  });
  await page.waitForTimeout(7000);
  await foto(page, "08-devolucion-con-foto");

  const textoConFoto = await dd.innerText();
  if (/Foto guardada/.test(textoConFoto)) ok("la foto se subio y la pantalla lo confirma");
  else falla("la subida de la foto", `el boton sigue diciendo: ${textoConFoto.match(/Sacar foto|Foto guardada/)?.[0]}`);

  if (!(await registrar.isDisabled())) ok("ahora si deja registrar");
  else falla("el boton", "sigue apagado con la foto puesta");

  await registrar.click();
  await page.waitForTimeout(9000);
  await foto(page, "09-despues-de-devolver");

  console.log("\n  --- lo que quedo en monday despues de devolver ---");
  const m2 = await enMonday(arriendoId);
  const sub = m2.item.subitems[0];
  const subVal = (cid) => sub.column_values.find((c) => c.id === cid)?.text ?? null;
  chequear("estado del item", subVal(CI.estado), "Devuelto");
  if (subVal(CI.fechaDevolucion)) ok(`fecha de devolucion: ${subVal(CI.fechaDevolucion)}`);
  else falla("la fecha de devolucion", "quedo vacia");
  if ((subVal(CI.foto) ?? "").trim()) ok("la foto quedo guardada en el item");
  else falla("la foto en monday", "la columna quedo vacia");

  const todosDevueltos = m2.item.subitems.length === 1;
  chequear("estado del arriendo", m2.val(C.estado), todosDevueltos ? "DEVUELTO" : "ACTIVO");
  if (Number(m2.val(C.cantidadDevuelta)) > 0) ok(`cantidad devuelta: ${m2.val(C.cantidadDevuelta)}`);
  else falla("la cantidad devuelta", `dice "${m2.val(C.cantidadDevuelta)}"`);

  // ==================================================================== 3
  console.log("\n=== TEST 3 — EL AVISO DE 'YA LO TENEMOS' ===");
  await page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await page.waitForTimeout(4000);
  const d3 = page.locator('[role="dialog"]');
  await d3.locator("label").filter({ hasText: "Todavía no hay orden" }).locator("input").check();
  await d3.locator("textarea").fill("Prueba del aviso de herramientas propias.");
  await d3.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1200);
  await d3.locator("input").first().fill("rotomartillo inalambrico");
  await page.waitForTimeout(2500);
  await foto(page, "10-aviso-ya-lo-tenemos");
  const t3 = await d3.innerText();
  if (/ya tiene \d+ disponible/.test(t3)) ok(`avisa: "${t3.match(/VDV ya tiene[^\n]*/)?.[0]}"`);
  else falla("el aviso de ya lo tenemos", "no aparecio");
  if (/HRR-\d+/.test(t3)) ok("y lista las herramientas con su codigo");
  else falla("la lista de parecidas", "no muestra codigos");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);

  // ==================================================================== 4
  console.log("\n=== TEST 4 — EL REPORTE EN PDF ===");
  const descarga = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
  await page
    .locator("div.rounded-\\[var\\(--radius-lg\\)\\]")
    .filter({ hasText: NOMBRE })
    .locator("button")
    .filter({ hasText: "Generar reporte" })
    .first()
    .click();
  const archivo = await descarga;
  if (archivo) {
    const destino = `${CARPETA}/${archivo.suggestedFilename()}`;
    await archivo.saveAs(destino);
    const bytes = existsSync(destino) ? readFileSync(destino) : null;
    if (bytes && bytes.length > 1000 && bytes.subarray(0, 4).toString() === "%PDF") {
      ok(`el PDF se genero: ${archivo.suggestedFilename()} (${Math.round(bytes.length / 1024)} KB)`);
    } else {
      falla("el PDF", "se descargo pero no parece un PDF valido");
    }
  } else {
    falla("el reporte", "no se descargo ningun archivo");
  }

  // ==================================================================== 5
  console.log("\n=== TEST 5 — LA ALERTA EN MIS PENDIENTES ===");
  await page.goto(`${BASE}/mis-pendientes`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(7000);
  await foto(page, "11-mis-pendientes");
  const t5 = await page.locator("body").innerText();
  if (/Devolver al proveedor/.test(t5)) ok("la bandeja muestra arriendos para devolver");
  else console.log("        (no hay arriendos vencidos ahora mismo, nada que mostrar)");
  if (/PARA HACER AHORA/.test(t5) || !/Devolver al proveedor/.test(t5)) ok("y van en 'Para hacer ahora'");
  else falla("el grupo", "los arriendos no estan en 'Para hacer ahora'");

  await admin.browser.close();

  /**
   * Los tests 6 y 7 van contra OTRO servidor, levantado SIN base.
   *
   * Con la base real, `verificarAcceso` lee el usuario y PISA las asignaciones
   * de la cookie con las de la base: la cuenta de TAP es administradora, asi
   * que por mas que se firme una sesion de "jefe de obra", el servidor la
   * devuelve como administrador y la pantalla dibuja todo. Se vio en la
   * captura: el menu decia "TAP - Super Admin". Sin base, el guard cae en la
   * sesion del token y recien ahi se esta probando el rol.
   */
  console.log("\n  (segundo servidor, sin base, para probar los roles de verdad)");
  // En su propio puerto: el primero tarda en soltar el suyo y el segundo
  // arrancaba con EADDRINUSE.
  const sinBase = await levantarApp({ conBaseReal: false, puerto: 3096 });
  cerrarSegundo = sinBase.cerrar;
  const BASE_ROLES = sinBase.base;

  // ==================================================================== 6
  console.log("\n=== TEST 6 — LO QUE VE CADA ROL ===");
  for (const [rol, veCostos, puedeTocar] of [
    ["oficina_tecnica", true, false],
    ["bodeguero", true, true],
    ["jefe_obra", false, false],
  ]) {
    const otro = await abrirNavegador({
      simular: () => null,
      sesion: cookieSesion([{ app: "herramientas", appRol: rol }], CUENTA_TAP),
      rolEnPantalla: sesionPantalla(rol),
      base: BASE_ROLES,
    });
    browser = otro.browser;
    await otro.page.goto(`${BASE_ROLES}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
    await otro.page.waitForTimeout(4000);
    await foto(otro.page, `12-rol-${rol}`);
    const t = await otro.page.locator("main").innerText();

    const muestraPlata = /ACUMULADO|Gasto total/.test(t) && !/no tiene acceso a los montos/.test(t);
    if (muestraPlata === veCostos) ok(`${rol} ${veCostos ? "ve" : "NO ve"} los montos`);
    else falla(`${rol} y los montos`, `muestra plata = ${muestraPlata}`);

    const tieneAlta = (await otro.page.locator("button").filter({ hasText: "Nuevo arriendo" }).count()) > 0;
    if (tieneAlta === puedeTocar) ok(`${rol} ${puedeTocar ? "tiene" : "NO tiene"} el boton de alta`);
    else falla(`${rol} y el alta`, `boton visible = ${tieneAlta}`);

    await otro.browser.close();
    browser = null;
  }

  // ==================================================================== 7
  console.log("\n=== TEST 7 — EL RECORTE POR OBRA ===");
  const jefe = await abrirNavegador({
    simular: () => null,
    sesion: cookieSesion(
      [{ app: "herramientas", appRol: "jefe_obra", appConfig: { restrictObras: true, obras: ["M388"] } }],
      CUENTA_TAP,
    ),
    rolEnPantalla: sesionPantalla("jefe_obra", { obras: ["M388"], restrictObras: true }),
    base: BASE_ROLES,
  });
  browser = jefe.browser;
  await jefe.page.goto(`${BASE_ROLES}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await jefe.page.waitForTimeout(4000);
  await foto(jefe.page, "13-jefe-de-obra-M388");
  /**
   * Se mira el DESPLEGABLE DE OBRAS, no el texto de la pantalla.
   *
   * El desplegable se arma con las obras de los arriendos que llegaron, asi que
   * si el recorte funciona solo puede ofrecer M388. Buscar "ZZ" en el texto
   * daba un falso positivo: el arriendo de prueba se LLAMA "ZZ PRUEBA ..." y su
   * obra es M388.
   */
  const obrasOfrecidas = await jefe.page
    .locator("main select")
    .first()
    .locator("option")
    .allInnerTexts();
  const otras = obrasOfrecidas.filter((o) => o !== "Todas las obras" && o !== "M388");
  if (otras.length === 0) ok(`el jefe de obra de M388 solo ve M388 (ofrece: ${obrasOfrecidas.join(", ")})`);
  else falla("el recorte por obra", `tambien le llegaron arriendos de: ${otras.join(", ")}`);

  const t7 = await jefe.page.locator("main").innerText();
  if (!/Nuevo arriendo|Devolver todo/.test(t7)) ok("y no tiene ningun boton para modificar");
  else falla("los botones del jefe de obra", "le aparecio alguno de modificacion");
  await jefe.browser.close();
  browser = null;
} catch (error) {
  falla("se corto el recorrido", error.message);
} finally {
  try { await browser?.close(); } catch { /* ya cerrado */ }

  console.log("\n=== LIMPIEZA ===");
  if (arriendoId) {
    try {
      await monday(`mutation ($id: ID!) { delete_item (item_id: $id) { id } }`, { id: String(arriendoId) });
      ok(`se borro el arriendo de prueba ${arriendoId}`);
    } catch (e) {
      falla("NO SE PUDO BORRAR", `${arriendoId} quedo en el tablero: ${e.message}`);
    }
  }
  const quedan = await monday(
    `query { boards(ids:["${de("MONDAY_BOARD_CONTROL_ARRIENDOS")}"]) { items_page(limit:50) { items { name } } } }`,
  ).then((x) => x.boards[0].items_page.items).catch(() => null);
  if (quedan) {
    const basura = quedan.filter((i) => /ZZ PRUEBA/i.test(i.name));
    if (!basura.length) ok(`el tablero quedo con ${quedan.length} arriendos, ninguno de prueba`);
    else falla("quedo basura", basura.map((i) => i.name).join(", "));
  }

  writeFileSync(`${CARPETA}/hallazgos.txt`, hallazgos.join("\n") || "sin hallazgos");
  console.log("\n====================================================");
  console.log(`>>> ${bien} bien, ${mal} ${mal === 1 ? "falla" : "fallas"}`);
  if (hallazgos.length) {
    console.log("\nQUE REVISAR:");
    for (const h of hallazgos) console.log(`  - ${h}`);
  }
  cerrar();
  cerrarSegundo?.();
  process.exit(mal ? 1 : 0);
}
