/**
 * Firma digital de la OC: un codigo determinístico calculado con los datos
 * definitivos del documento en el momento de emitirlo. Queda guardado en la
 * orden, dentro de Comentarios, para poder recalcularlo y compararlo despues
 * desde la pagina publica de validacion.
 *
 * Que garantiza y que no: detecta que el PDF que alguien tiene en la mano no
 * coincide con lo que dice monday (numero, total, quien la emitio, cuando).
 * No es una firma criptografica - cualquiera con los mismos datos puede
 * recalcular el codigo. Es exactamente el mismo alcance que tenia en la Vibe.
 */

function fnv1a(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0");
}

/** La misma fecha usada aca tiene que guardarse junto al codigo. */
export function calcularCodigoValidacion({ numeroOc, total, userId, fechaIso }) {
  const payload = `${numeroOc}|${Math.round(total)}|${userId}|${fechaIso}`;
  return `VDV-${numeroOc}-${fnv1a(payload)}-${fnv1a(payload.split("").reverse().join(""))}`;
}

export const MARCA_CODIGO = "Código de validación:";

export function codificarLineaCodigo(codigo) {
  return `${MARCA_CODIGO} ${codigo}`;
}

export function extraerCodigoDeComentarios(comentarios) {
  if (!comentarios) return null;
  const match = comentarios.match(/Código de validación:\s*(\S+)/);
  return match?.[1] ?? null;
}
