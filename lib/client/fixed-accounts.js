"use client";

/**
 * A que app pertenece la cuenta con la que entraste, y que rol tenes ahi
 * adentro - resuelto por el servidor a partir de la whitelist (tabla
 * usuarios_autorizados, columnas app/app_rol/app_config; administrable en
 * /admin/whitelist sin tocar codigo). components/auth/AuthGate.jsx llama a
 * seedAppSessionFromEmail() apenas se resuelve el login (fresco o de una
 * sesion ya existente) para armar ve_session/pp_session automaticamente y
 * evitar un segundo login adentro de cada app.
 *
 * Las 5 cuentas @valeexpress.demo.vdv.cl y 3 @portalproveedor.demo.vdv.cl de
 * prueba quedan como fallback por si alguna fila de la whitelist todavia no
 * tiene app/app_rol cargado en la DB.
 */

const VALE_EXPRESS_FALLBACK = {
  'superadmin.valeexpress@demo.vdv.cl': { appRol: 'super_admin', nombre: 'Super Admin' },
  'admin.valeexpress@demo.vdv.cl': { appRol: 'admin', nombre: 'Administrador' },
  'bodega.valeexpress@demo.vdv.cl': { appRol: 'bodeguero', nombre: 'Bodeguero' },
  'jefeobra.valeexpress@demo.vdv.cl': { appRol: 'jefe_obra', nombre: 'Jefe de Obra' },
  'apr.valeexpress@demo.vdv.cl': { appRol: 'apr', nombre: 'APR' },
};

const PORTAL_PROVEEDOR_FALLBACK = {
  'superadmin.portalproveedor@demo.vdv.cl': { appRol: 'super_admin', nombre: 'Super Admin' },
  'admin.portalproveedor@demo.vdv.cl': { appRol: 'admin', nombre: 'Administrador' },
  'subcontratista.portalproveedor@demo.vdv.cl': { appRol: 'subcontratista', nombre: 'Subcontratista' },
};

function resolverCuenta(email, serverInfo) {
  if (serverInfo?.app) {
    return {
      app: serverInfo.app,
      appRol: serverInfo.appRol,
      appConfig: serverInfo.appConfig || {},
      nombre: serverInfo.nombre,
    };
  }

  const ve = VALE_EXPRESS_FALLBACK[email];
  if (ve) return { app: 'vale-express', appRol: ve.appRol, appConfig: {}, nombre: ve.nombre };

  const pp = PORTAL_PROVEEDOR_FALLBACK[email];
  if (pp) return { app: 'portal-proveedor', appRol: pp.appRol, appConfig: {}, nombre: pp.nombre };

  return null;
}

function buildVeSession(id, email, cuenta) {
  return {
    userId: `db-${id}`,
    userName: cuenta.nombre || email,
    email,
    loginTime: new Date().toISOString(),
  };
}

function buildPpSession(id, email, cuenta) {
  return {
    role: cuenta.appRol,
    mondayUserId: `db-${id}`,
    adminName: cuenta.nombre || email,
    adminPhoto: null,
    proveedorName: cuenta.appConfig?.proveedorName ?? null,
    adminUserId: null,
    allowedObras: null,
    allowedProveedores: null,
    canGrantSubAccess: false,
  };
}

const GLOBAL_EMAIL_KEY = 'vdv_global_email';
const GLOBAL_APP_KEY = 'vdv_global_app';
const GLOBAL_WHITELIST_ROL_KEY = 'vdv_global_whitelist_rol';
const VE_ROLE_CACHE_PREFIX = 'vdv_ve_role_';

/** Email de la cuenta global actual (seteado por AuthGate), o null si no hay sesion. */
export function getGlobalEmail() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GLOBAL_EMAIL_KEY);
}

/** A que app pertenece la cuenta global actual ('vale-express' | 'portal-proveedor' | null). */
export function getGlobalApp() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GLOBAL_APP_KEY) || null;
}

/**
 * Rol EN LA WHITELIST (no en Vale Express/Portal Proveedor) de la cuenta
 * global actual - 'admin' puede administrar /admin/whitelist. Distinto de
 * appRol, que es el rol adentro de la app.
 */
export function getGlobalWhitelistRol() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(GLOBAL_WHITELIST_ROL_KEY) || null;
}

/** Compat: igual que getGlobalApp(), pero toma el email por parametro en vez del cache. */
export function appForEmail(email) {
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return null;
  if (normalized !== getGlobalEmail()) return null; // solo sabemos la app de la cuenta activa
  return getGlobalApp();
}

/**
 * Escribe en localStorage la sesion de la app que corresponda (Vale Express o
 * Portal Proveedor), a partir de los datos que ya devolvio el servidor
 * (serverInfo: {app, appRol, appConfig, nombre}) o, si faltan, del fallback
 * hardcodeado. Devuelve a que app pertenece y el dashboard al que redirigir,
 * o null si la cuenta no pertenece a ninguna app (ej. solo ve OC Tracker).
 */
export function seedAppSessionFromEmail(email, serverInfo) {
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return null;

  localStorage.setItem(GLOBAL_EMAIL_KEY, normalized);
  if (serverInfo?.rol) localStorage.setItem(GLOBAL_WHITELIST_ROL_KEY, serverInfo.rol);

  const cuenta = resolverCuenta(normalized, serverInfo);
  if (!cuenta) {
    localStorage.removeItem(GLOBAL_APP_KEY);
    return null;
  }

  localStorage.setItem(GLOBAL_APP_KEY, cuenta.app);

  if (cuenta.app === 'vale-express') {
    const id = serverInfo?.id ?? normalized;
    localStorage.setItem('ve_session', JSON.stringify(buildVeSession(id, normalized, cuenta)));
    localStorage.setItem(
      `${VE_ROLE_CACHE_PREFIX}db-${id}`,
      JSON.stringify({
        role: cuenta.appRol,
        obras: cuenta.appConfig?.obras || [],
        restrictObras: cuenta.appConfig?.restrictObras === true,
      })
    );
    return { app: 'vale-express', dashboardPath: '/vale-express/dashboard' };
  }

  if (cuenta.app === 'portal-proveedor') {
    const id = serverInfo?.id ?? normalized;
    localStorage.setItem('pp_session', JSON.stringify(buildPpSession(id, normalized, cuenta)));
    return {
      app: 'portal-proveedor',
      dashboardPath: cuenta.appRol === 'super_admin' ? '/portal-proveedor/super-admin-filter' : '/portal-proveedor/dashboard',
    };
  }

  return null;
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
