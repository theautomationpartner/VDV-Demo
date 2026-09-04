import "server-only";
import { leerSesion } from "@/lib/server/session";
import { obtenerUsuarioAutorizado } from "@/lib/server/whitelist";

/**
 * Guardian de acceso para /api/monday/* y /api/auth/whitelist. La app es
 * standalone (link publico): la unica prueba de identidad es la cookie de
 * sesion emitida en /api/auth/mfa/confirm o /api/auth/mfa/verify, despues de
 * pasar whitelist + 2FA (ver lib/server/session.js).
 */

export class AccesoError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.code = "SIN_SESION";
  }
}

/**
 * Quien sos (de la cookie) y QUE PODES HACER HOY (de la base).
 *
 * La cookie dura 12 horas, o 30 dias si la persona marco "recordarme", y lleva
 * adentro las asignaciones que tenia al entrar. Confiar en eso significaba que
 * cambiarle el rol a alguien no tenia efecto hasta que cerrara sesion: le
 * sacabas la aprobacion de ordenes un lunes a la mañana y seguia aprobando
 * hasta la noche. Revocarle la cuenta entera, igual.
 *
 * Ahora la identidad sigue saliendo de la cookie -eso es lo que hace que no
 * haya que loguearse cada vez- pero los roles se leen de la base en CADA
 * pedido. Un cambio en Usuarios y Roles se aplica en el proximo clic, en las
 * tres apps.
 *
 * Cuesta una consulta a Postgres por pedido. Es una fila por id, y las
 * pantallas pesadas ya cachean su respuesta 5 minutos del lado del navegador,
 * asi que no cambia lo que siente el usuario.
 *
 * SI LA BASE NO CONTESTA se sigue con lo que dice la cookie, avisando por
 * consola. Es a proposito: una intermitencia de Neon dejaria a toda la obra
 * afuera en medio de la jornada, y el precio de seguir es que durante esa
 * intermitencia los roles quedan tan viejos como estaban antes de este cambio.
 */
export async function verificarAcceso(request) {
  const sesion = leerSesion(request);
  if (!sesion) throw new AccesoError("Sesion invalida o vencida. Iniciar sesion de nuevo.");

  let usuario;
  try {
    usuario = await obtenerUsuarioAutorizado(sesion.id);
  } catch (error) {
    console.error("[auth] No se pudo leer el usuario, se sigue con la sesion:", error?.message);
    return sesion;
  }

  if (!usuario) throw new AccesoError("Tu cuenta ya no existe. Pedile a un administrador que te de de alta.");
  if (usuario.estado !== "activo") throw new AccesoError("Tu acceso fue revocado.");

  return {
    ...sesion,
    rol: usuario.rol,
    nombre: usuario.nombre ?? sesion.nombre,
    asignaciones: usuario.asignaciones ?? [],
  };
}

export function accesoErrorToResponse(err) {
  if (!(err instanceof AccesoError)) throw err;
  return Response.json({ error: err.message, code: err.code }, { status: 401 });
}
