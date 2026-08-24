"use client";

/**
 * A que app(s) pertenece la cuenta con la que entraste, y que rol tenes en
 * cada una - resuelto por el servidor a partir de la whitelist (tabla
 * usuarios_autorizados, columna asignaciones: array de {app, appRol,
 * appConfig}; administrable en /admin/whitelist sin tocar codigo). La
 * mayoria de la gente tiene UNA sola asignacion, pero puede tener mas de una
 * (ej. alguien con Super Admin en Vale Express Y Portal Proveedor).
 *
 * components/auth/AuthGate.jsx llama a seedAppSessionFromEmail() apenas se
 * resuelve el login (fresco o de una sesion ya existente) para armar
 * ve_session/pp_session automaticamente por cada asignacion que corresponda,
 * y evitar un segundo login adentro de cada app.
 */

// Fallback por si alguna cuenta de las 8 @demo.vdv.cl de prueba todavia no
// tiene `asignaciones` cargado en la DB.
const FALLBACK = {
  'superadmin.valeexpress@demo.vdv.cl': [{ app: 'vale-express', appRol: 'super_admin', nombre: 'Super Admin' }],
  'admin.valeexpress@demo.vdv.cl': [{ app: 'vale-express', appRol: 'admin', nombre: 'Administrador' }],
  'bodega.valeexpress@demo.vdv.cl': [{ app: 'vale-express', appRol: 'bodeguero', nombre: 'Bodeguero' }],
  'jefeobra.valeexpress@demo.vdv.cl': [{ app: 'vale-express', appRol: 'jefe_obra', nombre: 'Jefe de Obra' }],
  'apr.valeexpress@demo.vdv.cl': [{ app: 'vale-express', appRol: 'apr', nombre: 'APR' }],
  'superadmin.portalproveedor@demo.vdv.cl': [{ app: 'portal-proveedor', appRol: 'super_admin', nombre: 'Super Admin' }],
  'admin.portalproveedor@demo.vdv.cl': [{ app: 'portal-proveedor', appRol: 'admin', nombre: 'Administrador' }],
  'subcontratista.portalproveedor@demo.vdv.cl': [{ app: 'portal-proveedor', appRol: 'subcontratista', nombre: 'Subcontratista' }],
};

function resolverAsignaciones(email, serverInfo) {
  if (serverInfo?.asignaciones?.length) {
    return serverInfo.asignaciones.map((a) => ({ ...a, nombre: serverInfo.nombre }));
  }
  return FALLBACK[email] ?? [];
}

function buildVeSession(id, email, nombre, asignacion) {
  return {
    userId: `db-${id}`,
    userName: nombre || email,
    email,
    loginTime: new Date().toISOString(),
  };
}

function buildPpSession(id, email, nombre, asignacion) {
  return {
    role: asignacion.appRol,
    mondayUserId: `db-${id}`,
    adminName: nombre || email,
    adminPhoto: null,
    proveedorName: asignacion.appConfig?.proveedorName ?? null,
    adminUserId: null,
    allowedObras: null,
    allowedProveedores: null,
    canGrantSubAccess: false,
  };
}

const GLOBAL_EMAIL_KEY = 'vdv_global_email';
const GLOBAL_APPS_KEY = 'vdv_global_apps'; // JSON array, ej. ["vale-express","portal-proveedor"]
const VE_ROLE_CACHE_PREFIX = 'vdv_ve_role_';

/** Email de la cuenta global actual (seteado por AuthGate), o null si no hay sesion. */
export function getGlobalEmail() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GLOBAL_EMAIL_KEY);
}

/** A que app(s) pertenece la cuenta global actual. */
export function getGlobalApps() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(GLOBAL_APPS_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Compat: primera app de la cuenta global (o null). */
export function getGlobalApp() {
  return getGlobalApps()[0] ?? null;
}

/** true si la cuenta global tiene alguna asignacion para esa app. */
export function hasAccessToApp(app) {
  return getGlobalApps().includes(app);
}

/** Compat: igual que hasAccessToApp(), pero toma el email por parametro (solo sirve para la cuenta activa). */
export function appForEmail(email) {
  const normalized = email?.toLowerCase().trim();
  if (!normalized || normalized !== getGlobalEmail()) return null;
  return getGlobalApp();
}

/**
 * Escribe en localStorage la sesion de CADA app para la que la cuenta tenga
 * asignacion (ve_session y/o pp_session), a partir de los datos que ya
 * devolvio el servidor (serverInfo: {id, nombre, rol, asignaciones}) o, si
 * faltan, del fallback hardcodeado. Devuelve la primera app (para saber a
 * donde redirigir despues de loguearse) o null si no tiene ninguna.
 */
export function seedAppSessionFromEmail(email, serverInfo) {
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return null;

  localStorage.setItem(GLOBAL_EMAIL_KEY, normalized);

  const asignaciones = resolverAsignaciones(normalized, serverInfo);
  const apps = asignaciones.map((a) => a.app);
  localStorage.setItem(GLOBAL_APPS_KEY, JSON.stringify(apps));

  if (asignaciones.length === 0) return null;

  const id = serverInfo?.id ?? normalized;
  const nombre = serverInfo?.nombre;
  let primero = null;

  for (const asignacion of asignaciones) {
    if (asignacion.app === 'vale-express') {
      localStorage.setItem('ve_session', JSON.stringify(buildVeSession(id, normalized, nombre, asignacion)));
      localStorage.setItem(
        `${VE_ROLE_CACHE_PREFIX}db-${id}`,
        JSON.stringify({
          role: asignacion.appRol,
          obras: asignacion.appConfig?.obras || [],
          restrictObras: asignacion.appConfig?.restrictObras === true,
        })
      );
      primero ??= { app: 'vale-express', dashboardPath: '/vale-express/dashboard' };
    } else if (asignacion.app === 'portal-proveedor') {
      localStorage.setItem('pp_session', JSON.stringify(buildPpSession(id, normalized, nombre, asignacion)));
      primero ??= {
        app: 'portal-proveedor',
        dashboardPath: asignacion.appRol === 'super_admin' ? '/portal-proveedor/super-admin-filter' : '/portal-proveedor/dashboard',
      };
    }
  }

  return primero;
}

/** Rol cacheado por seedAppSessionFromEmail para un userId de Vale Express (ver hooks/vale-express/useUserRole.js). */
export function getCachedVeRole(userId) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${VE_ROLE_CACHE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
