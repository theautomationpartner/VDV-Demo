/**
 * El cursor y los gestos.
 *
 * Playwright mueve el mouse de verdad, pero el cursor del sistema NO sale en la
 * captura: el screencast dibuja la pagina, no la pantalla. Asi que se inyecta un
 * cursor falso en el DOM y se lo mueve junto con el real. Los clics del video
 * son los del cursor falso; los que valen son los de Playwright.
 */

/** Inyecta el cursor y el circulo de clic. Se llama una vez por pagina. */
export async function ponerCursor(page) {
  await page.addStyleTag({
    content: `
      #cursor-demo {
        position: fixed; top: 0; left: 0; width: 22px; height: 22px;
        margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(255,255,255,.92);
        box-shadow: 0 0 0 2px rgba(0,0,0,.35), 0 2px 10px rgba(0,0,0,.5);
        z-index: 2147483647; pointer-events: none;
        transform: translate3d(-100px,-100px,0);
      }
      #onda-demo {
        position: fixed; top: 0; left: 0; width: 22px; height: 22px;
        margin: -11px 0 0 -11px; border-radius: 50%;
        border: 3px solid rgba(255,255,255,.9);
        z-index: 2147483646; pointer-events: none; opacity: 0;
        transform: translate3d(-100px,-100px,0) scale(1);
      }
      #onda-demo.sonando { animation: onda-demo-anim .55s ease-out forwards; }
      @keyframes onda-demo-anim {
        from { opacity: .9; }
        to   { opacity: 0; }
      }
    `,
  });
  await page.evaluate(() => {
    for (const id of ["cursor-demo", "onda-demo"]) {
      if (document.getElementById(id)) continue;
      const d = document.createElement("div");
      d.id = id;
      document.body.appendChild(d);
    }
    window.__cursor = { x: -100, y: -100 };
    window.__ponerCursor = (x, y) => {
      window.__cursor = { x, y };
      const c = document.getElementById("cursor-demo");
      if (c) c.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    window.__onda = (x, y) => {
      const o = document.getElementById("onda-demo");
      if (!o) return;
      o.style.transform = `translate3d(${x}px,${y}px,0) scale(3.2)`;
      o.classList.remove("sonando");
      void o.offsetWidth;
      o.classList.add("sonando");
      setTimeout(() => { o.style.transform = `translate3d(${x}px,${y}px,0) scale(1)`; }, 560);
    };
  });
}

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Mueve el cursor hasta (x,y) con aceleracion y frenada. */
export async function mover(page, x, y, { pasos = 26, espera = 16 } = {}) {
  const desde = await page.evaluate(() => window.__cursor ?? { x: -100, y: -100 });
  for (let i = 1; i <= pasos; i += 1) {
    const t = suave(i / pasos);
    const px = desde.x + (x - desde.x) * t;
    const py = desde.y + (y - desde.y) * t;
    await page.evaluate(([a, b]) => window.__ponerCursor(a, b), [px, py]);
    await page.mouse.move(px, py);
    await page.waitForTimeout(espera);
  }
}

/** El centro de un elemento, en pixeles de la ventana. */
export async function centroDe(locator) {
  const caja = await locator.boundingBox();
  if (!caja) throw new Error("el elemento no esta visible, no tiene caja");
  return { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2, caja };
}

/**
 * Lleva el cursor al elemento y hace clic, con la onda.
 *
 * `debajo`: el cursor no puede tapar lo que la voz esta nombrando, asi que
 * despues del clic baja un poco, fuera del elemento.
 */
export async function clic(page, locator, { debajo = true } = {}) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(220);
  const { x, y, caja } = await centroDe(locator);
  await mover(page, x, y);
  await page.waitForTimeout(140);
  await page.evaluate(([a, b]) => window.__onda(a, b), [x, y]);
  await locator.click();
  await page.waitForTimeout(160);
  if (debajo) {
    const abajo = Math.min(y + caja.height / 2 + 26, 880);
    await page.evaluate(([a, b]) => window.__ponerCursor(a, b), [x, abajo]);
  }
}

/** Tipea con el cursor puesto en el campo, a velocidad de persona. */
export async function escribir(page, locator, texto, { porTecla = 75 } = {}) {
  await clic(page, locator, { debajo: false });
  await locator.type(texto, { delay: porTecla });
}

/** Elige una opcion de un <select>, mostrando el cursor sobre el campo. */
export async function elegir(page, locator, valor) {
  await clic(page, locator, { debajo: false });
  await locator.selectOption({ label: valor });
  await page.waitForTimeout(260);
}

/** Scroll con la rueda, de a poco, para que se vea el movimiento. */
export async function rueda(page, pixeles, { paso = 110, espera = 28 } = {}) {
  const signo = Math.sign(pixeles);
  let hecho = 0;
  while (Math.abs(hecho) < Math.abs(pixeles)) {
    const falta = Math.abs(pixeles) - Math.abs(hecho);
    const este = signo * Math.min(paso, falta);
    await page.mouse.wheel(0, este);
    hecho += este;
    await page.waitForTimeout(espera);
  }
  await page.waitForTimeout(260);
}
