/** Que devuelve EXACTAMENTE /api/monday/board para arriendos. Solo lectura. */
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";
const { cerrar } = await levantarApp();
const { browser, page } = await abrirNavegador({ simular: () => null });
let visto = null;
await page.route("**/api/monday/board**", async (route) => {
  const r = await route.fetch();
  try { const j = await r.json(); if (!visto && j?.result?.items) visto = j.result; } catch {}
  return route.fulfill({ response: r });
});
await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
await page.waitForTimeout(3000);
if (!visto) console.log("no se capturo la respuesta");
else {
  for (const it of visto.items) {
    console.log(`\n=== "${it.name}" ===`);
    for (const [k, v] of Object.entries(it)) {
      if (k === "subitems" || v == null || v === "") continue;
      console.log(`   ${k}: ${JSON.stringify(v).slice(0, 70)}`);
    }
    for (const s of it.subitems ?? []) {
      const campos = Object.entries(s).filter(([k, v]) => k !== "id" && v != null && v !== "");
      console.log(`   · sub "${s.name}": ${campos.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}`);
    }
  }
}
await browser.close(); cerrar(); process.exit(0);
