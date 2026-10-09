/**
 * Montaje base: saca las esperas de carga, empareja los cuadros a 30 fps y
 * codifica el video 4K sin voz, que es el que despues edita HyperFrames.
 *
 *   node montar.mjs
 *
 * Deja salida/base-4k.mp4 y salida/linea-final.json, este ultimo con los
 * tiempos YA CORRIDOS por los recortes: el inicio de cada audio y la caja de
 * cada zoom, en el tiempo del video montado y no en el de la grabacion.
 *
 * Los cuadros no se copian: se arma una lista para el demuxer `concat` de
 * ffmpeg, que puede repetir el mismo archivo tantas veces como haga falta. Con
 * copias serian varios gigas de PNG para nada, porque Chrome manda cuadros solo
 * cuando la pantalla cambia y hay tramos de un segundo con un solo cuadro.
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const correr = promisify(execFile);
const FPS = 30;

const t = JSON.parse(readFileSync("linea-de-tiempo.json", "utf8"));
const duraciones = JSON.parse(readFileSync("audio/duraciones.json", "utf8"));
mkdirSync("salida", { recursive: true });

if (!t.cuadros.length) throw new Error("no hay cuadros grabados");

// ----------------------------------------------- los tramos que SI se quedan

/**
 * Cuando termina la grabacion, que NO es cuando llego el ultimo cuadro.
 *
 * Chrome manda cuadros solo cuando la pantalla cambia. La ultima parte deja el
 * cursor quieto mientras la voz sigue hablando, asi que el ultimo cuadro llego
 * a los 82 s aunque la grabacion siguio hasta los 89,7. Tomando el cuadro, el
 * montaje se comia los ultimos 7 segundos -justo el remate del video-. Manda la
 * ultima parte; los cuadros que faltan se rellenan repitiendo el ultimo.
 */
const finGrabacion = Math.max(
  t.cuadros[t.cuadros.length - 1].t,
  ...t.partes.map((p) => p.hasta),
);

/**
 * Una espera de carga solo se corta si NO esta tapada por la voz.
 *
 * Las dos esperas de esta grabacion caen adentro de partes que estan narrando
 * -mientras abre la ficha, la voz dice "cada herramienta tiene su ficha"-. Si se
 * cortan, el video de esa parte queda mas corto que su mp3 y la voz se monta
 * sobre la parte siguiente: medido, 0,5 s de desfase en las partes 05 y 11. Una
 * espera tapada por la voz no es tiempo muerto, asi que se deja.
 */
const necesita = (p) => (duraciones[p.id] ?? p.audio ?? 0) + 0.7;
const tapadoPorLaVoz = (c) =>
  t.partes.some((p) => c.desde >= p.desde && c.hasta <= p.hasta && p.hasta - p.desde <= necesita(p) + c.hasta - c.desde);

const descartados = t.recortes.filter(tapadoPorLaVoz);
const cortes = t.recortes.filter((c) => !tapadoPorLaVoz(c)).sort((a, b) => a.desde - b.desde);
for (const c of descartados) {
  console.log(`se deja "${c.etiqueta}" (${(c.hasta - c.desde).toFixed(1)}s): la voz lo tapa`);
}

const tramos = [];
let cursor = 0;
for (const c of cortes) {
  if (c.desde > cursor) tramos.push({ desde: cursor, hasta: c.desde });
  cursor = Math.max(cursor, c.hasta);
}
if (cursor < finGrabacion) tramos.push({ desde: cursor, hasta: finGrabacion });

const duracionFinal = tramos.reduce((a, s) => a + (s.hasta - s.desde), 0);
const recortado = finGrabacion - duracionFinal;

/** Tiempo del video montado -> tiempo de la grabacion. */
function aFuente(tSalida) {
  let resto = tSalida;
  for (const s of tramos) {
    const largo = s.hasta - s.desde;
    if (resto <= largo) return s.desde + resto;
    resto -= largo;
  }
  return finGrabacion;
}

/** Tiempo de la grabacion -> tiempo del video montado. */
function aSalida(tFuente) {
  let acum = 0;
  for (const s of tramos) {
    if (tFuente < s.desde) return acum;
    if (tFuente <= s.hasta) return acum + (tFuente - s.desde);
    acum += s.hasta - s.desde;
  }
  return acum;
}

// ------------------------------------------------ la lista de cuadros parejos

/** El ultimo cuadro capturado en o antes de ese instante. */
function cuadroEn(tFuente) {
  let elegido = t.cuadros[0];
  for (const c of t.cuadros) {
    if (c.t <= tFuente) elegido = c;
    else break;
  }
  return elegido.archivo;
}

const totalCuadros = Math.floor(duracionFinal * FPS);
const lineas = [];
// Las rutas del demuxer concat se resuelven desde la carpeta de ESTE archivo,
// que es salida/, no desde donde se corre ffmpeg.
const ruta = (f) => `../${f}`;
for (let i = 0; i < totalCuadros; i += 1) {
  lineas.push(`file '${ruta(cuadroEn(aFuente(i / FPS)))}'`);
  lineas.push(`duration ${(1 / FPS).toFixed(6)}`);
}
// El demuxer concat pide repetir el ultimo archivo para que dure lo que dice.
lineas.push(`file '${ruta(cuadroEn(aFuente((totalCuadros - 1) / FPS)))}'`);
writeFileSync("salida/cuadros.txt", lineas.join("\n"));

// ------------------------------------------------------------- la linea final

const partes = t.partes.map((p) => ({
  id: p.id,
  // El audio arranca cuando arranca la parte.
  inicio: Number(aSalida(p.desde).toFixed(3)),
  fin: Number(aSalida(p.hasta).toFixed(3)),
  audio: duraciones[p.id] ?? p.audio,
  mp3: `audio/${p.id}.mp3`,
  zoom: p.zoom,
}));

writeFileSync(
  "salida/linea-final.json",
  JSON.stringify(
    {
      fps: FPS,
      duracion: Number(duracionFinal.toFixed(3)),
      viewport: t.viewport,
      // El video sale en 3840x2159: un pixel impar que deja Chrome. Se anota
      // para que la edicion escale sabiendolo y no lo descubra al codificar.
      tamanoCuadro: { ancho: 3840, alto: 2159 },
      partes,
      recortado: Number(recortado.toFixed(2)),
    },
    null,
    2,
  ),
);

console.log(`grabado:   ${finGrabacion.toFixed(1)}s`);
console.log(`recortado: ${recortado.toFixed(1)}s en ${cortes.length} tramos de carga`);
console.log(`montado:   ${duracionFinal.toFixed(1)}s · ${totalCuadros} cuadros a ${FPS} fps`);

// ------------------------------------------------------------- el intermedio

console.log("\ncodificando el 4K…");
await correr(
  "ffmpeg",
  [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", "salida/cuadros.txt",
    // `-vsync` ya no existe en ffmpeg 9; su reemplazo es `-fps_mode`.
    "-fps_mode", "cfr",
    "-r", String(FPS),
    // -crf 14 y tune animation: la pantalla de una app es plana y con bordes
    // duros, que es justo lo que ese perfil conserva mejor.
    "-c:v", "libx264",
    "-crf", "14",
    "-tune", "animation",
    "-preset", "medium",
    "-pix_fmt", "yuv420p",
    // El alto impar no lo admite yuv420p: se recorta una fila.
    "-vf", "crop=3840:2158:0:0",
    "salida/base-4k.mp4",
  ],
  { maxBuffer: 1024 * 1024 * 64 },
);

const { stdout } = await correr("ffprobe", [
  "-v", "error",
  "-select_streams", "v:0",
  "-show_entries", "stream=width,height,nb_frames,duration",
  "-of", "default=noprint_wrappers=1",
  "salida/base-4k.mp4",
]);
console.log(stdout.trim());
console.log("\nsalida/base-4k.mp4 listo");
