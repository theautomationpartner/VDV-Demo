"use client";

/**
 * Reconstruccion de "@api/BoardSDK" y "@api/api-methods" del framework original de
 * monday Vibe. Expone el mismo contrato encadenado que usaban las 3 apps originales
 * (board.items().withColumns().where().withPagination().execute(), board.item(id).update()...,
 * board.item().create().inGroup().returnColumns().execute(), board.users.me().execute(), etc.)
 * pero por debajo le pega a nuestras propias rutas server-side (/api/monday/board y
 * /api/monday/graphql), que son las unicas que conocen el MONDAY_API_TOKEN real.
 */

import { authHeader } from "@/lib/monday-auth";

// JSON no tiene tipo Date: el server convierte columnas "date" a Date, pero al
// viajar por la red vuelven a ser un string ISO. Este reviver las reconstruye
// del lado del cliente, para que el codigo migrado pueda seguir llamando
// .toLocaleDateString() directo sobre esos campos, como hacia el original.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function reviveDates(key, value) {
  return typeof value === "string" && ISO_DATE_RE.test(value) ? new Date(value) : value;
}

async function callBoardApi(boardKey, op, params) {
  const res = await fetch("/api/monday/board", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ boardKey, op, params }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text, reviveDates);
  } catch {
    json = {};
  }
  if (!res.ok) {
    throw new Error(json.error ?? `Error en /api/monday/board (status ${res.status})`);
  }
  return json.result;
}

export async function executeGraphQL(query, variables = {}) {
  const res = await fetch("/api/monday/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return json.data;
}

class ItemsQueryBuilder {
  constructor(boardKey) {
    this.boardKey = boardKey;
    this._columns = [];
    this._where = {};
    this._limit = 100;
    this._cursor = null;
  }
  withColumns(columns) {
    this._columns = columns;
    return this;
  }
  where(condition) {
    this._where = { ...this._where, ...condition };
    return this;
  }
  withPagination({ limit, cursor } = {}) {
    if (limit != null) this._limit = limit;
    if (cursor !== undefined) this._cursor = cursor;
    return this;
  }
  async execute() {
    return callBoardApi(this.boardKey, "items", {
      columns: this._columns,
      where: this._where,
      limit: this._limit,
      cursor: this._cursor,
    });
  }
}

class ItemMutator {
  constructor(boardKey, itemId) {
    this.boardKey = boardKey;
    this.itemId = itemId;
    this._values = null;
  }
  update(values) {
    this._values = values;
    return this;
  }
  async execute() {
    return callBoardApi(this.boardKey, "itemUpdate", {
      itemId: this.itemId,
      values: this._values ?? {},
    });
  }
  async uploadFile({ columnId, file }) {
    const formData = new FormData();
    formData.append("itemId", String(this.itemId));
    formData.append("columnId", columnId);
    formData.append("file", file);
    const res = await fetch("/api/monday/upload", {
      method: "POST",
      headers: await authHeader(),
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data?.add_file_to_column;
  }
}

class ItemCreator {
  constructor(boardKey) {
    this.boardKey = boardKey;
    this._name = "";
    this._values = {};
    this._groupId = null;
    this._returnColumns = [];
  }
  create(payload) {
    const { name, ...rest } = payload ?? {};
    this._name = name ?? "";
    this._values = rest;
    return this;
  }
  inGroup(groupId) {
    this._groupId = groupId;
    return this;
  }
  returnColumns(columns) {
    this._returnColumns = columns;
    return this;
  }
  async execute() {
    return callBoardApi(this.boardKey, "itemCreate", {
      name: this._name,
      groupId: this._groupId,
      values: this._values,
      returnColumns: this._returnColumns,
    });
  }
}

class UsersQuery {
  constructor(boardKey) {
    this.boardKey = boardKey;
    this._limit = 200;
    this._me = false;
  }
  me() {
    this._me = true;
    return this;
  }
  withPagination({ limit } = {}) {
    if (limit != null) this._limit = limit;
    return this;
  }
  async execute() {
    if (this._me) return callBoardApi(this.boardKey, "usersMe", {});
    return callBoardApi(this.boardKey, "usersList", { limit: this._limit });
  }
}

class BoardBase {
  constructor(boardKey) {
    this.boardKey = boardKey;
  }
  items() {
    return new ItemsQueryBuilder(this.boardKey);
  }
  item(id) {
    return id != null ? new ItemMutator(this.boardKey, id) : new ItemCreator(this.boardKey);
  }
  get users() {
    return new UsersQuery(this.boardKey);
  }
  async executeGraphQL(query, variables) {
    return executeGraphQL(query, variables);
  }
}

function defineBoard(boardKey) {
  return class extends BoardBase {
    constructor() {
      super(boardKey);
    }
  };
}

export const OrdenesDeCompraMaxxaBoard = defineBoard("OrdenesDeCompraMaxxaBoard");
export const FacturasIaBoard = defineBoard("FacturasIaBoard");
export const BaseDeDatosMaterialesBoard = defineBoard("BaseDeDatosMaterialesBoard");
export const IngresosBoard = defineBoard("IngresosBoard");
export const ValesBoard = defineBoard("ValesBoard");
export const ProveedoresBoard = defineBoard("ProveedoresBoard");
export const PagosVdvBoard = defineBoard("PagosVdvBoard");
export const FlujoContratacionSubcontratoBoard = defineBoard("FlujoContratacionSubcontratoBoard");
export const EstadosDePagoSubcontratosBoard = defineBoard("EstadosDePagoSubcontratosBoard");
