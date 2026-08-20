import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  listarUsuariosAutorizados,
  agregarUsuarioAutorizado,
  actualizarUsuarioAutorizado,
  eliminarUsuarioAutorizado,
} from "@/lib/server/whitelist";

/**
 * Panel de administracion de la whitelist. Solo usuarios con rol='admin' (y ya
 * logueados con 2FA, porque pasa por verificarAcceso) pueden ver o tocar esto.
 */
function requireAdmin(request) {
  const sesion = verificarAcceso(request);
  if (sesion.rol !== "admin") {
    return { error: Response.json({ error: "Necesitas rol de administrador" }, { status: 403 }) };
  }
  return { sesion };
}

export async function GET(request) {
  try {
    const { error } = requireAdmin(request);
    if (error) return error;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  return Response.json({ result: await listarUsuariosAutorizados() });
}

export async function POST(request) {
  try {
    const { error } = requireAdmin(request);
    if (error) return error;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const body = await request.json().catch(() => ({}));
  const { email, rol } = body ?? {};
  if (!email || typeof email !== "string") {
    return Response.json({ error: "Falta 'email'" }, { status: 400 });
  }

  return Response.json({ result: await agregarUsuarioAutorizado(email, rol) });
}

export async function PATCH(request) {
  try {
    const { error } = requireAdmin(request);
    if (error) return error;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const body = await request.json().catch(() => ({}));
  const { id, rol, estado } = body ?? {};
  if (!id) return Response.json({ error: "Falta 'id'" }, { status: 400 });

  const actualizado = await actualizarUsuarioAutorizado(id, { rol, estado });
  if (!actualizado) return Response.json({ error: "No existe ese usuario" }, { status: 404 });
  return Response.json({ result: actualizado });
}

export async function DELETE(request) {
  try {
    const { error } = requireAdmin(request);
    if (error) return error;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const { id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: "Falta 'id'" }, { status: 400 });

  await eliminarUsuarioAutorizado(id);
  return Response.json({ ok: true });
}
