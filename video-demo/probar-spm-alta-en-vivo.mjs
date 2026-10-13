/**
 * El alta de una solicitud y el envio, contra monday de verdad.
 *
 *  node video-demo/probar-spm-alta-en-vivo.mjs
 *
 * Comprueba COLUMNA POR COLUMNA lo que queda escrito, no solo que la llamada
 * devuelva 200. Lo que importa de verdad son tres cosas:
 *
 *   1. Que los DESTINATARIOS queden en el formato exacto que parsea Make. Si
 *      eso se rompe, el correo no sale y nadie se entera hasta que el proveedor
 *      no contesta.
 *   2. Que el numero salga de la base y no de contar el tablero.
 *   3. Que NO se pueda reenviar. Es el bug que hizo que en las pruebas del
 *      cliente los proveedores recibieran la misma solicitud dos veces.
 *
 * Al terminar BORRA todo lo que creo. Si algo falla, igual limpia.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { levantarApp, cookieSesion } from "./comun.mjs";

const PUERTO = 3097;
const API = `http://localhost:${PUERTO}/api/spm`;
const SPM = "18407094103";

/**
 * La sesion con la que corre la prueba.
 *
 * El mail tiene que tener ficha en Equipo VDV: el emisor es obligatorio y la
 * ruta corta antes de reservar el numero si no la encuentra. `clients@` es la
 * cuenta de TAP, que esta en el directorio (ficha 13070208522).
 */
const GALLETA = cookieSesion([{ app: "spm", appRol: "usuario" }], {
  uid: 31,
  email: "clients@theautomationpartner.com",
  nombre: "The Automation Partner",
});

const TOKEN =
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .match(/^MONDAY_API_TOKEN=(.*)$/m)?.[1]
    ?.replace(/^"|"$/g, "") ?? "";

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

async function post(ruta, cuerpo) {
  const r = await fetch(`${API}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${GALLETA.name}=${GALLETA.value}` },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };
const comparar = (n, real, esp) =>
  String(real ?? "") === String(esp ?? "") ? ok(n) : falla(n, `esperaba ${JSON.stringify(esp)}, quedo ${JSON.stringify(real)}`);

const COL = {
  numero: "text_mm7eawn",
  obra: "color_mm2289de",
  estado: "color_mm22s1hd",
  centroCosto: "dropdown_mm7cg19s",
  fecha: "date_mm22j930",
  envio: "color_mm7fnd78",
  destinatarios: "long_text_mm7g3ra0",
  ocasionales: "long_text_mm7gd0ee",
  emisor: "board_relation_mm79w6vx",
  proveedores: "board_relation_mm22xppd",
};

// Un servidor de una corrida anterior se queda con el puerto y `levantarApp`
// no falla: encuentra al viejo contestando y prueba contra otro build.
try {
  const viejo = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const pids = viejo
    .trim()
    .split(String.fromCharCode(10))
    .map((l) => l.trim().split(" ").filter(Boolean).pop());
  for (const pid of new Set(pids)) {
    if (pid && pid !== "0") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch { /* nadie escuchando */ }

// `conBaseReal` porque el numero de solicitud sale de Neon, no de monday.
const { cerrar } = await levantarApp({ puerto: PUERTO, conBaseReal: true });

const creados = [];

async function leer(id) {
  const d = await mon(
    `query($i:[ID!]){ items(ids:$i){ id name
       column_values(ids:${JSON.stringify(Object.values(COL))}){
         id text ... on BoardRelationValue { linked_item_ids } }
       subitems{ id name column_values(ids:["text_mm22xcsa","board_relation_mm22f0qg"]){ id text ... on BoardRelationValue { linked_item_ids } } } } }`,
    { i: [String(id)] },
  );
  const it = d.items[0];
  const porId = Object.fromEntries(it.column_values.map((c) => [c.id, c]));
  const fila = { id: it.id, name: it.name, subitems: it.subitems ?? [] };
  for (const [clave, cid] of Object.entries(COL)) {
    fila[clave] = porId[cid]?.linked_item_ids?.length ? porId[cid].linked_item_ids.map(String) : porId[cid]?.text ?? "";
  }
  return fila;
}

try {
  console.log("\n1. ALTA\n");

  const alta = await post("crear", {
    obra: "ZZ",
    centroCosto: "MATERIALES GENERALES",
    lineas: [
      { nombre: "ZZ TEST cemento", cantidad: "10", materialId: null, unidad: "saco" },
      { nombre: "ZZ TEST arena", cantidad: "3", materialId: null, unidad: "m3" },
    ],
    destinatarios: [
      { nombre: "ZZ TEST Proveedor Uno", mails: ["zztest1@example.com"], ocasional: true },
      { nombre: "ZZ TEST Proveedor | Dos", mails: ["ZZTEST2@EXAMPLE.COM", "zztest2@example.com"], ocasional: true },
    ],
  });
  if (alta.status !== 200) {
    falla("el alta devuelve 200", `${alta.status} ${JSON.stringify(alta.json)}`);
    throw new Error("sin solicitud no se puede seguir");
  }
  ok(`el alta devuelve 200 — ${alta.json.numero}`);
  creados.push(alta.json.id);

  const s = await leer(alta.json.id);

  console.log("  -- el encabezado --");
  comparar("el numero tiene el formato SPM-000", /^SPM-\d{3}$/.test(s.numero), true);
  comparar("el nombre arranca con el numero", s.name.startsWith(`${s.numero} · `), true);
  comparar("obra", s.obra, "ZZ");
  comparar("centro de costo", s.centroCosto, "MATERIALES GENERALES");
  comparar("estado inicial", s.estado, "En curso");
  comparar("NO sale enviada: queda en Borrador", s.envio, "Borrador");
  comparar("fecha de hoy", s.fecha, new Date().toISOString().slice(0, 10));
  comparar("el emisor quedo vinculado a una ficha", s.emisor.length, 1);

  console.log("  -- los destinatarios, que es lo que lee Make --");
  const lineas = String(s.destinatarios).split("\n");
  comparar("una linea por proveedor", lineas.length, 2);
  comparar(
    "formato exacto: Nombre | correos | tags",
    lineas[0],
    "ZZ TEST Proveedor Uno | zztest1@example.com | ocasional",
  );
  comparar(
    "los correos se normalizan y no se repiten",
    lineas[1],
    "ZZ TEST Proveedor / Dos | zztest2@example.com | ocasional",
  );
  lineas[1].split("|").length === 3
    ? ok("el pipe del nombre se reemplaza para no partir la linea")
    : falla("el pipe del nombre", lineas[1]);
  comparar("los ocasionales van ademas a su columna", String(s.ocasionales).split("\n").length, 2);
  comparar("ninguno entro al maestro de proveedores", s.proveedores.length ?? 0, 0);

  console.log("  -- las lineas --");
  comparar("dos subelementos", s.subitems.length, 2);
  const sub = s.subitems.find((x) => x.name.includes("cemento"));
  comparar("lo que no esta en el catalogo lleva [SC] y la unidad", sub?.name, "[SC] ZZ TEST cemento (saco)");
  comparar(
    "la cantidad queda como texto",
    sub?.column_values?.find((c) => c.id === "text_mm22xcsa")?.text,
    "10",
  );

  console.log("\n2. VALIDACIONES QUE TIENEN QUE RECHAZAR\n");

  const base = {
    obra: "ZZ",
    centroCosto: "MATERIALES GENERALES",
    lineas: [{ nombre: "x", cantidad: "1" }],
    destinatarios: [{ nombre: "p", mails: ["a@b.cl"] }],
  };
  const rechaza = async (nombre, cambio, textoEsperado) => {
    const r = await post("crear", { ...base, ...cambio });
    if (r.status === 400 && new RegExp(textoEsperado, "i").test(r.json.error ?? "")) ok(nombre);
    else falla(nombre, `${r.status} ${r.json.error ?? ""}`);
    if (r.json?.id) creados.push(r.json.id);
  };
  await rechaza("sin obra", { obra: "" }, "obra");
  await rechaza("sin centro de costo", { centroCosto: "" }, "centro de costo");
  await rechaza("sin materiales", { lineas: [] }, "material");
  await rechaza("una linea sin cantidad", { lineas: [{ nombre: "x", cantidad: "" }] }, "cantidad");
  await rechaza("sin destinatarios", { destinatarios: [] }, "proveedores");
  await rechaza("un destinatario sin correo valido", { destinatarios: [{ nombre: "p", mails: ["no-es-mail"] }] }, "correo");

  console.log("\n3. EL ENVIO Y EL FRENO AL REENVIO\n");

  /**
   * ESTA PRUEBA NUNCA DEJA LA COLUMNA EN "Por enviar".
   *
   * Make escucha esa columna por webhook: ponerla ahi -desde la ruta o desde la
   * API- hace que salgan correos DE VERDAD desde heather@vergaradelvalle.com a
   * los proveedores de la solicitud. La primera version de este test lo hizo:
   * mando dos correos a example.com, que rebotaron.
   *
   * Asi que el estado se simula escribiendolo directo en monday -como si Make
   * ya hubiera mandado- y lo que se prueba es que la ruta RECHACE. Que es, de
   * las dos mitades, la unica que tiene logica propia: poner una columna no
   * necesita test, impedir que se ponga dos veces si.
   */
  await mon(
    `mutation($b:ID!,$i:ID!,$v:JSON!){ change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){ id } }`,
    { b: SPM, i: String(alta.json.id), v: JSON.stringify({ [COL.envio]: { label: "Enviado" } }) },
  );
  ok("se simula que Make ya la mando, sin disparar a Make");

  const env2 = await post("enviar", { spmId: alta.json.id });
  env2.status === 409
    ? ok(`no deja reenviar: "${String(env2.json.error).slice(0, 70)}…"`)
    : falla("el freno al reenvio", `${env2.status} ${JSON.stringify(env2.json)}`);

  const sigue = await leer(alta.json.id);
  comparar("y la columna no se movio", sigue.envio, "Enviado");

  const sinNada = await post("enviar", {});
  comparar("sin id rechaza", sinNada.status, 400);
  const inventada = await post("enviar", { spmId: "999999999" });
  comparar("una solicitud que no existe rechaza", inventada.status, 404);
} catch (error) {
  falla("se corto la prueba", error.message);
} finally {
  console.log("\n=== LIMPIEZA ===");
  for (const id of new Set(creados.map(String))) {
    await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: id })
      .then(() => console.log(`  borrada ${id}`))
      .catch((e) => console.log(`  NO SE PUDO BORRAR ${id}: ${e.message.slice(0, 80)}`));
  }
  const quedan = await mon(
    `query($b:[ID!]){ boards(ids:$b){ items_page(limit:200){ items{ id name } } } }`,
    { b: [SPM] },
  ).catch(() => null);
  const basura = (quedan?.boards?.[0]?.items_page?.items ?? []).filter((i) => /ZZ TEST|^SPM-\d+ · ZZ /.test(i.name));
  basura.length
    ? falla("quedo basura en el tablero", basura.map((i) => `${i.id} ${i.name}`).join(", "))
    : ok("no quedo ninguna solicitud de prueba");

  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
