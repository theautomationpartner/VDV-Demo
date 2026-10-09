/** Recorre el asistente nuevo paso por paso. NO guarda: escritura cortada. */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
mkdirSync("capturas", { recursive: true });
const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });
const foto = async (n) => { await page.screenshot({ path: `capturas/${n}.png` }); console.log(`  ${n}.png`); };
try {
  await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await page.waitForTimeout(4500);
  const d = page.locator('[role="dialog"]');

  await foto("50-paso1-proveedores");
  console.log("--- PASO 1 ---\n" + (await d.innerText()).split("\n").filter(Boolean).slice(0, 12).join("\n"));

  const provs = d.locator("button").filter({ hasText: /RUT|orden\(es\)/ });
  console.log(`\nproveedores listados: ${await provs.count()}`);
  await provs.first().click();
  await page.waitForTimeout(1500);
  await foto("51-paso1-ocs-del-proveedor");
  console.log("\n--- despues de elegir proveedor ---\n" + (await d.innerText()).split("\n").filter(Boolean).slice(0, 12).join("\n"));

  await d.locator("button").filter({ hasText: /^OC / }).first().click();
  await page.waitForTimeout(2500);
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1000);
  await d.locator("select").first().selectOption({ index: 1 }).catch(() => {});
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1000);
  await d.locator("select").first().selectOption({ label: "POR DÍA" });
  await page.waitForTimeout(400);
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1200);

  await foto("52-paso4-items");
  console.log("\n--- PASO 4 (items) ---\n" + (await d.innerText()).split("\n").filter(Boolean).slice(0, 20).join("\n"));

  // Desmarcar el primero y ver que el total baje.
  const checks = d.locator('input[type="checkbox"]');
  if (await checks.count()) {
    await checks.first().uncheck();
    await page.waitForTimeout(700);
    await foto("53-paso4-item-desmarcado");
    const t = await d.innerText();
    console.log(`\ndespues de desmarcar: ${t.match(/\d+ ítem\(s\)[^\n]*/)?.[0]} | ${t.match(/[\d.]+ por período/)?.[0]}`);
    await checks.first().check();
    await page.waitForTimeout(500);
  }

  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1200);
  await foto("54-paso5-guia");
  const t5 = await d.innerText();
  console.log("\n--- PASO 5 (guia) ---\n" + t5.split("\n").filter(Boolean).slice(0, 18).join("\n"));
  const alta = d.locator("button").filter({ hasText: "Dar de alta" });
  console.log(`\nel boton de alta esta ${(await alta.isDisabled()) ? "APAGADO (bien: falta la guia)" : "PRENDIDO (mal)"}`);
} catch (e) {
  console.error("SE CORTO:", e.message);
  await foto("59-corte").catch(() => {});
} finally {
  console.log(`\nbloqueadas: ${bloqueadas.length}`);
  await browser.close(); cerrar(); process.exit(0);
}
