/**
 * Lo compartido por los scripts del video: levantar la app, entrar con sesion
 * y frenar cualquier escritura.
 *
 * Como se levanta la app, y por que asi: con el build de produccion (`next
 * start`), la autenticacion PRENDIDA y un DATABASE_URL que no existe. Eso
 * ultimo no es un descuido -es lo que mantiene la grabacion a salvo-. El guard
 * lee la base para confirmar que el usuario sigue activo, pero si la base no
 * responde vuelve a la sesion del token (lib/server/auth-guard.js), asi que la
 * app funciona entera sin tocar la base de produccion, que es la que tiene los
 * usuarios reales de VDV. El token de monday si es el de verdad: las lecturas
 * tienen que traer el inventario real porque el video es para el cliente.
 *
 * `.env.local` no se toca: se lee y se le pasan los valores al proceso hijo.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";

export const PUERTO = 3098;
export const BASE = `http://localhost:${PUERTO}`;

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.resolve(AQUI, "..");

const SECRETO = "secreto-solo-para-grabar-el-video-no-se-usa-en-ningun-lado";

/** El tamano de grabacion: 1600x900 dibujado a 2,4x da 3840x2160 reales. */
export const VIEWPORT = { width: 1600, height: 900 };
export const ESCALA = 2.4;

// ---------------------------------------------------------------- el servidor

function deEnv(clave) {
  const texto = readFileSync(path.join(APP, ".env.local"), "utf8");
  return texto.match(new RegExp(`^${clave}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";
}

const TABLEROS = [
  "CONTROL_HERRAMIENTAS", "CONTROL_HERRAMIENTAS_MOVIMIENTOS", "EQUIPO_VDV", "VALES", "INGRESOS",
  "PROVEEDORES", "ORDENES_DE_COMPRA_MAXXA", "FACTURAS_IA", "BASE_DE_DATOS_MATERIALES", "PAGOS_VDV",
  "FLUJO_CONTRATACION_SUBCONTRATO", "ESTADOS_DE_PAGO_SUBCONTRATOS",
];

/**
 * `conBaseReal` solo para las pruebas que ESCRIBEN.
 *
 * El correlativo del arriendo vive en Neon, no en monday, asi que un alta de
 * verdad necesita la base. Para todo lo demas se deja la base rota a proposito:
 * el guard cae en la sesion del token y no se toca ninguna base real.
 */
export async function levantarApp({ conBaseReal = false, puerto = PUERTO } = {}) {
  const entorno = {
    ...process.env,
    NODE_ENV: "production",
    AUTH_LAYERS_ENABLED: "true",
    MFA_SESSION_SECRET: SECRETO,
    MFA_ENCRYPTION_KEY: "0".repeat(64),
    // A proposito no existe. Ver el comentario de arriba del archivo.
    DATABASE_URL: conBaseReal ? deEnv("DATABASE_URL") : "postgresql://nadie:nadie@127.0.0.1:1/no-existe",
    MONDAY_API_TOKEN: deEnv("MONDAY_API_TOKEN"),
  };
  for (const b of TABLEROS) entorno[`MONDAY_BOARD_${b}`] = deEnv(`MONDAY_BOARD_${b}`);

  const server = spawn("npx", ["next", "start", "--port", String(puerto)], {
    cwd: APP,
    env: entorno,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(`[app] ${d}`));

  // Se espera a que el puerto conteste y no a que el log diga "Ready": next lo
  // imprime antes de poder servir.
  const hasta = Date.now() + 90_000;
  while (Date.now() < hasta) {
    try {
      const r = await fetch(`http://localhost:${puerto}/api/version`);
      if (r.status) break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  // En Windows `server.kill()` mata al cmd.exe que abrio npx, pero NO al node
  // de abajo, que se queda con el puerto tomado y hace fallar la corrida
  // siguiente con EADDRINUSE. Hay que matar el arbol entero.
  let cerrado = false;
  const base = `http://localhost:${puerto}`;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", shell: true });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch {
      /* ya estaba muerto */
    }
    server.kill();
  };
  process.on("exit", cerrar);
  process.on("SIGINT", () => { cerrar(); process.exit(1); });
  return { server, cerrar, base };
}

// ----------------------------------------------------------------- la sesion

/** Una cookie de sesion. Por defecto, administrador sin recorte de obras. */
export function cookieSesion(
  asignaciones = [{ app: "herramientas", appRol: "administrador" }],
  { nombre = "Mateo Demo", email = "demo@vergaradelvalle.com", uid = 999 } = {},
) {
  const token = jwt.sign(
    { uid, email, rol: "usuario", tipo: "sesion", nombre, asignaciones },
    SECRETO,
    { expiresIn: "2h" },
  );
  return { name: "vdv_session", value: token, domain: "localhost", path: "/" };
}

/** La cuenta de TAP: existe en la base (id 31) y tiene ficha en Equipo VDV. */
export const CUENTA_TAP = {
  uid: 31,
  email: "clients@theautomationpartner.com",
  nombre: "The Automation Partner",
  fichaEquipoVdv: "13070208522",
};

// -------------------------------------------------------------- el navegador

/** Todo lo que NO puede salir de la grabacion hacia afuera. */
const ESCRITURAS = [
  "/api/herramientas/movimiento",
  "/api/herramientas/confirmar",
  "/api/herramientas/poner-al-dia",
];

/**
 * Abre Chrome con la sesion puesta y la escritura cortada.
 *
 * `simular` recibe (url, request) y devuelve el cuerpo con el que se contesta,
 * o null para que la llamada se corte con un error. Lo usa el guion para que la
 * pantalla muestre el movimiento hecho sin que nada llegue a monday.
 */
export async function abrirNavegador({
  simular = () => ({ ok: true }),
  parchearLectura = null,
  // `dejarEscribir` apaga el corta-escrituras: solo para las pruebas que
  // verifican que monday acepta de verdad lo que la pantalla manda.
  dejarEscribir = false,
  sesion = null,
  rolEnPantalla = null,
  base = BASE,
} = {}) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      // Medido: el `deviceScaleFactor` del contexto vale para page.screenshot()
      // pero NO para el screencast, que sin esta bandera entrega 1600x900 y el
      // video queda blando al hacer zoom. Con la bandera MAS el viewport de
      // abajo, el cuadro sale 3840x2159 y la pagina se sigue maquetando a 1600.
      "--force-device-scale-factor=2.4",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      "--hide-scrollbars",
    ],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: ESCALA,
    locale: "es-CL",
    timezoneId: "America/Santiago",
  });
  await context.addCookies([sesion ?? cookieSesion()]);

  /**
   * El rol que dibuja la pantalla sale de localStorage, no de la cookie.
   * La cookie es lo que mira el SERVIDOR; `hr_session` es lo que mira el
   * navegador para saber que botones poner. Sin esto la pantalla cree que no
   * hay sesion y muestra el cartel de "tu cuenta no tiene acceso".
   */
  if (rolEnPantalla) {
    await context.addInitScript((datos) => {
      try {
        localStorage.setItem("hr_session", JSON.stringify(datos));
      } catch {
        /* almacenamiento bloqueado */
      }
    }, rolEnPantalla);
  }

  const bloqueadas = [];

  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    const metodo = req.method();

    const esEscrituraNuestra = ESCRITURAS.some((r) => url.includes(r));
    // El proxy de GraphQL: solo se dejan pasar las consultas, nunca mutations.
    const esMutationMonday =
      url.includes("/api/monday") && metodo === "POST" && /\bmutation\b/.test(req.postData() ?? "");
    const esOtraEscritura =
      ["POST", "PUT", "PATCH", "DELETE"].includes(metodo) &&
      !url.includes("/api/monday/board") &&
      !url.includes("/api/monday/archivo") &&
      !esEscrituraNuestra &&
      !esMutationMonday;

    if (!dejarEscribir && (esEscrituraNuestra || esMutationMonday || esOtraEscritura)) {
      bloqueadas.push(`${metodo} ${url.replace(base, "")}`);
      const cuerpo = simular(url, req);
      if (cuerpo === null) return route.abort("failed");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cuerpo),
      });
    }

    // Las lecturas del tablero pueden necesitar un retoque despues del
    // movimiento simulado: se pide la respuesta REAL y se la modifica, para que
    // la fila nueva tenga la misma forma que las de verdad.
    if (parchearLectura && url.includes("/api/monday/board")) {
      const respuesta = await route.fetch();
      let json;
      try {
        json = await respuesta.json();
      } catch {
        return route.fulfill({ response: respuesta });
      }
      const parchada = parchearLectura(json);
      return route.fulfill({
        response: respuesta,
        body: JSON.stringify(parchada ?? json),
        headers: { ...respuesta.headers(), "content-type": "application/json" },
      });
    }

    return route.continue();
  });

  const page = await context.newPage();
  return { browser, context, page, bloqueadas };
}
