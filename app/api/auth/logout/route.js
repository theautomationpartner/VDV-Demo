import { cerrarSesion } from "@/lib/server/session";

export async function POST() {
  await cerrarSesion();
  return Response.json({ ok: true });
}
