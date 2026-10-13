/**
 * Levanta la app compilada para mirarla en el navegador.
 *
 *   npm run ver-local          (puerto 3000)
 *   npm run ver-local -- 3005  (otro puerto)
 *
 * Por que un script y no `npm start` a secas:
 *
 * 1. **Compilada, no en modo dev.** En `next dev` la app no hidrata igual y los
 *    anchos de tabla no son los de verdad, asi que lo que se ve no es lo que ve
 *    el usuario. Si no hay build, lo avisa.
 * 2. **Sin codigo de 2FA.** `MFA_REQUIRED` arranca en true por defecto, y pedir
 *    el codigo en local significa MANDAR UN CORREO de verdad por cada vez que
 *    uno entra a mirar. Aca se apaga: alcanza con el mail para entrar.
 * 3. **Con las capas de permisos PRENDIDAS.** Es la diferencia que importa: con
 *    `AUTH_LAYERS_ENABLED` apagado, cualquiera ve todo y no se pueden probar los
 *    roles. Prendido, local se comporta como produccion.
 *
 * APUNTA A LA BASE Y A LOS TABLEROS DE VERDAD (los de `.env.local`). Lo que se
 * escriba desde acá se escribe en monday del cliente.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

// `fileURLToPath` y no `.pathname`: en Windows ese devuelve "/C:/..." y, peor,
// deja los espacios como %20. La carpeta del proyecto tiene espacios, asi que
// el spawn terminaba con un cwd inexistente y fallaba con ENOENT.
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const puerto = process.argv[2] ?? "3000";

if (!existsSync(new URL("../.next/BUILD_ID", import.meta.url))) {
  console.error("\nNo hay build. Corré primero:  npm run build\n");
  process.exit(1);
}

/**
 * LIBERAR EL PUERTO ANTES DE ARRANCAR.
 *
 * Sin esto, levantar de nuevo sobre un puerto ocupado NO da un error visible:
 * el proceso nuevo muere y el VIEJO sigue contestando. O sea que recompilás,
 * recargás el navegador, y seguís mirando el build de hace media hora sin que
 * nada avise. Me pasó: agregué dos filtros, los probé, y en pantalla no estaban.
 *
 * Es el mismo problema que ya estaba resuelto en las pruebas de video-demo/.
 */
try {
  const lineas = execSync(`netstat -ano | findstr LISTENING | findstr :${puerto}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pids = new Set(
    lineas.trim().split(String.fromCharCode(10)).map((l) => l.trim().split(" ").filter(Boolean).pop()),
  );
  for (const pid of pids) {
    if (!pid || pid === "0") continue;
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    console.log(`  (bajé el servidor anterior que tenía tomado el puerto ${puerto})`);
  }
  await new Promise((r) => setTimeout(r, 1500));
} catch {
  /* nadie escuchando, que es lo normal */
}

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const deEnv = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.replace(/^"|"$/g, "") ?? "";

const quienes = deEnv("DATABASE_URL").includes("neon.tech") ? "la base de VERDAD" : "una base local";

console.log(`
  VDV Suite, compilada, en http://localhost:${puerto}

  Entrá con un mail que esté en Usuarios y Roles. No pide código de 2FA.
  Para ver Solicitudes de Material hace falta tener esa app asignada;
  hoy la tiene clients@theautomationpartner.com.

  OJO: usa ${quienes} y los tableros de monday del cliente.
  Lo que escribas desde acá se escribe allá.

  Ctrl+C para bajarlo.
`);

const hijo = spawn("npx", ["next", "start", "--port", puerto], {
  cwd: RAIZ,
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    AUTH_LAYERS_ENABLED: "true",
    MFA_REQUIRED: "false",
    // Firma las sesiones de ESTA corrida. Se genera cada vez a proposito: una
    // sesion de un rato antes no sirve, y no queda ningun secreto escrito.
    MFA_SESSION_SECRET: randomBytes(32).toString("hex"),
    MFA_ENCRYPTION_KEY: "0".repeat(64),
  },
});

process.on("SIGINT", () => { hijo.kill(); process.exit(0); });
hijo.on("exit", (c) => process.exit(c ?? 0));
