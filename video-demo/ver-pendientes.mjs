/** Mira la bandeja con los arriendos adentro. Solo lectura. */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
mkdirSync("capturas", { recursive: true });
const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });
try {
  await page.goto(`${BASE}/mis-pendientes`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "capturas/40-pendientes.png", fullPage: true });
  const t = await page.locator("main, body").first().innerText();
  console.log(t.split("\n").filter(Boolean).slice(0, 30).join("\n"));
} catch (e) {
  console.error("SE CORTO:", e.message);
  await page.screenshot({ path: "capturas/49-corte.png" }).catch(() => {});
} finally {
  console.log(`\nbloqueadas: ${bloqueadas.length}`);
  await browser.close(); cerrar(); process.exit(0);
}
