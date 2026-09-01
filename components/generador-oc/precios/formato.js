/** Formateadores compartidos del modulo de precios. */

export function formatoMoneda(valor, moneda) {
  if (!Number.isFinite(valor)) return "—";
  if (moneda === "CLP") return `$ ${Math.round(valor).toLocaleString("es-CL")}`;
  if (moneda === "UF") {
    return `UF ${valor.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${moneda} ${valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatoPorcentaje(valor) {
  const signo = valor > 0 ? "+" : "";
  return `${signo}${valor.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Una fecha sin hora ("2026-08-25") la lee JavaScript como medianoche UTC, y al
 * mostrarla en Chile o Argentina retrocede al dia anterior. Agregarle la hora la
 * deja en la zona de quien mira.
 *
 * Hoy al historial de precios le llega la fecha CON hora, asi que no se rompe;
 * esto es para que siga sin romperse si algun dia le llega una fecha pelada.
 */
function aFecha(iso) {
  const texto = String(iso);
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T00:00:00` : texto);
}

export function formatoFecha(iso) {
  if (!iso) return "—";
  const fecha = aFecha(iso);
  if (!Number.isFinite(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatoFechaCorta(iso) {
  if (!iso) return "—";
  const fecha = aFecha(iso);
  if (!Number.isFinite(fecha.getTime())) return "—";
  return fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

/** El semaforo de precios, segun el tipo de alerta. */
export const ESTILO_ALERTA = {
  ALERTA: {
    caja: "border-[hsl(var(--precio-alto)/0.35)] bg-[hsl(var(--precio-alto-soft))]",
    texto: "text-[hsl(var(--precio-alto))]",
  },
  ADVERTENCIA: {
    caja: "border-[hsl(var(--precio-medio)/0.35)] bg-[hsl(var(--precio-medio-soft))]",
    texto: "text-[hsl(var(--precio-medio))]",
  },
  BUENO: {
    caja: "border-[hsl(var(--precio-bueno)/0.3)] bg-[hsl(var(--precio-bueno-soft))]",
    texto: "text-[hsl(var(--precio-bueno))]",
  },
  INFO: {
    caja: "border-border bg-muted/60",
    texto: "text-muted-foreground",
  },
  SIN_DATOS: {
    caja: "border-border bg-muted/40",
    texto: "text-muted-foreground",
  },
};
