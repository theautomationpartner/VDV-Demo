// Copia el worker de pdf.js a public/ para que el visor de documentos del
// Generador de OC lo pueda servir desde /pdf.worker.min.mjs.
//
// Se hace en cada build (y en cada `npm run dev`) en vez de dejar el archivo
// versionado: son 1,2 MB que TIENEN que coincidir exactamente con la version de
// pdfjs-dist instalada. Si se commiteara, un `npm update` lo dejaria desfasado
// y el visor fallaria sin ninguna pista de por que.
//
// La app original importaba el worker con "?worker", que es una extension de
// Vite; con webpack no existe.
const fs = require("fs");
const path = require("path");

const raiz = path.join(__dirname, "..");
const origen = path.join(raiz, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destino = path.join(raiz, "public", "pdf.worker.min.mjs");

if (!fs.existsSync(origen)) {
  console.error(`No se encontro el worker de pdf.js en ${origen}. ¿Falta npm install?`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.copyFileSync(origen, destino);

const version = require(path.join(raiz, "node_modules", "pdfjs-dist", "package.json")).version;
console.log(`worker de pdf.js ${version} copiado a public/`);
