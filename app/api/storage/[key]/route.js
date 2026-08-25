import { promises as fs } from "fs";
import path from "path";
import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";

const DATA_FILE = path.join(process.cwd(), "data", "storage.json");
const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Storage generico key/value (ver lib/storage.js) usado hoy para dos cosas
 * sensibles: roles de Vale Express y usuarios de Portal Proveedor. Antes esta
 * ruta no exigia sesion ni rol - cualquiera con la URL podia leer/escribir
 * cualquier key, incluyendo autoasignarse "super_admin" (ver auditoria,
 * hallazgo #1). Politica: GET exige sesion + pertenecer a la app duena de la
 * key; PUT exige ademas el rol minimo de esa app. Una key sin politica
 * declarada rechaza PUT por default (fail-closed) - GET sigue abierto a
 * cualquier sesion valida, igual que antes, ya que no sabemos a que app
 * pertenece.
 */
const KEY_POLICY = {
  warehouse_user_roles: { app: "vale-express", writeRoles: ["super_admin"] },
  // usuarios/page.jsx:40 y super-admin-filter/page.jsx:58 bloquean esta pantalla
  // a todo rol que no sea super_admin - "admin" de portal-proveedor no gestiona
  // usuarios, solo ve sus propios datos.
  portal_vdv_users: { app: "portal-proveedor", writeRoles: ["super_admin"] },
};

class KeyAccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

function verificarAccesoKey(sesion, key, { write }) {
  const policy = KEY_POLICY[key];
  if (!policy) {
    if (write) throw new KeyAccessError(`No hay politica de escritura para "${key}".`);
    return;
  }
  const asignacion = sesion.asignaciones?.find((a) => a.app === policy.app);
  if (!asignacion) throw new KeyAccessError(`Tu cuenta no tiene acceso a "${policy.app}".`);
  if (write && !policy.writeRoles.includes(asignacion.appRol)) {
    throw new KeyAccessError(`Tu rol en "${policy.app}" no puede modificar "${key}".`);
  }
}

function guard(request, key, { write }) {
  if (DEMO_MODE || !AUTH_LAYERS_ENABLED) return; // mismo criterio que /api/monday/* (ver auth-guard.js)
  const sesion = verificarAcceso(request);
  verificarAccesoKey(sesion, key, { write });
}

async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeAll(data) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET(request, { params }) {
  const { key } = await params;
  try {
    guard(request, key, { write: false });
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    if (err instanceof KeyAccessError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const all = await readAll();
  const entry = all[key] ?? { value: null, version: 0 };
  return Response.json(entry);
}

export async function PUT(request, { params }) {
  const { key } = await params;
  try {
    guard(request, key, { write: true });
  } catch (err) {
    if (err instanceof AccesoError) return accesoErrorToResponse(err);
    if (err instanceof KeyAccessError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await request.json().catch(() => ({}));
  const { value, version } = body;

  const all = await readAll();
  const current = all[key] ?? { value: null, version: 0 };

  if (version !== undefined && version !== current.version) {
    return Response.json(
      { error: `Conflicto de version en "${key}": esperada ${current.version}, recibida ${version}` },
      { status: 409 }
    );
  }

  const nextVersion = current.version + 1;
  all[key] = { value, version: nextVersion };
  await writeAll(all);

  return Response.json({ version: nextVersion });
}
