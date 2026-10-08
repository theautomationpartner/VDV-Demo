/**
 * Prueba a fondo Control de Herramientas contra monday de verdad y contra la
 * app levantada en local.
 *
 *   npm run dev            (en otra terminal)
 *   npm run probar-movimientos-herramientas
 *
 * Cubre, en este orden:
 *   1. las 7 acciones, verificando COLUMNA POR COLUMNA lo que queda en los dos
 *      tableros -no solo que la llamada devuelva 200-
 *   2. la maquina de estados completa: desde cada estado, que acciones se
 *      aceptan y cuales se rechazan
 *   3. las guardas de datos: custodio fuera del directorio, destino que falta,
 *      condicion que falta, accion inventada, herramienta que no existe
 *   4. la confirmacion de recepcion: que movimientos la piden, cuales no, y
 *      que no se pueda confirmar dos veces
 *   5. los casos de borde que tienen una regla propia: devolucion con falla con
 *      y sin taller, regreso a bodega vs a obra, y que el envio a reparacion NO
 *      toque la ubicacion
 *   6. texto con acentos, comillas y saltos de linea
 *
 * Al terminar BORRA todo lo que creo. Si algo falla, igual limpia.
 *
 * Por que hace falta: la logica escribe DOS tableros en orden y un error ahi no
 * da ningun sintoma hasta que alguien nota que una herramienta figura donde no
 * esta. La unica forma de saber que anda es mirar como queda el tablero.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { mon } from "./monday-token.mjs";

register("./alias-loader.mjs", pathToFileURL(import.meta.filename));
const { desfaseConElHistorial } = await import("../lib/herramientas/dominio.js");
const { coincide, normalizar, agruparHerramientas, permanenciaDe, ESTADO_BAJA } = await import(
  "../lib/herramientas/inventario.js"
);
const { registrarMovimiento } = await import("../lib/server/herramientas-movimientos.js");

const MAESTRO = "18430928907";
const MOVIMIENTOS = "18430928943";
const API = "http://localhost:3000/api/herramientas";

// Los ids reales, verificados con npm run validar-schemas.
const M = {
  codigo: "text_mm7687am",
  estado: "color_mm76r560",
  tipoUbic: "color_mm765ngx",
  ubic: "color_mm76ncrk",
  custodio: "text_mm764j8g",
  cond: "color_mm76b1fq",
  ultSalida: "date_mm76td04",
  ultDevol: "date_mm76kdht",
  categoria: "dropdown_mm76v0b9",
  foto: "file_mm76hyqy",
};
const V = {
  idMaestro: "text_mm761181",
  codigo: "text_mm76997n",
  herramienta: "text_mm76cqvb",
  categoria: "text_mm76djdk",
  tipo: "color_mm76b3kk",
  fecha: "date_mm76jsah",
  obra: "color_mm76vnzv",
  origen: "text_mm76s0s6",
  destino: "text_mm76mdd5",
  entrega: "text_mm76mpcy",
  recibe: "text_mm767hsg",
  alSalir: "color_mm764jg3",
  alRecibir: "color_mm76bsqh",
  observaciones: "long_text_mm76vxn5",
  recepcion: "color_mm7y936c",
  confirmadaPor: "text_mm7ygdnm",
  fechaConfirmacion: "date_mm7y9yrs",
  responsableRegistroVdv: "board_relation_mm797mqq",
};

// Dos personas que SI estan en Equipo VDV (verificado el 08-oct).
const DEL_EQUIPO = "claudio leyton";
const OTRO_DEL_EQUIPO = "Isabel Delgado";

const creadas = [];
let fallas = 0;
let pasadas = 0;

function ok(nombre) {
  pasadas += 1;
  console.log(`  ok    ${nombre}`);
}
function falla(nombre, detalle) {
  fallas += 1;
  console.log(`  FALLA ${nombre}`);
  if (detalle) console.log(`        ${detalle}`);
}
function comparar(nombre, obtenido, esperado) {
  const a = obtenido ?? "";
  const b = esperado ?? "";
  if (String(a) === String(b)) ok(nombre);
  else falla(nombre, `esperaba ${JSON.stringify(b)}, quedo ${JSON.stringify(a)}`);
}

async function post(ruta, cuerpo) {
  const r = await fetch(`${API}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** Crea una herramienta de prueba en el estado que haga falta. */
async function crearHerramienta(sufijo, valores = {}) {
  const base = {
    [M.codigo]: `ZZ-${sufijo}`,
    [M.estado]: { label: "DISPONIBLE" },
    [M.tipoUbic]: { label: "BODEGA" },
    [M.ubic]: { label: "BODEGA CENTRAL" },
    [M.categoria]: { labels: ["Taladro"] },
  };
  const r = await mon(
    `mutation($b:ID!,$n:String!,$v:JSON!){ create_item(board_id:$b,item_name:$n,column_values:$v){ id } }`,
    { b: MAESTRO, n: `ZZ TEST ${sufijo} (borrar)`, v: JSON.stringify({ ...base, ...valores }) },
  );
  const id = r.create_item.id;
  creadas.push(id);
  return id;
}

/**
 * Una columna de ESTADO vacia no devuelve "" en `text`: monday devuelve el label
 * que tiene el color gris. Solo `value` los distingue. Se lee igual que la app
 * (ver coerceColumnValue), si no el test compara contra una mentira.
 */
function textoReal(c) {
  if (c.value == null && /^color_/.test(c.id)) return "";
  return c.text ?? "";
}

async function leerMaestro(id) {
  const d = await mon(
    `query($i:[ID!]){ items(ids:$i){ name column_values(ids:${JSON.stringify(Object.values(M))}){ id text value } } }`,
    { i: [id] },
  );
  const porId = Object.fromEntries(d.items[0].column_values.map((c) => [c.id, textoReal(c)]));
  const salida = { name: d.items[0].name };
  for (const [clave, col] of Object.entries(M)) salida[clave] = porId[col] ?? null;
  return salida;
}

async function leerMovimientos(idMaestro) {
  const d = await mon(
    `query{ boards(ids:["${MOVIMIENTOS}"]){ items_page(limit:200){ items{ id name created_at
      column_values(ids:${JSON.stringify(Object.values(V))}){ id text value } } } } }`,
  );
  return d.boards[0].items_page.items
    .map((i) => {
      const porId = Object.fromEntries(i.column_values.map((c) => [c.id, textoReal(c)]));
      const fila = { id: i.id, name: i.name, createdAt: i.created_at };
      for (const [clave, col] of Object.entries(V)) fila[clave] = porId[col] ?? null;
      return fila;
    })
    .filter((m) => m.idMaestro === String(idMaestro));
}

const hoy = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- 1. columnas
async function bloqueColumnas() {
  console.log("\n1. QUE QUEDA ESCRITO EN MONDAY, columna por columna");
  const id = await crearHerramienta("cols");

  const r = await post("movimiento", {
    itemId: id,
    accion: "salida",
    destino: "M388",
    custodio: DEL_EQUIPO,
    condicion: "Buena",
    observaciones: "Sale para la losa del 3er piso",
  });
  if (r.status !== 200) return falla("la salida devolvio 200", JSON.stringify(r.json));

  const h = await leerMaestro(id);
  console.log("  -- el maestro --");
  comparar("estado operativo = EN USO", h.estado, "EN USO");
  comparar("tipo ubicacion = OBRA", h.tipoUbic, "OBRA");
  comparar("ubicacion actual = M388", h.ubic, "M388");
  comparar("custodio = quien recibe", h.custodio, DEL_EQUIPO);
  comparar("condicion fisica = USADO", h.cond, "USADO");
  comparar("fecha ultima salida = hoy", h.ultSalida, hoy);
  comparar("fecha ultima devolucion sigue vacia", h.ultDevol, "");

  const [m] = await leerMovimientos(id);
  console.log("  -- el movimiento --");
  comparar("nombre del item", m.name, "Salida a obra: ZZ TEST cols (borrar)");
  comparar("id del maestro", m.idMaestro, String(id));
  comparar("codigo copiado", m.codigo, "ZZ-cols");
  comparar("nombre de la herramienta copiado", m.herramienta, "ZZ TEST cols (borrar)");
  comparar("categoria copiada", m.categoria, "Taladro");
  comparar("tipo de movimiento", m.tipo, "Salida");
  comparar("fecha del movimiento = hoy", m.fecha, hoy);
  comparar("obra = destino", m.obra, "M388");
  comparar("origen = donde estaba", m.origen, "BODEGA CENTRAL");
  comparar("destino", m.destino, "M388");
  comparar("recibe", m.recibe, DEL_EQUIPO);
  comparar("estado AL SALIR", m.alSalir, "Buena");
  comparar("estado al recibir vacio en una salida", m.alRecibir, "");
  comparar("observaciones", m.observaciones, "Sale para la losa del 3er piso");
  comparar("recepcion = Pendiente", m.recepcion, "Pendiente");
  return id;
}

// ------------------------------------------------------- 2. maquina de estados
const ACCIONES_POR_ESTADO = {
  DISPONIBLE: ["salida", "perdida", "baja"],
  "EN USO": ["devolucion", "traslado", "perdida", "baja"],
  "REQUIERE REPARACIÓN": ["enviarReparacion", "baja"],
  "EN REPARACIÓN": ["regresoReparacion", "baja"],
  EXTRAVIADA: ["baja"],
  "DADA DE BAJA": [],
};
const TODAS = ["salida", "devolucion", "traslado", "enviarReparacion", "regresoReparacion", "perdida", "baja"];

function datosPara(accion) {
  const d = {};
  if (["salida", "devolucion", "traslado", "regresoReparacion"].includes(accion)) d.destino = "M388";
  if (["salida", "traslado"].includes(accion)) d.custodio = DEL_EQUIPO;
  if (["salida", "devolucion", "traslado", "regresoReparacion"].includes(accion)) d.condicion = "Buena";
  return d;
}

async function bloqueEstados() {
  console.log("\n2. LA MAQUINA DE ESTADOS: que se puede hacer desde cada estado");
  for (const [estado, permitidas] of Object.entries(ACCIONES_POR_ESTADO)) {
    const rechazadas = TODAS.filter((a) => !permitidas.includes(a));
    let bien = 0;
    const mal = [];

    for (const accion of rechazadas) {
      const id = await crearHerramienta(`est-${rechazadas.indexOf(accion)}`, { [M.estado]: { label: estado } });
      const r = await post("movimiento", { itemId: id, accion, ...datosPara(accion) });
      if (r.status === 409) bien += 1;
      else mal.push(`${accion} dio ${r.status}`);
    }
    for (const accion of permitidas) {
      const id = await crearHerramienta(`estok-${permitidas.indexOf(accion)}`, { [M.estado]: { label: estado } });
      const r = await post("movimiento", { itemId: id, accion, ...datosPara(accion) });
      if (r.status === 200) bien += 1;
      else mal.push(`${accion} deberia andar y dio ${r.status}: ${r.json.error ?? ""}`);
    }

    if (mal.length === 0) ok(`${estado.padEnd(21)} ${permitidas.length} permitidas, ${rechazadas.length} rechazadas`);
    else falla(`${estado}`, mal.join(" | "));
  }
}

// ------------------------------------------------------------- 3. las guardas
async function bloqueGuardas() {
  console.log("\n3. LAS GUARDAS DE DATOS");
  const id = await crearHerramienta("guardas");

  let r = await post("movimiento", { itemId: id, accion: "salida", destino: "M388", custodio: "Juan Inventado", condicion: "Buena" });
  if (r.status === 400 && /Equipo VDV/.test(r.json.error ?? "")) ok("custodio fuera del directorio -> rechaza");
  else falla("custodio fuera del directorio", `${r.status} ${r.json.error}`);

  r = await post("movimiento", { itemId: id, accion: "salida", custodio: DEL_EQUIPO, condicion: "Buena" });
  if (r.status === 400) ok("salida sin destino -> rechaza");
  else falla("salida sin destino", `${r.status}`);

  r = await post("movimiento", { itemId: id, accion: "salida", destino: "M388", custodio: DEL_EQUIPO });
  if (r.status === 400) ok("salida sin condicion -> rechaza");
  else falla("salida sin condicion", `${r.status}`);

  r = await post("movimiento", { itemId: id, accion: "teletransportar", destino: "M388" });
  if (r.status === 400) ok("accion inventada -> rechaza");
  else falla("accion inventada", `${r.status}`);

  r = await post("movimiento", { itemId: "999999999", accion: "salida", destino: "M388", custodio: DEL_EQUIPO, condicion: "Buena" });
  if (r.status === 404) ok("herramienta que no existe -> 404");
  else falla("herramienta que no existe", `${r.status}`);

  r = await post("movimiento", { accion: "salida" });
  if (r.status === 400) ok("pedido sin herramienta -> rechaza");
  else falla("pedido sin herramienta", `${r.status}`);

  // Despues de todos los rechazos, la herramienta tiene que estar intacta.
  const h = await leerMaestro(id);
  comparar("ningun rechazo toco la herramienta", h.estado, "DISPONIBLE");
  const movs = await leerMovimientos(id);
  comparar("ningun rechazo dejo un movimiento", String(movs.length), "0");
}

// ------------------------------------------------------- 4. la confirmacion
async function bloqueConfirmacion(idConSalida) {
  console.log("\n4. LA CONFIRMACION DE RECEPCION");

  const [mov] = await leerMovimientos(idConSalida);
  let r = await post("confirmar", { movimientoId: mov.id });
  if (r.status === 200) ok("se confirma una salida pendiente");
  else falla("confirmar una salida", `${r.status} ${r.json.error}`);

  const [despues] = await leerMovimientos(idConSalida);
  comparar("recepcion = Confirmada", despues.recepcion, "Confirmada");
  comparar("fecha de confirmacion = hoy", despues.fechaConfirmacion, hoy);

  r = await post("confirmar", { movimientoId: mov.id });
  if (r.status === 409) ok("no se puede confirmar dos veces");
  else falla("confirmar dos veces", `${r.status}`);

  r = await post("confirmar", { movimientoId: "999999999" });
  if (r.status === 404) ok("confirmar algo que no existe -> 404");
  else falla("confirmar lo que no existe", `${r.status}`);

  // Una baja no espera confirmacion: no tiene a nadie del otro lado.
  const id = await crearHerramienta("sinconf");
  await post("movimiento", { itemId: id, accion: "baja" });
  const [baja] = await leerMovimientos(id);
  comparar("una baja NO queda pendiente", baja.recepcion, "");
  r = await post("confirmar", { movimientoId: baja.id });
  if (r.status === 400) ok("no se puede confirmar algo que no lo pide");
  else falla("confirmar una baja", `${r.status}`);

  console.log("  -- cuales piden confirmacion --");
  for (const [accion, esperado] of [
    ["salida", "Pendiente"],
    ["traslado", "Pendiente"],
    ["devolucion", "Pendiente"],
    ["enviarReparacion", ""],
    ["perdida", ""],
  ]) {
    const estadoPrevio =
      accion === "devolucion" || accion === "traslado" ? "EN USO" : accion === "enviarReparacion" ? "REQUIERE REPARACIÓN" : "DISPONIBLE";
    const idA = await crearHerramienta(`conf-${accion}`, { [M.estado]: { label: estadoPrevio } });
    await post("movimiento", { itemId: idA, accion, ...datosPara(accion) });
    const [m] = await leerMovimientos(idA);
    comparar(`${accion.padEnd(18)} -> ${esperado || "(no pide)"}`, m?.recepcion, esperado);
  }
}

// --------------------------------------------------------- 5. casos de borde
async function bloqueBordes() {
  console.log("\n5. LOS CASOS CON REGLA PROPIA");

  // Devolucion con falla, SIN mandar al taller.
  let id = await crearHerramienta("dev1", { [M.estado]: { label: "EN USO" }, [M.ubic]: { label: "M388" }, [M.custodio]: DEL_EQUIPO });
  await post("movimiento", { itemId: id, accion: "devolucion", destino: "BODEGA CENTRAL", condicion: "Mala/Con falla" });
  let h = await leerMaestro(id);
  comparar("devolucion con falla sin taller -> REQUIERE REPARACION", h.estado, "REQUIERE REPARACIÓN");
  comparar("  y queda en BODEGA", h.tipoUbic, "BODEGA");
  comparar("  el custodio se vacia", h.custodio, "");
  comparar("  condicion fisica = DAÑADO", h.cond, "DAÑADO");
  comparar("  fecha ultima devolucion = hoy", h.ultDevol, hoy);
  let [m] = await leerMovimientos(id);
  comparar("  entrega = quien la tenia", m.entrega, DEL_EQUIPO);
  comparar("  estado AL RECIBIR", m.alRecibir, "Mala/Con falla");

  // Devolucion con falla, mandandola al taller en el mismo acto.
  id = await crearHerramienta("dev2", { [M.estado]: { label: "EN USO" }, [M.ubic]: { label: "M388" } });
  await post("movimiento", { itemId: id, accion: "devolucion", destino: "BODEGA CENTRAL", condicion: "Mala/Con falla", enviarReparacion: true });
  h = await leerMaestro(id);
  comparar("devolucion con falla AL TALLER -> EN REPARACION", h.estado, "EN REPARACIÓN");
  comparar("  y tipo ubicacion = REPARACION", h.tipoUbic, "REPARACIÓN");

  // Devolucion sana.
  id = await crearHerramienta("dev3", { [M.estado]: { label: "EN USO" }, [M.ubic]: { label: "M388" } });
  await post("movimiento", { itemId: id, accion: "devolucion", destino: "BODEGA CENTRAL", condicion: "Buena" });
  h = await leerMaestro(id);
  comparar("devolucion sana -> DISPONIBLE", h.estado, "DISPONIBLE");

  // El envio a reparacion NO toca la ubicacion: la herramienta sigue siendo de su obra.
  id = await crearHerramienta("rep1", { [M.estado]: { label: "REQUIERE REPARACIÓN" }, [M.ubic]: { label: "M388" }, [M.custodio]: DEL_EQUIPO });
  await post("movimiento", { itemId: id, accion: "enviarReparacion" });
  h = await leerMaestro(id);
  comparar("enviar a taller -> EN REPARACION", h.estado, "EN REPARACIÓN");
  comparar("  NO cambia la ubicacion", h.ubic, "M388");
  comparar("  NO borra el custodio", h.custodio, DEL_EQUIPO);

  // Vuelve del taller a bodega (sin custodio) vs a una obra (con custodio).
  id = await crearHerramienta("rep2", { [M.estado]: { label: "EN REPARACIÓN" } });
  await post("movimiento", { itemId: id, accion: "regresoReparacion", destino: "BODEGA CENTRAL", condicion: "Buena" });
  h = await leerMaestro(id);
  comparar("vuelve del taller sin custodio -> DISPONIBLE", h.estado, "DISPONIBLE");
  comparar("  tipo ubicacion = BODEGA", h.tipoUbic, "BODEGA");

  id = await crearHerramienta("rep3", { [M.estado]: { label: "EN REPARACIÓN" } });
  await post("movimiento", { itemId: id, accion: "regresoReparacion", destino: "M388", custodio: OTRO_DEL_EQUIPO, condicion: "Buena" });
  h = await leerMaestro(id);
  comparar("vuelve del taller con custodio -> EN USO", h.estado, "EN USO");
  comparar("  tipo ubicacion = OBRA", h.tipoUbic, "OBRA");
  comparar("  custodio", h.custodio, OTRO_DEL_EQUIPO);

  // Un traslado tambien es salir: si no, la permanencia seguiria contando desde
  // la obra anterior.
  id = await crearHerramienta("tras", { [M.estado]: { label: "EN USO" }, [M.ubic]: { label: "M388" }, [M.custodio]: DEL_EQUIPO });
  await post("movimiento", { itemId: id, accion: "traslado", destino: "FORESTAL", custodio: OTRO_DEL_EQUIPO, condicion: "Buena" });
  h = await leerMaestro(id);
  comparar("traslado cambia la obra", h.ubic, "FORESTAL");
  comparar("  cambia el custodio", h.custodio, OTRO_DEL_EQUIPO);
  comparar("  y pisa la fecha de ultima salida", h.ultSalida, hoy);
  [m] = await leerMovimientos(id);
  comparar("  entrega = el custodio anterior", m.entrega, DEL_EQUIPO);
  comparar("  origen = la obra anterior", m.origen, "M388");

  // Perdida y baja.
  id = await crearHerramienta("perd");
  await post("movimiento", { itemId: id, accion: "perdida" });
  h = await leerMaestro(id);
  comparar("perdida -> EXTRAVIADA", h.estado, "EXTRAVIADA");
  comparar("  no toca la ubicacion", h.ubic, "BODEGA CENTRAL");

  id = await crearHerramienta("baja", { [M.estado]: { label: "EXTRAVIADA" } });
  await post("movimiento", { itemId: id, accion: "baja" });
  h = await leerMaestro(id);
  comparar("baja -> DADA DE BAJA", h.estado, "DADA DE BAJA");
  comparar("  tipo ubicacion = BAJA", h.tipoUbic, "BAJA");
}

// -------------------------------------------------------------- 6. el texto
async function bloqueTexto() {
  console.log("\n6. TEXTO CON ACENTOS, COMILLAS Y SALTOS");
  const id = await crearHerramienta("texto");
  const raro = 'Ñandú "roto" — se le salió el mandril\nSegunda línea; con punto y coma';
  const r = await post("movimiento", {
    itemId: id,
    accion: "salida",
    destino: ". JUAN XXIII",
    custodio: DEL_EQUIPO,
    condicion: "Mala/Con falla",
    observaciones: raro,
  });
  if (r.status !== 200) return falla("la salida con texto raro", JSON.stringify(r.json));
  const [m] = await leerMovimientos(id);
  comparar("las observaciones vuelven iguales", m.observaciones, raro);
  const h = await leerMaestro(id);
  comparar("una obra que empieza con punto se guarda bien", h.ubic, ". JUAN XXIII");
}

/**
 * El movimiento con los nombres que usa la app. `leerMovimientos` devuelve las
 * claves cortas de este script (tipo, recibe, alSalir) y desfaseConElHistorial
 * espera las del dominio: sin esta traduccion recibe undefined y no opina.
 */
function comoLoVeLaApp(m) {
  return {
    tipoMovimiento: m.tipo,
    destino: m.destino,
    obra: m.obra,
    recibeCustodio: m.recibe,
    estadoAlSalir: m.alSalir,
    estadoAlRecibir: m.alRecibir,
  };
}

// ------------------------------------------------- 7. la ficha contra el historial
async function bloqueDesfase() {
  console.log("\n7. CUANDO LA FICHA NO COINCIDE CON SU HISTORIAL");
  const id = await crearHerramienta("desfase");

  await post("movimiento", { itemId: id, accion: "salida", destino: "M388", custodio: DEL_EQUIPO, condicion: "Buena" });
  let h = await leerMaestro(id);
  comparar("tras la salida la ficha dice M388", h.ubic, "M388");

  // Se simula lo que pasa si monday acepta el movimiento y rechaza la ficha:
  // se deja la herramienta como estaba antes, con el movimiento ya escrito.
  await mon(
    `mutation($b:ID!,$i:ID!,$v:JSON!){ change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){ id } }`,
    {
      b: MAESTRO,
      i: id,
      v: JSON.stringify({
        [M.estado]: { label: "DISPONIBLE" },
        [M.tipoUbic]: { label: "BODEGA" },
        [M.ubic]: { label: "BODEGA CENTRAL" },
        [M.custodio]: "",
      }),
    },
  );

  const [ultimo] = await leerMovimientos(id);
  const antes = await leerMaestro(id);
  const detectado = desfaseConElHistorial(
    {
      estadoOperativo: antes.estado,
      tipoUbicacion: antes.tipoUbic,
      ubicacionActual: antes.ubic,
      custodioActual: antes.custodio,
    },
    comoLoVeLaApp(ultimo),
  );
  if (detectado) ok(`se detecta el desfase (${detectado.diferencias.length} columnas)`);
  else falla("se detecta el desfase", "no devolvio nada");

  const r = await post("poner-al-dia", { itemId: id });
  if (r.status === 200) ok("poner al dia responde 200");
  else falla("poner al dia", `${r.status} ${r.json.error}`);

  h = await leerMaestro(id);
  comparar("  vuelve a EN USO", h.estado, "EN USO");
  comparar("  vuelve a M388", h.ubic, "M388");
  comparar("  vuelve el custodio", h.custodio, DEL_EQUIPO);

  // Llamarlo cuando ya esta al dia no tiene que romper ni inventar nada.
  const otra = await post("poner-al-dia", { itemId: id });
  if (otra.status === 200 && otra.json.yaEstaba) ok("si ya estaba al dia, lo dice y no toca nada");
  else falla("poner al dia dos veces", JSON.stringify(otra.json));

  // Y lo mas importante: que no invente desfases donde no los hay.
  const limpia = await crearHerramienta("sindesfase");
  await post("movimiento", { itemId: limpia, accion: "salida", destino: "FORESTAL", custodio: DEL_EQUIPO, condicion: "Buena" });
  const hl = await leerMaestro(limpia);
  const [ml] = await leerMovimientos(limpia);
  const falso = desfaseConElHistorial(
    {
      estadoOperativo: hl.estado,
      tipoUbicacion: hl.tipoUbic,
      ubicacionActual: hl.ubic,
      custodioActual: hl.custodio,
    },
    comoLoVeLaApp(ml),
  );
  if (!falso) ok("una herramienta sana NO da falso positivo");
  else falla("falso positivo", JSON.stringify(falso.diferencias));
}

// ------------------------------------------------------------------ 8. la foto
async function bloqueFoto() {
  console.log("\n8. LA FOTO: subir y volver a leerla");
  const id = await crearHerramienta("foto");

  // Un PNG de 1x1 armado a mano: no hace falta tener un archivo al lado.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  const fd = new FormData();
  fd.append("boardKey", "ControlHerramientasBoard");
  fd.append("itemId", String(id));
  fd.append("columnId", M.foto);
  fd.append("file", new Blob([png], { type: "image/png" }), "prueba.png");
  fd.append("reemplazar", "true");

  const r = await fetch("http://localhost:3000/api/monday/upload", { method: "POST", body: fd });
  if (r.status === 200) ok("la subida responde 200");
  else return falla("la subida", `${r.status}`);

  // monday tarda un instante en dejar la URL disponible en la columna.
  await new Promise((res) => setTimeout(res, 3000));
  const h = await leerMaestro(id);
  if (h.foto) ok("la columna quedo con la URL de la foto");
  else return falla("la columna de foto", "quedo vacia");

  // Y que la app la sirva de vuelta: es el camino que usa la pantalla, con su
  // verificacion de permisos y el redirect a monday.
  const img = await fetch(
    `http://localhost:3000/api/monday/archivo?boardKey=ControlHerramientasBoard&itemId=${id}&columna=foto`,
    { redirect: "follow" },
  );
  const buf = Buffer.from(await img.arrayBuffer());
  if (img.status === 200) ok("la app la sirve de vuelta");
  else falla("servir la foto", `${img.status}`);
  comparar("  es el mismo archivo", buf.length, png.length);

  // Y que no se pueda bajar cualquier columna pasando su nombre.
  const otra = await fetch(
    `http://localhost:3000/api/monday/archivo?boardKey=ControlHerramientasBoard&itemId=${id}&columna=observaciones`,
  );
  if (otra.status >= 400) ok("no se puede pedir otra columna que no sea la foto");
  else falla("pedir otra columna", `dio ${otra.status}`);
}

// ------------------------------------------------- 9. el listado: buscar y agrupar
async function bloqueListado() {
  console.log("\n9. EL LISTADO sobre las herramientas reales");
  const r = await fetch("http://localhost:3000/api/monday/board", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      boardKey: "ControlHerramientasBoard",
      op: "items",
      params: {
        columns: ["codigo", "categoria", "marca", "modelo", "numeroSerie", "estadoOperativo", "ubicacionActual", "custodioActual", "fechaUltimaSalida"],
        limit: 500,
        orderBy: { column: "updatedAt", direction: "desc" },
      },
    }),
  });
  const json = await r.json();
  if (!json.result) return falla("traer el inventario", JSON.stringify(json).slice(0, 150));
  // Las de prueba de esta corrida no cuentan para las cuentas de abajo.
  const items = json.result.items.filter((i) => !/^ZZ /.test(i.name));
  ok(`trae el inventario (${items.length} herramientas reales)`);

  // El orden: la ultima tocada primero. Es lo que hace que las que tienen foto
  // se vean, en vez de caer en la fila 81 de 83.
  const conFoto = items.filter((i) => i.foto).length;
  if (items.length > 10) ok(`ordenado por lo ultimo tocado (${conFoto} con foto)`);

  // El buscador, con los casos que el cliente pidio en la llamada.
  const buscar = (q) => items.filter((h) => coincide(h, normalizar(q)));
  const rotomartillos = buscar("rotomartillo");
  if (rotomartillos.length > 0) ok(`buscar "rotomartillo" encuentra ${rotomartillos.length}`);
  else falla("buscar rotomartillo", "no encontro ninguno");

  const porCodigo = buscar("HRR-0133");
  comparar('buscar por codigo "HRR-0133" da 1', porCodigo.length, 1);

  const porMarca = buscar("makita");
  if (porMarca.length > 0) ok(`buscar por marca "makita" encuentra ${porMarca.length}`);
  else falla("buscar por marca", "no encontro ninguna");

  // Dos palabras exigen las dos, no cualquiera de las dos.
  const dos = buscar("taladro makita");
  const soloTaladro = buscar("taladro");
  if (dos.length <= soloTaladro.length) ok("dos palabras filtran mas que una");
  else falla("busqueda de dos palabras", `"taladro makita" (${dos.length}) > "taladro" (${soloTaladro.length})`);

  const sinNada = buscar("zzzzznoexiste");
  comparar("algo que no existe no devuelve nada", sinNada.length, 0);

  const conTilde = buscar("reparacion");
  const sinTilde = buscar("reparación");
  comparar("buscar con y sin tilde da lo mismo", conTilde.length, sinTilde.length);

  // El filtro por defecto del listado: sin las dadas de baja.
  const vigentes = items.filter((h) => h.estadoOperativo !== ESTADO_BAJA);
  if (vigentes.length < items.length) ok(`el filtro vigente saca ${items.length - vigentes.length} dadas de baja`);
  else ok("no hay dadas de baja para sacar");

  // El agrupado: unidades iguales en el mismo lugar van en una sola fila.
  const grupos = agruparHerramientas(vigentes);
  const agrupados = grupos.filter((g) => g.unidades.length > 1);
  if (grupos.length <= vigentes.length) ok(`${vigentes.length} unidades en ${grupos.length} modelos, ${agrupados.length} agrupados`);
  else falla("el agrupado", "hay mas grupos que unidades");

  const suma = grupos.reduce((t, g) => t + g.unidades.length, 0);
  comparar("  no se pierde ni se duplica ninguna", suma, vigentes.length);

  if (agrupados.length) {
    const g = agrupados[0];
    const mismoLugar = g.unidades.every((u) => u.ubicacionActual === g.unidades[0].ubicacionActual);
    if (mismoLugar) ok("  las agrupadas estan todas en el mismo lugar");
    else falla("el agrupado junta obras distintas", g.nombre);
  }

  // La permanencia, que es el dato que hace saltar lo que lleva demasiado.
  const conFecha = items.filter((h) => permanenciaDe(h) !== null);
  const viejas = conFecha.filter((h) => permanenciaDe(h) >= 30);
  ok(`permanencia calculada en ${conFecha.length}, ${viejas.length} llevan mas de un mes`);
}

// --------------------------------------------- 10. quien registro el movimiento
async function bloqueFirma() {
  console.log("\n10. LA FIRMA: el movimiento dice quien lo registro");
  const id = await crearHerramienta("firma");

  // Se llama a la funcion del servidor y no a la API porque en local no hay
  // login: asi se le puede pasar una sesion, que es de donde sale la firma.
  const r = await registrarMovimiento({
    itemId: id,
    accion: "salida",
    datos: { destino: "M388", custodio: DEL_EQUIPO, condicion: "Buena" },
    quien: { email: "claudio@vergaradelvalle.com", nombre: DEL_EQUIPO },
  });

  // OJO: en una columna de VINCULO el campo `text` viene SIEMPRE null; el dato
  // esta en linked_items. Leerlo mal hace creer que no se escribio nada.
  const d = await mon(
    `query($i:[ID!]){ items(ids:$i){ column_values(ids:["${V.responsableRegistroVdv}"]){
      ... on BoardRelationValue { display_value linked_items{ id name } } } } }`,
    { i: [r.movimientoId] },
  );
  const cv = d.items[0].column_values[0];
  comparar("queda vinculado a su ficha de Equipo VDV", cv.display_value, DEL_EQUIPO);
  comparar("  apunta al item del directorio", cv.linked_items?.length, 1);

  // Y que un mail que no esta en el directorio no frene el movimiento.
  const id2 = await crearHerramienta("firma2");
  const r2 = await registrarMovimiento({
    itemId: id2,
    accion: "perdida",
    datos: {},
    quien: { email: "nadie@ejemplo.com", nombre: "Nadie" },
  });
  if (r2.ok) ok("un mail que no esta en el directorio no frena el movimiento");
  else falla("mail desconocido", "freno el movimiento");
}

// ------------------------------- 11. dos movimientos el mismo dia, en orden
async function bloqueMismoDia() {
  console.log("\n11. DOS MOVIMIENTOS EL MISMO DIA");
  const id = await crearHerramienta("mismodia");

  await post("movimiento", { itemId: id, accion: "salida", destino: "M388", custodio: DEL_EQUIPO, condicion: "Buena" });
  await post("movimiento", { itemId: id, accion: "traslado", destino: "FORESTAL", custodio: OTRO_DEL_EQUIPO, condicion: "Buena" });

  const movs = await leerMovimientos(id);
  comparar("quedan los dos movimientos", movs.length, 2);
  comparar("  los dos tienen la misma fecha", movs[0].fecha, movs[1].fecha);

  // Ordenado como lo hace la ficha: por hora de creacion, no por fecha. Los dos
  // guardan el dia, asi que ordenar por fecha empata y deja cualquiera primero.
  const comoLaFicha = [...movs].sort((a, b) => {
    const porCreacion = new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0);
    if (porCreacion !== 0) return porCreacion;
    return new Date(b.fecha ?? 0) - new Date(a.fecha ?? 0);
  });
  comparar("el ultimo es el TRASLADO, no la salida", comoLaFicha[0].tipo, "Traslado");

  // Y lo que importa de verdad: que el detector no invente un desfase. Si toma
  // el movimiento viejo dice que la ficha esta mal cuando esta bien, y "Poner
  // al dia" revertiria el traslado.
  const h = await leerMaestro(id);
  const desfase = desfaseConElHistorial(
    {
      estadoOperativo: h.estado,
      tipoUbicacion: h.tipoUbic,
      ubicacionActual: h.ubic,
      custodioActual: h.custodio,
    },
    comoLoVeLaApp(comoLaFicha[0]),
  );
  if (!desfase) ok("no inventa un desfase con dos movimientos del mismo dia");
  else falla("falso desfase", JSON.stringify(desfase.diferencias));
}

// ------------------------------------------------------------------ limpieza
async function limpiar() {
  console.log("\nLIMPIEZA");
  let movs = 0;
  const d = await mon(
    `query{ boards(ids:["${MOVIMIENTOS}"]){ items_page(limit:500){ items{ id column_values(ids:["${V.idMaestro}"]){ text } } } } }`,
  );
  for (const item of d.boards[0].items_page.items) {
    if (creadas.includes(item.column_values[0]?.text)) {
      await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: item.id });
      movs += 1;
    }
  }
  for (const id of creadas) {
    await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: id }).catch(() => {});
  }
  console.log(`  borradas ${creadas.length} herramientas de prueba y ${movs} movimientos`);

  // Que no quede ningun ZZ TEST suelto de una corrida anterior que se corto.
  const sobrantes = await mon(
    `query{ boards(ids:["${MAESTRO}"]){ items_page(limit:500){ items{ id name } } } }`,
  );
  const zz = sobrantes.boards[0].items_page.items.filter((i) => /^ZZ TEST /.test(i.name));
  if (zz.length) console.log(`  OJO: quedaron ${zz.length} ZZ TEST de antes: ${zz.map((i) => i.name).join(", ")}`);
  else console.log("  no quedo ningun ZZ TEST suelto");
}

// -------------------------------------------------------------------- correr
/** Borra lo que haya quedado de una corrida que se corto por la mitad. */
async function limpiarSobrantes() {
  const h = await mon(`query{ boards(ids:["${MAESTRO}"]){ items_page(limit:500){ items{ id name } } } }`);
  const zz = h.boards[0].items_page.items.filter((i) => /^ZZ TEST /.test(i.name));
  if (!zz.length) return;
  console.log(`(habia ${zz.length} ZZ TEST de una corrida anterior, se borran)`);
  for (const i of zz) creadas.push(String(i.id));
}

try {
  await limpiarSobrantes();
  const idConSalida = await bloqueColumnas();
  await bloqueEstados();
  await bloqueGuardas();
  if (idConSalida) await bloqueConfirmacion(idConSalida);
  await bloqueBordes();
  await bloqueTexto();
  await bloqueDesfase();
  await bloqueFoto();
  await bloqueListado();
  await bloqueFirma();
  await bloqueMismoDia();
} catch (error) {
  fallas += 1;
  console.log("\nSE CORTO:", error.message.slice(0, 400));
} finally {
  await limpiar();
}

console.log(`\n${"=".repeat(52)}`);
console.log(fallas ? `>>> ${pasadas} bien, ${fallas} FALLAS` : `>>> las ${pasadas} comprobaciones pasan`);
process.exit(fallas ? 1 : 0);
