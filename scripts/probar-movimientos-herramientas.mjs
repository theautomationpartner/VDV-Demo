/**
 * Prueba los 7 movimientos de una herramienta de punta a punta, contra monday
 * de verdad y contra la app levantada en local.
 *
 *   npm run dev            (en otra terminal)
 *   node scripts/probar-movimientos-herramientas.mjs
 *
 * Crea una herramienta "ZZ TEST", le hace salida, traslado, devolucion con
 * falla, envio y regreso de taller, perdida y baja, verifica como queda el
 * maestro despues de cada una, prueba que la guarda de estado rechace una
 * accion imposible y que la recepcion no se pueda confirmar dos veces. Al
 * terminar BORRA la herramienta y todos sus movimientos.
 *
 * Necesita un .tok al lado con el token de monday. Hace falta porque la unica
 * forma de saber que esto funciona es mirar como queda el tablero: la logica
 * escribe dos tableros en orden y un error ahi no da ningun sintoma visible
 * hasta que alguien nota que una herramienta figura donde no esta.
 */
import { mon } from "./monday-token.mjs";
const MAESTRO = "18430928907";
const MOVS = "18430928943";
const API = "http://localhost:3000/api/herramientas";

const COL = { codigo:"text_mm7687am", estado:"color_mm76r560", tipoUbic:"color_mm765ngx",
  ubic:"color_mm76ncrk", custodio:"text_mm764j8g", salida:"date_mm76td04", devol:"date_mm76kdht",
  cond:"color_mm76b1fq" };

async function post(ruta, body) {
  const r = await fetch(`${API}/${ruta}`, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(()=>({})) };
}
async function estado(id) {
  const d = await mon(`query($i:[ID!]){ items(ids:$i){ name column_values(ids:${JSON.stringify(Object.values(COL))}){ id text } } }`, { i:[id] });
  const m = Object.fromEntries(d.items[0].column_values.map(c=>[c.id,c.text]));
  return { estado:m[COL.estado], tipoUbic:m[COL.tipoUbic], ubic:m[COL.ubic], custodio:m[COL.custodio],
           salida:m[COL.salida], devol:m[COL.devol], cond:m[COL.cond] };
}
const ver = (e) => `${(e.estado??"-").padEnd(20)} ${(e.tipoUbic??"-").padEnd(12)} ${(e.ubic??"-").padEnd(16)} custodio:${e.custodio||"(vacio)"}`;

// 1. herramienta de prueba
const creada = await mon(`mutation($b:ID!,$n:String!,$v:JSON!){ create_item(board_id:$b,item_name:$n,column_values:$v){ id } }`,
  { b: MAESTRO, n: "ZZ TEST movimientos (borrar)",
    v: JSON.stringify({ [COL.codigo]:"ZZ-TEST", [COL.estado]:{label:"DISPONIBLE"}, [COL.tipoUbic]:{label:"BODEGA"}, [COL.ubic]:{label:"BODEGA CENTRAL"} }) });
const id = creada.create_item.id;
console.log(`herramienta de prueba: ${id}`);
console.log("inicial       ", ver(await estado(id)));

let fallas = 0;
async function paso(titulo, body, esperado) {
  const r = await post("movimiento", { itemId: id, ...body });
  const e = await estado(id);
  const ok = Object.entries(esperado).every(([k,v]) => (e[k] ?? "") === v);
  if (!ok || r.status !== 200) { fallas++; console.log(`  FALLA ${titulo}: http ${r.status} ${JSON.stringify(r.json).slice(0,120)}`);
    console.log("         esperaba", JSON.stringify(esperado), "\n         quedo   ", JSON.stringify(e)); }
  else console.log(`  ok ${titulo.padEnd(26)} ${ver(e)}${r.json.esperaConfirmacion ? "  [pendiente de confirmar]" : ""}`);
  return r;
}

console.log("\n--- los 6 movimientos ---");
const rSalida = await paso("salida a M388", { accion:"salida", destino:"M388", custodio:"Juan Perez", condicion:"Buena" },
  { estado:"EN USO", tipoUbic:"OBRA", ubic:"M388", custodio:"Juan Perez" });
await paso("traslado a FORESTAL", { accion:"traslado", destino:"FORESTAL", custodio:"Ana Soto", condicion:"Buena" },
  { estado:"EN USO", ubic:"FORESTAL", custodio:"Ana Soto" });
await paso("devolucion con falla", { accion:"devolucion", destino:"BODEGA CENTRAL", condicion:"Mala/Con falla" },
  { estado:"REQUIERE REPARACIÓN", tipoUbic:"BODEGA", ubic:"BODEGA CENTRAL", custodio:"" });
await paso("envio a reparacion", { accion:"enviarReparacion" },
  { estado:"EN REPARACIÓN", tipoUbic:"REPARACIÓN" });
await paso("regreso de reparacion", { accion:"regresoReparacion", destino:"BODEGA CENTRAL", condicion:"Buena" },
  { estado:"DISPONIBLE", tipoUbic:"BODEGA", ubic:"BODEGA CENTRAL" });
await paso("perdida", { accion:"perdida" }, { estado:"EXTRAVIADA" });
await paso("baja", { accion:"baja" }, { estado:"DADA DE BAJA", tipoUbic:"BAJA" });

console.log("\n--- la guarda de estado ---");
const r = await post("movimiento", { itemId: id, accion:"salida", destino:"M388", custodio:"X", condicion:"Buena" });
if (r.status === 409) console.log(`  ok no deja sacar algo dado de baja (409): ${r.json.error.slice(0,80)}`);
else { fallas++; console.log(`  FALLA: deberia rechazar, dio ${r.status}`); }

console.log("\n--- confirmacion de recepcion ---");
const c1 = await post("confirmar", { movimientoId: rSalida.json.movimientoId });
console.log(c1.status === 200 ? "  ok se confirma la salida" : `  FALLA confirmar: ${c1.status} ${JSON.stringify(c1.json)}`);
if (c1.status !== 200) fallas++;
const c2 = await post("confirmar", { movimientoId: rSalida.json.movimientoId });
if (c2.status === 409) console.log("  ok no se puede confirmar dos veces (409)");
else { fallas++; console.log(`  FALLA: la segunda confirmacion dio ${c2.status}`); }

const mv = await mon(`query($i:[ID!]){ items(ids:$i){ column_values(ids:["color_mm7y936c","text_mm7ygdnm","date_mm7y9yrs"]){ id text } } }`, { i:[rSalida.json.movimientoId] });
console.log("  en monday:", JSON.stringify(Object.fromEntries(mv.items[0].column_values.map(c=>[c.id,c.text]))));

// 2. limpieza: la herramienta y todos sus movimientos
console.log("\n--- limpieza ---");
const todos = await mon(`query{ boards(ids:["${MOVS}"]){ items_page(limit:200){ items{ id column_values(ids:["text_mm761181"]){ text } } } } }`);
const mios = todos.boards[0].items_page.items.filter(i => i.column_values[0]?.text === String(id));
for (const m of mios) await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: m.id });
await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: id });
console.log(`  borrados: ${mios.length} movimientos + la herramienta ${id}`);

console.log(fallas ? `\n>>> ${fallas} FALLAS` : "\n>>> todo pasa");
