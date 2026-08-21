"use client";

/**
 * Fuente unica de las 8 cuentas fijas por rol (ver app/vale-express/page.jsx y
 * app/portal-proveedor/page.jsx para el detalle de cada rol). El login global
 * (whitelist + 2FA, ver components/auth/AuthGate.jsx) ya sabe con que email
 * entraste, asi que estas mismas cuentas se usan para autocompletar la sesion
 * de cada app - no tiene sentido volver a pedir el email ahi adentro.
 */

export const VALE_EXPRESS_ACCOUNTS = {
  'superadmin.valeexpress@demo.vdv.cl': { id: 'demo-ve-super-admin', name: 'Super Admin' },
  'admin.valeexpress@demo.vdv.cl': { id: 'demo-ve-admin', name: 'Administrador' },
  'bodega.valeexpress@demo.vdv.cl': { id: 'demo-ve-bodeguero', name: 'Bodeguero' },
  'jefeobra.valeexpress@demo.vdv.cl': { id: 'demo-ve-jefe-obra', name: 'Jefe de Obra' },
  'apr.valeexpress@demo.vdv.cl': { id: 'demo-ve-apr', name: 'APR' },
};

export const PORTAL_PROVEEDOR_ACCOUNTS = {
  'superadmin.portalproveedor@demo.vdv.cl': { id: 'demo-pp-super-admin', name: 'Super Admin', role: 'super_admin', proveedorName: null },
  'admin.portalproveedor@demo.vdv.cl': { id: 'demo-pp-admin', name: 'Administrador', role: 'admin', proveedorName: null },
  'subcontratista.portalproveedor@demo.vdv.cl': { id: 'demo-pp-subcontratista', name: 'Subcontratista', role: 'subcontratista', proveedorName: null },
};

function buildVeSession(email, account) {
  return {
    userId: account.id,
    userName: account.name,
    email,
    loginTime: new Date().toISOString(),
  };
}

function buildPpSession(account) {
  return {
    role: account.role,
    mondayUserId: account.id,
    adminName: account.name,
    adminPhoto: null,
    proveedorName: account.proveedorName,
    adminUserId: null,
    allowedObras: null,
    allowedProveedores: null,
    canGrantSubAccess: false,
  };
}

/**
 * Escribe en localStorage la sesion de la app que corresponda a ese email (si
 * es una de las 8 cuentas fijas). Devuelve a que app pertenece (para poder
 * redirigir directo al dashboard despues de loguearse), o null si el email no
 * matchea ninguna cuenta de app (ej. una cuenta que solo puede ver OC Tracker).
 */
export function seedAppSessionFromEmail(email) {
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return null;

  const ve = VALE_EXPRESS_ACCOUNTS[normalized];
  if (ve) {
    localStorage.setItem('ve_session', JSON.stringify(buildVeSession(normalized, ve)));
    return { app: 'vale-express', dashboardPath: '/vale-express/dashboard' };
  }

  const pp = PORTAL_PROVEEDOR_ACCOUNTS[normalized];
  if (pp) {
    localStorage.setItem('pp_session', JSON.stringify(buildPpSession(pp)));
    return {
      app: 'portal-proveedor',
      dashboardPath: pp.role === 'super_admin' ? '/portal-proveedor/super-admin-filter' : '/portal-proveedor/dashboard',
    };
  }

  return null;
}
