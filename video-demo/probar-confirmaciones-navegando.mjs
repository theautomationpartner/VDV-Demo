/**
 * El circuito completo de la confirmacion de recepcion, usando la pantalla.
 *
 *   node video-demo/probar-confirmaciones-navegando.mjs
 *
 * Lo que prueba y que los tests de arriba NO pueden probar: que un movimiento
 * real escrito en monday APAREZCA en "Mis Pendientes", que el link lleve a la
 * ficha correcta, que el boton de confirmar este ahi, y -sobre todo- que
 * despues de confirmar la fila DESAPAREZCA de la bandeja y el contador baje.
 *
 * Ese ultimo paso es el que no se puede verificar de otra forma: la bandeja
 * cachea cinco minutos, asi que sin tirar esa foto al confirmar, el recorrido
 * natural -entro por la bandeja, confirmo, vuelvo- te devolvia a la misma lista
 * con el mismo numero, y al segundo click la ficha ya no tenia boton.
 *
 * Escribe de verdad en monday y BORRA todo lo que crea, falle o no.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { levantarApp, cookieSesion } from "./comun.mjs";

/**
 * Puerto propio y no el 3098 de las demas pruebas.
 *
 * Si queda un servidor de una corrida anterior tomando el puerto, `levantarApp`
 * no falla: el `next start` muere con EADDRINUSE pero el bucle de espera
 * encuentra al VIEJO contestando y sigue como si nada. La prueba entonces corre
 * contra otro build -y contra la base real, donde la cuenta forjada no existe-,
 * y lo que se ve son 401 que no tienen nada que ver con lo que se esta
 * probando. Ya paso una vez aca.
 */
const PUERTO = 3097;
const BASE = `http://localhost:${PUERTO}`;
const MAESTRO = "18430928907";
const MOVIMIENTOS = "18430928943";
const COL = {
  codigo: "text_mm7687am",
  estado: "color_mm76r560",
  tipoUbic: "color_mm765ngx",
  ubic: "color_mm76ncrk",
  categoria: "dropdown_mm76v0b9",
};
const IDMAESTRO_EN_MOVIMIENTO = "text_mm761181";

// Verificados el 08-oct: existen en Equipo VDV y en el dropdown de obras.
const CUSTODIO = "claudio leyton";
const OBRA = "M388";

const TOKEN = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
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

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${d}` : ""}`); };
const comprobar = (n, cond, d) => (cond ? ok(n) : falla(n, d));

const aBorrar = [];
const { cerrar } = await levantarApp({ puerto: PUERTO });
const galleta = cookieSesion();

// Que conteste EL servidor que se acaba de levantar y no uno viejo: si el build
// no es el de ahora, todo lo que siga mide otra cosa.
const version = await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0);
if (version !== 200) {
  console.error(`La app no contesta en ${BASE} (status ${version}).`);
  cerrar();
  process.exit(1);
}
let browser;

try {
  // ------------------------------------------------- 1. una herramienta real
  const nombre = `ZZ TEST confirmacion ${Date.now()} (borrar)`;
  const creada = await mon(
    `mutation($b:ID!,$n:String!,$v:JSON!){ create_item(board_id:$b,item_name:$n,column_values:$v){ id } }`,
    {
      b: MAESTRO,
      n: nombre,
      v: JSON.stringify({
        [COL.codigo]: "ZZ-CONF",
        [COL.estado]: { label: "DISPONIBLE" },
        [COL.tipoUbic]: { label: "BODEGA" },
        [COL.ubic]: { label: "BODEGA CENTRAL" },
        [COL.categoria]: { labels: ["Taladro"] },
      }),
    },
  );
  const herramientaId = creada.create_item.id;
  aBorrar.push([MAESTRO, herramientaId]);
  console.log(`  herramienta de prueba: ${herramientaId}\n`);

  // ------------------------------------------- 2. una salida, que queda pendiente
  const salida = await fetch(`${BASE}/api/herramientas/movimiento`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${galleta.name}=${galleta.value}` },
    body: JSON.stringify({
      itemId: herramientaId,
      accion: "salida",
      destino: OBRA,
      custodio: CUSTODIO,
      condicion: "Buena",
    }),
  });
  const jsonSalida = await salida.json().catch(() => ({}));
  comprobar("la salida se registra", salida.status === 200 && jsonSalida.ok, `${salida.status} ${JSON.stringify(jsonSalida)}`);
  comprobar("y queda esperando confirmacion", jsonSalida.esperaConfirmacion === true);
  if (jsonSalida.movimientoId) aBorrar.push([MOVIMIENTOS, jsonSalida.movimientoId]);

  // monday tarda en indexar lo recien escrito para los filtros del query_params.
  await new Promise((r) => setTimeout(r, 8000));

  // ---------------------------------------------------- 3. mirar la bandeja
  browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    locale: "es-CL",
    timezoneId: "America/Santiago",
  });
  await context.addCookies([galleta]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("hr_session", JSON.stringify({ role: "administrador", obras: [], restrictObras: false }));
    } catch { /* almacenamiento bloqueado */ }
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/mis-pendientes`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(4000);

  const texto = await page.locator("body").innerText();
  comprobar("la herramienta aparece en la bandeja", texto.includes(nombre), texto.split("\n").filter(Boolean).slice(0, 12).join(" | "));
  comprobar("dice que hay que confirmar", texto.includes("Confirmar que llegó"));
  comprobar("muestra la obra de destino", texto.includes(OBRA));
  comprobar("y el motivo explica de donde vino", /todavía nadie confirmó que llegó/.test(texto));
  comprobar("no muestra un monto inventado", !/\$\s*0\b/.test(texto));

  // El contador del menu lateral tiene que contarla.
  const contador = await page.locator("nav[aria-label='Mis pendientes']").first().innerText().catch(() => "");
  comprobar("el contador del menu la cuenta", /[1-9]/.test(contador), `contador: ${JSON.stringify(contador)}`);

  // --------------------------------------------- 4. el link lleva a la ficha
  await page.getByText(nombre, { exact: false }).first().click();
  await page.waitForURL(`**/herramientas/${herramientaId}`, { timeout: 30_000 });
  ok("el link lleva a la ficha de esa herramienta");

  await page.waitForTimeout(5000);
  const botonConfirmar = page.getByRole("button", { name: /confirmar/i }).first();
  comprobar("la ficha tiene el boton de confirmar", await botonConfirmar.isVisible().catch(() => false));

  // ------------------------------------------- 5. confirmar y volver a mirar
  await botonConfirmar.click();
  await page.waitForTimeout(6000);
  const fichaDespues = await page.locator("body").innerText();

  // La vista por defecto del historial es el MAPA, y ahi la marca de recepcion
  // se dibuja solo mientras esta pendiente: una vez confirmada desaparece, que
  // es lo que corresponde. Asi que lo que se comprueba aca es que el aviso se
  // haya ido, no que aparezca un cartel nuevo.
  comprobar("ya no avisa que falta confirmar", !/Falta confirmar que llegó/.test(fichaDespues), fichaDespues.slice(0, 300));
  comprobar("ni el encabezado dice que hay algo sin confirmar", !/sin confirmar/.test(fichaDespues));

  // Quien SI deja constancia es la vista Lista: ahi queda "Recibida por X".
  await page.getByRole("button", { name: "Lista" }).first().click();
  await page.waitForTimeout(1500);
  const enLista = await page.locator("body").innerText();
  comprobar("la lista deja constancia de quien recibio", /Recibida por Mateo Demo/.test(enLista), enLista.slice(0, 300));

  await mon(
    `query($i:[ID!]){ items(ids:$i){ column_values(ids:["color_mm7y936c"]){ text } } }`,
    { i: [String(jsonSalida.movimientoId)] },
  ).then((d) =>
    comprobar("y en monday quedo Confirmada", d.items[0].column_values[0].text === "Confirmada", d.items[0].column_values[0].text),
  );

  await new Promise((r) => setTimeout(r, 8000));
  await page.goto(`${BASE}/mis-pendientes`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(4000);

  const textoDespues = await page.locator("body").innerText();
  comprobar(
    "LA FILA YA NO ESTA EN LA BANDEJA",
    !textoDespues.includes(nombre),
    textoDespues.split("\n").filter(Boolean).slice(0, 12).join(" | "),
  );
  // No se comprueba "estas al dia": la bandeja puede tener OTROS pendientes
  // -arriendos, contratos- que no tienen nada que ver con esta prueba.
  comprobar(
    "ya no queda nada que confirmar de esta herramienta",
    !textoDespues.includes("Confirmar que llegó") || !textoDespues.includes("ZZ-CONF"),
  );
} catch (error) {
  falla("se corto la prueba", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  // Los movimientos que haya escrito la app por su cuenta (la salida) salen por
  // el id del maestro: si la prueba se corto antes de guardar el id, igual se
  // encuentran, y un ZZ TEST que queda vivo ensucia el tablero del cliente.
  try {
    const sobrantes = await mon(
      `query($b:ID!){ boards(ids:[$b]){ items_page(limit:200){ items{ id column_values(ids:["${IDMAESTRO_EN_MOVIMIENTO}"]){ text } } } } }`,
      { b: MOVIMIENTOS },
    );
    const delMaestro = new Set(aBorrar.filter(([b]) => b === MAESTRO).map(([, id]) => String(id)));
    for (const it of sobrantes.boards[0].items_page.items) {
      if (delMaestro.has(String(it.column_values[0]?.text ?? ""))) aBorrar.push([MOVIMIENTOS, it.id]);
    }
  } catch { /* si no se pudo listar, se borra lo que se anoto */ }

  const vistos = new Set();
  for (const [, id] of aBorrar) {
    if (vistos.has(String(id))) continue;
    vistos.add(String(id));
    await mon(`mutation($i:ID!){ delete_item(item_id:$i){ id } }`, { i: String(id) })
      .then(() => console.log(`  borrado ${id}`))
      .catch((e) => console.log(`  NO SE PUDO BORRAR ${id}: ${e.message}`));
  }
  cerrar();
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
