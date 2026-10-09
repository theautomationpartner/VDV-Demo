import { chromium } from "playwright";
const VARIANTES = [
  { nombre: "flag + viewport explicito 1600x900 + dSF 2.4", ctx: { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2.4 } },
  { nombre: "flag + viewport null (como A)", ctx: { viewport: null } },
];
for (const v of VARIANTES) {
  const browser = await chromium.launch({ channel: "chrome", args: ["--force-device-scale-factor=2.4", "--window-size=1600,900", "--hide-scrollbars"] });
  const context = await browser.newContext(v.ctx);
  const page = await context.newPage();
  await page.setContent("<body style='margin:0;background:#222'><h1 style='color:#fff'>hola</h1></body>");
  await page.waitForTimeout(400);
  const cdp = await context.newCDPSession(page);
  const r = await new Promise(async (resolve) => {
    let listo = false;
    const corte = setTimeout(() => resolve({ error: "sin cuadros" }), 6000);
    cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch {}
      if (listo) return; listo = true; clearTimeout(corte);
      const b = Buffer.from(data, "base64");
      const ancho = await page.evaluate(() => document.documentElement.clientWidth).catch(() => "?");
      resolve({ cuadro: `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, maquetado: ancho });
    });
    await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
    for (let i = 0; i < 8 && !listo; i += 1) { await page.mouse.move(200 + i * 30, 300).catch(() => {}); await page.waitForTimeout(120).catch(() => {}); }
  });
  console.log(`${v.nombre}\n   ${JSON.stringify(r)}`);
  await browser.close();
}
