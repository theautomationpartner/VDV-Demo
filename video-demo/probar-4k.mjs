/**
 * El screencast entrega 1600x900 aunque Playwright tenga deviceScaleFactor 2,4:
 * ese ajuste vale para page.screenshot(), no para el screencast. Se prueban tres
 * formas de conseguir el cuadro en 4K y se mide cual sirve, ademas de que la
 * pagina siga maquetada como 1600 de ancho (si no, el video queda con la letra
 * chiquita dentro de una pantalla enorme).
 */
import { chromium } from "playwright";

const CONFIGS = [
  {
    nombre: "A · force-device-scale-factor, ventana 1600x900",
    launch: { args: ["--force-device-scale-factor=2.4", "--window-size=1600,900", "--hide-scrollbars"] },
    context: { viewport: null },
  },
  {
    nombre: "B · force-device-scale-factor, ventana 3840x2160",
    launch: { args: ["--force-device-scale-factor=2.4", "--window-size=3840,2160", "--hide-scrollbars"] },
    context: { viewport: null },
  },
  {
    nombre: "C · viewport 3840x2160 + zoom CSS 2,4",
    launch: { args: ["--window-size=3840,2160", "--hide-scrollbars"] },
    context: { viewport: { width: 3840, height: 2160 } },
    zoom: 2.4,
  },
];

for (const cfg of CONFIGS) {
  const browser = await chromium.launch({ channel: "chrome", ...cfg.launch });
  const context = await browser.newContext(cfg.context);
  const page = await context.newPage();
  await page.setContent("<body style='margin:0;background:#222'><h1 style='color:#fff;font:600 24px system-ui'>hola</h1></body>");
  if (cfg.zoom) await page.addStyleTag({ content: `html { zoom: ${cfg.zoom}; }` });
  await page.waitForTimeout(400);

  const cdp = await context.newCDPSession(page);
  const r = await new Promise(async (resolve) => {
    let listo = false;
    const corte = setTimeout(() => resolve({ error: "no llego ningun cuadro" }), 6000);
    cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      try { await cdp.send("Page.screencastFrameAck", { sessionId }); } catch {}
      if (listo) return;
      listo = true;
      clearTimeout(corte);
      const buf = Buffer.from(data, "base64");
      const anchoCss = await page.evaluate(() => document.documentElement.clientWidth);
      resolve({ cuadro: `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, anchoMaquetado: anchoCss });
    });
    await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
    for (let i = 0; i < 6; i += 1) { await page.mouse.move(200 + i * 40, 300); await page.waitForTimeout(120); }
  });

  console.log(`${cfg.nombre}\n   ${JSON.stringify(r)}\n`);
  await cdp.send("Page.stopScreencast").catch(() => {});
  await browser.close();
}
