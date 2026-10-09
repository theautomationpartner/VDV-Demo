/** Mide de donde saca el color el boton del dialogo. Solo lectura. */
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";

const { cerrar } = await levantarApp();
const { browser, page } = await abrirNavegador({ simular: () => null });

await page.goto(`${BASE}/herramientas`, { waitUntil: "networkidle", timeout: 90_000 });
await page.waitForTimeout(2500);
await page.locator("main button").filter({ hasText: "Código:" }).first().click();
await page.waitForTimeout(2000);
await page.locator("button").filter({ hasText: /Registrar devolución|Registrar salida/ }).first().click();
await page.waitForTimeout(1500);

const info = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[role="dialog"] button')].find((b) => /^Registrar/.test(b.innerText.trim()));
  if (!btn) return { error: "no se encontro el boton" };
  const cs = getComputedStyle(btn);
  const dialogo = btn.closest('[role="dialog"]');
  const dentroDeApp = Boolean(btn.closest("[data-app]"));
  const padre = dialogo?.parentElement;
  return {
    fondoDelBoton: cs.backgroundColor,
    accentQueVe: getComputedStyle(btn).getPropertyValue("--accent").trim(),
    accentEnBody: getComputedStyle(document.body).getPropertyValue("--accent").trim(),
    accentEnApp: (() => {
      const app = document.querySelector("[data-app]");
      return app ? getComputedStyle(app).getPropertyValue("--accent").trim() : "(no hay [data-app])";
    })(),
    dialogoDentroDeDataApp: dentroDeApp,
    padreDelDialogo: padre ? `${padre.tagName.toLowerCase()}${padre.getAttribute("data-app") ? `[data-app=${padre.getAttribute("data-app")}]` : ""}` : "(sin padre)",
    appEnHtml: document.documentElement.getAttribute("data-app"),
    appEnBody: document.body.getAttribute("data-app"),
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
cerrar();
process.exit(0);
