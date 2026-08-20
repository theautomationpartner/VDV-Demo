import { promises as fs } from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "storage.json");

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

export async function GET(_request, { params }) {
  const { key } = await params;
  const all = await readAll();
  const entry = all[key] ?? { value: null, version: 0 };
  return Response.json(entry);
}

export async function PUT(request, { params }) {
  const { key } = await params;
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
