/**
 * Escribe el index.html de HyperFrames a partir de salida/linea-final.json.
 *
 *   node componer.mjs
 *
 * Se genera en vez de escribirse a mano porque son doce zooms, y cada uno es una
 * cuenta -pasar la caja del elemento a coordenadas del cuadro, sacar la escala y
 * correr la camara para centrarla- que a mano sale mal una de cada dos veces.
 */
import { readFileSync, writeFileSync } from "node:fs";

const L = JSON.parse(readFileSync("salida/linea-final.json", "utf8"));

const ANCHO = 1920;
const ALTO = 1080;

/** Cuando entra la grabacion. Se pisa con el final de la apertura. */
const ABRE = 3.8;
const COLA = 1.4; // el fundido a negro del final
const DURACION = Number((ABRE + L.duracion + COLA).toFixed(2));

// La pagina se maqueto a 1600x900 y el cuadro sale 1920x1080: un factor parejo.
const AESCALA = ANCHO / L.viewport.width;

const ZOOM_MAX = 1.9; // mas que esto empieza a verse blando
const ZOOM_MIN = 1.15; // menos que esto no se nota que hubo zoom
const AIRE = 44; // margen alrededor del elemento, en pixeles de la pagina

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/** De la caja del elemento a la transformacion de la camara. */
function camara(zoom) {
  if (!zoom) return { escala: 1, x: 0, y: 0 };

  // Con aire alrededor y sin salirse de la pagina.
  const x0 = clamp(zoom.x - AIRE, 0, L.viewport.width);
  const y0 = clamp(zoom.y - AIRE, 0, L.viewport.height);
  const x1 = clamp(zoom.x + zoom.w + AIRE, 0, L.viewport.width);
  const y1 = clamp(zoom.y + zoom.h + AIRE, 0, L.viewport.height);

  const w = (x1 - x0) * AESCALA;
  const h = (y1 - y0) * AESCALA;
  if (w <= 0 || h <= 0) return { escala: 1, x: 0, y: 0 };

  const escala = clamp(Math.min(ANCHO / w, ALTO / h), ZOOM_MIN, ZOOM_MAX);

  // El centro de la caja va al centro del cuadro, sin dejar ver borde vacio.
  const cx = (x0 * AESCALA + w / 2) * escala;
  const cy = (y0 * AESCALA + h / 2) * escala;
  return {
    escala: Number(escala.toFixed(4)),
    x: Number(clamp(ANCHO / 2 - cx, ANCHO * (1 - escala), 0).toFixed(1)),
    y: Number(clamp(ALTO / 2 - cy, ALTO * (1 - escala), 0).toFixed(1)),
  };
}

const partes = L.partes.map((p) => ({ ...p, camara: camara(p.zoom), absoluto: Number((ABRE + p.inicio).toFixed(3)) }));

// ------------------------------------------------------------------- el HTML

const audios = [
  `      <audio id="voz-01-apertura" src="assets/voz/01-apertura.mp3" data-start="0.35" data-duration="3.94" data-track-index="3" data-volume="1"></audio>`,
  ...partes.map(
    (p) =>
      `      <audio id="voz-${p.id}" src="assets/voz/${p.id}.mp3" data-start="${p.absoluto}" data-duration="${p.audio.toFixed(2)}" data-track-index="3" data-volume="1"></audio>`,
  ),
].join("\n");

const zooms = partes
  .map((p) => {
    const c = p.camara;
    return `  tl.to("#camara", { scale: ${c.escala}, x: ${c.x}, y: ${c.y}, duration: 1.0, ease: "power2.inOut" }, ${p.absoluto.toFixed(2)});`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"><\/script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden;
        background: #0a0a0c;
      }
      #root {
        width: 100%; height: 100%; position: relative; overflow: hidden;
        background: hsl(260 8% 8%);
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }

      /* La camara: envuelve la grabacion y es lo unico que se anima para los
         zooms. No lleva data-start -un wrapper con tiempo alrededor de un
         <video> con tiempo es justo lo que el lint rechaza. */
      #camara {
        position: absolute; inset: 0;
        width: ${ANCHO}px; height: ${ALTO}px;
        transform-origin: 0 0;
        will-change: transform;
      }
      #base { width: ${ANCHO}px; height: ${ALTO}px; object-fit: cover; display: block; }

      /* La apertura, encima de todo salvo el fundido. */
      #apertura {
        position: absolute; inset: 0; display: flex;
        align-items: center; justify-content: center; flex-direction: column;
        background:
          radial-gradient(120% 90% at 50% 38%, hsl(262 72% 22%) 0%, hsl(260 10% 7%) 62%),
          hsl(260 8% 8%);
      }
      #marca {
        display: flex; align-items: center; gap: 26px; margin-bottom: 38px;
      }
      #sello {
        width: 104px; height: 104px; border-radius: 26px;
        background: hsl(262 72% 64%);
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 38px; font-weight: 700; letter-spacing: 0.04em;
        box-shadow: 0 18px 60px hsl(262 72% 40% / 0.55);
      }
      #empresa {
        color: hsl(260 8% 72%); font-size: 27px; font-weight: 500;
        letter-spacing: 0.34em; text-transform: uppercase;
      }
      #titulo {
        color: hsl(260 8% 96%); font-size: 96px; font-weight: 700;
        letter-spacing: -0.03em; text-align: center; text-wrap: balance;
      }
      #bajada {
        margin-top: 22px; color: hsl(262 60% 78%);
        font-size: 31px; font-weight: 500; letter-spacing: 0.02em;
      }

      /* El logo de TAP: fuera de la camara, asi que los zooms no lo agrandan. */
      /* Arranca invisible DESDE EL CSS y no con un tl.set(...) en el 0: un set
         de duracion cero en el instante 0 no llega a aplicarse mientras la
         aguja esta justo ahi, y el primer cuadro salia con el logo entero. */
      #tap {
        position: absolute; right: 64px; bottom: 56px;
        width: 232px; transform-origin: 100% 100%;
        opacity: 0;
      }
      #tap img { width: 100%; height: auto; display: block; }

      /* El fundido de entrada y salida, arriba de todo. */
      #negro { position: absolute; inset: 0; background: #000; }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${DURACION}"
      data-width="${ANCHO}"
      data-height="${ALTO}"
    >
      <div id="camara">
        <video
          id="base"
          class="clip"
          src="assets/base-4k.mp4"
          playsinline
          muted
          data-start="${ABRE}"
          data-duration="${L.duracion}"
          data-track-index="0"
        ></video>
      </div>

      <div id="apertura" class="clip" data-start="0" data-duration="5" data-track-index="1">
        <div id="marca">
          <div id="sello">VDV</div>
          <div id="empresa">Vergara del Valle</div>
        </div>
        <h1 id="titulo">Control de Herramientas</h1>
        <p id="bajada">dentro de VDV Suite</p>
      </div>

      <div id="tap" class="clip" data-start="0" data-duration="${DURACION}" data-track-index="2">
        <img src="assets/logo-tap.png" alt="The Automation Partner" />
      </div>

      <div id="negro" class="clip" data-start="0" data-duration="${DURACION}" data-track-index="4"></div>

${audios}
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });

      // --- la apertura ---------------------------------------------------
      tl.set("#camara", { scale: 1, x: 0, y: 0 }, 0);
      tl.fromTo("#marca", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.85, ease: "power2.out" }, 0.35);
      tl.fromTo("#titulo", { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, 0.6);
      tl.fromTo("#bajada", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, 0.95);
      tl.to("#tap", { opacity: 1, duration: 0.7, ease: "power2.out" }, 0.6);

      // El texto se va ANTES que el fondo: si se fueran juntos, durante el
      // cruce quedaria texto claro sobre un fondo ya aclarado por el video y
      // los chequeos de contraste lo marcan.
      tl.to(["#marca", "#titulo", "#bajada"], { opacity: 0, y: -16, duration: 0.55, ease: "power2.in" }, 3.15);
      tl.to("#apertura", { opacity: 0, duration: 0.7, ease: "power1.inOut" }, ${(ABRE - 0.1).toFixed(2)});

      // El logo pasa a marca de agua recien cuando la apertura termino.
      tl.to("#tap", { scale: 0.6, opacity: 0.35, duration: 0.6, ease: "power2.inOut" }, ${(ABRE + 0.6).toFixed(2)});

      // --- los fundidos de negro ----------------------------------------
      tl.fromTo("#negro", { opacity: 1 }, { opacity: 0, duration: 0.7, ease: "power1.out" }, 0);
      tl.to("#negro", { opacity: 1, duration: 1.1, ease: "power1.in" }, ${(DURACION - 1.1).toFixed(2)});

      // --- los zooms, encadenados ---------------------------------------
      // Cada parte va directo al encuadre siguiente, sin volver a 1x en el
      // medio: volver a pantalla completa entre dos zooms seguidos marea.
${zooms}

      window.__timelines["main"] = tl;
      tl.seek(0);
    <\/script>
  </body>
</html>
`;

writeFileSync("videos/control-herramientas/index.html", html);

console.log(`duracion total: ${DURACION}s`);
console.log(`la grabacion entra en ${ABRE}s y termina en ${(ABRE + L.duracion).toFixed(1)}s\n`);
for (const p of partes) {
  const c = p.camara;
  console.log(`  ${p.id.padEnd(16)} ${String(p.absoluto).padStart(6)}s  zoom x${c.escala.toFixed(2)}  (${c.x}, ${c.y})`);
}
