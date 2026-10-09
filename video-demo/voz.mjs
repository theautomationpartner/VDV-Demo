/**
 * Genera un mp3 por parte del guion con edge-tts y mide cuanto dura cada uno.
 *
 *   node voz.mjs
 *
 * Deja audio/NN-nombre.mp3 y audio/duraciones.json, que es lo que despues usa
 * el montaje para saber cuanto tiene que durar cada parte en pantalla.
 */
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { PARTES, VOZ } from "./guion.mjs";

const correr = promisify(execFile);
mkdirSync("audio", { recursive: true });

const duraciones = {};

for (const parte of PARTES) {
  const salida = `audio/${parte.id}.mp3`;
  await correr("python", [
    "-m", "edge_tts",
    "--voice", VOZ,
    "--text", parte.texto,
    "--write-media", salida,
  ]);

  const { stdout } = await correr("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    salida,
  ]);
  const segundos = Number(stdout.trim());
  duraciones[parte.id] = segundos;
  console.log(`${parte.id}  ${segundos.toFixed(2)}s  ${parte.texto.slice(0, 55)}…`);
}

const total = Object.values(duraciones).reduce((a, b) => a + b, 0);
writeFileSync("audio/duraciones.json", JSON.stringify(duraciones, null, 2));
console.log(`\ntotal de voz: ${total.toFixed(1)}s`);
console.log(`con las pausas de 0,7s por parte: ~${(total + PARTES.length * 0.7).toFixed(1)}s`);
