/**
 * Las listas escritas a mano en el codigo, contra lo que dice monday HOY.
 *
 *   node scripts/auditar-listas-hardcodeadas.mjs
 *
 * Solo LECTURA. No cambia nada: dice que esta desincronizado.
 *
 * Por que existe: una lista de opciones escrita en el codigo es una copia de
 * algo que vive en monday, y las copias se separan. Cuando el cliente agrega
 * una categoria o renombra un estado, la app sigue mostrando lo viejo -y peor,
 * puede intentar ESCRIBIR una etiqueta que ya no existe-.
 *
 * Las listas que se leen con `useColumnOptions` no entran aca: esas piden las
 * opciones a monday y la constante es solo el plan B si la lectura falla.
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const deEnv = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";
const TOKEN = deEnv("MONDAY_API_TOKEN");

async function mon(query, variables = {}) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

/** Las etiquetas de una columna de estado o de dropdown, tal como estan hoy. */
async function etiquetas(boardId, columnId) {
  const d = await mon(`query($b:[ID!]){ boards(ids:$b){ columns{ id type settings_str } } }`, { b: [boardId] });
  const col = (d.boards?.[0]?.columns ?? []).find((c) => c.id === columnId);
  if (!col) return null;
  const s = JSON.parse(col.settings_str || "{}");
  if (col.type === "status") {
    return Object.values(s.labels ?? {}).filter((x) => typeof x === "string" && x.trim());
  }
  return (s.labels ?? []).map((l) => l?.name).filter(Boolean);
}

const LISTAS = [
  {
    que: "Herramientas · estado operativo",
    donde: "lib/herramientas/dominio.js → ESTADOS_OPERATIVOS",
    board: deEnv("MONDAY_BOARD_CONTROL_HERRAMIENTAS"),
    columna: "color_mm76r560",
    enElCodigo: ["DISPONIBLE", "EN USO", "EN REPARACIÓN", "REQUIERE REPARACIÓN", "EXTRAVIADA", "DADA DE BAJA"],
  },
  /*
    OJO con estas dos: la condicion viaja con DOS vocabularios distintos y no es
    un descuido. Al registrar un movimiento se elige "Nueva / Buena / Regular /
    Mala/Con falla" y eso se guarda en el tablero de MOVIMIENTOS; despues
    `condicionFisicaDesde()` lo traduce a "NUEVO / USADO / DAÑADO", que es el
    vocabulario del MAESTRO. Comparar una lista contra la columna de la otra da
    un falso positivo -me paso-.
  */
  {
    que: "Herramientas · condición al salir (movimientos)",
    donde: "lib/herramientas/dominio.js → CONDICION_MOVIMIENTO",
    board: deEnv("MONDAY_BOARD_CONTROL_HERRAMIENTAS_MOVIMIENTOS"),
    columna: "color_mm764jg3",
    enElCodigo: ["Nueva", "Buena", "Regular", "Mala/Con falla"],
  },
  {
    que: "Herramientas · condición al recibir (movimientos)",
    donde: "lib/herramientas/dominio.js → CONDICION_MOVIMIENTO",
    board: deEnv("MONDAY_BOARD_CONTROL_HERRAMIENTAS_MOVIMIENTOS"),
    columna: "color_mm76bsqh",
    enElCodigo: ["Nueva", "Buena", "Regular", "Mala/Con falla"],
  },
  {
    que: "Herramientas · condición física (maestro)",
    donde: "lib/herramientas/dominio.js → condicionFisicaDesde()",
    board: deEnv("MONDAY_BOARD_CONTROL_HERRAMIENTAS"),
    columna: "color_mm76b1fq",
    enElCodigo: ["NUEVO", "USADO", "DAÑADO"],
  },
  {
    que: "Arriendos · categoría",
    donde: "components/arriendos/DialogoNuevoArriendo.jsx → CATEGORIAS",
    board: deEnv("MONDAY_BOARD_CONTROL_ARRIENDOS"),
    columna: "dropdown_mm76nbyq",
    enElCodigo: [
      "Herramienta eléctrica", "Equipo menor", "Andamios", "Compactación", "Generación",
      "Izaje", "Acceso", "Contenedores", "Baños", "Maquinaria", "Herramienta manual", "Otro",
    ],
  },
  {
    que: "Arriendos · unidad de cobro",
    donde: "components/arriendos/DialogoNuevoArriendo.jsx → UNIDADES",
    board: deEnv("MONDAY_BOARD_CONTROL_ARRIENDOS"),
    columna: "dropdown_mm766xqg",
    enElCodigo: ["POR EQUIPO", "POR CUERPO", "POR UNIDAD", "POR DÍA", "POR HORA", "POR USO", "OTRO"],
  },
  {
    que: "SPM · estado de la solicitud",
    donde: "lib/spm/dominio.js → ESTADOS",
    board: deEnv("MONDAY_BOARD_SPM_VDV"),
    columna: "color_mm22s1hd",
    enElCodigo: ["En curso", "Listo", "Detenido", "Descartado"],
  },
  {
    que: "SPM · estado de envío",
    donde: "lib/spm/dominio.js → ENVIO",
    board: deEnv("MONDAY_BOARD_SPM_VDV"),
    columna: "color_mm7fnd78",
    enElCodigo: ["Borrador", "Por enviar", "Enviado", "Error envío"],
  },
  {
    que: "SPM · estado de comparación",
    donde: "lib/spm/dominio.js → COMPARACION",
    board: deEnv("MONDAY_BOARD_SPM_VDV"),
    columna: "color_mm7jmbwc",
    enElCodigo: ["Pendiente", "Por comparar", "Comparando", "Comparado", "Error comparación"],
  },
  {
    que: "SPM · estado de una cotización",
    donde: "lib/spm/cotizaciones.js → ESTADO",
    board: deEnv("MONDAY_BOARD_COTIZACIONES_SPM"),
    columna: "color_mm7cqzdh",
    enElCodigo: ["Pendiente", "Recibida", "Vencida", "Descartada", "Seleccionada", "Revisar"],
  },
  {
    que: "SPM · homologación de una línea",
    donde: "lib/spm/cotizaciones.js → HOMOLOGACION",
    board: deEnv("MONDAY_BOARD_COTIZACIONES_SPM_ITEMS"),
    columna: "color_mm7hfkys",
    enElCodigo: ["Exacto", "Equivalente", "Dudoso", "Distinto", "No solicitado"],
  },
];

let problemas = 0;

for (const l of LISTAS) {
  const enMonday = await etiquetas(l.board, l.columna).catch(() => null);
  if (!enMonday) {
    problemas += 1;
    console.log(`\n${l.que}\n   NO SE PUDO LEER la columna ${l.columna} del tablero ${l.board}`);
    continue;
  }
  const faltanEnElCodigo = enMonday.filter((x) => !l.enElCodigo.includes(x));
  const sobranEnElCodigo = l.enElCodigo.filter((x) => !enMonday.includes(x));

  if (!faltanEnElCodigo.length && !sobranEnElCodigo.length) {
    console.log(`\nOK  ${l.que} — ${enMonday.length} etiquetas, coinciden`);
    continue;
  }
  problemas += 1;
  console.log(`\n⚠  ${l.que}`);
  console.log(`   ${l.donde}`);
  if (faltanEnElCodigo.length) {
    console.log(`   EN MONDAY Y NO EN EL CÓDIGO (la app no las ofrece): ${faltanEnElCodigo.map((x) => `"${x}"`).join(", ")}`);
  }
  if (sobranEnElCodigo.length) {
    console.log(`   EN EL CÓDIGO Y NO EN MONDAY (escribirlas falla): ${sobranEnElCodigo.map((x) => `"${x}"`).join(", ")}`);
  }
}

console.log(
  `\n${problemas === 0 ? "TODO SINCRONIZADO" : `HAY ${problemas} LISTA${problemas === 1 ? "" : "S"} DESINCRONIZADA${problemas === 1 ? "" : "S"}`}: ${LISTAS.length} revisadas\n`,
);
process.exit(problemas === 0 ? 0 : 1);
