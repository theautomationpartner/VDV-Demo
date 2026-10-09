/**
 * Comprueba la cuenta del costo de arriendos contra los numeros que muestra la
 * app que hizo Pablo en monday vibe.
 *
 *   npm run probar-costos-arriendo
 *
 * Por que asi y no con datos inventados: el acumulado es la razon de ser del
 * modulo -es la plata que VDV esta gastando- y la unica forma de saber que la
 * formula es la correcta es que de el MISMO numero que el que Pablo ya vio y dio
 * por bueno. Los cuatro arriendos de prueba que cargo son el banco de pruebas.
 *
 * Lee monday. No escribe nada.
 */
import { readFileSync } from "node:fs";
import {
  resumenDeArriendo,
  estadoSegunItems,
  aFecha,
  diasEntre,
} from "../lib/arriendos/dominio.js";

const env = readFileSync(".env.local", "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

const MAESTRO = de("MONDAY_BOARD_CONTROL_ARRIENDOS");

async function pedir(query) {
  const r = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: de("MONDAY_API_TOKEN"),
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Los column_id salen del schema para no repetirlos a mano.
const C = {
  obra: "color_mm77xt1v",
  tipoTarifa: "color_mm769xwd",
  tarifaUnitaria: "numeric_mm7682b3",
  iva: "color_mm76ecnt",
  fechaInicioArriendo: "date_mm767bkr",
  fechaFinArriendo: "date_mm766jse",
  estadoArriendo: "color_mm76rmss",
  cantidadInicial: "numeric_mm76kbyj",
  nGuiaIngreso: "text_mm76anc5",
  excepcionSinOc: "color_mm76v1h4",
};
const CI = {
  cantidad: "numeric_mm77cw29",
  precioUnitario: "numeric_mm77996y",
  precioTarifa: "numeric_mm77261e",
  tipoTarifa: "color_mm77haqq",
  inicio: "date_mm77t980",
  termino: "date_mm77mg5m",
  fechaDevolucion: "date_mm77cxq5",
  estado: "color_mm775j0h",
};

/**
 * Lee una celda COMO LA LEE LA APP.
 *
 * El detalle que invalida la lectura ingenua: en monday una columna de estado
 * VACIA no devuelve "", devuelve la etiqueta que tenga asignado el color gris.
 * En este tablero eso significa que una celda sin completar dice "TARIFA FIJA",
 * "DAÑADO" o "NUEVO". Lo unico que distingue un dato de un hueco es que `value`
 * venga en null, y eso es lo que mira la API de la app
 * (app/api/monday/board/route.js). Si el test no hace lo mismo, valida contra
 * una entrada que la app nunca recibe -y pasa en verde mientras la pantalla
 * muestra otra cosa, que es exactamente lo que paso la primera vez-.
 */
const texto = (cols, id) => {
  const c = cols.find((x) => x.id === id);
  if (!c) return null;
  if (c.value === null || c.value === undefined) return null;
  return c.text || null;
};
const mapear = (cols, mapa) =>
  Object.fromEntries(Object.entries(mapa).map(([k, id]) => [k, texto(cols, id)]));

/**
 * Lo que tiene que dar, sabiendo que tres de los cuatro arriendos estan
 * incompletos en el tablero.
 *
 * La app de Pablo muestra $612.161 de gasto total, pero ese numero se apoya en
 * celdas vacias: lee "TARIFA FIJA" donde nadie cargo la tarifa y cobra "torre"
 * una sola vez. Suponer lo contrario -que es por dia- daria $285.000 para el
 * mismo arriendo. Con esa diferencia no hay default honesto, asi que lo unico
 * correcto es no sumarlo y decir que falta el dato.
 *
 * El unico arriendo con todo cargado es "Andamio torre", y ahi los dos numeros
 * coinciden, que es lo que prueba que la formula es la correcta.
 */
const ESPERADO = {
  "Andamio torre": { confiable: true, neto: 497171, conIva: 591633, items: 3, enObra: 0, unidades: 26, conDano: 1 },
  torre: { confiable: false, falta: "el tipo de tarifa" },
  "test arriendo": { confiable: false, falta: "el tipo de tarifa" },
  s: { confiable: false },
};
/** Solo lo calculable entra al total. */
const TOTAL_ESPERADO = { neto: 497171, conIva: 591633 };

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}\n        ${d}`); };

const HOY = new Date(2026, 9, 9); // 09-oct-2026, el dia de la captura

const d = await pedir(`query {
  boards(ids: [${MAESTRO}]) {
    items_page(limit: 50) {
      items {
        id name
        column_values { id text value }
        subitems { id name column_values { id text value } }
      }
    }
  }
}`);

const arriendos = d.boards[0].items_page.items;
console.log(`${arriendos.length} arriendos en el tablero\n`);

let netoTotal = 0;
let conIvaTotal = 0;

for (const it of arriendos) {
  const arriendo = mapear(it.column_values, C);
  const items = (it.subitems ?? []).map((s) => mapear(s.column_values, CI));
  const r = resumenDeArriendo(arriendo, items, HOY);

  if (r.confiable) {
    netoTotal += r.neto;
    conIvaTotal += r.conIva;
  }

  const esp = ESPERADO[it.name];
  console.log(`"${it.name}"  (${arriendo.tipoTarifa ?? "SIN tipo de tarifa cargado"})`);
  if (!esp) {
    console.log("  (no estaba en la captura, se saltea)");
    continue;
  }

  const comparar = (campo, obtenido, esperado) =>
    obtenido === esperado
      ? ok(`${campo} = ${obtenido}`)
      : falla(`${campo}`, `esperaba ${esperado}, dio ${obtenido}`);

  comparar("se puede calcular", r.confiable, esp.confiable);
  if (!esp.confiable) {
    if (esp.falta && !r.faltan.includes(esp.falta)) {
      falla("que falta", `esperaba "${esp.falta}", dijo: ${r.faltan.join(", ") || "(nada)"}`);
    } else {
      ok(`avisa que falta: ${r.faltan.join(", ")}`);
    }
    console.log("");
    continue;
  }

  comparar("neto", r.neto, esp.neto);
  comparar("con IVA", r.conIva, esp.conIva);
  comparar("items", r.total, esp.items);
  comparar("en obra", r.enObra, esp.enObra);
  comparar("unidades", r.unidades, esp.unidades);
  comparar("con daño", r.conDano, esp.conDano);

  // La permanencia: la app de Pablo sigue contando hasta hoy aunque el equipo
  // ya haya vuelto. Aca el reloj se detiene al devolver, asi que se informa la
  // diferencia en vez de fallar por ella.
  const inicio = aFecha(arriendo.fechaInicioArriendo);
  const comoLaVibe = inicio ? diasEntre(inicio, HOY) : null;
  if (r.permanencia !== comoLaVibe) {
    console.log(
      `  DISTINTO permanencia: nosotros ${r.permanencia} (el reloj para al devolver), ` +
        `la vibe ${comoLaVibe} (sigue contando hasta hoy)`,
    );
  } else {
    ok(`permanencia = ${r.permanencia}`);
  }

  console.log(`  estado segun items: ${estadoSegunItems(r)}  (el tablero dice "${arriendo.estadoArriendo}")`);
  console.log("");
}

console.log("=== TOTALES ===");
if (netoTotal === TOTAL_ESPERADO.neto) ok(`neto total = ${netoTotal}`);
else falla("neto total", `esperaba ${TOTAL_ESPERADO.neto}, dio ${netoTotal}`);
if (conIvaTotal === TOTAL_ESPERADO.conIva) ok(`total c/IVA = ${conIvaTotal}`);
else falla("total c/IVA", `esperaba ${TOTAL_ESPERADO.conIva}, dio ${conIvaTotal}`);

console.log(`\n>>> ${bien} bien, ${mal} ${mal === 1 ? "falla" : "fallas"}`);
process.exit(mal ? 1 : 0);
