// Deja correr modulos del repo fuera de Next: resuelve "@/...", completa la
// extension que el bundler agrega sola, y neutraliza "server-only".
import { pathToFileURL, fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const EXTENSIONES = ["", ".js", ".jsx", ".mjs", "/index.js"];

function conExtension(base) {
  for (const ext of EXTENSIONES) {
    if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) return base + ext;
  }
  return base;
}

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    return next(pathToFileURL(conExtension(path.join(RAIZ, specifier.slice(2)))).href, context);
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const desde = path.dirname(fileURLToPath(context.parentURL));
    return next(pathToFileURL(conExtension(path.resolve(desde, specifier))).href, context);
  }
  return next(specifier, context);
}
