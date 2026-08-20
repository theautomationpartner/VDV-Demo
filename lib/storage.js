"use client";

/**
 * Reconstruccion de "@skills/monday-storage.jsx" (Storage API de las apps de monday),
 * con el mismo contrato: storage().k(key).get() / storage().k(key).v(version).set(value).
 * Por debajo persiste en un JSON local via /api/storage/[key] en vez de en el storage
 * nativo de monday (que requiere contexto de app instalada dentro del iframe).
 */

class StorageKey {
  constructor(key) {
    this.key = key;
    this._version = undefined;
  }
  v(version) {
    this._version = version;
    return this;
  }
  async get() {
    const res = await fetch(`/api/storage/${encodeURIComponent(this.key)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Error al leer storage");
    return json;
  }
  async set(value) {
    const res = await fetch(`/api/storage/${encodeURIComponent(this.key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value, version: this._version }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Error al guardar en storage");
    return json;
  }
}

export function storage() {
  return {
    k(key) {
      return new StorageKey(key);
    },
  };
}
