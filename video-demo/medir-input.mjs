/** Mide el input del paso 2 contra los campos de al lado. Solo lee. */
import { chromium } from "playwright";
import { levantarApp, cookieSesion } from "./comun.mjs";
const PUERTO = 3097;
const BASE = `http://localhost:${PUERTO}`;

/**
 * Libera el puerto antes de arrancar.
 *
 * Si una corrida anterior se corto, su `next start` sigue vivo con el puerto
 * tomado. `levantarApp` no falla por eso: el nuevo servidor muere con
 * EADDRINUSE pero el bucle de espera encuentra al VIEJO contestando y sigue
 * como si nada, asi que la medicion termina corriendo contra otro build -o
 * contra un servidor a medio morir que contesta "This page couldn't load"-.
 * Perdi tres corridas con esto antes de automatizarlo.
 */
const { execSync } = await import("node:child_process");
try {
  const salida = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  for (const pid of new Set(salida.trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/).pop()))) {
    if (!pid || pid === "0") continue;
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    console.log(`  (habia un servidor viejo en ${PUERTO}, PID ${pid}: lo mate)`);
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch {
  /* nadie escuchando, que es lo normal */
}

const { cerrar } = await levantarApp({ puerto: PUERTO });
if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
  console.error("la app no contesta"); cerrar(); process.exit(1);
}
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "es-CL" });
await ctx.addCookies([cookieSesion()]);
await ctx.addInitScript(() => {
  try { localStorage.setItem("hr_session", JSON.stringify({ role: "administrador", obras: [], restrictObras: false })); } catch {}
});
const page = await ctx.newPage();
// Nada de escrituras.
await ctx.route("**/api/herramientas/**", (r) => r.abort());
try {
  await page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(3000);
  await page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await page.waitForTimeout(4500);
  const d = page.locator('[role="dialog"]');
  await d.locator("button").filter({ hasText: /RUT|orden\(es\)/ }).first().click();
  await page.waitForTimeout(1500);
  await d.locator("button").filter({ hasText: /^OC / }).first().click();
  await page.waitForTimeout(2500);
  await d.locator("button").filter({ hasText: "Continuar" }).click();
  await page.waitForTimeout(1500);

  console.log("PASO:", (await d.innerText()).split("\n").filter(Boolean)[1]);

  const medir = async (sel, etiqueta, enfocar) => {
    const el = d.locator(sel).first();
    if (enfocar) { await el.focus(); await page.waitForTimeout(400); }
    const m = await el.evaluate((n) => {
      const c = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      return {
        x: Math.round(r.x * 10) / 10, ancho: Math.round(r.width * 10) / 10,
        alto: Math.round(r.height * 10) / 10,
        padLeft: c.paddingLeft, border: `${c.borderLeftWidth} ${c.borderLeftColor}`,
        radio: c.borderRadius, sombra: c.boxShadow, outline: `${c.outlineWidth} ${c.outlineStyle}`,
        fondo: c.backgroundColor, fuente: `${c.fontSize}/${c.lineHeight}`,
      };
    });
    console.log(`\n${etiqueta}${enfocar ? "  (ENFOCADO)" : ""}`);
    for (const [k, v] of Object.entries(m)) console.log(`   ${k.padEnd(9)} ${v}`);
    return m;
  };

  const inputSin = await medir("input[type=text], input:not([type])", "input ¿Qué se arrienda?", false);
  const selectObra = await medir("select", "select ¿A qué obra va?", false);
  const inputCon = await medir("input[type=text], input:not([type])", "input ¿Qué se arrienda?", true);
  const selectCon = await medir("select", "select ¿A qué obra va?", true);

  console.log("\n--- COMPARACION ---");
  console.log(`alineacion izquierda: input x=${inputSin.x} vs select x=${selectObra.x}  -> ${inputSin.x === selectObra.x ? "IGUAL" : "DISTINTA"}`);
  console.log(`ancho:                input ${inputSin.ancho} vs select ${selectObra.ancho} -> ${inputSin.ancho === selectObra.ancho ? "IGUAL" : "DISTINTO"}`);
  console.log(`alto:                 input ${inputSin.alto} vs select ${selectObra.alto}`);
  console.log(`padding izq:          input ${inputSin.padLeft} vs select ${selectObra.padLeft}`);
  console.log(`borde en reposo:      input ${inputSin.border} | select ${selectObra.border}`);
  console.log(`al enfocar, el input: sombra=${inputCon.sombra}  outline=${inputCon.outline}  borde=${inputCon.border}`);
  console.log(`al enfocar, el select: sombra=${selectCon.sombra}  outline=${selectCon.outline}  borde=${selectCon.border}`);
  console.log(`¿el input crece al enfocar? ${inputCon.ancho !== inputSin.ancho || inputCon.alto !== inputSin.alto ? "SI" : "no"}`);

  await d.locator("input").first().focus();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "capturas/medicion-input.png" });
  console.log("\ncaptura: capturas/medicion-input.png");
} catch (e) {
  console.error("SE CORTO:", e.message);
  try {
    console.log("--- que muestra la pagina ---");
    const txt = await page.locator("body").innerText();
    console.log(txt.split(/\r?\n/).filter(Boolean).slice(0, 25).join(" | "));
    await page.screenshot({ path: "capturas/corte-medicion.png" });
  } catch {}
} finally {
  await browser.close(); cerrar(); process.exit(0);
}
