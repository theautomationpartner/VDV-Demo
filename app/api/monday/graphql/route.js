import { verificarSessionToken, MondayAuthError } from "@/lib/server/monday-guard";

const MONDAY_API_URL = "https://api.monday.com/v2";

/**
 * Proxy server-side hacia la API GraphQL real de monday.com.
 * El token nunca se expone al cliente: el navegador solo le pega a esta ruta.
 */
export async function POST(request) {
  try {
    verificarSessionToken(request.headers.get("authorization"));
  } catch (err) {
    if (err instanceof MondayAuthError) {
      return Response.json({ errors: [{ message: err.message }] }, { status: 401 });
    }
    throw err;
  }

  const token = process.env.MONDAY_API_TOKEN;

  if (!token) {
    return Response.json(
      { errors: [{ message: "MONDAY_API_TOKEN no esta configurado en .env.local" }] },
      { status: 501 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ errors: [{ message: "Body invalido, se esperaba JSON" }] }, { status: 400 });
  }

  const { query, variables } = body ?? {};
  if (!query || typeof query !== "string") {
    return Response.json({ errors: [{ message: "Falta 'query' (string GraphQL)" }] }, { status: 400 });
  }

  const mondayRes = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });

  const data = await mondayRes.json().catch(() => ({
    errors: [{ message: `Respuesta no-JSON de monday.com (status ${mondayRes.status})` }],
  }));

  return Response.json(data, { status: mondayRes.status });
}
