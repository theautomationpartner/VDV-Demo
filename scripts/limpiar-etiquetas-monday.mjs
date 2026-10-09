/**
 * Apaga las etiquetas de fabrica que quedaron colgadas en las columnas de
 * estado: "En curso", "Listo" y "Detenido".
 *
 *   node scripts/limpiar-etiquetas-monday.mjs            (muestra que haria)
 *   node scripts/limpiar-etiquetas-monday.mjs --aplicar  (lo hace)
 *
 * Cuando monday crea una columna de estado le pone esas tres. El cliente cargo
 * las suyas encima -DISPONIBLE, EN USO, EN REPARACION...- pero nunca saco las
 * viejas, asi que el desplegable sigue ofreciendolas y cualquiera puede dejar
 * una herramienta marcada como "Listo", que no quiere decir nada.
 *
 * Se DESACTIVAN, no se borran: desaparecen del desplegable y lo ya escrito se
 * sigue leyendo. Igual se comprueba fila por fila que no las use nadie, y si
 * alguna esta en uso se saltea la columna entera.
 *
 * TRES COSAS QUE HAY QUE SABER ANTES DE TOCAR ESTO
 *
 *   1. `update_status_column` pide `revision`, que sale del propio campo
 *      `revision` de la columna. Sin eso contesta que falta el argumento.
 *   2. Hay que mandar el JUEGO COMPLETO de etiquetas. Mandando solo las tres,
 *      monday entiende que las demas sobran e intenta borrarlas: contesta
 *      "Unable to delete a label already in use".
 *   3. Cada etiqueta exige `label` Y `color`, y el color va con el nombre del
 *      enum nuevo, que NO es el `var_name` que devuelve `settings_str`
 *      ("orange" no existe, es "working_orange"). El mapa de abajo se saco
 *      midiendo: se creo un tablero descartable con una etiqueta por cada uno
 *      de los 40 colores del enum y se leyo que `var_name` devolvia cada uno.
 */
import { readFileSync } from "node:fs";

const APLICAR = process.argv.includes("--aplicar");

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

async function mon(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: de("MONDAY_API_TOKEN"),
      // `update_status_column` no existe en la 2024-10 que usa la app.
      "API-Version": "2026-07",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

/**
 * var_name que devuelve `settings_str` -> nombre del enum que pide la mutacion.
 *
 * NO esta escrito a mano: se midio. Se creo un tablero descartable con una
 * etiqueta por cada uno de los 40 colores del enum y se leyo que `var_name`
 * contestaba monday para cada uno. Hacia falta porque los nombres no se
 * parecen: "sky" es `royal`, "turquoise" es `chili_blue`, "mustered" es
 * `saladish`. A ojo me equivoque en cinco de nueve.
 */
const COLOR = {
  "orange": "working_orange",
  "green-shadow": "done_green",
  "red-shadow": "stuck_red",
  "blue-links": "dark_blue",
  "purple": "purple",
  "grey": "explosive",
  "grass-green": "grass_green",
  "bright-blue": "bright_blue",
  "mustered": "saladish",
  "yellow": "egg_yolk",
  "soft-black": "blackish",
  "dark-red": "dark_red",
  "dark-pink": "sofia_pink",
  "light-pink": "lipstick",
  "dark-purple": "dark_purple",
  "lime-green": "bright_green",
  "turquoise": "chili_blue",
  "trolley-grey": "american_gray",
  "brown": "brown",
  "dark-orange": "dark_orange",
  "sunset": "sunset",
  "bubble": "bubble",
  "peach": "peach",
  "berry": "berry",
  "winter": "winter",
  "river": "river",
  "navy": "navy",
  "australia": "aquamarine",
  "indigo": "indigo",
  "dark_indigo": "dark_indigo",
  "pecan": "pecan",
  "light_magic": "lavender",
  "sky": "royal",
  "cold_blue": "steel",
  "kids": "orchid",
  "purple_gray": "lilac",
  "corona": "tan",
  "sail": "sky",
  "old_rose": "coffee",
  "eden": "teal",
};

const BASURA = ["En curso", "Listo", "Detenido"];

const CASOS = [
  ["CONTROL_HERRAMIENTAS", "color_mm76r560", "Estado operativo"],
  ["CONTROL_HERRAMIENTAS", "color_mm765ngx", "Tipo de ubicación"],
  ["CONTROL_HERRAMIENTAS_MOVIMIENTOS", "color_mm76b3kk", "Tipo de movimiento"],
];

let apagadas = 0;
let problemas = 0;

for (const [clave, col, titulo] of CASOS) {
  const boardId = de(`MONDAY_BOARD_${clave}`);
  if (!boardId) {
    console.log(`\n${titulo}: falta MONDAY_BOARD_${clave}, se omite`);
    continue;
  }

  const leer = async () => {
    const d = await mon(
      `query($b:[ID!]){ boards(ids:$b){ columns(ids:["${col}"]){ settings_str revision } } }`,
      { b: [boardId] },
    );
    const c = d.boards[0].columns[0];
    return { s: JSON.parse(c.settings_str || "{}"), revision: c.revision };
  };

  const antes = await leer();

  // Que no las use NADIE, comprobado contra las filas y justo antes de tocar.
  const filas = await mon(
    `query($b:[ID!]){ boards(ids:$b){ items_page(limit:500){ items{ column_values(ids:["${col}"]){ value } } } } }`,
    { b: [boardId] },
  );
  const enUso = new Set(
    filas.boards[0].items_page.items
      .map((i) => (i.column_values[0].value ? JSON.parse(i.column_values[0].value).index : null))
      .filter((x) => x !== null),
  );

  const objetivo = Object.entries(antes.s.labels ?? {})
    .filter(([idx, texto]) => BASURA.includes(texto))
    .map(([idx, texto]) => ({ index: Number(idx), texto }));

  console.log(`\n${titulo} (${clave})`);
  if (!objetivo.length) {
    console.log("   limpia, no le quedan etiquetas de fabrica");
    continue;
  }

  const usadas = objetivo.filter((l) => enUso.has(l.index));
  if (usadas.length) {
    console.log(`   NO SE TOCA: ${usadas.map((l) => `"${l.texto}"`).join(", ")} esta en uso`);
    problemas += 1;
    continue;
  }

  for (const l of objetivo) console.log(`   ${l.index} "${l.texto}" -> se borra`);
  apagadas += objetivo.length;
  if (!APLICAR) continue;

  /**
   * Se BORRAN, no se desactivan.
   *
   * `is_deactivated: true` lo acepta sin chistar y no hace nada:
   * `deactivated_labels` queda vacio igual. Lo que si funciona es mandar el
   * juego completo MENOS las que sobran -monday borra las que faltan-, y a las
   * que no usa nadie las deja borrar. Los indices de las que quedan no se
   * mueven, asi que ninguna fila cambia de valor.
   */
  const aBorrar = new Set(objetivo.map((l) => l.index));
  const done = new Set(antes.s.done_colors ?? []);
  const labels = Object.entries(antes.s.labels)
    .filter(([idx]) => !aBorrar.has(Number(idx)))
    .map(([idx, texto]) => {
      const varName = antes.s.labels_colors?.[idx]?.var_name;
      const color = COLOR[varName];
      if (!color) throw new Error(`No se conoce el color "${varName}" de la etiqueta "${texto}". Agregalo al mapa antes de seguir.`);
      return { index: Number(idx), label: texto, color, is_done: done.has(Number(idx)) };
    });

  await mon(
    `mutation($b:ID!,$c:String!,$r:String!,$s:UpdateStatusColumnSettingsInput!){
       update_status_column(board_id:$b, id:$c, revision:$r, settings:$s){ id }
     }`,
    { b: boardId, c: col, r: String(antes.revision), s: { labels } },
  );

  /**
   * Que las buenas hayan quedado letra por letra y color por color como
   * estaban, Y EN EL MISMO INDICE: el indice es lo que guarda cada fila, asi
   * que si se corriera uno, 145 herramientas cambiarian de estado en silencio.
   */
  const despues = await leer();
  const buenas = Object.keys(antes.s.labels).filter((i) => !aBorrar.has(Number(i)));
  const textoOk = buenas.every((i) => antes.s.labels[i] === despues.s.labels[i]);
  const colorOk = buenas.every(
    (i) => antes.s.labels_colors?.[i]?.var_name === despues.s.labels_colors?.[i]?.var_name,
  );
  const seFueron = objetivo.every((l) => despues.s.labels[String(l.index)] === undefined);

  console.log(`   quedan: ${Object.values(despues.s.labels).join(" | ")}`);
  console.log(`   las buenas intactas: texto=${textoOk} color=${colorOk} | las de fabrica se fueron: ${seFueron}`);
  if (!textoOk || !colorOk || !seFueron) {
    problemas += 1;
    console.log("   REVISAR: algo no quedo como se esperaba");
  }
}

console.log(
  APLICAR
    ? `\n${problemas === 0 ? "Listo" : "CON PROBLEMAS"}: ${apagadas} etiquetas borradas.\n`
    : `\nEn seco: ${apagadas} por borrar. Corré con --aplicar.\n`,
);
process.exit(problemas === 0 ? 0 : 1);
