/** Abre el alta y la devolucion para mirarlas. NO guarda: toda escritura cortada. */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
mkdirSync("capturas", { recursive: true });
const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });
try {
  await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(3500);

  await page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "capturas/30-alta-paso1.png" });
  const t = await page.locator('[role="dialog"]').innerText();
  console.log("--- PASO 1 ---\n" + t.split("\n").filter(Boolean).slice(0, 14).join("\n"));

  const ocs = page.locator('[role="dialog"] button').filter({ hasText: /^OC / });
  console.log(`\nordenes listadas: ${await ocs.count()}`);
  if (await ocs.count()) {
    await ocs.first().click();
    await page.waitForTimeout(2500);
    await page.locator('[role="dialog"] button').filter({ hasText: "Continuar" }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: "capturas/31-alta-paso2.png" });
    const t2 = await page.locator('[role="dialog"]').innerText();
    console.log("\n--- PASO 2 ---\n" + t2.split("\n").filter(Boolean).slice(0, 16).join("\n"));
  }
} catch (e) {
  console.error("SE CORTO:", e.message);
  await page.screenshot({ path: "capturas/39-corte.png" }).catch(() => {});
} finally {
  console.log(`\nBLOQUEADO: ${bloqueadas.length}`);
  for (const b of bloqueadas) console.log(`  ${b}`);
  await browser.close(); cerrar(); process.exit(0);
}
