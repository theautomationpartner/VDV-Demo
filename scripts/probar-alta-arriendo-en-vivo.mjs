/**
 * LA UNICA PRUEBA QUE ESCRIBE DE VERDAD.
 *
 *   npm run probar-alta-arriendo-en-vivo
 *
 * Todo lo demas se probo con la escritura cortada: eso alcanza para verificar
 * las cuentas, los permisos y lo que se dibuja, pero NO que monday acepte lo
 * que mandamos. Esto crea un arriendo real, le sube una foto, lo devuelve, y
 * despues BORRA TODO.
 *
 * Que se comprueba, en orden:
 *   1. el alta escribe y monday la acepta
 *   2. el correlativo sale con formato ARR-0000 y sale de nuestra base
 *   3. los items quedan colgando del arriendo
 *   4. el responsable queda VINCULADO a Equipo VDV (no escrito como texto)
 *   5. devolver SIN foto se rechaza
 *   6. la foto se sube
 *   7. la devolucion escribe y el encabezado se recalcula solo
 *   8. no queda nada
 *
 * Corre como la cuenta de TAP (id 31), que esta activa, es administradora de
 * Herramientas y tiene ficha en Equipo VDV. Asi el arriendo de prueba queda
 * firmado por nosotros y no por una persona real de VDV.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";

const PUERTO = 3097;
const BASE = `http://localhost:${PUERTO}`;
const SECRETO = "secreto-solo-para-esta-prueba-no-se-usa-en-ningun-lado";

const NOMBRE = "ZZ PRUEBA - Arriendo de Mateo";
const USUARIO = { uid: 31, email: "clients@theautomationpartner.com", nombre: "The Automation Partner" };
const FICHA_EQUIPO_VDV = "13070208522";

const env = readFileSync(".env.local", "utf8");
const de = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };

// ------------------------------------------------------------------- monday

async function monday(query, variables = {}) {
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

// ---------------------------------------------------------------- el server

const entorno = {
  ...process.env,
  NODE_ENV: "production",
  AUTH_LAYERS_ENABLED: "true",
  MFA_SESSION_SECRET: SECRETO,
  MFA_ENCRYPTION_KEY: "0".repeat(64),
  // La base REAL: el correlativo vive ahi y es lo que se quiere probar.
  DATABASE_URL: de("DATABASE_URL"),
  MONDAY_API_TOKEN: de("MONDAY_API_TOKEN"),
};
for (const b of [
  "CONTROL_ARRIENDOS", "CONTROL_ARRIENDOS_ITEMS", "CONTROL_HERRAMIENTAS",
  "CONTROL_HERRAMIENTAS_MOVIMIENTOS", "EQUIPO_VDV", "ORDENES_DE_COMPRA_MAXXA", "PROVEEDORES",
]) {
  entorno[`MONDAY_BOARD_${b}`] = de(`MONDAY_BOARD_${b}`);
}

console.log(`levantando la app en ${PUERTO} con la base REAL…`);
const server = spawn("npx", ["next", "start", "--port", String(PUERTO)], {
  env: entorno,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", () => {});
server.stderr.on("data", (d) => process.stderr.write(`[app] ${d}`));

function matar() {
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", shell: true });
    }
  } catch { /* ya estaba muerto */ }
  server.kill();
}
process.on("exit", matar);
process.on("SIGINT", () => { matar(); process.exit(1); });

const hasta = Date.now() + 90_000;
while (Date.now() < hasta) {
  try {
    await fetch(`${BASE}/api/version`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const cookie = `vdv_session=${jwt.sign({ ...USUARIO, rol: "usuario", tipo: "sesion" }, SECRETO, { expiresIn: "20m" })}`;

const pedir = async (ruta, cuerpo, metodo = "POST") => {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

// ------------------------------------------------------------------ la prueba

let arriendoId = null;
let numeroFolio = null;

try {
  console.log("\n1. EL ALTA");
  const alta = await pedir("/api/arriendos/crear", {
    nombre: NOMBRE,
    obra: "ZZ",
    categoria: "Equipo menor",
    marca: "ZZ PRUEBA",
    tipoTarifa: "POR DÍA",
    iva: "NETO",
    fechaInicio: "2026-10-05",
    fechaFin: "2026-10-20",
    nGuia: "ZZ-PRUEBA-001",
    observaciones: "Creado por la prueba automatica. Si quedo colgado, borrar.",
    excepcion: { motivo: "Prueba automatica del alta, no es un arriendo real." },
    items: [
      { nombre: "ZZ PRUEBA - item A", cantidad: 2, precioUnitario: 1000 },
      { nombre: "ZZ PRUEBA - item B", cantidad: 3, precioUnitario: 500 },
    ],
  });

  if (alta.status === 200 && alta.json.id) {
    arriendoId = alta.json.id;
    numeroFolio = alta.json.numero;
    ok(`se creo el arriendo ${arriendoId}`);
  } else {
    falla("el alta", `${alta.status} ${JSON.stringify(alta.json)}`);
    throw new Error("sin arriendo no se puede seguir");
  }

  if (/^ARR-\d{4}$/.test(alta.json.codigo ?? "")) ok(`el correlativo salio ${alta.json.codigo}`);
  else falla("el correlativo", `esperaba ARR-0000, dio "${alta.json.codigo}"`);

  if (!alta.json.fallidos?.length) ok("los 2 items se crearon");
  else falla("los items", `fallaron: ${alta.json.fallidos.join(", ")}`);

  console.log("\n2. COMO QUEDO EN MONDAY");
  const C = {
    codigo: "text_mm76bm7d", obra: "color_mm77xt1v", tipoTarifa: "color_mm769xwd",
    estado: "color_mm76rmss", cantidadInicial: "numeric_mm76kbyj", cantidadActiva: "numeric_mm76jjmq",
    cantidadDevuelta: "numeric_mm76x7qp", excepcion: "color_mm76v1h4", responsableVdv: "board_relation_mm79bptf",
  };
  const ver = async () => {
    const d = await monday(
      `query ($ids: [ID!]) { items (ids: $ids) {
         name
         column_values { id text ... on BoardRelationValue { display_value linked_item_ids } }
         subitems { id name column_values { id text } }
       } }`,
      { ids: [String(arriendoId)] },
    );
    return d.items[0];
  };
  let item = await ver();
  const val = (id) => item.column_values.find((c) => c.id === id);

  if (item.name === NOMBRE) ok("el nombre quedo bien");
  else falla("el nombre", `dice "${item.name}"`);

  if (val(C.obra)?.text === "ZZ") ok("la obra quedo en ZZ");
  else falla("la obra", `dice "${val(C.obra)?.text}"`);

  if (val(C.tipoTarifa)?.text === "POR DÍA") ok("el tipo de tarifa quedo cargado");
  else falla("el tipo de tarifa", `dice "${val(C.tipoTarifa)?.text}"`);

  if (val(C.estado)?.text === "ACTIVO") ok("el estado quedo ACTIVO");
  else falla("el estado", `dice "${val(C.estado)?.text}"`);

  if (Number(val(C.cantidadInicial)?.text) === 5) ok("la cantidad inicial es 5 (2+3)");
  else falla("la cantidad inicial", `dice "${val(C.cantidadInicial)?.text}"`);

  if (val(C.excepcion)?.text === "SÍ AUTORIZADA") ok("la excepcion sin OC quedo registrada");
  else falla("la excepcion", `dice "${val(C.excepcion)?.text}"`);

  console.log("\n3. EL VINCULO CON EQUIPO VDV — lo que nunca se habia probado");
  const vinculo = val(C.responsableVdv);
  const vinculados = vinculo?.linked_item_ids ?? [];
  if (vinculados.map(String).includes(FICHA_EQUIPO_VDV)) {
    ok(`quedo vinculado a la ficha ${FICHA_EQUIPO_VDV} ("${vinculo.display_value}")`);
  } else {
    falla("el vinculo con Equipo VDV", `linked_item_ids = ${JSON.stringify(vinculados)}, display = "${vinculo?.display_value}"`);
  }

  if (item.subitems?.length === 2) ok("los 2 items cuelgan del arriendo");
  else falla("los subelementos", `hay ${item.subitems?.length ?? 0}`);

  const itemA = item.subitems.find((s) => s.name.includes("item A"));

  console.log("\n4. DEVOLVER SIN FOTO TIENE QUE FALLAR");
  const sinFoto = await pedir("/api/arriendos/devolver", {
    arriendoId,
    devoluciones: [{ itemId: itemA.id, estado: "Devuelto" }],
  });
  if (sinFoto.status === 400 && /foto/i.test(sinFoto.json.error ?? "")) {
    ok(`lo rechazo: "${sinFoto.json.error}"`);
  } else {
    falla("devolver sin foto", `${sinFoto.status} ${JSON.stringify(sinFoto.json)}`);
  }

  console.log("\n5. LA FOTO");
  // Un PNG de 1x1 real, que es lo mas chico que monday acepta como imagen.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("boardKey", "ControlArriendosItemsBoard");
  form.append("itemId", String(itemA.id));
  form.append("columnId", "file_mm7c46se");
  form.append("file", new Blob([png], { type: "image/png" }), "zz-prueba.png");
  const subida = await fetch(`${BASE}/api/monday/upload`, { method: "POST", headers: { Cookie: cookie }, body: form });
  if (subida.ok) ok("la foto de devolucion se subio");
  else falla("subir la foto", `${subida.status} ${(await subida.text()).slice(0, 160)}`);

  console.log("\n6. LA DEVOLUCION");
  const devo = await pedir("/api/arriendos/devolver", {
    arriendoId,
    devoluciones: [{ itemId: itemA.id, estado: "Devuelto", fecha: "2026-10-09" }],
  });
  if (devo.status === 200) ok("la devolucion se registro");
  else falla("la devolucion", `${devo.status} ${JSON.stringify(devo.json)}`);

  if (devo.json.estado === "ACTIVO") ok("el arriendo sigue ACTIVO (queda el item B en obra)");
  else falla("el estado recalculado", `dice "${devo.json.estado}"`);

  if (devo.json.activas === 3 && devo.json.devueltas === 2) {
    ok("el encabezado se recalculo solo: 3 activas, 2 devueltas");
  } else {
    falla("el recalculo", `activas=${devo.json.activas}, devueltas=${devo.json.devueltas}, esperaba 3 y 2`);
  }

  item = await ver();
  const v2 = (id) => item.column_values.find((c) => c.id === id)?.text;
  if (Number(v2(C.cantidadActiva)) === 3 && Number(v2(C.cantidadDevuelta)) === 2) {
    ok("y en monday quedo igual");
  } else {
    falla("monday despues de devolver", `activa=${v2(C.cantidadActiva)}, devuelta=${v2(C.cantidadDevuelta)}`);
  }
} catch (error) {
  falla("se corto", error.message);
} finally {
  console.log("\n7. LIMPIEZA");
  if (arriendoId) {
    try {
      // Borrar el arriendo se lleva sus subelementos.
      await monday(`mutation ($id: ID!) { delete_item (item_id: $id) { id } }`, { id: String(arriendoId) });
      ok(`se borro el arriendo ${arriendoId} y sus items`);
    } catch (error) {
      falla("NO SE PUDO BORRAR", `${arriendoId} quedo en el tablero: ${error.message}`);
    }
  }

  /**
   * El folio NO se libera desde aca a proposito.
   *
   * `liberarFolioArriendo` solo baja el contador si el numero sigue siendo el
   * ultimo, y para llamarlo haria falta conectarse a la base por fuera de la
   * app. Un numero salteado es inofensivo -el codigo lo contempla como "hueco",
   * que es lo correcto cuando un alta no se completa- y dejarlo asi mantiene
   * esta prueba sin tocar la base directamente.
   */
  if (numeroFolio) {
    console.log(`  (el folio ${numeroFolio} queda usado: el proximo alta sacara el siguiente)`);
  }

  const quedan = await monday(
    `query { boards(ids:["${de("MONDAY_BOARD_CONTROL_ARRIENDOS")}"]) { items_page(limit:50) { items { name } } } }`,
  ).then((d) => d.boards[0].items_page.items).catch(() => null);
  if (quedan) {
    const prueba = quedan.filter((i) => /ZZ PRUEBA/i.test(i.name));
    if (prueba.length === 0) ok(`el tablero quedo con ${quedan.length} arriendos y ninguno de prueba`);
    else falla("quedo basura", prueba.map((i) => i.name).join(", "));
  }

  console.log("\n====================================================");
  console.log(`>>> ${bien} bien, ${mal} ${mal === 1 ? "falla" : "fallas"}`);
  matar();
  process.exit(mal ? 1 : 0);
}
