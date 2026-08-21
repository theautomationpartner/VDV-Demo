import "server-only";
import { sql } from "@/lib/server/db";

/**
 * Whitelist de emails - es el login entero de la app (link publico, sin iframe
 * de monday.com de por medio: no hay sessionToken del que sacar identidad, asi
 * que la fuente de verdad es directamente el email que la persona escribe).
 *
 * Regla de oro: se consulta en cada intento de login, no se cachea el resultado
 * "autorizado" mas alla de la sesion ya emitida (ver lib/server/session.js) - si
 * se revoca a alguien, el proximo intento de generar sesion falla, aunque su
 * sesion vieja siga viva hasta que expire.
 */

export class NoAutorizado extends Error {}

async function auditar(evento) {
  try {
    await sql`
      insert into auditoria (usuario_id, email, accion, ip, detalle)
      values (${evento.usuarioId ?? null}, ${evento.email ?? null}, ${evento.accion}, ${evento.ip ?? null}, ${evento.detalle ?? null})
    `;
  } catch (err) {
    // La auditoria nunca debe tumbar el pedido real.
    console.error("[auditoria] no se pudo registrar:", err.message);
  }
}

/**
 * Verifica que el email este habilitado en la whitelist. Devuelve el registro
 * completo (id, email, rol) o tira NoAutorizado - siempre con el mismo mensaje
 * generico, para no confirmarle a quien esta tanteando si el email existe o no.
 */
export async function verificarEmailEnWhitelist(email, { ip } = {}) {
  const normalizado = email.toLowerCase().trim();
  const rows = await sql`select * from usuarios_autorizados where email = ${normalizado} limit 1`;
  const usuario = rows[0] ?? null;

  if (!usuario || usuario.estado !== "activo") {
    await auditar({ email: normalizado, accion: "no_autorizado", ip });
    throw new NoAutorizado();
  }

  await auditar({ usuarioId: usuario.id, email: usuario.email, accion: "login_intento_ok", ip });
  return usuario;
}

export async function marcarUltimoAcceso(usuarioId) {
  await sql`update usuarios_autorizados set ultimo_acceso = now() where id = ${usuarioId}`;
}

export async function auditarEvento(usuarioId, email, accion, ip) {
  await auditar({ usuarioId, email, accion, ip });
}

// --- Administracion de la whitelist (panel de admin, ver app/api/auth/whitelist
// y app/admin/whitelist/page.jsx) ---

export async function listarUsuariosAutorizados() {
  return sql`
    select id, email, nombre, rol, estado, app, app_rol, app_config, creado_en, ultimo_acceso
    from usuarios_autorizados order by creado_en desc
  `;
}

export async function agregarUsuarioAutorizado({ email, nombre, rol = "usuario", app = null, appRol = null, appConfig = {} }) {
  const rows = await sql`
    insert into usuarios_autorizados (email, nombre, rol, app, app_rol, app_config)
    values (${email.toLowerCase().trim()}, ${nombre ?? null}, ${rol}, ${app}, ${appRol}, ${JSON.stringify(appConfig ?? {})})
    on conflict (email) do update set
      estado = 'activo',
      nombre = excluded.nombre,
      rol = excluded.rol,
      app = excluded.app,
      app_rol = excluded.app_rol,
      app_config = excluded.app_config
    returning id, email, nombre, rol, estado, app, app_rol, app_config
  `;
  return rows[0];
}

export async function actualizarUsuarioAutorizado(id, { nombre, rol, estado, app, appRol, appConfig }) {
  const rows = await sql`
    update usuarios_autorizados
    set
      nombre = coalesce(${nombre ?? null}, nombre),
      rol = coalesce(${rol ?? null}, rol),
      estado = coalesce(${estado ?? null}, estado),
      app = coalesce(${app ?? null}, app),
      app_rol = coalesce(${appRol ?? null}, app_rol),
      app_config = coalesce(${appConfig ? JSON.stringify(appConfig) : null}, app_config)
    where id = ${id}
    returning id, email, nombre, rol, estado, app, app_rol, app_config
  `;
  return rows[0] ?? null;
}

export async function eliminarUsuarioAutorizado(id) {
  await sql`delete from usuarios_autorizados where id = ${id}`;
}
