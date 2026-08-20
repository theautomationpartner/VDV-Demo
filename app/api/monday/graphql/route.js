import { verificarAcceso, accesoErrorToResponse, AccesoError } from "@/lib/server/auth-guard";
import { demoMoveItemToGroup } from "@/lib/server/demo-data";

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEMO_MODE = process.env.DEMO_MODE === "true";
const AUTH_LAYERS_ENABLED = process.env.AUTH_LAYERS_ENABLED === "true";

/**
 * Proxy server-side hacia la API GraphQL real de monday.com.
 * El token nunca se expone al cliente: el navegador solo le pega a esta ruta.
 */
export async function POST(request) {
  if (!DEMO_MODE && AUTH_LAYERS_ENABLED) {
    try {
      verificarAcceso(request);
    } catch (err) {
      if (err instanceof AccesoError) return accesoErrorToResponse(err);
      throw err;
    }
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ errors: [{ message: "Body invalido, se esperaba JSON" }] }, { status: 400 });
  }

  if (DEMO_MODE) {
    const { query, variables } = body ?? {};
    // Paginacion cruda (next_items_page): las fixtures de demo entran enteras en la
    // primera pagina via /api/monday/board, asi que aca no hay nada mas que devolver.
    if (query?.includes("next_items_page")) {
      return Response.json({ data: { next_items_page: { cursor: null, items: [] } } });
    }
    // Rechazo de vale en vales-pendientes: mueve el item a "VALES RECHAZADOS".
    if (query?.includes("move_item_to_group")) {
      const result = demoMoveItemToGroup(variables?.itemId, variables?.groupId);
      return Response.json({ data: { move_item_to_group: result } });
    }
    return Response.json({ data: {} });
  }

  const token = process.env.MONDAY_API_TOKEN;

  if (!token) {
    return Response.json(
      { errors: [{ message: "MONDAY_API_TOKEN no esta configurado en .env.local" }] },
      { status: 501 }
    );
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
