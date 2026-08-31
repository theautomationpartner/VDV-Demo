import { getBoardSchema, resolveColumnId } from "@/lib/board-schemas";
import { mondayFetch, getBoardIdOrThrow } from "@/lib/server/monday-client";
import { extraerCodigoDeComentarios } from "@/lib/generador-oc/firma";

const BOARD_KEY = "OrdenesDeCompraMaxxaBoard";

/**
 * Forma del codigo de validacion que estampa el PDF: VDV-2189-A1B2C3D4-E5F6A7B8
 * (ver lib/generador-oc/firma.js).
 */
const FORMA_CODIGO = /^VDV-\d+-[0-9A-F]{8}-[0-9A-F]{8}$/;

/** Nada que no este impreso en el propio documento que el proveedor ya tiene. */
const CAMPOS_PUBLICOS = [
  "numeroOc",
  "obra",
  "monto",
  "moneda",
  "proveedores",
  "estadoDocumento",
  "validezDocumento",
  "comentarios",
  "responsable",
];

/**
 * Validacion publica de una Orden de Compra: es lo que hay detras del QR
 * impreso en cada OC.
 *
 * PUBLICA A PROPOSITO, sin sesion: quien escanea el QR es el proveedor, que no
 * tiene cuenta en VDV Suite. Ponerlo detras del login dejaria el QR inservible
 * (es el mismo problema que tuvimos con los PDF de contratos, que llevaban a la
 * pantalla de login de monday).
 *
 * Como no hay login, hay dos limites deliberados:
 *
 *  1. Sin un codigo con la forma correcta no se responde nada. El id de item de
 *     monday es un numero de 11 digitos y sin esto se podrian ir probando ids
 *     al azar para leer montos y proveedores de todas las ordenes de la cuenta.
 *     Quien viene del QR siempre trae el codigo en el enlace.
 *  2. Solo se devuelven los campos que ya estan impresos en el documento que el
 *     proveedor tiene en la mano. Nada de comentarios internos ni de lineas.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  const codigo = searchParams.get("codigo");

  if (!itemId || !codigo || !FORMA_CODIGO.test(codigo)) {
    return Response.json({ encontrada: false });
  }

  try {
    const schema = getBoardSchema(BOARD_KEY);
    getBoardIdOrThrow(schema, BOARD_KEY);
    const ids = CAMPOS_PUBLICOS.map((k) => resolveColumnId(BOARD_KEY, k));

    const data = await mondayFetch(
      `query ($itemId: [ID!]) {
        items(ids: $itemId) {
          id
          created_at
          column_values(ids: ${JSON.stringify(ids)}) {
            id text
            ... on BoardRelationValue { display_value }
          }
        }
      }`,
      { itemId: [String(itemId)] },
    );

    const item = data.items?.[0];
    if (!item) return Response.json({ encontrada: false });

    const valor = (clave) => {
      const columnId = resolveColumnId(BOARD_KEY, clave);
      const cv = item.column_values.find((c) => c.id === columnId);
      return cv?.display_value || cv?.text || "";
    };

    const codigoGuardado = extraerCodigoDeComentarios(valor("comentarios"));
    const monto = parseFloat(valor("monto"));
    // "2026-08-31 - 2026-09-30" -> la fecha de emision es la primera.
    const emision = valor("validezDocumento").split(" - ")[0] || null;

    return Response.json({
      encontrada: true,
      autentica: Boolean(codigoGuardado) && codigo === codigoGuardado,
      numeroOc: valor("numeroOc"),
      obra: valor("obra"),
      monto: Number.isFinite(monto) ? monto : 0,
      moneda: valor("moneda") || "CLP",
      proveedor: valor("proveedores"),
      estado: valor("estadoDocumento"),
      fechaEmision: emision,
      responsable: valor("responsable"),
    });
  } catch (error) {
    console.error("[generador-oc] No se pudo validar la OC:", error?.message);
    return Response.json({ encontrada: false });
  }
}
