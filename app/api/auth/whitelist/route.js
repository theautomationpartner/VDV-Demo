import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import {
  listarUsuariosAutorizados,
  obtenerUsuarioAutorizado,
  agregarUsuarioAutorizado,
  actualizarUsuarioAutorizado,
  eliminarUsuarioAutorizado,
} from "@/lib/server/whitelist";

/**
 * Panel de administracion de la whitelist. No hay un rol propio de esta
 * whitelist: el acceso sale de los roles que la cuenta ya tiene DENTRO de
 * cada app (Vale Express / Portal Proveedor, via asignaciones en el JWT de
 * sesion), y esta ACOTADO POR APP - alguien puede ser super_admin de Vale
 * Express y admin (o nada) de Portal Proveedor:
 *   - 'super_admin' en una app -> puede ver Y editar usuarios de ESA app.
 *   - 'admin' en una app       -> puede solo VER usuarios de ESA app.
 * Un usuario de la whitelist con asignaciones en varias apps solo se puede
 * "administrar completo" (estado, nombre, borrar) si el que edita tiene
 * 'super_admin' en TODAS esas apps a la vez - si no, revocar/borrar afectaria
 * tambien accesos de una app que no administra. Editar asignaciones puntuales
 * si esta acotado por app: PATCH hace merge, preservando intactas las
 * asignaciones de apps que este editor no administra.
 */
function appAccessMap(sesion) {
  const access = {};
  for (const a of sesion.asignaciones ?? []) {
    if (a.appRol === "super_admin") access[a.app] = "editor";
    else if (a.appRol === "admin" && access[a.app] !== "editor") access[a.app] = "viewer";
  }
  return access;
}

function editableApps(access) {
  return new Set(Object.keys(access).filter((app) => access[app] === "editor"));
}

function viewableApps(access) {
  return new Set(Object.keys(access));
}

function puedeAdministrarCompleto(asignaciones, editable) {
  const propias = asignaciones ?? [];
  return propias.length > 0 && propias.every((a) => editable.has(a.app));
}

function requireAlgunAcceso(request) {
  const sesion = verificarAcceso(request);
  const access = appAccessMap(sesion);
  if (Object.keys(access).length === 0) {
    return { error: Response.json({ error: "Necesitas rol de administrador en alguna app" }, { status: 403 }) };
  }
  return { sesion, access };
}

export async function GET(request) {
  let access;
  try {
    const result = requireAlgunAcceso(request);
    if (result.error) return result.error;
    access = result.access;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const visibles = viewableApps(access);
  const editables = editableApps(access);

  const todos = await listarUsuariosAutorizados();
  const result = todos
    .map((u) => {
      const asignacionesVisibles = (u.asignaciones ?? []).filter((a) => visibles.has(a.app));
      if (asignacionesVisibles.length === 0) return null;
      return {
        ...u,
        asignaciones: asignacionesVisibles,
        // Distincion clave: "algo" alcanza para el boton Editar y para tocar
        // SOLO las asignaciones de las apps que este admin controla (el PATCH
        // ya hace merge preservando las demas, ver mas abajo). "Completo"
        // hace falta para nombre/estado/borrar, que afectan TODAS las apps
        // de la persona a la vez - de lo contrario un super_admin de una sola
        // app podria revocar/borrar acceso a una app que no administra.
        puedeEditarAlgo: (u.asignaciones ?? []).some((a) => editables.has(a.app)),
        puedeAdministrarCompleto: puedeAdministrarCompleto(u.asignaciones, editables),
      };
    })
    .filter(Boolean);

  return Response.json({ result, access });
}

export async function POST(request) {
  let access;
  try {
    const result = requireAlgunAcceso(request);
    if (result.error) return result.error;
    access = result.access;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const editables = editableApps(access);
  const body = await request.json().catch(() => ({}));
  const { email, nombre, asignaciones = [] } = body ?? {};
  if (!email || typeof email !== "string") {
    return Response.json({ error: "Falta 'email'" }, { status: 400 });
  }
  const appFueraDeAlcance = asignaciones.find((a) => !editables.has(a.app));
  if (appFueraDeAlcance) {
    return Response.json({ error: `No administrás ${appFueraDeAlcance.app}` }, { status: 403 });
  }

  return Response.json({ result: await agregarUsuarioAutorizado({ email, nombre, asignaciones }) });
}

export async function PATCH(request) {
  let access;
  try {
    const result = requireAlgunAcceso(request);
    if (result.error) return result.error;
    access = result.access;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const editables = editableApps(access);
  const body = await request.json().catch(() => ({}));
  const { id, nombre, estado, asignaciones } = body ?? {};
  if (!id) return Response.json({ error: "Falta 'id'" }, { status: 400 });

  const actual = await obtenerUsuarioAutorizado(id);
  if (!actual) return Response.json({ error: "No existe ese usuario" }, { status: 404 });

  const cambios = {};

  // nombre/estado son de la cuenta entera (afectan TODAS sus apps) - solo se
  // pueden tocar si esta persona administra el 100% de las apps de ese
  // usuario, para no revocar/renombrar algo que pertenece a otro admin.
  if (nombre !== undefined || estado !== undefined) {
    if (!puedeAdministrarCompleto(actual.asignaciones, editables)) {
      return Response.json(
        { error: "Esta persona tiene asignaciones en apps que no administrás - no podés cambiar su nombre/estado" },
        { status: 403 }
      );
    }
    if (nombre !== undefined) cambios.nombre = nombre;
    if (estado !== undefined) cambios.estado = estado;
  }

  // asignaciones: se puede editar SOLO las de las apps que administra este
  // super_admin - las de otras apps quedan intactas (merge, no reemplazo).
  if (asignaciones !== undefined) {
    const appFueraDeAlcance = asignaciones.find((a) => !editables.has(a.app));
    if (appFueraDeAlcance) {
      return Response.json({ error: `No administrás ${appFueraDeAlcance.app}` }, { status: 403 });
    }
    const ajenas = (actual.asignaciones ?? []).filter((a) => !editables.has(a.app));
    cambios.asignaciones = [...ajenas, ...asignaciones];
  }

  const actualizado = await actualizarUsuarioAutorizado(id, cambios);
  if (!actualizado) return Response.json({ error: "No existe ese usuario" }, { status: 404 });
  return Response.json({ result: actualizado });
}

export async function DELETE(request) {
  let access;
  try {
    const result = requireAlgunAcceso(request);
    if (result.error) return result.error;
    access = result.access;
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    throw err;
  }

  const editables = editableApps(access);
  const { id } = await request.json().catch(() => ({}));
  if (!id) return Response.json({ error: "Falta 'id'" }, { status: 400 });

  const actual = await obtenerUsuarioAutorizado(id);
  if (!actual) return Response.json({ error: "No existe ese usuario" }, { status: 404 });

  // Borrar saca a la persona de TODAS las apps a la vez - mismo motivo que
  // nombre/estado, hace falta administrar el 100% de sus apps.
  if (!puedeAdministrarCompleto(actual.asignaciones, editables)) {
    return Response.json(
      { error: "Esta persona tiene asignaciones en apps que no administrás - no la podés eliminar" },
      { status: 403 }
    );
  }

  await eliminarUsuarioAutorizado(id);
  return Response.json({ ok: true });
}
