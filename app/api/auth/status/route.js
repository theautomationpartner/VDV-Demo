import { leerSesion } from "@/lib/server/session";
import { verificarAcceso, AccesoError } from "@/lib/server/auth-guard";

const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Consulta el cliente al arrancar la app para saber si ya hay una sesion valida
 * (cookie httpOnly, ver lib/server/session.js) o si tiene que mostrar el login.
 */
export async function GET(request) {
  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) {
    // Demo (datos inventados) o el login todavia no esta activado a proposito
    // (falta terminar de configurar DATABASE_URL / MFA_*): se comporta como si
    // no existiera ningun gate.
    return Response.json({ status: "ready", email: null, rol: null });
  }

  if (!leerSesion(request)) return Response.json({ status: "logged_out" });

  // Los roles salen de la base, no de la cookie: es lo que hace que un cambio
  // en Usuarios y Roles se vea en el menu sin cerrar sesion. Si la cuenta fue
  // revocada o borrada, verificarAcceso lanza y se responde logged_out, que es
  // lo que saca a esa persona de la app.
  let sesion;
  try {
    sesion = await verificarAcceso(request);
  } catch (err) {
    if (err instanceof AccesoError) return Response.json({ status: "logged_out" });
    throw err;
  }

  return Response.json({
    status: "ready",
    id: sesion.id,
    email: sesion.email,
    rol: sesion.rol,
    asignaciones: sesion.asignaciones,
    nombre: sesion.nombre,
  });
}
