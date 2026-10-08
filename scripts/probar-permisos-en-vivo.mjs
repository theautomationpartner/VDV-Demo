/**
 * Prueba los permisos de Control de Herramientas CONTRA LA APP DE VERDAD, por
 * HTTP y con la autenticacion prendida.
 *
 *   npm run probar-permisos-en-vivo
 *
 * Por que hace falta, teniendo ya el script de permisos: aquel llama a las
 * funciones del servidor de a una. Este levanta la app con AUTH_LAYERS_ENABLED
 * y le pega a las rutas reales con una cookie de sesion firmada por rol, asi
 * que comprueba el camino completo -el guard, la ruta, el recorte y la
 * respuesta- que es donde se cuelan los errores de cableado: una ruta que se
 * olvido de llamar al guard pasa los dos scripts anteriores igual.
 *
 * Como funciona sin tocar ninguna base: `verificarAcceso` lee el usuario para
 * confirmar que sigue activo, pero si la base NO RESPONDE vuelve a la sesion del
 * token en vez de dejar a todos afuera (ver lib/server/auth-guard.js). Asi que
 * se levanta con un DATABASE_URL que no existe y las sesiones se firman aca.
 * Ninguna de las dos bases reales se toca.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import jwt from "jsonwebtoken";

const PUERTO = 3099;
const BASE = `http://localhost:${PUERTO}`;
const SECRETO = "secreto-solo-para-esta-prueba-no-se-usa-en-ningun-lado";

let pasadas = 0;
let fallas = 0;
const ok = (n) => { pasadas += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { fallas += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };

/** Una cookie de sesion con las asignaciones que se le pasen. */
function sesion(asignaciones) {
  const token = jwt.sign(
    { uid: 999, email: "prueba@vdv.cl", rol: "usuario", tipo: "sesion", nombre: "Prueba", asignaciones },
    SECRETO,
    { expiresIn: "10m" },
  );
  return `vdv_session=${token}`;
}

const ROLES = {
  administrador: sesion([{ app: "herramientas", appRol: "administrador" }]),
  oficinaTecnica: sesion([{ app: "herramientas", appRol: "oficina_tecnica" }]),
  bodeguero: sesion([{ app: "herramientas", appRol: "bodeguero" }]),
  // Acotado a una obra: es el caso que no se puede probar sin sesion.
  jefeDeObraM388: sesion([
    { app: "herramientas", appRol: "jefe_obra", appConfig: { restrictObras: true, obras: ["M388"] } },
  ]),
  bodegueroM388: sesion([
    { app: "herramientas", appRol: "bodeguero", appConfig: { restrictObras: true, obras: ["M388"] } },
  ]),
  // Alguien de otra app, que no deberia ver nada de herramientas.
  soloValeExpress: sesion([{ app: "vale-express", appRol: "super_admin" }]),
  sinSesion: null,
};

async function pedir(ruta, { cookie, metodo = "POST", cuerpo } = {}) {
  const r = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const inventario = (cookie) =>
  pedir("/api/monday/board", {
    cookie,
    cuerpo: {
      boardKey: "ControlHerramientasBoard",
      op: "items",
      params: { columns: ["codigo", "ubicacionActual", "valorCompra", "estadoOperativo"], limit: 500 },
    },
  });

async function correr() {
  console.log("\n1. QUIEN PUEDE VER EL INVENTARIO");
  for (const [nombre, cookie] of [["administrador", ROLES.administrador], ["bodeguero", ROLES.bodeguero], ["jefe de obra", ROLES.jefeDeObraM388]]) {
    const r = await inventario(cookie);
    if (r.status === 200) ok(`${nombre} entra (${r.json.result?.items?.length ?? 0} herramientas)`);
    else falla(`${nombre} deberia entrar`, `${r.status} ${r.json.error ?? ""}`);
  }
  for (const [nombre, cookie] of [["solo Vale Express", ROLES.soloValeExpress], ["sin sesion", ROLES.sinSesion]]) {
    const r = await inventario(cookie);
    if (r.status >= 400) ok(`${nombre} NO entra (${r.status})`);
    else falla(`${nombre} no deberia entrar`, `dio ${r.status}`);
  }

  console.log("\n2. EL RECORTE POR OBRA, que es lo que no se puede probar sin sesion");
  const todo = await inventario(ROLES.administrador);
  const total = todo.json.result.items.length;
  const deM388 = todo.json.result.items.filter((h) => h.ubicacionActual === "M388").length;

  const jefe = await inventario(ROLES.jefeDeObraM388);
  const ve = jefe.json.result.items.length;
  if (ve === deM388) ok(`el jefe de obra ve ${ve}, que son exactamente las de M388 (de ${total})`);
  else falla("el recorte por obra", `ve ${ve} y en M388 hay ${deM388}`);
  if (jefe.json.result.items.every((h) => h.ubicacionActual === "M388")) ok("  ninguna es de otra obra");
  else falla("  se colo una de otra obra");

  const bodeguero = await inventario(ROLES.bodegueroM388);
  if (bodeguero.json.result.items.length === total) ok(`el bodeguero acotado ve las ${total}, como pidio el cliente`);
  else falla("el bodeguero deberia ver todo", `ve ${bodeguero.json.result.items.length} de ${total}`);

  console.log("\n3. LA VALORIZACION");
  const conPlata = (r) => r.json.result.items.filter((h) => "valorCompra" in h).length;
  comprobar("el administrador recibe el precio", conPlata(todo) > 0, true);
  comprobar("la oficina tecnica tambien", conPlata(await inventario(ROLES.oficinaTecnica)) > 0, true);
  comprobar("el bodeguero NO lo recibe", conPlata(await inventario(ROLES.bodeguero)), 0);
  comprobar("el jefe de obra tampoco", conPlata(jefe), 0);

  console.log("\n4. LA FICHA DE UNA HERRAMIENTA AJENA");
  const deOtraObra = todo.json.result.items.find((h) => h.ubicacionActual && h.ubicacionActual !== "M388");
  const unaDeM388 = todo.json.result.items.find((h) => h.ubicacionActual === "M388");

  let r = await pedir("/api/monday/board", {
    cookie: ROLES.jefeDeObraM388,
    cuerpo: { boardKey: "ControlHerramientasBoard", op: "item", params: { itemId: deOtraObra.id, columns: ["codigo"] } },
  });
  if (r.status === 403) ok(`no puede abrir una de ${deOtraObra.ubicacionActual} por la URL`);
  else falla("abrir una ficha ajena", `dio ${r.status}`);

  r = await pedir("/api/monday/board", {
    cookie: ROLES.jefeDeObraM388,
    cuerpo: { boardKey: "ControlHerramientasBoard", op: "item", params: { itemId: unaDeM388.id, columns: ["codigo"] } },
  });
  if (r.status === 200) ok("pero si una de su obra, aunque la consulta no pida la obra");
  else falla("abrir una ficha propia", `dio ${r.status}`);

  console.log("\n5. QUIEN PUEDE MOVER UNA HERRAMIENTA");
  const movimiento = (cookie, itemId = unaDeM388.id) =>
    pedir("/api/herramientas/movimiento", {
      cookie,
      cuerpo: { itemId, accion: "perdida" },
    });

  for (const [nombre, cookie] of [["el jefe de obra", ROLES.jefeDeObraM388], ["la oficina tecnica", ROLES.oficinaTecnica], ["solo Vale Express", ROLES.soloValeExpress], ["sin sesion", ROLES.sinSesion]]) {
    const r = await movimiento(cookie);
    if (r.status === 403 || r.status === 401) ok(`${nombre} NO puede mover (${r.status})`);
    else falla(`${nombre} no deberia poder mover`, `dio ${r.status}: ${r.json.error ?? ""}`);
  }

  // Y el que si puede, pero sobre una herramienta de otra obra.
  const r2 = await pedir("/api/herramientas/movimiento", {
    cookie: ROLES.bodegueroM388,
    cuerpo: { itemId: deOtraObra.id, accion: "salida", destino: "FORESTAL", custodio: "claudio leyton", condicion: "Buena" },
  });
  // El bodeguero ve toda la empresa, asi que el recorte por obra NO lo frena:
  // esto tiene que ser rechazado por el ESTADO o aceptado, pero nunca por obra.
  if (r2.status !== 403) ok("el bodeguero no queda frenado por la obra (ve toda la empresa)");
  else falla("el bodeguero quedo frenado por obra", r2.json.error);

  console.log("\n6. LA FOTO");
  const foto = async (cookie, itemId) => {
    const r = await fetch(
      `${BASE}/api/monday/archivo?boardKey=ControlHerramientasBoard&itemId=${itemId}&columna=foto`,
      { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" },
    );
    return r.status;
  };
  comprobar("sin sesion no se baja una foto", (await foto(null, unaDeM388.id)) >= 400, true);
  comprobar("solo Vale Express tampoco", (await foto(ROLES.soloValeExpress, unaDeM388.id)) >= 400, true);
  comprobar(
    "el jefe de obra no baja la de otra obra",
    (await foto(ROLES.jefeDeObraM388, deOtraObra.id)) >= 400,
    true,
  );

  console.log("\n7. PONER AL DIA");
  for (const [nombre, cookie, esperado] of [
    ["el jefe de obra no puede", ROLES.jefeDeObraM388, 403],
    ["sin sesion tampoco", ROLES.sinSesion, 401],
  ]) {
    const r = await pedir("/api/herramientas/poner-al-dia", { cookie, cuerpo: { itemId: unaDeM388.id } });
    if (r.status === esperado) ok(nombre);
    else falla(nombre, `esperaba ${esperado}, dio ${r.status}`);
  }
}

function comprobar(nombre, obtenido, esperado) {
  if (obtenido === esperado) ok(nombre);
  else falla(nombre, `esperaba ${JSON.stringify(esperado)}, dio ${JSON.stringify(obtenido)}`);
}

// --------------------------------------------------------------- el servidor
//
// Las variables van en el ENTORNO del proceso, no en un archivo: Next no pisa lo
// que ya esta en process.env, asi que .env.local NO SE TOCA. Si esto se cuelga o
// lo matan a mitad, no deja nada roto detras.
const original = readFileSync(".env.local", "utf8");
const deEnv = (clave) => original.match(new RegExp(`^${clave}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

const entorno = {
  ...process.env,
  NODE_ENV: "production",
  AUTH_LAYERS_ENABLED: "true",
  MFA_SESSION_SECRET: SECRETO,
  MFA_ENCRYPTION_KEY: "0".repeat(64),
  // A proposito no existe: asi verificarAcceso cae en la sesion del token y no
  // se toca ninguna base real. Ver el comentario de arriba del archivo.
  DATABASE_URL: "postgresql://nadie:nadie@127.0.0.1:1/no-existe",
  MONDAY_API_TOKEN: deEnv("MONDAY_API_TOKEN"),
};
for (const b of [
  "CONTROL_HERRAMIENTAS", "CONTROL_HERRAMIENTAS_MOVIMIENTOS", "EQUIPO_VDV", "VALES", "INGRESOS",
  "PROVEEDORES", "ORDENES_DE_COMPRA_MAXXA", "FACTURAS_IA", "BASE_DE_DATOS_MATERIALES", "PAGOS_VDV",
  "FLUJO_CONTRATACION_SUBCONTRATO", "ESTADOS_DE_PAGO_SUBCONTRATOS",
]) {
  entorno[`MONDAY_BOARD_${b}`] = deEnv(`MONDAY_BOARD_${b}`);
}

// `next start` y no `next dev`: dev no deja levantar un segundo servidor en el
// mismo directorio, y start corre el build de produccion, que es lo que se
// quiere probar. Necesita un `npm run build` previo.
console.log(`levantando la app en ${PUERTO} con la autenticacion PRENDIDA y sin base…`);
const server = spawn("npx", ["next", "start", "--port", String(PUERTO)], {
  env: entorno,
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});

function limpiar() {
  server.kill();
}
process.on("exit", limpiar);
process.on("SIGINT", () => { limpiar(); process.exit(1); });

// Se espera a que el PUERTO conteste, no a que el log diga "Ready": next lo
// imprime antes de estar escuchando y el primer pedido se cae.
let salida = "";
server.stdout.on("data", (b) => { salida += b; });
server.stderr.on("data", (b) => { salida += b; });

const arranco = await (async () => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE}/api/version`);
      if (r.status < 500) return true;
    } catch {
      // todavia no escucha
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
})();

if (!arranco) {
  console.log("el servidor no contesto en 90 s. Lo que imprimio:");
  console.log(salida.slice(-1200));
  limpiar();
  process.exit(1);
}

try {
  await correr();
} catch (error) {
  fallas += 1;
  console.log("\nSE CORTO:", error.message.slice(0, 300));
} finally {
  limpiar();
}

console.log(`\n${"=".repeat(52)}`);
console.log(fallas ? `>>> ${pasadas} bien, ${fallas} FALLAS` : `>>> las ${pasadas} comprobaciones pasan`);
process.exit(fallas ? 1 : 0);
