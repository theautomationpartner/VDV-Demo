import "server-only";
import { sql } from "@/lib/server/db";
import { mondayFetch } from "@/lib/server/monday-client";

/**
 * Capa 2 (whitelist de emails) - ver SeguidadApp.md seccion "Capa 2". La lista se
 * guarda por email (lo que el cliente entiende y administra) y se vincula al
 * monday_user_id la primera vez que esa persona entra, porque el sessionToken de
 * monday NO trae el email, solo el user_id numerico.
 *
 * Regla de oro: esto se consulta en CADA pedido al backend (ver lib/server/auth-guard.js),
 * no solo al iniciar sesion. Si se revoca a alguien, deja de funcionar en el acto.
 */

export class NoAutorizado extends Error {}

const emailCache = new Map(); // userId -> { email, expira }
const EMAIL_CACHE_MS = 24 * 60 * 60 * 1000;

async function obtenerEmailDeMonday(userId) {
  const cached = emailCache.get(userId);
  if (cached && Date.now() < cached.expira) return cached.email;

  const data = await mondayFetch(`query ($ids: [ID!]) { users(ids: $ids) { email } }`, { ids: [userId] });
  const email = data?.users?.[0]?.email;
  if (!email) throw new NoAutorizado(`No se pudo resolver el email de monday para el user_id ${userId}`);

  emailCache.set(userId, { email, expira: Date.now() + EMAIL_CACHE_MS });
  return email;
}

async function auditar(evento) {
  try {
    await sql`
      insert into auditoria (monday_user_id, email, accion, ip, detalle)
      values (${evento.userId ?? null}, ${evento.email ?? null}, ${evento.accion}, ${evento.ip ?? null}, ${evento.detalle ?? null})
    `;
  } catch (err) {
    // La auditoria nunca debe tumbar el pedido real.
    console.error("[auditoria] no se pudo registrar:", err.message);
  }
}

/**
 * Verifica que el usuario del sessionToken de monday (Capa 1, ya validado) este
 * habilitado en la whitelist. Devuelve { email, rol } o tira NoAutorizado.
 */
export async function verificarListaBlanca(sesion, { ip } = {}) {
  if (sesion.isGuest) {
    await auditar({ userId: sesion.userId, accion: "no_autorizado_guest", ip });
    throw new NoAutorizado();
  }

  const rows = await sql`select * from usuarios_autorizados where monday_user_id = ${sesion.userId} limit 1`;
  let usuario = rows[0] ?? null;

  if (!usuario) {
    const email = (await obtenerEmailDeMonday(sesion.userId)).toLowerCase();
    const porEmail = await sql`select * from usuarios_autorizados where email = ${email} limit 1`;
    usuario = porEmail[0] ?? null;

    if (!usuario) {
      await auditar({ userId: sesion.userId, email, accion: "no_autorizado", ip });
      throw new NoAutorizado();
    }

    await sql`
      update usuarios_autorizados
      set monday_user_id = ${sesion.userId}, monday_account_id = ${sesion.accountId}
      where id = ${usuario.id}
    `;
    usuario = { ...usuario, monday_user_id: sesion.userId };
  }

  if (usuario.estado !== "activo") {
    await auditar({ userId: sesion.userId, email: usuario.email, accion: "no_autorizado_revocado", ip });
    throw new NoAutorizado();
  }

  await sql`update usuarios_autorizados set ultimo_acceso = now() where id = ${usuario.id}`;
  await auditar({ userId: sesion.userId, email: usuario.email, accion: "ingreso_ok", ip });

  return { email: usuario.email, rol: usuario.rol };
}

// --- Administracion de la whitelist (panel de admin, ver app/api/auth/whitelist) ---

export async function listarUsuariosAutorizados() {
  return sql`select id, email, monday_user_id, rol, estado, creado_en, ultimo_acceso from usuarios_autorizados order by creado_en desc`;
}

export async function agregarUsuarioAutorizado(email, rol = "usuario") {
  const rows = await sql`
    insert into usuarios_autorizados (email, rol)
    values (${email.toLowerCase().trim()}, ${rol})
    on conflict (email) do update set estado = 'activo', rol = excluded.rol
    returning id, email, rol, estado
  `;
  return rows[0];
}

export async function actualizarUsuarioAutorizado(id, { rol, estado }) {
  const rows = await sql`
    update usuarios_autorizados
    set rol = coalesce(${rol ?? null}, rol), estado = coalesce(${estado ?? null}, estado)
    where id = ${id}
    returning id, email, rol, estado
  `;
  return rows[0] ?? null;
}

export async function eliminarUsuarioAutorizado(id) {
  await sql`delete from usuarios_autorizados where id = ${id}`;
}
