/** Abre la pantalla de Arriendos y saca capturas. Solo lectura. */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
mkdirSync("capturas", { recursive: true });
const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });
try {
  await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "capturas/20-arriendos-operacion.png", fullPage: true });
  console.log("capturas/20-arriendos-operacion.png");

  const t = await page.locator("main, body").first().innerText();
  console.log("\n--- lo que dice la pantalla ---");
  console.log(t.split("\n").filter(Boolean).slice(0, 26).join("\n"));

  await page.locator("button").filter({ hasText: "Histórico y gasto" }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "capturas/21-arriendos-gasto.png", fullPage: true });
  console.log("\ncapturas/21-arriendos-gasto.png");
} catch (e) {
  console.error("SE CORTO:", e.message);
  await page.screenshot({ path: "capturas/29-corte.png" }).catch(() => {});
} finally {
  console.log(`\nbloqueadas: ${bloqueadas.length}`);
  await browser.close(); cerrar(); process.exit(0);
}
