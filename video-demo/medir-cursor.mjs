/** Que cursor muestran los elementos clickeables. Solo lectura. */
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
const { cerrar } = await levantarApp();
const { browser, page } = await abrirNavegador({ simular: () => null });
for (const ruta of ["/arriendos", "/herramientas"]) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const cuenta = {};
    const muestras = [];
    for (const el of document.querySelectorAll("button, a[href], select, [role='button'], summary, label")) {
      if (!el.offsetParent) continue;
      const c = getComputedStyle(el).cursor;
      cuenta[c] = (cuenta[c] ?? 0) + 1;
      if (c !== "pointer" && muestras.length < 5) {
        muestras.push(`${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 32)}" -> ${c}`);
      }
    }
    return { cuenta, muestras };
  });
  console.log(`\n${ruta}`);
  console.log("  cursores:", JSON.stringify(r.cuenta));
  for (const m of r.muestras) console.log("   ", m);
}
await browser.close(); cerrar(); process.exit(0);
