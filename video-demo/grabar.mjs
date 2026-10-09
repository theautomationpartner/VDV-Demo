/**
 * Graba el video: hace el recorrido del guion y captura cuadros PNG en 4K.
 *
 *   node grabar.mjs
 *
 * Deja cuadros/ con los PNG y linea-de-tiempo.json con, por cada parte, cuando
 * empieza, cuanto dura su audio y sobre que caja hay que hacer zoom. Ese archivo
 * es el que despues leen el montaje y HyperFrames.
 *
 * Por que screencast por CDP y no recordVideo: recordVideo sale en 720p
 * comprimido y se ve borroso. El screencast entrega el cuadro tal como lo dibuja
 * Chrome, que con deviceScaleFactor 2,4 sobre 1600x900 son 3840x2160 reales.
 *
 * Chrome manda cuadros SOLO cuando la pantalla cambia. Eso no es un error: los
 * huecos se rellenan en el montaje repitiendo el ultimo cuadro.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE, VIEWPORT } from "./comun.mjs";
import { ponerCursor, clic, escribir, elegir, rueda, mover } from "./interaccion.mjs";
import { crearSimulacion } from "./simulacion.mjs";
import { PARTES, HERRAMIENTA } from "./guion.mjs";

const duraciones = JSON.parse(readFileSync("audio/duraciones.json", "utf8"));
const COLA = 0.7; // el aire que queda despues de que termina la voz

rmSync("cuadros", { recursive: true, force: true });
mkdirSync("cuadros", { recursive: true });

const sim = crearSimulacion();
const { cerrar } = await levantarApp();
const { browser, page, bloqueadas } = await abrirNavegador({
  simular: (url) => sim.respuestaDeEscritura(url),
  parchearLectura: (json) => sim.parchearLectura(json),
});

// ------------------------------------------------------------- el screencast

const cuadros = [];
let grabando = false;
let t0 = 0;
let cdp = null;

async function empezarAGrabar() {
  cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
    try {
      await cdp.send("Page.screencastFrameAck", { sessionId });
    } catch {
      /* la sesion ya se cerro */
    }
    if (!grabando) return;
    const n = String(cuadros.length).padStart(6, "0");
    const archivo = `cuadros/${n}.png`;
    writeFileSync(archivo, Buffer.from(data, "base64"));
    cuadros.push({ archivo, t: metadata.timestamp - t0 });
  });
  t0 = Date.now() / 1000;
  grabando = true;
  await cdp.send("Page.startScreencast", {
    format: "png",
    quality: 100,
    maxWidth: 3840,
    maxHeight: 2160,
    everyNthFrame: 1,
  });
}

const ahora = () => Date.now() / 1000 - t0;

// -------------------------------------------------------------- los recortes

/** Los tramos de carga, que el montaje saca. */
const recortes = [];
async function sinGrabar(etiqueta, fn) {
  const desde = ahora();
  const r = await fn();
  recortes.push({ etiqueta, desde, hasta: ahora() });
  return r;
}

// ----------------------------------------------------------------- el guion

const linea = [];

/** Corre una parte: hace la accion, anota el zoom y espera a que termine la voz. */
async function parte(id, accion) {
  const desde = ahora();
  const caja = (await accion()) ?? null;
  const audio = duraciones[id] ?? 3;
  const falta = audio + COLA - (ahora() - desde);
  if (falta > 0) await page.waitForTimeout(falta * 1000);
  linea.push({ id, desde, hasta: ahora(), audio, zoom: caja });
  console.log(`  ${id}  ${(ahora() - desde).toFixed(1)}s  zoom:${caja ? "si" : "no"}`);
}

/** La caja de un elemento, en pixeles de la pagina (no de la imagen 4K). */
async function cajaDe(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);
  const b = await locator.boundingBox();
  if (!b) return null;
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

/** La caja que envuelve a varios elementos. */
async function cajaDeVarios(locators) {
  const cajas = [];
  for (const l of locators) {
    const b = await l.boundingBox().catch(() => null);
    if (b) cajas.push(b);
  }
  if (!cajas.length) return null;
  const x = Math.min(...cajas.map((c) => c.x));
  const y = Math.min(...cajas.map((c) => c.y));
  const x2 = Math.max(...cajas.map((c) => c.x + c.width));
  const y2 = Math.max(...cajas.map((c) => c.y + c.height));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y) };
}

try {
  console.log("abriendo el inventario…");
  await page.goto(`${BASE}/herramientas`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(2500);
  await ponerCursor(page);
  await empezarAGrabar();
  await page.waitForTimeout(900);

  const buscador = page.locator('input[placeholder*="Buscar"]').first();
  const filtros = page.locator("main select, main button").filter({ hasText: /Todas las obras|Inventario vigente|Todas las categorías/ });

  // 02 — el inventario
  await parte("02-inventario", async () => {
    const titulo = page.locator("h1, h2").filter({ hasText: "Inventario de Herramientas" }).first();
    const caja = await cajaDe(titulo).catch(() => null);
    await mover(page, 980, 120);
    return caja ? { ...caja, w: Math.max(caja.w, 900), h: caja.h + 40 } : null;
  });

  // 03 — el buscador
  await parte("03-buscador", async () => {
    const caja = await cajaDe(buscador);
    await escribir(page, buscador, "rotomartillo");
    await page.waitForTimeout(900);
    return caja;
  });

  // 04 — los filtros
  await parte("04-filtros", async () => {
    const caja = await cajaDeVarios(await filtros.all());
    await mover(page, 760, 230);
    return caja;
  });

  // 05 — abrir la ficha
  const tarjeta = page.locator("main button").filter({ hasText: "Código:" }).first();
  await parte("05-abrir-ficha", async () => {
    const caja = await cajaDe(tarjeta);
    await clic(page, tarjeta);
    await sinGrabar("abre la ficha", async () => {
      await page.waitForTimeout(2600);
    });
    return caja;
  });

  const bloqueEstado = page.locator("main section, main div").filter({ hasText: /Último movimiento:/ }).first();
  const panelFotos = page.locator("main section").filter({ hasText: "Fotos de la herramienta" }).first();

  // 06 — el estado
  await parte("06-estado", async () => cajaDe(bloqueEstado));

  // 07 — la foto
  await parte("07-foto", async () => {
    const caja = await cajaDe(panelFotos);
    await mover(page, 1160, 700);
    return caja;
  });

  // 08 — las solapas
  await parte("08-solapas", async () => {
    await rueda(page, 520);
    const solapas = page.locator("main button").filter({ hasText: /^(Detalles|Mapa|Línea de tiempo|Lista)$/ });
    const caja = await cajaDeVarios(await solapas.all());
    const lineaDeTiempo = page.locator("main button").filter({ hasText: /^Línea de tiempo$/ }).first();
    await clic(page, lineaDeTiempo);
    await page.waitForTimeout(1200);
    return caja ? { ...caja, h: caja.h + 420 } : null;
  });

  // 09 — registrar salida
  const botonSalida = page.locator("main button").filter({ hasText: /^Registrar salida/ }).first();
  await parte("09-registrar", async () => {
    await rueda(page, -560);
    const caja = await cajaDe(botonSalida);
    await clic(page, botonSalida);
    await page.waitForTimeout(1400);
    return caja;
  });

  // 10 — el dialogo
  const dialogo = page.locator('[role="dialog"]');
  await parte("10-dialogo", async () => {
    const obra = dialogo.locator("select").nth(0);
    const custodio = dialogo.locator("select").nth(1);
    const estado = dialogo.locator("select").nth(2);
    await elegir(page, obra, HERRAMIENTA.obraDestino);
    const caja = await cajaDe(custodio);
    await elegir(page, custodio, HERRAMIENTA.custodio);
    await elegir(page, estado, HERRAMIENTA.estadoSalida);
    return caja;
  });

  // 11 — registrar (aca se corta la escritura y se simula la respuesta)
  await parte("11-registrado", async () => {
    const registrar = dialogo.locator("button").filter({ hasText: /^Registrar$/ }).first();
    sim.marcarHecho();
    await clic(page, registrar);
    await sinGrabar("guarda y refresca", async () => {
      await page.waitForTimeout(3200);
    });
    return cajaDe(bloqueEstado);
  });

  // 12 — el pendiente de confirmar
  await parte("12-pendiente", async () => {
    // El `p` puntual y no un contenedor: con `main` el locator agarraba media
    // pantalla, scrollIntoViewIfNeeded se comia un minuto y no devolvia caja.
    const aviso = page.locator("p").filter({ hasText: /movimientos? sin confirmar/ }).first();
    if (!(await aviso.count())) {
      console.log("    OJO: no aparecio el aviso de pendiente");
      return cajaDe(bloqueEstado);
    }
    const caja = await cajaDe(aviso);
    await mover(page, 1000, 330);
    return caja ? { x: caja.x - 16, y: caja.y - 10, w: caja.w + 32, h: caja.h + 20 } : null;
  });

  await page.waitForTimeout(700);
} catch (err) {
  console.error("\nSE CORTO:", err.message);
  await page.screenshot({ path: "cuadros/ZZ-donde-se-corto.png" }).catch(() => {});
  throw err;
} finally {
  grabando = false;
  try { await cdp?.send("Page.stopScreencast"); } catch { /* ya cerro */ }

  writeFileSync(
    "linea-de-tiempo.json",
    JSON.stringify(
      { viewport: VIEWPORT, cuadros, partes: linea, recortes, bloqueadas: sim.estado.bloqueadas },
      null,
      2,
    ),
  );

  console.log(`\ncuadros capturados: ${cuadros.length}`);
  console.log(`duracion grabada: ${cuadros.length ? cuadros[cuadros.length - 1].t.toFixed(1) : 0}s`);
  console.log(`\nBLOQUEADO (nada de esto salio hacia monday):`);
  for (const b of [...new Set([...bloqueadas, ...sim.estado.bloqueadas])]) console.log(`  ${b}`);

  await browser.close();
  cerrar();
  process.exit(0);
}
