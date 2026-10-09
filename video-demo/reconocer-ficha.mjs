/**
 * Segunda pasada de reconocimiento, sobre UNA herramienta elegida: las cuatro
 * solapas de la ficha y el dialogo de salida. Solo lectura.
 *
 *   node reconocer-ficha.mjs "Rotomartillo inalámbrico"
 */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";

const BUSCAR = process.argv[2] ?? "Rotomartillo inalámbrico";
mkdirSync("capturas", { recursive: true });
const foto = async (page, n) => { await page.screenshot({ path: `capturas/${n}.png` }); console.log(`  capturas/${n}.png`); };

const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });

try {
  await page.goto(`${BASE}/herramientas`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(2500);

  console.log(`buscando "${BUSCAR}"…`);
  await page.locator('input[type="search"], input[placeholder*="Buscar"]').first().fill(BUSCAR);
  await page.waitForTimeout(1500);
  await foto(page, "10-buscador");

  const tarjeta = page.locator("main button").filter({ hasText: "Código:" }).first();
  console.log(`  primera coincidencia: ${(await tarjeta.innerText()).split("\n").slice(0, 2).join(" | ")}`);
  await tarjeta.click();
  await page.waitForTimeout(2500);
  await foto(page, "11-ficha-arriba");

  // Las acciones disponibles segun el estado.
  const acciones = await page.locator("main button").evaluateAll((els) =>
    els.map((e) => e.innerText.trim()).filter((t) => /^(Registrar|Trasladar|Enviar|Volvió|Marcar|Dar de baja)/.test(t)),
  );
  console.log(`  acciones: ${acciones.join(" / ")}`);

  // Las cuatro solapas de la ficha, que son botones dentro de main.
  for (const s of ["Detalles", "Mapa", "Línea de tiempo", "Lista"]) {
    const tab = page.locator("main button").filter({ hasText: new RegExp(`^${s}$`) }).first();
    if (!(await tab.count())) { console.log(`  (no esta la solapa ${s})`); continue; }
    await tab.click();
    await page.waitForTimeout(1600);
    await tab.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await foto(page, `12-solapa-${s.toLowerCase().replace(/[^a-z]/g, "")}`);
  }

  // El dialogo de la accion principal.
  const principal = page.locator("main button").filter({ hasText: /^(Registrar salida|Registrar devolución)/ }).first();
  if (await principal.count()) {
    await principal.scrollIntoViewIfNeeded();
    await principal.click();
    await page.waitForTimeout(1600);
    await foto(page, "13-dialogo");
    const campos = await page.locator('[role="dialog"] label').evaluateAll((e) => e.map((x) => x.innerText.trim()));
    console.log(`  campos: ${campos.join(" / ")}`);
    // Que ofrece el desplegable de custodio, que es el que se cerro al directorio.
    const selects = await page.locator('[role="dialog"] select').evaluateAll((els) =>
      els.map((s) => `${s.previousElementSibling?.innerText?.trim() ?? "?"} -> ${[...s.options].slice(0, 6).map((o) => o.text).join(", ")}`),
    );
    for (const s of selects) console.log(`  ${s}`);
  }
} catch (err) {
  console.error("SE CORTO:", err.message);
  await foto(page, "99-corte").catch(() => {});
} finally {
  console.log(`\nbloqueadas: ${bloqueadas.length}`);
  for (const b of bloqueadas) console.log(`  ${b}`);
  await browser.close();
  cerrar();
  process.exit(0);
}
