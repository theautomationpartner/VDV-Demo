/** Comprueba el aviso "ya lo tenemos" y la devolucion. NO guarda nada. */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
mkdirSync("capturas", { recursive: true });
const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });
try {
  await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(3500);

  // 1. El aviso de que ya lo tenemos.
  await page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await page.waitForTimeout(4000);
  const d = page.locator('[role="dialog"]');
  await d.locator("label").filter({ hasText: "Todavía no hay orden" }).locator("input").check();
  await d.locator("textarea").fill("El equipo llegó antes que la OC, autorizado por Pablo.");
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1200);

  await d.locator("input").first().fill("rotomartillo inalambrico");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "capturas/32-cruce.png" });
  const t = await d.innerText();
  console.log("--- PASO 2 con el cruce ---");
  console.log(t.split("\n").filter(Boolean).slice(0, 14).join("\n"));

  // En el paso 2 el boton de atras ya no dice "Cancelar": se cierra con Escape.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);

  // 2. La devolucion.
  const devolver = page.locator("button").filter({ hasText: "Devolver todo" }).first();
  if (await devolver.count()) {
    await devolver.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "capturas/33-devolucion.png" });
    const t2 = await page.locator('[role="dialog"]').innerText();
    console.log("\n--- DEVOLUCION ---");
    console.log(t2.split("\n").filter(Boolean).slice(0, 16).join("\n"));
  } else {
    console.log("\n(no hay ningun arriendo con el boton Devolver todo)");
  }
} catch (e) {
  console.error("SE CORTO:", e.message);
  await page.screenshot({ path: "capturas/38-corte.png" }).catch(() => {});
} finally {
  console.log(`\nBLOQUEADO (nada salio a monday): ${bloqueadas.length}`);
  for (const b of bloqueadas) console.log(`  ${b}`);
  await browser.close(); cerrar(); process.exit(0);
}
