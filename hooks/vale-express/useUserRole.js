"use client";

import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';
import { getCachedVeRole } from '@/lib/client/fixed-accounts';

const ROLES_KEY = 'warehouse_user_roles';

export const ROLES = {
    super_admin: { label: 'Super Admin', description: 'Acceso total, gestión de roles y obras' },
    admin: { label: 'Administrador', description: 'Puede ver y operar todo, sin gestionar roles' },
    bodeguero: { label: 'Bodeguero', description: 'Solo ingreso de materiales' },
    jefe_obra: { label: 'Jefe de Obra', description: 'Solo solicitud de materiales' },
    apr: { label: 'APR', description: 'Solo solicitud de materiales' },
    viewer: { label: 'Visualizador (Prueba)', description: 'Solo puede ver, no puede crear ni editar nada' }
};

// Cuentas fijas que no dependen de storage.json (que en Vercel no persiste): la de
// solo lectura (login con admin@test.com) y las de la cuenta demo con datos 100%
// inventados (ver lib/server/demo-data.js DEMO_USERS / DEMO_MODE). Se resuelven
// siempre igual sin importar lo que haya guardado en storage.
const FIXED_ROLE_DATA = {
    'test-viewer': { role: 'viewer', obras: [], restrictObras: false },
    'demo-ve-super-admin': { role: 'super_admin', obras: [], restrictObras: false },
    'demo-ve-admin': { role: 'admin', obras: [], restrictObras: false },
    'demo-ve-bodeguero': { role: 'bodeguero', obras: [], restrictObras: false },
    'demo-ve-jefe-obra': { role: 'jefe_obra', obras: [], restrictObras: false },
    'demo-ve-apr': { role: 'apr', obras: [], restrictObras: false },
};

export function getUserRoleData(roles, userId) {
    const fixed = FIXED_ROLE_DATA[String(userId)];
    if (fixed) return fixed;
    // Cuentas reales (whitelist en la DB, userId tipo "db-<id>"): el rol lo
    // resolvio el servidor en el login y lo cacheo seedAppSessionFromEmail -
    // administrable desde /admin/whitelist, sin tocar codigo ni storage.json.
    const cached = getCachedVeRole(String(userId));
    if (cached) return cached;
    return roles[String(userId)] || null;
}

export const ALL_OBRAS = [
    "PL 46-50", "VIK", "SAMOA", "IVA", "SELMAN", "NUEVO", "HUELEN", "ALAIA",
    "LEON 3355", "M506", "QUINCHO PDA 5007", "Marketing", "TIENDA PILATES",
    "CERRO COLORADO", "ADOLFO IBAÑEZ 270", "R20", "M388", "CHATEAU PAPUDO",
    "VICTORIA", "OFICINA CENTRAL", "CARMEN FARIÑA", "LAS PESEBRERAS", "CASA MARK",
    "RAFAEL CAÑAS", "DUNKERQUE", "TOMAS DUCH", "MANQUEHUE", "FORESTAL", "ACHIRAS",
    ". JUAN XXIII", "ALAIA 2", "ROSA R"
];

/**
 * DATA FORMAT:
 * New: { "userId": { role: "admin", obras: [], restrictObras: false } }
 *      - restrictObras: false -> all obras (default)
 *      - restrictObras: true  -> only the obras in the array
 *
 * Old (backward compat): { "userId": "admin" } -> treated as no restrictions
 */

export function getRoleFromData(data) {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (typeof data === 'object') return data.role || null;
    return null;
}

export function getObrasFromData(data) {
    if (!data) return [];
    if (typeof data === 'string') return [];
    if (typeof data === 'object') return data.obras || [];
    return [];
}

export function isObrasRestricted(data) {
    if (!data) return false;
    if (typeof data === 'string') return false;
    if (typeof data === 'object') return data.restrictObras === true;
    return false;
}

export async function getAllRoles() {
    try {
        const { value, version } = await storage().k(ROLES_KEY).get();
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return { roles: parsed || {}, version };
    } catch (err) {
        console.error('[ROLES] Error loading roles:', err);
        return { roles: {}, version: null };
    }
}

export async function saveAllRoles(roles) {
    try {
        const { version } = await storage().k(ROLES_KEY).get();
        await storage().k(ROLES_KEY).v(version).set(roles);
        return true;
    } catch (err) {
        console.error('[ROLES] Error saving roles:', err);
        return false;
    }
}

export function useUserRole(userId) {
    const [role, setRole] = useState(null);
    const [obras, setObras] = useState([]);
    const [restrictObras, setRestrictObras] = useState(false);
    const [loading, setLoading] = useState(true);
    const [allRoles, setAllRoles] = useState({});

    const loadRole = useCallback(async () => {
        if (!userId) {
            setLoading(false);
            return;
        }

        try {
            const { roles } = await getAllRoles();
            setAllRoles(roles);
            const userData = getUserRoleData(roles, userId);
            const userRole = getRoleFromData(userData);
            const userObras = getObrasFromData(userData);
            const restricted = isObrasRestricted(userData);
            setRole(userRole);
            setObras(userObras);
            setRestrictObras(restricted);
        } catch (err) {
            console.error('[ROLES] Error loading user role:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        loadRole();
    }, [loadRole]);

    const hasAccess = useCallback((requiredRoles) => {
        if (!role) return false;
        if (role === 'admin') return true;
        return requiredRoles.includes(role);
    }, [role]);

    return { role, obras, restrictObras, loading, allRoles, hasAccess, reload: loadRole };
}

export function canAccessIngreso(role) {
    if (!role) return false;
    const r = typeof role === 'string' ? role : role?.role;
    return r === 'super_admin' || r === 'admin' || r === 'bodeguero';
}

export function canAccessSolicitud(role) {
    if (!role) return true; // Allow users without explicit role to request materials
    const r = typeof role === 'string' ? role : role?.role;
    return r === 'super_admin' || r === 'admin' || r === 'jefe_obra' || r === 'apr';
}

/**
 * Can view pending vales. Bodeguero/Admin/Super Admin can edit/deliver.
 * Jefe de Obra and APR can view only (read-only).
 */
export function canAccessValesPendientes(role) {
    if (!role) return false;
    const r = typeof role === 'string' ? role : role?.role;
    return r === 'super_admin' || r === 'admin' || r === 'bodeguero' || r === 'jefe_obra' || r === 'apr' || r === 'viewer';
}

/**
 * Can edit/deliver/reject vales. Only bodeguero, admin, super_admin.
 */
export function canEditVales(role) {
    if (!role) return false;
    const r = typeof role === 'string' ? role : role?.role;
    return r === 'super_admin' || r === 'admin' || r === 'bodeguero';
}

/**
 * Can see the admin panel. Super Admin and Admin can view.
 */
export function canAccessAdmin(role) {
    if (!role) return false;
    const r = typeof role === 'string' ? role : role?.role;
    // El original (code-text/Vale Express.txt) nunca le daba entrada al panel
    // de administracion de roles al rol "viewer" ("Visualizador (Prueba):
    // solo puede ver, no puede crear ni editar nada") - la migracion lo habia
    // agregado por error, exponiendole la lista completa de usuarios/roles/
    // obras asignadas a una cuenta que deberia ser de solo lectura sobre los
    // datos operativos, no sobre la configuracion de acceso del sistema.
    return r === 'super_admin' || r === 'admin';
}

/**
 * Can manage roles and obra assignments. Super Admin only.
 */
export function canManageRoles(role) {
    if (!role) return false;
    const r = typeof role === 'string' ? role : role?.role;
    return r === 'super_admin';
}

/**
 * Can view stock page. All roles can view (restricted by their obras).
 */
export function canAccessStock(role) {
    if (!role) return false;
    const r = typeof role === 'string' ? role : role?.role;
    return r === 'super_admin' || r === 'admin' || r === 'bodeguero' || r === 'jefe_obra' || r === 'apr' || r === 'viewer';
}

/**
 * Returns the list of obras a user can access.
 * Super Admin / Admin = ALL, restrictObras false = ALL, restrictObras true = only the listed obras.
 * Users without role assignment default to ALL obras (backward compatibility).
 */
export function getAllowedObras(role, obras, restricted) {
    if (role === 'super_admin' || role === 'admin') return ALL_OBRAS;
    if (!role) return ALL_OBRAS; // Users without explicit role get all obras
    if (!restricted) return ALL_OBRAS;
    if (!obras || obras.length === 0) return []; // restricted but none selected = no access
    return obras;
}
