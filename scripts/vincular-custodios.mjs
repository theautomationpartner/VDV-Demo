/**
 * Llena la columna "Custodio actual (ficha)" en las herramientas que ya tienen
 * un custodio escrito como texto.
 *
 *   node scripts/vincular-custodios.mjs            (muestra que haria)
 *   node scripts/vincular-custodios.mjs --aplicar  (lo hace)
 *
 * Las 145 fichas vienen de antes de que existiera el vinculo: su custodio es
 * un nombre escrito. Esto lo cruza contra Equipo VDV y deja el vinculo puesto,
 * para que desde hoy "que tiene a cargo Fulano" se pueda contestar sin
 * comparar cadenas, y para que un renombre no rompa nada.
 *
 * LO QUE NO HACE, A PROPOSITO
 *
 * No corrige el texto ni inventa vinculos. Si un nombre no cruza -porque esa
 * persona no esta en el directorio, o esta como INACTIVA, o hay dos que se
 * llaman igual- la fila se deja como esta y se lista al final. Elegir a dedo
 * entre dos personas que se llaman igual es escribir el vinculo equivocado y
 * no enterarse nunca.
 *
 * Es idempotente: una fila que ya tiene el vinculo correcto no se toca.
 */
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

const MAESTRO = de("MONDAY_BOARD_CONTROL_HERRAMIENTAS");
const EQUIPO = de("MONDAY_BOARD_EQUIPO_VDV");
const COL_TEXTO = "text_mm764j8g";
const COL_VINCULO = "board_relation_mm79270j";
const COL_MAIL = "email_mm701kch";
const COL_ESTADO = "color_mm70te8n";

async function mon(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: de("MONDAY_API_TOKEN"),
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const normalizar = (t) =>
  String(t ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ------------------------------------------------------------- el directorio

const dirDatos = await mon(
  `query($b:[ID!]){ boards(ids:$b){ items_page(limit:200){
     items{ id name column_values(ids:["${COL_ESTADO}"]){ text } } } } }`,
  { b: [EQUIPO] },
);

const fichaPorNombre = new Map();
const repetidos = new Set();
for (const it of dirDatos.boards[0].items_page.items) {
  const estado = String(it.column_values[0]?.text ?? "").trim().toUpperCase();
  if (estado === "INACTIVO") continue;
  const clave = normalizar(it.name);
  if (!clave) continue;
  if (fichaPorNombre.has(clave)) repetidos.add(clave);
  else fichaPorNombre.set(clave, { id: String(it.id), nombre: String(it.name).trim() });
}
console.log(`Directorio: ${fichaPorNombre.size} personas activas${repetidos.size ? `, ${repetidos.size} nombres repetidos` : ""}`);

// ------------------------------------------------------------ las herramientas

const datos = await mon(
  `query($b:[ID!]){ boards(ids:$b){ items_page(limit:500){
     items{ id name
       column_values(ids:["${COL_TEXTO}","${COL_VINCULO}"]){
         id text
         ... on BoardRelationValue { linked_item_ids }
       } } } } }`,
  { b: [MAESTRO] },
);
const items = datos.boards[0].items_page.items;

const porHacer = [];
const sinCustodio = [];
const noCruzan = new Map();
let yaEstaban = 0;

for (const it of items) {
  const porId = Object.fromEntries(it.column_values.map((c) => [c.id, c]));
  const texto = String(porId[COL_TEXTO]?.text ?? "").trim();
  const vinculados = (porId[COL_VINCULO]?.linked_item_ids ?? []).map(String);

  if (!texto) {
    // Sin custodio escrito. Si igual tiene un vinculo colgado, hay que sacarlo:
    // una herramienta en bodega no esta a cargo de nadie.
    if (vinculados.length) porHacer.push({ id: it.id, name: it.name, texto: "", ficha: null, vinculados });
    else sinCustodio.push(it.name);
    continue;
  }

  const clave = normalizar(texto);
  if (repetidos.has(clave)) {
    noCruzan.set(texto, (noCruzan.get(texto) ?? 0) + 1);
    continue;
  }
  const ficha = fichaPorNombre.get(clave);
  if (!ficha) {
    noCruzan.set(texto, (noCruzan.get(texto) ?? 0) + 1);
    continue;
  }
  if (vinculados.length === 1 && vinculados[0] === ficha.id) {
    yaEstaban += 1;
    continue;
  }
  porHacer.push({ id: it.id, name: it.name, texto, ficha, vinculados });
}

console.log(
  `\nHerramientas: ${items.length} | con vinculo correcto: ${yaEstaban} | ` +
    `sin custodio: ${sinCustodio.length} | para vincular: ${porHacer.length}`,
);

if (noCruzan.size) {
  console.log(`\nNO CRUZAN con el directorio (se dejan como estan):`);
  for (const [nombre, cuantas] of [...noCruzan].sort((a, b) => b[1] - a[1])) {
    console.log(`   "${nombre}" -> ${cuantas} herramienta${cuantas > 1 ? "s" : ""}`);
  }
}

if (porHacer.length) {
  console.log(`\nSe van a vincular:`);
  for (const f of porHacer.slice(0, 15)) {
    console.log(`   ${f.texto || "(sin custodio)"} ${f.ficha ? `-> ${f.ficha.nombre} [${f.ficha.id}]` : "-> se saca el vinculo"}   (${f.name})`);
  }
  if (porHacer.length > 15) console.log(`   … y ${porHacer.length - 15} mas`);
}

if (!APLICAR) {
  console.log(`\nEn seco. Corré con --aplicar.\n`);
  process.exit(0);
}

let hechas = 0;
let fallaron = 0;
for (const f of porHacer) {
  try {
    await mon(
      `mutation($b:ID!,$i:ID!,$v:JSON!){
         change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){ id }
       }`,
      {
        b: MAESTRO,
        i: String(f.id),
        v: JSON.stringify({
          // Se escribe tambien el TEXTO con el nombre del directorio: asi las
          // dos columnas quedan diciendo lo mismo desde el primer dia, y de
          // paso se emparejan los "claudio leyton" con los "CLAUDIO LEYTON".
          [COL_TEXTO]: f.ficha ? f.ficha.nombre : "",
          [COL_VINCULO]: { item_ids: f.ficha ? [Number(f.ficha.id)] : [] },
        }),
      },
    );
    hechas += 1;
  } catch (error) {
    fallaron += 1;
    console.log(`   FALLO ${f.name}: ${error.message.slice(0, 140)}`);
  }
}

console.log(`\nVinculadas ${hechas}${fallaron ? `, ${fallaron} fallaron` : ""}.\n`);
process.exit(fallaron === 0 ? 0 : 1);
