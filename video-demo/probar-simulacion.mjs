/**
 * Dos preguntas que la grabacion dejo abiertas:
 *   1. de que forma vienen las respuestas de /api/monday/board, para saber por
 *      que el parche no engancho;
 *   2. en que tamano entrega los cuadros el screencast.
 * Solo lectura salvo el movimiento, que se corta igual que en la grabacion.
 */
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
import { crearSimulacion } from "./simulacion.mjs";
import { HERRAMIENTA } from "./guion.mjs";

const sim = crearSimulacion();
const vistas = [];

const { cerrar } = await levantarApp();
const { browser, page } = await abrirNavegador({
  simular: (url) => sim.respuestaDeEscritura(url),
  parchearLectura: (json) => {
    const claves = json && typeof json === "object" ? Object.keys(json).slice(0, 12) : [];
    const primero = Array.isArray(json?.items) && json.items[0] ? Object.keys(json.items[0]).slice(0, 14) : null;
    vistas.push({
      hecho: sim.estado.movimientoHecho,
      claves,
      cuantosItems: Array.isArray(json?.items) ? json.items.length : null,
      clavesDelPrimerItem: primero,
    });
    return sim.parchearLectura(json);
  },
});

await page.goto(`${BASE}/herramientas`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(2000);
await page.locator('input[placeholder*="Buscar"]').first().fill("rotomartillo");
await page.waitForTimeout(1200);
await page.locator("main button").filter({ hasText: "Código:" }).first().click();
await page.waitForTimeout(3000);

console.log("=== lecturas ANTES del movimiento ===");
for (const v of vistas) console.log(JSON.stringify(v));
vistas.length = 0;

// El tamano real de los cuadros del screencast.
const cdp = await page.context().newCDPSession(page);
const medida = await new Promise(async (resolve) => {
  let listo = false;
  cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
    try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch {}
    if (listo) return;
    listo = true;
    const buf = Buffer.from(data, "base64");
    // El ancho y alto van en el chunk IHDR del PNG, bytes 16-24.
    resolve({
      ancho: buf.readUInt32BE(16),
      alto: buf.readUInt32BE(20),
      metadata: { deviceWidth: metadata.deviceWidth, deviceHeight: metadata.deviceHeight, pageScaleFactor: metadata.pageScaleFactor },
    });
  });
  await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
  await page.mouse.move(400, 400);
  await page.mouse.move(500, 420);
});
await cdp.send("Page.stopScreencast").catch(() => {});
console.log("\n=== tamano del cuadro ===");
console.log(JSON.stringify(medida));

// Ahora el movimiento, para ver las lecturas de despues.
await page.locator("main button").filter({ hasText: /^Registrar salida/ }).first().click();
await page.waitForTimeout(1500);
const d = page.locator('[role="dialog"]');
await d.locator("select").nth(0).selectOption({ label: HERRAMIENTA.obraDestino });
await d.locator("select").nth(1).selectOption({ label: HERRAMIENTA.custodio });
await d.locator("select").nth(2).selectOption({ label: HERRAMIENTA.estadoSalida });
sim.marcarHecho();
await d.locator("button").filter({ hasText: /^Registrar$/ }).first().click();
await page.waitForTimeout(5000);

console.log("\n=== lecturas DESPUES del movimiento ===");
for (const v of vistas) console.log(JSON.stringify(v));

const enPantalla = await page.locator("main").first().innerText();
console.log("\n=== que dice la ficha ahora ===");
console.log(enPantalla.split("\n").slice(0, 10).join(" | "));
console.log(`idHerramienta que guardo la simulacion: ${sim.estado.idHerramienta}`);

await browser.close();
cerrar();
process.exit(0);
