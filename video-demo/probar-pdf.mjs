/** Por que no se descarga el reporte. Solo lectura. */
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
const { cerrar } = await levantarApp();
const { browser, page } = await abrirNavegador({ simular: () => null });
const errores = [];
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(3500);
const descarga = page.waitForEvent("download", { timeout: 25_000 }).catch(() => null);
await page.locator("button").filter({ hasText: "Generar reporte" }).first().click();
const archivo = await descarga;
await page.waitForTimeout(3000);
console.log(archivo ? `descargo: ${archivo.suggestedFilename()}` : "NO descargo nada");
const aviso = await page.locator("[data-sonner-toast], [role=status]").allInnerTexts().catch(() => []);
console.log(`avisos en pantalla: ${JSON.stringify(aviso)}`);
// Se llama la funcion a mano para ver si el que falla es el boton o el PDF.
const directo = await page.evaluate(async () => {
  try {
    const m = await import("/_next/static/chunks/__nada__.js").catch(() => null);
    return "no-se-puede-importar-desde-afuera";
  } catch (e) { return `error: ${e.message}`; }
});
console.log(`import directo: ${directo}`);
const anclas = await page.evaluate(() => document.querySelectorAll("a[download]").length);
console.log(`anclas de descarga en el DOM: ${anclas}`);
console.log(`\nerrores en la consola (${errores.length}):`);
for (const e of errores.slice(0, 6)) console.log(`  ${e.slice(0, 300)}`);
await browser.close(); cerrar(); process.exit(0);
