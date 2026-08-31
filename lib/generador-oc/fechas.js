/** Fechas y forma de pago de la Orden de Compra. */

/** Dias de validez que ofrece el formulario. */
export const VALIDEZ_OPCIONES = [30, 45, 60, 90];

/** Plazos de credito que ofrece el formulario. */
export const CREDITO_OPCIONES = [30, 60];

/** Hoy en YYYY-MM-DD, en la zona horaria del navegador. */
export function hoyISO() {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000);
  return local.toISOString().split("T")[0] ?? "";
}

/** Suma dias a una fecha YYYY-MM-DD y devuelve el mismo formato. */
export function sumarDias(fechaISO, dias) {
  const base = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(base.getTime())) return fechaISO;
  base.setDate(base.getDate() + dias);
  const local = new Date(base.getTime() - base.getTimezoneOffset() * 60_000);
  return local.toISOString().split("T")[0] ?? fechaISO;
}

/**
 * Fecha larga en espanol. El "T00:00:00" no es decorativo: sin el,
 * new Date("2026-08-05") se interpreta como medianoche UTC y en Chile se
 * muestra el dia anterior.
 */
export function fechaLarga(fechaISO) {
  const fecha = new Date(`${fechaISO}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return fechaISO;
  return fecha.toLocaleDateString("es-CL", { year: "numeric", month: "long", day: "numeric" });
}

/** Texto de la forma de pago, para el documento y para el registro en monday. */
export function formatearPago(pago) {
  return pago.credito ? `Crédito ${pago.dias} días` : "Contado";
}
