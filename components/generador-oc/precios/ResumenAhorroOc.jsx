"use client";

import { Card } from "@/components/ui/card";
import { TrendingDown, ArrowRight } from "lucide-react";
import { calcularResumenAhorro } from "@/lib/generador-oc/precios";
import { formatoMoneda, formatoPorcentaje } from "./formato";

/**
 * La orden completa mirada de arriba: cuanto costaria comprando a los mejores
 * precios historicos, y que lineas concentran la diferencia.
 */
export default function ResumenAhorroOc({ items, analisis, moneda }) {
  const lineas = items
    .map((item, indice) => {
      const a = analisis[indice];
      if (!a) return null;
      return {
        indice,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioActual: a.precioComparable,
        alerta: a.alerta,
      };
    })
    .filter(Boolean);

  if (lineas.length === 0) return null;

  const resumen = calcularResumenAhorro(lineas);

  if (resumen.lineasConOportunidad === 0) {
    return (
      <Card className="border-[hsl(var(--precio-bueno)/0.3)] bg-[hsl(var(--precio-bueno-soft))] p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--precio-bueno))]">
          <TrendingDown className="h-4 w-4" />
          Sin antecedentes de compras a menor precio en las líneas analizadas.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {resumen.lineasAnalizadas} de {items.length} líneas tienen historial comparable.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-base font-semibold">Oportunidades de ahorro</h3>
        <p className="text-xs text-muted-foreground">
          {resumen.lineasConOportunidad} de {items.length} productos tienen antecedentes de compra a
          menor precio.
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Total OC actual
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatoMoneda(resumen.totalActual, moneda)}
          </dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Con mejores precios
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {formatoMoneda(resumen.totalMejorPrecio, moneda)}
          </dd>
        </div>
        <div className="rounded-md border border-[hsl(var(--precio-medio)/0.35)] bg-[hsl(var(--precio-medio-soft))] p-3">
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Ahorro potencial
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-[hsl(var(--precio-medio))]">
            {formatoMoneda(resumen.ahorroPotencial, moneda)}
            <span className="ml-2 text-xs font-medium">
              {formatoPorcentaje(resumen.ahorroPct)}
            </span>
          </dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Ranking por impacto económico</h4>
        <ol className="space-y-2">
          {resumen.ranking.slice(0, 6).map((op, i) => (
            <li
              key={`${op.indice}-${op.descripcion}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{op.descripcion}</span>
              <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                {formatoMoneda(op.precioActual, moneda)}
                <ArrowRight className="h-3 w-3" />
                {formatoMoneda(op.mejorPrecio, moneda)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-[hsl(var(--precio-medio))]">
                {formatoMoneda(op.ahorroPotencial, moneda)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Ahorro potencial según precios históricos. No significa que ese precio siga disponible:
        puede haber razones de plazo, crédito, despacho o disponibilidad.
      </p>
    </Card>
  );
}
