"use client";

import { useState, useEffect, useCallback } from 'react';
import { storage } from '@/lib/storage';

const STORAGE_KEY = 'portal_vdv_users';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useUserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(null);

  const load = useCallback(async () => {
    try {
      const result = await storage().k(STORAGE_KEY).get();
      const data = result.value;
      setVersion(result.version);
      if (data && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        setUsers([]);
      }
    } catch (err) {
      console.error('Error loading users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (updatedUsers) => {
    try {
      await storage().k(STORAGE_KEY).v(version).set({ users: updatedUsers });
      // Re-read to get fresh version
      const result = await storage().k(STORAGE_KEY).get();
      setVersion(result.version);
      setUsers(updatedUsers);
      return true;
    } catch (err) {
      console.error('Error saving users:', err);
      // Reload to get fresh state
      await load();
      return false;
    }
  }, [version, load]);

  const addUser = useCallback(async (userData) => {
    const newUser = {
      id: generateId(),
      name: userData.name,
      mondayUserId: userData.mondayUserId || null,
      email: userData.email || '',
      photoUrl: userData.photoUrl || '',
      role: userData.role,
      allowedObras: userData.allowedObras || [],
      allowedProveedores: userData.allowedProveedores || [],
      canGrantSubAccess: userData.canGrantSubAccess || false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...users, newUser];
    const ok = await save(updated);
    return ok ? newUser : null;
  }, [users, save]);

  const updateUser = useCallback(async (userId, updates) => {
    const updated = users.map((u) => u.id === userId ? { ...u, ...updates } : u);
    return save(updated);
  }, [users, save]);

  const deleteUser = useCallback(async (userId) => {
    const updated = users.filter((u) => u.id !== userId);
    return save(updated);
  }, [users, save]);

  const getAdminUsers = useCallback(() => {
    return users.filter((u) => u.role === 'admin');
  }, [users]);

  const getSubUsers = useCallback(() => {
    return users.filter((u) => u.role === 'subcontratista');
  }, [users]);

  return {
    users,
    loading,
    addUser,
    updateUser,
    deleteUser,
    getAdminUsers,
    getSubUsers,
    reload: load,
  };
}
