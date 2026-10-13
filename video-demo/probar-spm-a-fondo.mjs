/**
 * Las cinco pantallas de SPM, a fondo, como las usaria una persona.
 *
 *   npm run probar-spm-a-fondo
 *
 * ES SOLO LECTURA, Y NO ES UNA PROMESA: hay un alambre de pua. Cualquier pedido
 * que escriba -crear una solicitud, mandar a cotizar, cambiar el estado de una
 * cotizacion- se CORTA antes de salir y hace fallar la prueba. Eso cubre lo
 * unico que de verdad hay que cuidar aca: "Mandar a cotizar" despierta a Make y
 * salen correos de verdad desde heather@vergaradelvalle.com a proveedores de
 * VDV. Ya paso una vez.
 *
 * Por eso ningun paso de abajo aprieta ese boton ni toca el selector de estado
 * de una cotizacion: se comprueba que esten y como se ven, no que funcionen.
 * Probar que funcionan es otra corrida, con permiso.
 *
 * Levanta la app CON LA BASE DE VERDAD a proposito: desde que la cuenta tiene
 * asignada la app, los permisos salen de Neon y no de la galleta, que es el
 * camino que recorre un usuario real.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { levantarApp, cookieSesion, CUENTA_TAP } from "./comun.mjs";

const PUERTO = 3098;
const BASE = `http://localhost:${PUERTO}`;

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

let bien = 0;
let mal = 0;
const ok = (n) => { bien += 1; console.log(`  ok    ${n}`); };
const falla = (n, d) => { mal += 1; console.log(`  FALLA ${n}${d ? `\n        ${String(d).slice(0, 700)}` : ""}`); };
const comprobar = (n, cond, d) => (cond ? ok(n) : falla(n, d));
const titulo = (n) => console.log(`\n${n}\n`);

try {
  const s = execSync(`netstat -ano | findstr LISTENING | findstr :${PUERTO}`, {
    encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
  });
  const pids = s.trim().split(String.fromCharCode(10)).map((l) => l.trim().split(" ").filter(Boolean).pop());
  for (const pid of new Set(pids)) {
    if (pid && pid !== "0") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  }
  await new Promise((r) => setTimeout(r, 2000));
} catch { /* nadie escuchando */ }

const { cerrar } = await levantarApp({ puerto: PUERTO, conBaseReal: true });

let browser;
const escriturasBloqueadas = [];

try {
  if ((await fetch(`${BASE}/api/version`).then((r) => r.status).catch(() => 0)) !== 200) {
    throw new Error(`la app no contesta en ${BASE}`);
  }

  browser = await chromium.launch({ channel: "chrome" });

  /**
   * El alambre de pua. Va en el CONTEXTO, asi que cubre cualquier pestaña que
   * se abra despues, y corta por metodo y por ruta en vez de por una lista de
   * endpoints: una ruta nueva que escriba queda cubierta sola.
   */
  const ponerAlambre = async (ctx) => {
    await ctx.route("**/api/**", async (ruta) => {
      const pedido = ruta.request();
      const metodo = pedido.method();
      const url = pedido.url();
      const cuerpo = pedido.postData() ?? "";

      const esEscrituraSpm = metodo !== "GET" && /\/api\/spm\//.test(url);
      const esMutacionTablero = /"op"\s*:\s*"item(Create|Update|Delete)"/.test(cuerpo);
      const esGraphQlDeEscritura = /\/api\/monday\/graphql/.test(url) && /mutation/i.test(cuerpo);

      if (esEscrituraSpm || esMutacionTablero || esGraphQlDeEscritura) {
        escriturasBloqueadas.push(`${metodo} ${url.replace(BASE, "")} ${cuerpo.slice(0, 120)}`);
        return ruta.abort();
      }
      return ruta.continue();
    });
  };

  const nuevoContexto = async (asignaciones, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-CL", ...extra });
    await ctx.addCookies([cookieSesion(asignaciones, CUENTA_TAP)]);
    await ponerAlambre(ctx);
    return ctx;
  };

  // ===================================================== 0. quien NO puede entrar
  titulo("0. LA PUERTA: una cuenta sin la app");

  /**
   * Con la base conectada los permisos salen de Neon, asi que una galleta sin
   * la app igual entra: lo que corta es la fila del usuario. Para probar la
   * puerta de verdad hace falta una cuenta que NO la tenga, y hay una a mano:
   * cualquier subcontratista del Portal. Se usa un uid que existe en la base.
   */
  const SUBCONTRATISTA = { uid: 48, email: "pablovergarad@gmail.com", nombre: "Subcontratista" };
  const ctxAjeno = await browser.newContext({ viewport: { width: 1200, height: 800 }, locale: "es-CL" });
  await ctxAjeno.addCookies([cookieSesion([{ app: "portal-proveedor", appRol: "subcontratista" }], SUBCONTRATISTA)]);
  await ponerAlambre(ctxAjeno);
  const ajena = await ctxAjeno.newPage();

  /**
   * Las cinco pantallas MAS una ficha. La ficha entra porque tenia el mismo
   * error que Cotizaciones -preguntaba si estaba cargando antes de preguntar si
   * habia acceso, y dejaba una ruedita girando para siempre-, y sin probarla
   * eso vuelve sin que nadie se entere. El id no importa: el corte es antes.
   */
  for (const ruta of ["/spm", "/spm/comparativos", "/spm/cotizaciones", "/spm/materiales", "/spm/proveedores", "/spm/1"]) {
    await ajena.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 60_000 });
    // Se espera a que la pantalla DECIDA. Con un timeout fijo, una pantalla
    // todavia cargando se ve igual que una bloqueada, y eso es exactamente lo
    // que no se puede confundir en una prueba de permisos.
    await ajena
      .getByText(/no tiene asignada la app|No se pudieron? leer|no tiene acceso|SPM-\d{3}/i)
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => {});
    const t = await ajena.locator("body").innerText();
    comprobar(
      `${ruta}: un subcontratista no ve datos`,
      /no tiene asignada la app|No se pudieron leer|no tiene acceso/i.test(t) && !/SPM-\d{3}/.test(t),
      t.slice(0, 300),
    );
  }
  comprobar(
    "y el cartel le dice exactamente qué pedir",
    /Solicitudes de Material/.test(await ajena.locator("body").innerText()),
  );
  await ctxAjeno.close();

  // ============================================================== la sesión buena
  const ctx = await nuevoContexto([{ app: "spm", appRol: "usuario" }]);
  const page = await ctx.newPage();

  const erroresJs = [];
  page.on("pageerror", (e) => erroresJs.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const texto = m.text();
    // Los 404 de favicon y los avisos de React en modo produccion no cuentan.
    if (/favicon|Download the React DevTools/i.test(texto)) return;
    erroresJs.push(texto);
  });

  const texto = () => page.locator("body").innerText();
  const esperar = (patron, ms = 90_000) => page.getByText(patron).first().waitFor({ timeout: ms });

  // Un material de verdad, sacado del tablero en esta misma corrida, para probar
  // el buscador del alta sin depender de que exista un nombre fijo.
  const unMaterialAlta = (
    await mon(
      `query($b:[ID!]){ boards(ids:$b){ items_page(limit:1){ items{ name column_values(ids:["pulse_id_mm1h3kva"]){ text } } } } }`,
      { b: [deEnv("MONDAY_BOARD_BASE_DE_DATOS_MATERIALES")] },
    )
  ).boards[0].items_page.items[0];
  const codigoAlta = unMaterialAlta.column_values[0]?.text ?? "";

  // =========================================================== 1. EL LISTADO
  titulo("1. LISTADO DE SOLICITUDES");

  await page.goto(`${BASE}/spm`, { waitUntil: "networkidle", timeout: 120_000 });
  await esperar(/SPM-\d{3}|Todav[ií]a no hay solicitudes/);
  let t = await texto();

  comprobar("carga con su título y su explicación", /Solicitudes de Material/.test(t) && /Pedir cotizaci[oó]n/.test(t));
  comprobar("muestra las 6 columnas", /l[ií]neas/i.test(t) && /qui[eé]n la pidi[oó]/i.test(t) && /proveedores/i.test(t) && /cotiz/i.test(t) && /estado/i.test(t));
  comprobar("y el contador de cuántas hay", /\d+ solicitud(es)?/.test(t), t.slice(0, 400));

  const filas = await page.locator("a[data-solicitud]").all();
  comprobar(`lista las solicitudes (${filas.length})`, filas.length > 0);

  // El orden: lo último arriba.
  const numeros = (t.match(/SPM-\d{3}/g) ?? []);
  comprobar(
    "las más nuevas van arriba",
    numeros.length < 2 || numeros[0] >= numeros[1],
    `orden en pantalla: ${numeros.join(" ")}`,
  );

  // --- los cinco campos por los que se busca
  const casos = [
    ["por número", "SPM-001", /SPM-001/],
    ["por obra", "ZZ", /SPM-\d{3}/],
    ["por quién la pidió", "pablo", /SPM-\d{3}/],
    ["por proveedor", "test", /SPM-\d{3}/],
  ];
  for (const [nombre, termino, esperado] of casos) {
    await page.getByLabel("Buscar solicitudes").fill(termino);
    await page.waitForTimeout(500);
    const r = await texto();
    comprobar(`buscar ${nombre} ("${termino}") encuentra algo`, esperado.test(r), r.slice(0, 400));
  }

  // --- lo que NO existe tiene que dar un vacío que se entienda
  await page.getByLabel("Buscar solicitudes").fill("zzzz-no-existe-nada");
  await page.waitForTimeout(500);
  t = await texto();
  comprobar("buscar algo inexistente avisa y dice cuántas hay en total", /Ninguna solicitud coincide/.test(t) && /Hay \d+ en total/.test(t), t.slice(-400));

  // --- limpiar la búsqueda
  await page.getByLabel("Limpiar la búsqueda").click();
  await page.waitForTimeout(400);
  comprobar("la cruz limpia la búsqueda y vuelven todas", /SPM-\d{3}/.test(await texto()));

  // --- el filtro por obra sale de las solicitudes, no del dropdown entero
  const opcionesObra = await page.locator("select[aria-label='Filtrar por obra'] option").allInnerTexts();
  comprobar(
    `el filtro de obra ofrece solo las que tienen solicitudes (${opcionesObra.length - 1})`,
    opcionesObra.length > 1 && opcionesObra.length < 30,
    `ofrece ${opcionesObra.length - 1}; el dropdown de monday tiene 34`,
  );
  await page.locator("select[aria-label='Filtrar por obra']").selectOption(opcionesObra[1]);
  await page.waitForTimeout(500);
  t = await texto();
  comprobar(`filtrar por la obra "${opcionesObra[1]}" recorta la lista`, /\d+ de \d+/.test(t), t.slice(0, 400));
  await page.locator("select[aria-label='Filtrar por obra']").selectOption("");

  /*
    Los dos filtros que faltaban contra la app del cliente. Se comprueban igual
    que el de obra: que ofrezcan SOLO lo que aparece en las solicitudes -no los
    142 centros de costo del dropdown de monday- y que al elegir uno la lista se
    recorte de verdad.
  */
  for (const [etiqueta, tope] of [
    ["Filtrar por centro de costo", 50],
    ["Filtrar por proveedor", 50],
  ]) {
    const sel = page.locator(`select[aria-label='${etiqueta}']`);
    const opciones = await sel.locator("option").allInnerTexts();
    comprobar(
      `"${etiqueta}" ofrece solo lo que hay en las solicitudes (${opciones.length - 1})`,
      opciones.length > 1 && opciones.length < tope,
      `ofrece ${opciones.length - 1}: ${opciones.slice(1, 4).join(" / ")}`,
    );
    await sel.selectOption(opciones[1]);
    await page.waitForTimeout(500);
    const r = await texto();
    comprobar(
      `y al elegir "${opciones[1].slice(0, 24)}" recorta la lista`,
      /\d+ de \d+/.test(r) || /Ninguna solicitud coincide/.test(r),
      r.slice(0, 400),
    );
    await sel.selectOption("");
    await page.waitForTimeout(400);
  }

  // --- el filtro por estado
  await page.locator("select[aria-label='Filtrar por estado']").selectOption("Descartado");
  await page.waitForTimeout(500);
  comprobar("un estado sin solicitudes muestra el vacío, no una lista rota", /Ninguna solicitud coincide/.test(await texto()));
  await page.locator("select[aria-label='Filtrar por estado']").selectOption("");
  await page.waitForTimeout(400);

  // --- el aviso de sin respuesta solo aparece si hay alguna
  const botonSinRespuesta = page.getByRole("button", { name: /Sin respuesta \(\d+\)/ });
  if (await botonSinRespuesta.count()) {
    await botonSinRespuesta.click();
    await page.waitForTimeout(500);
    comprobar("el filtro 'Sin respuesta' deja solo las que nadie contestó", /Sin respuesta/.test(await texto()));
    await botonSinRespuesta.click();
    await page.waitForTimeout(300);
  } else {
    ok("no hay solicitudes sin respuesta, y por eso el filtro no se ofrece");
  }

  // =============================================================== 2. LA FICHA
  titulo("2. LA FICHA DE UNA SOLICITUD");

  await page.locator("a[data-solicitud]").first().click();
  await page.waitForURL(/\/spm\/\d+$/, { timeout: 30_000 });
  await esperar(/Materiales pedidos/);
  t = await texto();
  const urlFicha = page.url();

  comprobar("muestra el número de la solicitud", /SPM-\d{3}|Sin n[uú]mero/.test(t));
  comprobar("dice quién la pidió", /la pidi[oó]/i.test(t), t.slice(0, 500));
  comprobar("tiene la sección de materiales con su cuenta", /Materiales pedidos\s*\n?\s*\d+/.test(t), t.slice(0, 600));
  comprobar("la de destinatarios", /A qui[eé]n se le pide/.test(t));
  comprobar("y la de respuestas, con cuántas de cuántas", /Lo que contestaron\s*\n?\s*\d+ de \d+/.test(t), t.slice(0, 900));

  // Las líneas de material, con sus columnas separadas
  const columnasLinea = await page.locator("table thead th").allInnerTexts();
  comprobar(
    "las líneas tienen material, cantidad y unidad en columnas",
    columnasLinea.join("|").includes("Material") && columnasLinea.join("|").includes("Cantidad"),
    columnasLinea.join(" / "),
  );
  comprobar("el nombre se ve limpio, sin el prefijo técnico [SC]", !/\[SC\]/.test(t), t.slice(0, 800));

  // EL BOTÓN SE MIRA, NO SE APRIETA.
  const mandar = page.getByRole("button", { name: /Mandar a cotizar|Reintentar el env[ií]o/ });
  if (await mandar.count()) {
    comprobar("el botón de mandar a cotizar está", await mandar.first().isVisible());
    comprobar("y avisa que no se puede deshacer", /No se puede deshacer/i.test(t), t.slice(-500));
    ok("NO se aprieta: eso manda correos de verdad");
  } else {
    comprobar(
      "si no se puede mandar, lo dice en palabras en vez de dejar un botón gris",
      /Ya se envi[oó]|est[aá] saliendo/i.test(t),
      t.slice(-500),
    );
  }

  /**
   * El comparativo, si lo tiene. Se busca el TITULO de la seccion y no la
   * palabra suelta: "Comparativos" ahora es tambien un item del menu lateral,
   * asi que un `/Comparativo/` sobre el texto de la pantalla da verdadero
   * siempre y la comprobacion no comprueba nada.
   */
  const tituloComparativo = page.getByRole("heading", { name: "Comparativo", exact: true });
  if (await tituloComparativo.count()) {
    comprobar("el comparativo muestra el recomendado", /Recomendado:/.test(t), t.slice(-700));
  } else {
    ok("esta solicitud todavía no tiene comparativo, y la ficha no lo inventa");
  }

  // Volver con el botón del navegador tiene que devolver el listado, no una página rota
  await page.goBack();
  await esperar(/SPM-\d{3}|Todav[ií]a no hay solicitudes/);
  comprobar("volver atrás devuelve el listado funcionando", /Solicitudes de Material/.test(await texto()));

  // Y entrar por la URL directa, como quien pega un link
  await page.goto(urlFicha, { waitUntil: "networkidle", timeout: 120_000 });
  await esperar(/Materiales pedidos/);
  ok("entrar por el link directo a una ficha también funciona");

  // ================================================ 2b. EL ALTA, SIN GUARDAR
  titulo("2b. EL FORMULARIO DE ALTA (sin guardar nada)");

  /**
   * Se abre el alta y se BUSCA, nada mas. No se guarda: crear una solicitud
   * quema un numero de folio en Neon que no vuelve, aunque despues se borre el
   * item de monday.
   *
   * Lo que se prueba es el buscador de materiales, que hasta hoy consultaba a
   * monday filtrando por NOMBRE. El codigo interno (`VD-###`) es una columna de
   * tipo "item ID" y monday NO acepta `contains_text` sobre ese tipo -devuelve
   * `no_operator_config`, probado contra la cuenta real-, asi que buscar por
   * codigo por el servidor es imposible. Ahora el catalogo se trae entero una
   * vez y se busca en memoria.
   */
  await page.goto(`${BASE}/spm/nueva`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await esperar(/Nueva solicitud de material/);
  await page.getByLabel("Buscar un material del catálogo").waitFor({ timeout: 60_000 });

  /**
   * LO PRIMERO: QUE EL BUSCADOR SIRVA ENSEGUIDA.
   *
   * Traer el catalogo entero tarda ~13 s medidos. Cuando la busqueda dependia
   * SOLO de eso, el campo quedaba muerto casi 8 segundos y en pantalla decia
   * "0 materiales hasta ahora". El que entra a cargar una solicitud escribe
   * antes de eso, asi que mientras el catalogo viaja se busca contra monday por
   * nombre, como siempre.
   *
   * Se comprueba SIN esperar a que termine la carga, a proposito.
   */
  /*
    Para que la prueba no sea una carrera contra el reloj -que pasa o falla
    segun lo rapido que ande monday ese dia-, se FRENA el catalogo a proposito:
    se demoran 25 segundos las paginas de 500, que son las de la carga completa,
    y se dejan pasar las consultas de 15, que son las del buscador. Si el
    buscador sigue encontrando, es porque de verdad no depende del catalogo.
  */
  await page.route("**/api/monday/board", async (ruta) => {
    const cuerpo = ruta.request().postData() ?? "";
    const esElCatalogo = /BaseDeDatosMateriales/.test(cuerpo) && /"limit"\s*:\s*500/.test(cuerpo);
    if (esElCatalogo) await new Promise((r) => setTimeout(r, 25_000));
    // Para cuando la demora termina, la pantalla ya se recargo y ese pedido no
    // existe mas. Dejarlo sin atrapar tumba el proceso entero con "Route is
    // already handled" y se pierde el resto de la prueba.
    try {
      await ruta.continue();
    } catch {
      /* el pedido ya no existe */
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByLabel("Buscar un material del catálogo").waitFor({ timeout: 60_000 });

  const buscadorTemprano = page.getByLabel("Buscar un material del catálogo");
  await buscadorTemprano.fill(unMaterialAlta.name.split(" ")[0]);
  const escapado = unMaterialAlta.name.slice(0, 10).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const aparecioTemprano = await page
    .getByRole("button", { name: new RegExp(escapado, "i") })
    .first()
    // 20 s, no 10: la busqueda por nombre va contra monday por el proxy y el
    // tiempo de ida y vuelta no lo maneja la app. Con 10 s la prueba fallaba de
    // a ratos y eso no decia nada sobre el codigo. Lo que la hace valer sigue
    // siendo que el catalogo esta frenado 25 s: si el buscador dependiera de el,
    // no encontraria nada ni en 20 ni en 24.
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  comprobar(
    "el buscador encuentra con el catálogo frenado 25 s: no depende de él",
    aparecioTemprano,
    "con el catálogo frenado no encontró nada: el campo vuelve a quedar muerto mientras carga",
  );
  await buscadorTemprano.fill("");
  await page.unroute("**/api/monday/board");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByLabel("Buscar un material del catálogo").waitFor({ timeout: 60_000 });

  // Esperar a que el catalogo termine de llegar: hasta entonces el buscador lo dice.
  await page
    .getByText(/Buscar en [\d.]+ materiales por nombre, código VD-### o categoría/)
    .first()
    .waitFor({ timeout: 90_000 })
    .catch(() => {});
  t = await texto();

  comprobar("el alta carga", /Nueva solicitud de material/.test(t), t.slice(0, 300));
  comprobar(
    "el buscador dice por dónde busca de verdad, con el total del catálogo",
    /Buscar en [\d.]+ materiales por nombre, código VD-### o categoría/.test(
      (await page.getByLabel("Buscar un material del catálogo").getAttribute("placeholder")) ?? "",
    ),
    await page.getByLabel("Buscar un material del catálogo").getAttribute("placeholder"),
  );

  const buscadorMat = page.getByLabel("Buscar un material del catálogo");

  // Por NOMBRE, que es lo que ya funcionaba.
  await buscadorMat.fill(unMaterialAlta.name.split(" ")[0]);
  await page.waitForTimeout(600);
  comprobar(
    `buscar por nombre encuentra "${unMaterialAlta.name.slice(0, 26)}"`,
    (await texto()).includes(unMaterialAlta.name),
    (await texto()).slice(0, 500),
  );

  // Por CODIGO, que es lo que no se podia.
  await buscadorMat.fill(codigoAlta);
  await page.waitForTimeout(600);
  t = await texto();
  comprobar(
    `BUSCAR POR CÓDIGO (${codigoAlta}) encuentra "${unMaterialAlta.name.slice(0, 26)}"`,
    t.includes(unMaterialAlta.name),
    `esto es lo que la app del cliente ofrece y no hace. Pantalla: ${t.slice(0, 500)}`,
  );
  comprobar("y el código se ve en el resultado", t.includes(codigoAlta), t.slice(0, 500));

  // Algo que no existe tiene que decirlo, no quedarse mudo.
  await buscadorMat.fill("zzzz-no-existe-ningun-material");
  await page.waitForTimeout(600);
  comprobar(
    "lo que no está en el catálogo lo dice y ofrece la salida",
    /No está en el catálogo/.test(await texto()),
    (await texto()).slice(0, 500),
  );
  await buscadorMat.fill("");

  comprobar(
    "el botón de guardar arranca apagado y dice qué falta",
    (await page.getByRole("button", { name: /Guardar borrador/i }).isDisabled()) &&
      /Falta:/.test(await texto()),
    (await texto()).slice(-400),
  );
  ok("NO se guarda: crear una solicitud quema un folio que no vuelve");

  // ============================== 2c. LA ESPERA DESPUES DE MANDAR (sin mandar)
  titulo("2c. LA ESPERA A MAKE (sin mandar nada de verdad)");

  /**
   * La app marca "Por enviar" y ahi termina su trabajo: los correos los manda
   * Make, que tarda ~8 segundos y recien despues escribe "Enviado". La ficha se
   * recargaba en el acto, leia la columna ANTES de ese cambio, y quedaba en
   * "Esta saliendo en este momento" PARA SIEMPRE. A la vista parece colgada, y
   * la reaccion natural es volver a apretar.
   *
   * COMO SE PRUEBA SIN MANDAR: se intercepta el pedido de envio y se contesta
   * que si, sin dejarlo llegar al servidor. La app cree que mando y arranca la
   * espera -que es lo que se quiere probar-, pero no sale ni un correo ni se
   * toca una columna. Es la unica forma de probar esto sin despertar a Make.
   */
  let seIntentoEnviarDeVerdad = false;
  await page.route("**/api/spm/enviar", async (ruta) => {
    seIntentoEnviarDeVerdad = true;
    await ruta.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, numero: "SPM-TEST" }),
    });
  });

  // Una en Borrador, que es la unica donde el boton aparece.
  const enBorrador = (await mon(
    `query($b:[ID!]){ boards(ids:$b){ items_page(limit:50){ items{ id column_values(ids:["color_mm7fnd78"]){ text } } } } }`,
    { b: ["18407094103"] },
  )).boards[0].items_page.items.find((i) => i.column_values[0]?.text === "Borrador");

  if (!enBorrador) {
    ok("no hay ninguna solicitud en Borrador, así que no se puede probar la espera");
  } else {
    await page.goto(`${BASE}/spm/${enBorrador.id}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByText(/Materiales pedidos/).first().waitFor({ timeout: 60_000 });

    const botonMandar = page.getByRole("button", { name: /Mandar a cotizar/i });
    comprobar("el botón está", await botonMandar.isVisible());
    await botonMandar.click();

    const avisoEspera = page.getByText(/Esto se actualiza solo/);
    comprobar(
      "al mandar, la pantalla avisa que está esperando y que se actualiza sola",
      await avisoEspera.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false),
      (await texto()).slice(-500),
    );

    /*
      Y que la espera TERMINE. Esta solicitud sigue en "Borrador" -no se mando
      nada de verdad-, asi que en la primera vuelta la app ve un estado que no
      es "Por enviar" y tiene que cortar. Si el aviso quedara para siempre, el
      arreglo seria solo un cartel nuevo.
    */
    comprobar(
      "y la espera corta sola cuando el estado deja de ser 'Por enviar'",
      await avisoEspera.waitFor({ state: "hidden", timeout: 40_000 }).then(() => true).catch(() => false),
      "el aviso no se fue en 40 s: el reloj queda corriendo para siempre",
    );

    comprobar("el pedido de envío se interceptó: no salió ningún correo", seIntentoEnviarDeVerdad);
  }
  await page.unroute("**/api/spm/enviar");

  // ========================================================= 3. COTIZACIONES
  titulo("3. COTIZACIONES RECIBIDAS");

  await page.goto(`${BASE}/spm/cotizaciones`, { waitUntil: "networkidle", timeout: 120_000 });
  await esperar(/Cotizaciones recibidas/);
  await page.waitForTimeout(2500);
  t = await texto();

  comprobar("carga", /Cotizaciones recibidas/.test(t));
  comprobar(
    "agrupa por solicitud, o dice que no hay ninguna",
    /SPM-\d{3}/.test(t) || /no hay|ninguna/i.test(t),
    t.slice(0, 500),
  );
  if (/Sin solicitud vinculada/.test(t)) {
    comprobar(
      "las que quedaron sin solicitud se marcan y se explica por qué",
      /no se pueden comparar|qued[oó]|sin solicitud/i.test(t),
      t.slice(0, 700),
    );
  }

  comprobar("muestra la fecha de cada cotización", /\d{2}-\d{2}-\d{4}|sin fecha/.test(t), t.slice(0, 700));

  /*
    El dato que la pantalla del cliente pone y la nuestra no tenía: cuál es la
    más barata del grupo. Solo aparece cuando hay DOS o más ofertas en carrera,
    así que si en el tablero de hoy hay un grupo con una sola, no tiene que
    salir nada -y eso tambien se comprueba-.
  */
  /*
    El plural bien escrito. "cotizaciónes" fue un error de verdad que estuvo en
    pantalla: el plural de "cotización" pierde la tilde. Se comprueba porque es
    invisible para el build y para el lint, y lo ve el cliente.
  */
  comprobar("el plural está bien escrito", !/cotizaci[óo]nes\b/.test(t) || /cotizaciones/.test(t), t.slice(0, 600));
  comprobar("no dice 'cotizaciónes'", !/cotizaciónes/.test(t), t.slice(0, 600));

  const gruposConVarias = /\d+ cotizaciones/.test(t);
  if (gruposConVarias) {
    comprobar("marca cuál es la más barata del grupo", /menor \$/.test(t), t.slice(0, 900));
    /*
      Que el encabezado y la fila digan LO MISMO sobre si se puede comparar.
      Si el encabezado avisa "no cotizaron lo mismo", la fila no puede marcar
      "la más barata" a secas: es justo el número que no hay que creerse.
    */
    const avisaDesparejo = /no cotizaron lo mismo/.test(t);
    comprobar(
      "el encabezado y la fila coinciden en si el menor se puede comparar",
      avisaDesparejo === /la más barata, pero ojo/.test(t),
      t.slice(0, 900),
    );
  } else {
    ok("ningún grupo tiene dos ofertas, así que no se marca ninguna 'más barata'");
  }

  comprobar(
    "el nombre de la solicitud se ve como un link para abrirla",
    await page.getByRole("link", { name: /Abrir la solicitud/ }).first().isVisible().catch(() => false),
    "no hay ningun link con el texto accesible 'Abrir la solicitud'",
  );

  // Los dos filtros nuevos, con el mismo criterio que en el listado: que
  // ofrezcan solo lo que hay, y que al elegir uno la lista se recorte.
  for (const etiqueta of ["Filtrar por proveedor", "Filtrar por obra"]) {
    const sel = page.locator(`select[aria-label='${etiqueta}']`);
    comprobar(`existe "${etiqueta}"`, (await sel.count()) === 1);
    const opciones = await sel.locator("option").allInnerTexts();
    comprobar(
      `"${etiqueta}" ofrece solo lo que cotizó (${opciones.length - 1})`,
      opciones.length > 1,
      opciones.join(" / "),
    );
    await sel.selectOption(opciones[1]);
    await page.waitForTimeout(600);
    const r = await texto();
    comprobar(
      `y al elegir "${opciones[1].slice(0, 26)}" la lista cambia`,
      /cotizaci(ó|o)n/i.test(r),
      r.slice(0, 400),
    );
    await sel.selectOption("");
    await page.waitForTimeout(400);
  }

  // El selector de estado existe pero NO se toca: cambiarlo escribe en monday.
  const selectoresEstado = await page.locator("select[aria-label^='Estado de la cotización']").count();
  if (selectoresEstado > 0) {
    ok(`cada cotización tiene su selector de estado (${selectoresEstado}) — no se tocan, escriben en monday`);
  }

  // =========================================================== 4. COMPARATIVOS
  titulo("4. COMPARATIVOS");

  await page.goto(`${BASE}/spm/comparativos`, { waitUntil: "networkidle", timeout: 120_000 });
  await esperar(/SPM-\d{3}|nada para comparar|Ning[uú]n comparativo/);
  t = await texto();

  comprobar("carga", /Comparativos/.test(t));
  if (/SPM-\d{3}/.test(t)) {
    comprobar("la tarjeta dice cuántos materiales y cuántos contestaron", /\d+ materiales? · contest/.test(t), t.slice(0, 700));
    comprobar("y tiene el botón para ir al cuadro", await page.getByRole("link", { name: /Ver cuadro comparativo/i }).first().isVisible());
    await page.getByLabel("Buscar comparativos").fill("zzzz-no-existe");
    await page.waitForTimeout(500);
    comprobar("buscar algo inexistente da un vacío claro", /Ning[uú]n comparativo coincide/.test(await texto()));
    await page.getByLabel("Limpiar la búsqueda").click();
    await page.waitForTimeout(400);
  } else {
    comprobar("si no hay nada, explica por qué y no deja la pantalla en blanco", /nada para comparar/i.test(t), t.slice(0, 500));
  }

  // ====================================================== 5. BASE DE MATERIALES
  titulo("5. BASE DE MATERIALES");

  const totalMateriales = (
    await mon(`query($b:[ID!]){ boards(ids:$b){ items_count } }`, { b: [deEnv("MONDAY_BOARD_BASE_DE_DATOS_MATERIALES")] })
  ).boards[0].items_count;

  await page.goto(`${BASE}/spm/materiales`, { waitUntil: "networkidle", timeout: 120_000 });
  // Mientras trae las páginas tiene que decir que no terminó.
  const parcial = await page.getByText(/hasta ahora/).count().catch(() => 0);
  await esperar(new RegExp(`${totalMateriales.toLocaleString("es-CL")} materiales`));
  t = await texto();

  ok(`muestra el total real del catálogo: ${totalMateriales.toLocaleString("es-CL")}`);
  comprobar("mientras carga avisa que todavía no está completo", parcial >= 0);
  comprobar("ya terminado, no dice 'hasta ahora'", !/hasta ahora/.test(t));
  comprobar("avisa cuántos no tienen unidad, con su porcentaje", /\d+ sin unidad \(\d+%\)/.test(t), t.slice(0, 500));
  comprobar("y marca las filas vacías que dejó monday", /fila(s)? vac[ií]a/.test(t), t.slice(0, 500));

  // Las cuatro formas de buscar, con un material sacado del tablero ahora.
  const unMaterial = (
    await mon(
      `query($b:[ID!]){ boards(ids:$b){ items_page(limit:1){ items{ name column_values(ids:["pulse_id_mm1h3kva","dropdown_mm1hymez"]){ id text } } } } }`,
      { b: [deEnv("MONDAY_BOARD_BASE_DE_DATOS_MATERIALES")] },
    )
  ).boards[0].items_page.items[0];
  const codigo = unMaterial.column_values.find((c) => c.id === "pulse_id_mm1h3kva")?.text ?? "";

  for (const [comoBusca, termino] of [["por nombre", unMaterial.name.split(" ")[0]], ["por código", codigo]]) {
    await page.getByLabel("Buscar materiales").fill(termino);
    await page.waitForTimeout(600);
    comprobar(`buscar ${comoBusca} ("${termino}") encuentra ${unMaterial.name.slice(0, 28)}`, (await texto()).includes(unMaterial.name), (await texto()).slice(0, 500));
  }

  // Sin tildes y en minúscula, que es como escribe la gente.
  await page.getByLabel("Buscar materiales").fill(unMaterial.name.split(" ")[0].toLowerCase());
  await page.waitForTimeout(600);
  comprobar("buscar en minúscula encuentra lo mismo, aunque el catálogo esté en mayúsculas", (await texto()).includes(unMaterial.name));

  await page.getByLabel("Buscar materiales").fill("zzzz-no-existe");
  await page.waitForTimeout(600);
  comprobar("un material inexistente da un vacío que dice cuántos hay", /Ning[uú]n material coincide/.test(await texto()) && /\d+ en el cat[aá]logo/.test(await texto()));
  await page.getByLabel("Limpiar la búsqueda").click();
  await page.waitForTimeout(400);

  // El filtro de categoría
  const categorias = await page.locator("select[aria-label='Filtrar por categoría']").first().locator("option").allInnerTexts();
  comprobar(`el filtro ofrece las categorías cargadas (${categorias.length - 1})`, categorias.length > 2, categorias.slice(0, 5).join(" / "));
  await page.locator("select[aria-label='Filtrar por categoría']").first().selectOption(categorias[1]);
  await page.waitForTimeout(600);
  comprobar(`filtrar por "${categorias[1]}" recorta y lo dice`, /\d+ de [\d.]+ materiales/.test(await texto()), (await texto()).slice(0, 400));
  await page.locator("select[aria-label='Filtrar por categoría']").first().selectOption("");
  await page.waitForTimeout(400);

  // El filtro que justifica la pantalla
  await page.getByRole("button", { name: /^Sin unidad$/ }).click();
  await page.waitForTimeout(700);
  t = await texto();
  const cuantosSinUnidad = Number(((t.match(/([\d.]+) sin unidad/) ?? [])[1] ?? "0").replace(/\./g, ""));
  const visiblesFiltrado = Number((t.match(/([\d.]+) de [\d.]+ materiales/) ?? [])[1]?.replace(/\./g, "") ?? 0);
  comprobar(
    `el filtro 'Sin unidad' deja exactamente los ${cuantosSinUnidad} que no la tienen`,
    visiblesFiltrado === cuantosSinUnidad,
    `el aviso dice ${cuantosSinUnidad} y el filtro muestra ${visiblesFiltrado}`,
  );
  /*
    El tope de filas DIBUJADAS, y el boton para subirlo.
    Lo que hay que cuidar es que el boton suba lo dibujado SIN tocar los numeros
    de arriba: esos son del catalogo entero y no pueden moverse. Es justo lo que
    diferencia esto del "Cargar más" de la app del cliente, donde cada clic
    cambia los contadores porque recien ahi llegan los datos.
  */
  // Se sigue con el filtro "Sin unidad" PRENDIDO del paso anterior: son 213
  // materiales, que es mas que el tope de 150, asi que el boton tiene que estar.
  comprobar("el tope de filas dibujadas se declara en vez de disimularse", /Se ven \d+ de [\d.]+ materiales que coinciden/.test(t), t.slice(-500));

  const contarFilas = () => page.locator("table tbody tr").count();
  const antes = await contarFilas();
  const resumenAntes = (t.match(/[\d.]+ sin unidad \(\d+%\)/) ?? [])[0];

  await page.getByRole("button", { name: /Mostrar \d+ más/ }).click();
  await page.waitForTimeout(700);
  const despues = await contarFilas();
  t = await texto();

  comprobar(`"Mostrar más" dibuja más filas (${antes} -> ${despues})`, despues > antes, `${antes} -> ${despues}`);
  comprobar(
    "y los números de arriba NO se mueven: son del catálogo entero",
    (t.match(/[\d.]+ sin unidad \(\d+%\)/) ?? [])[0] === resumenAntes,
    `antes "${resumenAntes}", después "${(t.match(/[\d.]+ sin unidad \(\d+%\)/) ?? [])[0]}"`,
  );

  // Y al cambiar el filtro el tope vuelve a empezar: si no, una busqueda de 4
  // resultados se queda con 600 filas dibujadas de la vez anterior.
  await page.getByLabel("Buscar materiales").fill("ABRAZADERA");
  await page.waitForTimeout(700);
  comprobar(
    "al cambiar el filtro el tope vuelve a empezar",
    !/Se ven \d+ de/.test(await texto()) || (await contarFilas()) <= 150,
    `quedaron ${await contarFilas()} filas`,
  );
  await page.getByLabel("Limpiar la búsqueda").click();
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: /^Sin unidad$/ }).click();
  await page.waitForTimeout(400);

  // ======================================================== 6. LOS PROVEEDORES
  titulo("6. MAESTRO DE PROVEEDORES");

  const BOARD_PROV = deEnv("MONDAY_BOARD_PROVEEDORES");
  const totalProveedores = (await mon(`query($b:[ID!]){ boards(ids:$b){ items_count } }`, { b: [BOARD_PROV] })).boards[0].items_count;

  let proveedores = [];
  let cursor = null;
  for (;;) {
    const d = cursor
      ? await mon(`query($c:String!){ next_items_page(limit:500,cursor:$c){ cursor items{ name column_values(ids:["texto4__1"]){ text } } } }`, { c: cursor })
      : await mon(`query($b:[ID!]){ boards(ids:$b){ items_page(limit:500){ cursor items{ name column_values(ids:["texto4__1"]){ text } } } } }`, { b: [BOARD_PROV] });
    const pagina = cursor ? d.next_items_page : d.boards[0].items_page;
    proveedores = proveedores.concat(pagina.items);
    cursor = pagina.cursor;
    if (!cursor) break;
  }
  const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  const correoDe = (p) => String(p.column_values[0]?.text ?? "").trim();
  const sinCorreo = proveedores.filter((p) => !correoDe(p));
  const correoRoto = proveedores.filter((p) => {
    const c = correoDe(p);
    return c && !c.split(",").map((m) => m.trim()).every((m) => MAIL.test(m));
  });

  await page.goto(`${BASE}/spm/proveedores`, { waitUntil: "networkidle", timeout: 120_000 });
  await esperar(new RegExp(`${totalProveedores.toLocaleString("es-CL")} proveedores`));
  t = await texto();

  ok(`muestra el total real del maestro: ${totalProveedores}`);
  comprobar(
    `el aviso cuenta los ${sinCorreo.length} sin correo del tablero entero`,
    new RegExp(`${sinCorreo.length}\\s*proveedores sin correo`).test(t),
    t.slice(0, 600),
  );
  comprobar("y dice qué pasa si se los cita", /el env[ií]o sale sin error y no reciben nada/i.test(t), t.slice(0, 600));

  // Los cuatro filtros de correo, contados contra monday
  for (const [etiqueta, cuantos, marca] of [
    ["Sin correo", sinCorreo.length, /No tiene correo cargado/],
    ["Correo roto", correoRoto.length, /no es una direcci[oó]n de correo/i],
    ["Con correo", proveedores.length - sinCorreo.length - correoRoto.length, /@/],
  ]) {
    if (cuantos === 0) { ok(`no hay ninguno en "${etiqueta}", así que no hay nada que mostrar`); continue; }
    await page.getByRole("button", { name: new RegExp(`^${etiqueta}$`) }).click();
    await page.waitForTimeout(700);
    const r = await texto();
    const mostrados = Number((r.match(/([\d.]+) de [\d.]+ proveedores/) ?? [])[1]?.replace(/\./g, "") ?? 0);
    comprobar(`el filtro "${etiqueta}" muestra los ${cuantos} que corresponden`, mostrados === cuantos, `muestra ${mostrados}, deberían ser ${cuantos}`);
    comprobar(`y las filas de "${etiqueta}" se ven como corresponde`, marca.test(r), r.slice(0, 500));
  }
  if (correoRoto.length) {
    await page.getByRole("button", { name: /^Correo roto$/ }).click();
    await page.waitForTimeout(600);
    comprobar(`nombra al que tiene el correo roto (${correoRoto[0].name})`, (await texto()).includes(correoRoto[0].name));
  }
  await page.getByRole("button", { name: /^Todos$/ }).click();
  await page.waitForTimeout(500);

  await page.getByLabel("Buscar proveedores").fill(proveedores[5].name.split(" ")[0]);
  await page.waitForTimeout(700);
  comprobar(`buscar por razón social encuentra "${proveedores[5].name.slice(0, 25)}"`, (await texto()).includes(proveedores[5].name));
  await page.getByLabel("Limpiar la búsqueda").click();
  await page.waitForTimeout(400);

  // =================================================== 7. LO QUE CRUZA TODO
  titulo("7. LO QUE CRUZA TODAS LAS PANTALLAS");

  /**
   * QUE LA APP SE PUEDA ASIGNAR DESDE USUARIOS Y ROLES.
   *
   * No alcanza con que los roles existan en el codigo: si nadie puede dar de
   * alta a alguien en SPM, la app no sirve. Y el sintoma era dificil de leer -la
   * app andaba si se asignaba por base de datos, pero en la pantalla no aparecia
   * por ningun lado-, porque Usuarios y Roles solo dibuja las apps que el que
   * edita administra, y SPM no estaba en la lista de las que no tienen un rol
   * de administracion propio (como OC Tracker y Herramientas).
   *
   * Se le pregunta a la API, que es la que decide: el mapa `access` dice el
   * nivel por app, y "editor" es el que habilita asignar.
   */
  const permisos = await page.evaluate(async () => {
    const r = await fetch("/api/auth/whitelist", { credentials: "include" });
    return r.ok ? r.json() : null;
  });
  comprobar(
    "la app SPM se puede asignar desde Usuarios y Roles",
    permisos?.access?.spm === "editor",
    `el mapa de permisos dice: ${JSON.stringify(permisos?.access ?? null)}`,
  );

  comprobar(
    "ninguna pantalla tiró un error de javascript",
    erroresJs.length === 0,
    erroresJs.slice(0, 3).join(" | "),
  );

  // El foco con el teclado tiene que verse en algo, no quedar invisible.
  await page.goto(`${BASE}/spm`, { waitUntil: "networkidle", timeout: 120_000 });
  await esperar(/SPM-\d{3}|Todav[ií]a no hay solicitudes/);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const foco = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return { etiqueta: el.tagName, sombra: cs.boxShadow, borde: cs.outlineWidth };
  });
  comprobar(
    "navegando con Tab el foco se ve",
    foco && (foco.sombra !== "none" || foco.borde !== "0px"),
    JSON.stringify(foco),
  );

  // Y en celular, las cinco.
  const chico = await ctx.newPage();
  await chico.setViewportSize({ width: 390, height: 844 });
  for (const [ruta, marca] of [
    ["/spm", /Solicitudes de Material/],
    ["/spm/comparativos", /Comparativos/],
    ["/spm/cotizaciones", /Cotizaciones recibidas/],
    ["/spm/materiales", /Base de Materiales/],
    ["/spm/proveedores", /Maestro de Proveedores/],
  ]) {
    await chico.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120_000 });
    await chico.waitForTimeout(2500);
    const tc = await chico.locator("body").innerText();
    const ancho = await chico.evaluate(() => document.documentElement.scrollWidth);
    comprobar(`${ruta} en celular: carga y no se va para el costado (${ancho}px)`, marca.test(tc) && ancho <= 400, `ancho ${ancho}px, texto: ${tc.slice(0, 200)}`);
  }
  await chico.close();

  // ======================================================= 8. EL ALAMBRE DE PUA
  titulo("8. QUE NO SE HAYA ESCRITO NADA");

  comprobar(
    "no salió ni un solo pedido de escritura en toda la prueba",
    escriturasBloqueadas.length === 0,
    escriturasBloqueadas.join("\n        "),
  );
} catch (error) {
  falla("se cortó la prueba", error.message);
} finally {
  if (browser) await browser.close().catch(() => {});
  cerrar();
}

if (escriturasBloqueadas.length) {
  console.log(`\n  ATENCION: se bloquearon ${escriturasBloqueadas.length} escrituras:`);
  for (const e of escriturasBloqueadas) console.log(`    ${e}`);
}

console.log(`\n${mal === 0 ? "TODO PASA" : "HAY FALLAS"}: ${bien} ok, ${mal} fallas\n`);
process.exit(mal === 0 ? 0 : 1);
