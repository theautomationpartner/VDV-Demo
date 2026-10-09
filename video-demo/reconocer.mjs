/**
 * Recorre Control de Herramientas en modo SOLO LECTURA y deja una captura de
 * cada pantalla en capturas/, para escribir el guion con los textos reales en
 * vez de inventarlos.
 *
 *   node reconocer.mjs
 */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";

mkdirSync("capturas", { recursive: true });

const foto = async (page, nombre) => {
  await page.screenshot({ path: `capturas/${nombre}.png` });
  console.log(`  capturas/${nombre}.png`);
};

console.log("levantando la app…");
const { cerrar } = await levantarApp();

// En el reconocimiento no se simula nada: si algo intenta escribir, se corta.
const { browser, page, bloqueadas } = await abrirNavegador({ simular: () => null });

try {
  console.log("\n1. el listado");
  await page.goto(`${BASE}/herramientas`, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(3000);
  await foto(page, "01-listado");

  const titulo = await page.title();
  const h1 = await page.locator("h1").first().textContent().catch(() => "(sin h1)");
  console.log(`  title: ${titulo}\n  h1: ${h1?.trim()}`);

  // Que se ve arriba: buscador, filtros, contadores.
  const textos = await page.locator("main button, main input, main select").evaluateAll((els) =>
    els.slice(0, 40).map((e) => {
      const t = (e.innerText || e.placeholder || e.getAttribute("aria-label") || "").trim();
      return `${e.tagName.toLowerCase()}: ${t.slice(0, 60)}`;
    }).filter((s) => s.length > 10),
  );
  console.log("\n  controles visibles:");
  for (const t of textos) console.log(`    ${t}`);

  console.log("\n2. la primera herramienta del listado");
  const tarjetas = page.locator("main button").filter({ hasText: "Código:" });
  const cuantas = await tarjetas.count();
  console.log(`  tarjetas con codigo: ${cuantas}`);
  if (cuantas > 0) {
    const nombres = await tarjetas.evaluateAll((els) =>
      els.slice(0, 12).map((e) => e.innerText.split("\n").slice(0, 2).join(" | ")),
    );
    console.log("  primeras:");
    for (const n of nombres) console.log(`    ${n}`);

    await tarjetas.first().click();
    await page.waitForTimeout(2500);
    await foto(page, "02-ficha");

    // Las solapas de la ficha.
    const solapas = await page.locator('[role="tab"], nav button').evaluateAll((els) =>
      els.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 10),
    );
    console.log(`  solapas: ${solapas.join(" / ")}`);

    for (const s of solapas) {
      const tab = page.locator('[role="tab"], nav button').filter({ hasText: s }).first();
      if (!(await tab.count())) continue;
      await tab.click().catch(() => {});
      await page.waitForTimeout(1500);
      await foto(page, `03-ficha-${s.toLowerCase().replace(/[^a-z]/g, "")}`);
    }

    // El menu de movimientos, sin confirmarlo.
    const accion = page.locator("button").filter({ hasText: /Registrar|Trasladar|Enviar a/ }).first();
    if (await accion.count()) {
      console.log(`  accion encontrada: ${(await accion.textContent())?.trim()}`);
      await accion.click();
      await page.waitForTimeout(1800);
      await foto(page, "04-dialogo-movimiento");
      const campos = await page.locator('[role="dialog"] label, [role="dialog"] button').evaluateAll((els) =>
        els.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 15),
      );
      console.log(`  campos del dialogo: ${campos.join(" / ")}`);
    } else {
      console.log("  no se encontro boton de movimiento");
    }
  }
} catch (err) {
  console.error("\nSE CORTO:", err.message);
  await foto(page, "99-donde-se-corto").catch(() => {});
} finally {
  console.log(`\nbloqueadas durante el reconocimiento: ${bloqueadas.length}`);
  for (const b of bloqueadas) console.log(`  ${b}`);
  await browser.close();
  cerrar();
  process.exit(0);
}
