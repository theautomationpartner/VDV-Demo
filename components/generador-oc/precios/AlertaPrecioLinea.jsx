"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, ExternalLink, LineChart, Info } from "lucide-react";
import { ESTILO_ALERTA, formatoFecha, formatoMoneda, formatoPorcentaje } from "./formato";

/**
 * El aviso que aparece debajo de una linea del detalle.
 *
 * No abre ventanas ni bloquea nada: informa la diferencia contra el mejor
 * precio reciente comparable. Quien compra puede tener razones para pagar mas
 * (plazo, despacho, disponibilidad) y la decision sigue siendo suya.
 */
export default function AlertaPrecioLinea({ analisis, moneda, onVerHistorial, urlDeRegistro }) {
  if (!analisis) return null;

  const { alerta, posibles, motivo, unidadComparacion, precioComparable, referenciaLista } =
    analisis;

  if (alerta.tipo === "SIN_DATOS") {
    // Sin compras anteriores, el precio de lista sirve de referencia.
    if (posibles === 0 && referenciaLista && referenciaLista.precio > 0) {
      const diff = ((precioComparable - referenciaLista.precio) / referenciaLista.precio) * 100;
      const sobre = diff > 0;
      return (
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs ${ESTILO_ALERTA.INFO.caja}`}
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            Sin compras previas. Precio de lista:{" "}
            <span className="font-medium tabular-nums">
              {formatoMoneda(referenciaLista.precio, moneda)}
            </span>
          </span>
          {Math.abs(diff) >= 1 && (
            <span className="text-muted-foreground">
              ({sobre ? "+" : ""}
              {diff.toFixed(1)}% {sobre ? "sobre" : "bajo"} lista)
            </span>
          )}
        </div>
      );
    }
    if (posibles > 0) {
      return (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${ESTILO_ALERTA.INFO.caja}`}
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>Hay compras posiblemente relacionadas.</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onVerHistorial}>
            Revisar
          </Button>
        </div>
      );
    }
    if (motivo) return <p className="text-xs text-muted-foreground">{motivo}</p>;
    return (
      <p className="text-xs text-muted-foreground">Sin historial comparable para este material.</p>
    );
  }

  const estilo = ESTILO_ALERTA[alerta.tipo];
  const ref = alerta.referencia;
  const url = ref ? urlDeRegistro(ref.id) : null;

  if (alerta.tipo === "BUENO" || alerta.tipo === "INFO") {
    const promedio = alerta.variacionPromedioPct;
    return (
      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2.5 py-1.5 text-xs ${estilo.caja}`}
      >
        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${estilo.texto}`} />
        <span className={`font-medium ${estilo.texto}`}>
          {alerta.tipo === "BUENO" ? "Buen precio" : "En línea con el histórico"}
        </span>
        {promedio !== null && promedio < 0 && (
          <span className="text-muted-foreground">
            {Math.abs(promedio).toFixed(1)}% inferior al promedio histórico
          </span>
        )}
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onVerHistorial}>
          Ver historial
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 rounded-md border px-2.5 py-2 text-xs ${estilo.caja}`}>
      <p className={`flex items-start gap-1.5 font-semibold ${estilo.texto}`}>
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{formatoPorcentaje(alerta.variacionPct)} sobre el mejor precio reciente</span>
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Actual</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {formatoMoneda(precioComparable, moneda)}/{unidadComparacion || "un"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Mejor</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {formatoMoneda(ref?.precioComparable ?? 0, moneda)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Diferencia</dt>
          <dd className={`font-medium tabular-nums ${estilo.texto}`}>
            +{formatoMoneda(alerta.diferencia, moneda)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Fecha</dt>
          <dd className="text-foreground">{formatoFecha(ref?.fecha ?? null)}</dd>
        </div>
      </dl>

      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{ref?.proveedor}</span>
        {ref?.numeroOc ? ` · OC ${ref.numeroOc}` : ""}
        {ref?.obra ? ` · ${ref.obra}` : ""}
      </p>

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {url && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            render={<a href={url} target="_blank" rel="noopener noreferrer" />}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            Ver OC {ref?.numeroOc}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onVerHistorial}>
          <LineChart className="mr-1 h-3 w-3" />
          Ver historial
        </Button>
      </div>
    </div>
  );
}
