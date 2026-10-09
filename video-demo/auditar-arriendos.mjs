/**
 * Auditoria visual y de accesibilidad de Arriendos, MEDIDA en la app compilada.
 *
 *   node auditar-arriendos.mjs
 *
 * No opina sobre el diseño: mide lo que se puede medir y deja la evidencia.
 * Recorre escritorio y telefono, y revisa contraste, foco, objetivos tactiles,
 * desbordes, etiquetas de formulario y jerarquia de titulos.
 *
 * Solo lectura: toda escritura queda cortada.
 */
import { mkdirSync } from "node:fs";
import { levantarApp, abrirNavegador, BASE } from "./comun.mjs";

const CARPETA = "capturas/auditoria";
mkdirSync(CARPETA, { recursive: true });

const hallazgos = [];
const anotar = (nivel, donde, que, evidencia) => {
  hallazgos.push({ nivel, donde, que, evidencia });
  console.log(`  ${nivel === "alto" ? "ALTO " : nivel === "medio" ? "medio" : "bajo "} ${donde}: ${que}`);
  if (evidencia) console.log(`         ${evidencia}`);
};

/** Lo que se inyecta en la pagina para medir. */
const MEDIDORES = `
  window.__aud = {
    /**
     * Los canales 0-255 de un color, con su alfa.
     *
     * Chrome devuelve tanto "rgb(1,2,3)" como "color(srgb 0.5 0.5 0.5 / 0.85)".
     * En el segundo los canales van de 0 a 1, y tomarlos como 0-255 daba
     * contrastes inventados de 1,12:1 sobre texto que se lee perfecto.
     */
    canales(c) {
      const t = String(c);
      const m = t.match(/[0-9.]+/g);
      if (!m) return null;
      const fraccion = t.indexOf("color(") === 0;
      const n = m.slice(0, 3).map((v) => (fraccion ? Number(v) * 255 : Number(v)));
      const a = m.length > 3 ? Number(m[3]) : 1;
      return { n, a };
    },
    lumDe(canales) {
      const [r, g, b] = canales.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },
    // El primer fondo opaco detras de un elemento.
    fondoDe(el) {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        const k = this.canales(c);
        if (k && k.a > 0.5) return c;
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    },
    contraste(el) {
      const cs = getComputedStyle(el);
      const texto = this.canales(cs.color);
      const fondo = this.canales(this.fondoDe(el));
      if (!texto || !fondo) return null;
      // El texto semitransparente se COMPONE sobre su fondo antes de medir:
      // es lo que el ojo ve. Sin esto, un gris claro al 85% daba 1,12:1.
      const sobre = texto.n.map((v, i) => v * texto.a + fondo.n[i] * (1 - texto.a));
      const l1 = this.lumDe(sobre);
      const l2 = this.lumDe(fondo.n);
      const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (a + 0.05) / (b + 0.05);
    },
  };
`;

async function auditar(page, rotulo) {
  console.log(`\n--- ${rotulo} ---`);
  await page.evaluate(MEDIDORES);

  // 1. CONTRASTE del texto visible.
  const contraste = await page.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll("p, span, h1, h2, h3, label, a, button, td, th, li")) {
      if (!el.offsetParent || el.children.length > 0) continue;
      const texto = (el.innerText || "").trim();
      if (!texto) continue;
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      const grande = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
      const minimo = grande ? 3 : 4.5;
      const r = window.__aud.contraste(el);
      if (r !== null && r < minimo) {
        malos.push({ texto: texto.slice(0, 48), ratio: Math.round(r * 100) / 100, minimo, px: Math.round(px), color: cs.color });
      }
    }
    // Un mismo estilo se repite: se agrupa por color+tamaño.
    const vistos = new Map();
    for (const m of malos) {
      const k = `${m.color}|${m.px}`;
      if (!vistos.has(k)) vistos.set(k, { ...m, veces: 0 });
      vistos.get(k).veces += 1;
    }
    return [...vistos.values()];
  });
  for (const c of contraste) {
    anotar(
      c.ratio < 3 ? "alto" : "medio",
      rotulo,
      `contraste ${c.ratio}:1 (mínimo ${c.minimo}) en texto de ${c.px}px`,
      `"${c.texto}" · ${c.veces} vez/veces · color ${c.color}`,
    );
  }

  // 2. OBJETIVOS TACTILES chicos.
  const chicos = await page.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll("button, a[href], select, input, [role='button']")) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 43.5 || r.width < 43.5) {
        malos.push({
          que: (el.innerText || el.getAttribute("aria-label") || el.type || el.tagName).trim().slice(0, 40),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return malos.slice(0, 12);
  });
  for (const c of chicos) {
    anotar("medio", rotulo, `objetivo táctil de ${c.w}×${c.h}px (mínimo 44×44)`, `"${c.que}"`);
  }

  // 3. DESBORDE horizontal.
  const desborde = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth + 1) return null;
    const culpables = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.right > doc.clientWidth + 2 && r.width > 40) {
        culpables.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} (hasta ${Math.round(r.right)}px)`);
      }
      if (culpables.length >= 4) break;
    }
    return { ancho: doc.scrollWidth, ventana: doc.clientWidth, culpables };
  });
  if (desborde) {
    anotar("alto", rotulo, `la página se desplaza de costado: ${desborde.ancho}px en una ventana de ${desborde.ventana}px`, desborde.culpables.join(" · "));
  }

  // 4. CAMPOS SIN ETIQUETA asociada.
  const sinEtiqueta = await page.evaluate(() => {
    const malos = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (!el.offsetParent || el.type === "hidden") continue;
      const tieneLabel = el.id && document.querySelector(`label[for="${el.id}"]`);
      const envuelto = el.closest("label");
      const aria = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby");
      if (!tieneLabel && !envuelto && !aria) {
        malos.push({ tipo: el.tagName.toLowerCase() + (el.type ? `[${el.type}]` : ""), ph: el.placeholder || "(sin placeholder)" });
      }
    }
    return malos.slice(0, 10);
  });
  for (const m of sinEtiqueta) {
    anotar("medio", rotulo, `${m.tipo} sin etiqueta asociada`, `placeholder: ${m.ph}`);
  }

  // 5. JERARQUIA de titulos.
  const titulos = await page.evaluate(() =>
    [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
      .filter((h) => h.offsetParent)
      .map((h) => ({ n: Number(h.tagName[1]), t: h.innerText.trim().slice(0, 40) })),
  );
  if (titulos.length) {
    const h1 = titulos.filter((t) => t.n === 1).length;
    if (h1 === 0) anotar("bajo", rotulo, "la pantalla no tiene ningún h1");
    if (h1 > 1) anotar("bajo", rotulo, `hay ${h1} h1 en la misma pantalla`);
    for (let i = 1; i < titulos.length; i += 1) {
      if (titulos[i].n - titulos[i - 1].n > 1) {
        anotar("bajo", rotulo, `salto de h${titulos[i - 1].n} a h${titulos[i].n}`, `"${titulos[i].t}"`);
        break;
      }
    }
  }

  // 6. FOCO VISIBLE: se tabula y se mira si algo cambia.
  const sinFoco = await page.evaluate(() => {
    const malos = [];
    const focoables = [...document.querySelectorAll("button, a[href], select, input, textarea, [tabindex='0']")]
      .filter((el) => el.offsetParent && !el.disabled)
      .slice(0, 25);
    for (const el of focoables) {
      const antes = getComputedStyle(el);
      const base = `${antes.outline}|${antes.boxShadow}|${antes.borderColor}`;
      el.focus();
      const d = getComputedStyle(el);
      const foco = `${d.outline}|${d.boxShadow}|${d.borderColor}`;
      if (base === foco) {
        malos.push((el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40));
      }
      el.blur();
    }
    return malos;
  });
  for (const m of sinFoco.slice(0, 6)) {
    anotar("medio", rotulo, "al enfocarlo con el teclado no cambia nada visible", `"${m}"`);
  }
}

const { cerrar } = await levantarApp();

try {
  // ------------------------------------------------- escritorio
  const esc = await abrirNavegador({ simular: () => null });
  await esc.page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await esc.page.waitForTimeout(3500);
  await auditar(esc.page, "listado · escritorio");
  await esc.page.screenshot({ path: `${CARPETA}/01-listado-escritorio.png`, fullPage: true });

  // El foco de un <select>, que es lo que Mateo vio raro.
  console.log("\n--- el foco del select, medido ---");
  await esc.page.locator("main select").first().focus();
  await esc.page.waitForTimeout(400);
  const foco = await esc.page.evaluate(() => {
    const s = document.querySelector("main select");
    const cs = getComputedStyle(s);
    const campo = s.closest("div");
    const label = campo?.querySelector("label") ?? campo?.previousElementSibling;
    return {
      outline: cs.outline,
      outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow.slice(0, 120),
      ringOffsetColor: cs.getPropertyValue("--tw-ring-offset-color"),
      ringOffsetWidth: cs.getPropertyValue("--tw-ring-offset-width"),
      ringColor: cs.getPropertyValue("--tw-ring-color"),
      fondoDelCampo: campo ? getComputedStyle(campo).backgroundColor : null,
      labelTexto: label?.innerText?.trim()?.slice(0, 30) ?? null,
    };
  });
  console.log(JSON.stringify(foco, null, 2));
  await esc.page.screenshot({ path: `${CARPETA}/02-select-enfocado.png` });

  // Y el de adentro del dialogo, que es donde se vio.
  await esc.page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await esc.page.waitForTimeout(4000);
  await auditar(esc.page, "alta paso 1 · escritorio");
  await esc.page.screenshot({ path: `${CARPETA}/03-dialogo-alta.png` });
  await esc.browser.close();

  // ------------------------------------------------- telefono
  const cel = await abrirNavegador({ simular: () => null });
  await cel.page.setViewportSize({ width: 390, height: 844 });
  await cel.page.goto(`${BASE}/arriendos`, { waitUntil: "networkidle", timeout: 120_000 });
  await cel.page.waitForTimeout(3500);
  await auditar(cel.page, "listado · teléfono 390px");
  await cel.page.screenshot({ path: `${CARPETA}/04-listado-telefono.png`, fullPage: true });

  await cel.page.locator("button").filter({ hasText: "Nuevo arriendo" }).first().click();
  await cel.page.waitForTimeout(4000);
  await auditar(cel.page, "alta · teléfono 390px");
  await cel.page.screenshot({ path: `${CARPETA}/05-alta-telefono.png` });
  await cel.browser.close();
} catch (error) {
  anotar("alto", "la auditoría", "se cortó", error.message);
} finally {
  const porNivel = (n) => hallazgos.filter((h) => h.nivel === n).length;
  console.log("\n====================================================");
  console.log(`>>> ${hallazgos.length} hallazgos: ${porNivel("alto")} altos, ${porNivel("medio")} medios, ${porNivel("bajo")} bajos`);
  console.log(`capturas en ${CARPETA}/`);
  cerrar();
  process.exit(0);
}
