/** Las tres formas de despacho que admite una Orden de Compra. */
export const DESPACHO_LABELS = {
  PROVEEDOR: "Por cuenta del proveedor",
  RETIRO_CLIENTE: "Retiro por parte del cliente",
  SIN_DESPACHO: "No genera despacho (servicio)",
};

/** Linea legible para mostrar en pantalla e imprimir en el documento. */
export function formatearDespacho(despacho) {
  if (despacho.tipo === "PROVEEDOR") {
    return `${DESPACHO_LABELS.PROVEEDOR} — Dirección: ${despacho.direccion?.trim() || "No especificada"}`;
  }
  return DESPACHO_LABELS[despacho.tipo];
}
