"use client";

import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';

const STORAGE_KEY = 'portal_super_admins';

// In-memory cache so multiple components don't re-fetch
let cachedIds = null;
let cachedVersion = null;

/**
 * List of monday.com user IDs designated as Super Admins.
 * Starts empty - the first user to access the app when no super admins
 * exist gets auto-promoted (bootstrap flow).
 */
export let SUPER_ADMIN_IDS = [];

/**
 * Load super admin IDs from storage (call once at app start).
 */
export async function loadSuperAdminIds() {
  try {
    const { value, version } = await storage().k(STORAGE_KEY).get();
    cachedVersion = version;
    if (value && Array.isArray(value)) {
      SUPER_ADMIN_IDS = value.map(String);
      cachedIds = [...SUPER_ADMIN_IDS];
    }
  } catch (err) {
    console.error('Error loading super admin IDs:', err);
  }
  return SUPER_ADMIN_IDS;
}

/**
 * Add a user ID to the super admin list.
 */
export async function addSuperAdmin(userId) {
  const id = String(userId);
  if (SUPER_ADMIN_IDS.includes(id)) return;
  SUPER_ADMIN_IDS = [...SUPER_ADMIN_IDS, id];
  cachedIds = [...SUPER_ADMIN_IDS];
  try {
    const { version } = await storage().k(STORAGE_KEY).get();
    await storage().k(STORAGE_KEY).v(version).set(SUPER_ADMIN_IDS);
  } catch (err) {
    console.error('Error saving super admin:', err);
  }
}

/**
 * Hook that loads super admin IDs and provides bootstrap check.
 */
export function useSuperAdmins() {
  const [ids, setIds] = useState(cachedIds || []);
  const [loading, setLoading] = useState(cachedIds === null);

  useEffect(() => {
    if (cachedIds !== null) {
      setIds(cachedIds);
      setLoading(false);
      return;
    }
    loadSuperAdminIds().then((loaded) => {
      setIds(loaded);
      setLoading(false);
    });
  }, []);

  const bootstrap = useCallback(async (userId) => {
    await addSuperAdmin(userId);
    setIds([...SUPER_ADMIN_IDS]);
  }, []);

  return { ids, loading, bootstrap };
}
