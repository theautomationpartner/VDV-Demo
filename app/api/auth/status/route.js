import { leerSesion } from "@/lib/server/session";

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

  const sesion = leerSesion(request);
  if (!sesion) return Response.json({ status: "logged_out" });

  return Response.json({ status: "ready", email: sesion.email, rol: sesion.rol });
}
