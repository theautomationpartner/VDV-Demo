"use client";

import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatoFecha, formatoFechaCorta, formatoMoneda } from "./formato";

const COLORES = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

function TooltipPunto({ active, payload, moneda }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-popover-foreground">{formatoMoneda(p.y, moneda)}</p>
      <p className="text-muted-foreground">{formatoFecha(p.fecha)}</p>
      <p className="mt-1 text-popover-foreground">{p.proveedor}</p>
      <p className="text-muted-foreground">
        {p.cantidad} {p.unidad} {p.numeroOc ? `· OC ${p.numeroOc}` : ""}
      </p>
      {p.obra && <p className="text-muted-foreground">{p.obra}</p>}
    </div>
  );
}

/**
 * Como se movio el precio unitario neto en el tiempo: un punto por compra, una
 * serie por proveedor. Asi se ve de un vistazo si un proveedor viene subiendo.
 */
export default function GraficoEvolucion({ registros, moneda }) {
  const conFecha = registros.filter((r) => r.fecha);

  if (conFecha.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No hay compras con fecha registrada para graficar.
      </div>
    );
  }

  const porProveedor = new Map();
  conFecha.forEach((r) => {
    const punto = {
      x: new Date(r.fecha).getTime(),
      y: r.precioComparable,
      fecha: r.fecha,
      proveedor: r.proveedor,
      cantidad: r.cantidad,
      unidad: r.unidad,
      numeroOc: r.numeroOc,
      obra: r.obra,
    };
    porProveedor.set(r.proveedor, [...(porProveedor.get(r.proveedor) ?? []), punto]);
  });

  const series = [...porProveedor.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => formatoFechaCorta(new Date(v).toISOString())}
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
          />
          <YAxis
            dataKey="y"
            type="number"
            tickFormatter={(v) => (moneda === "CLP" ? `${Math.round(v / 1000)}k` : v.toFixed(1))}
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            width={44}
          />
          <Tooltip content={<TooltipPunto moneda={moneda} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map(([proveedor, puntos], i) => (
            <Scatter
              key={proveedor}
              name={proveedor}
              data={puntos}
              fill={COLORES[i % COLORES.length]}
              line={{ stroke: COLORES[i % COLORES.length], strokeWidth: 1 }}
              shape="circle"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
