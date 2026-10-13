"use client";

import { AlertTriangle, Check, Clock3, FileText, Loader2 } from "lucide-react";
import { ENVIO, COMPARACION, TONO_ENVIO, TONO_COMPARACION } from "@/lib/spm/dominio";

const TONOS = {
  neutro: "border-[var(--border-default)] text-[var(--fg-muted)]",
  curso: "border-[var(--accent)] text-[var(--accent)]",
  ok: "border-[var(--success)] text-[var(--success)]",
  error: "border-[var(--danger)] text-[var(--danger)]",
};

const ICONO = {
  [ENVIO.BORRADOR]: FileText,
  [ENVIO.POR_ENVIAR]: Loader2,
  [ENVIO.ENVIADO]: Check,
  [ENVIO.ERROR]: AlertTriangle,
  [COMPARACION.PENDIENTE]: Clock3,
  [COMPARACION.POR_COMPARAR]: Clock3,
  [COMPARACION.COMPARANDO]: Loader2,
  [COMPARACION.COMPARADO]: Check,
  [COMPARACION.ERROR]: AlertTriangle,
};

/**
 * La pastilla de un estado de envio o de comparacion.
 *
 * Los dos estados DE PASO -"Por enviar" y "Comparando"- llevan el icono girando
 * a proposito: dicen "esto esta pasando ahora", que es justo lo que hace que
 * alguien se de cuenta de que algo se quedo trabado si sigue girando mañana.
 */
export function Estado({ valor, tipo = "envio" }) {
  if (!valor) return <span className="text-xs text-[var(--fg-subtle)]">—</span>;

  const tono = (tipo === "envio" ? TONO_ENVIO : TONO_COMPARACION)[valor] ?? "neutro";
  const Icono = ICONO[valor] ?? Clock3;
  const girando = valor === ENVIO.POR_ENVIAR || valor === COMPARACION.COMPARANDO;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONOS[tono]}`}
    >
      <Icono className={`h-3 w-3 shrink-0 ${girando ? "animate-spin" : ""}`} aria-hidden />
      {valor}
    </span>
  );
}
