"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Camera,
  ChevronDown,
  Clock,
  DollarSign,
  FileText,
  MapPin,
  Package,
  TrendingUp,
  Undo2,
} from "lucide-react";
import { formatearMonto, fechaCorta } from "@/lib/herramientas/inventario";
import { ESTADOS_CERRADOS, ITEM_DANADO, ITEM_PERDIDO } from "@/lib/arriendos/dominio";
import { TONO_ESTADO } from "@/lib/arriendos/listado";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** Los avisos de arriba de la tarjeta, en palabras. */
const TEXTO_ALERTA = {
  "sin-guia": "Sin guía de ingreso: no hay respaldo documental.",
  "sin-oc": "Sin orden de compra y sin excepción autorizada.",
  vencido: "La fecha de fin ya pasó y el equipo sigue en obra.",
};

/** El aviso de datos faltantes se arma con lo que falta, asi que va aparte. */
function enumerar(cosas) {
  if (cosas.length <= 1) return cosas[0] ?? "";
  return `${cosas.slice(0, -1).join(", ")} y ${cosas[cosas.length - 1]}`;
}

function textoAlerta(alerta) {
  if (alerta.nivel !== "sin-datos") return TEXTO_ALERTA[alerta.nivel];
  const varios = alerta.faltan.length > 1;
  return `No se puede calcular el costo: ${varios ? "faltan" : "falta"} ${enumerar(alerta.faltan)}. Completalo en el arriendo.`;
}

function Dato({ icono: Icono, label, children, alerta = false }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
        <Icono className={`h-3 w-3 shrink-0 ${alerta ? "text-[var(--warning)]" : ""}`} />
        {label}
      </p>
      <div className={`mt-0.5 truncate font-medium ${alerta ? "text-[var(--warning)]" : "text-foreground"}`}>
        {children}
      </div>
    </div>
  );
}

/**
 * La barra de devolucion.
 *
 * Es lo primero que mira el administrador: cuanto falta por volver. El tramo
 * naranja son los que volvieron con daño o se perdieron, que cuentan como
 * devueltos -ya no estan en obra- pero no son lo mismo que un retorno limpio.
 */
function BarraDevolucion({ resumen }) {
  const { total, devueltos, conDano, perdidos, porcentajeDevuelto } = resumen;
  const conFoto = resumen.items.filter(
    (i) => ESTADOS_CERRADOS.has(i.estado) && String(i.fotoDevolucion ?? "").trim(),
  ).length;
  if (!total) return null;
  const buenos = devueltos - conDano - perdidos;
  const pct = (n) => (total ? (n / total) * 100 : 0);

  return (
    <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">
          Devuelto {devueltos} de {total} ítems · {porcentajeDevuelto}%
        </span>
        {/* La foto de devolucion es obligatoria, asi que el contador dice de
            cuantas de las que ya volvieron quedo la constancia. */}
        {devueltos > 0 ? (
          <span
            className={`inline-flex items-center gap-1 tabular-nums ${
              conFoto < devueltos ? "text-[var(--warning)]" : "text-[var(--fg-subtle)]"
            }`}
          >
            <Camera className="h-3 w-3" />
            Fotos {conFoto} de {devueltos}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        {buenos > 0 ? <div className="h-full bg-[var(--success)]" style={{ width: `${pct(buenos)}%` }} /> : null}
        {conDano > 0 ? <div className="h-full bg-[var(--warning)]" style={{ width: `${pct(conDano)}%` }} /> : null}
        {perdidos > 0 ? <div className="h-full bg-[var(--destructive)]" style={{ width: `${pct(perdidos)}%` }} /> : null}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--fg-muted)]">
        {buenos > 0 ? <span className="text-[var(--success)]">{buenos} en buen estado</span> : null}
        {conDano > 0 ? <span className="text-[var(--warning)]">{conDano} con daño</span> : null}
        {perdidos > 0 ? <span className="text-[var(--destructive)]">{perdidos} perdido(s)</span> : null}
        {resumen.unidadesEnObra > 0 ? (
          <span>{resumen.unidadesEnObra} unidad(es) siguen en obra</span>
        ) : null}
      </p>
    </div>
  );
}

/** La lista desplegable de items. */
function Items({ arriendo, verCostos, puedeGestionar, onDevolverItem }) {
  const items = arriendo.resumen.items ?? [];
  if (!items.length) return null;

  return (
    <div className="mt-2 space-y-1.5 border-t border-[var(--border-subtle)] pt-2">
      {items.map((item, i) => {
        const cerrado = ESTADOS_CERRADOS.has(item.estado);
        const tono =
          item.estado === ITEM_DANADO
            ? "var(--warning)"
            : item.estado === ITEM_PERDIDO
              ? "var(--destructive)"
              : cerrado
                ? "var(--success)"
                : "var(--accent)";
        return (
          <div
            key={item.id ?? `${arriendo.id}-${i}`}
            className="rounded-[var(--radius-md)] bg-[var(--surface-2)] p-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {item.name || "Sin nombre"}
                <span className="ml-1.5 font-normal text-[var(--fg-muted)]">×{item.calculo.cantidad}</span>
              </span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
              >
                {item.estado || "Activo"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--fg-muted)]">
              <span>
                {fechaCorta(item.inicio)}
                {item.fechaDevolucion || item.termino ? ` → ${fechaCorta(item.fechaDevolucion || item.termino)}` : ""}
              </span>
              <span className="tabular-nums">
                {item.calculo.dias} día(s)
                {item.calculo.unidades !== item.calculo.dias ? ` · ${item.calculo.unidades} u. de tarifa` : ""}
              </span>
              {verCostos && item.calculo.confiable && item.calculo.precio > 0 ? (
                <span className="tabular-nums font-medium text-foreground">
                  {formatearMonto(item.calculo.neto)}
                </span>
              ) : null}
              {verCostos && !item.calculo.confiable ? (
                <span className="text-[var(--warning)]">falta {enumerar(item.calculo.faltan)}</span>
              ) : null}
            </div>
            {puedeGestionar && onDevolverItem && !cerrado ? (
              <button
                onClick={() => onDevolverItem?.(arriendo, item)}
                className={`mt-2 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--accent)] px-2.5 text-[11px] font-medium text-[var(--accent)] ${FOCUS_RING}`}
              >
                <Undo2 className="h-3 w-3" />
                Devolver este ítem
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ArriendoCard({ arriendo, verCostos, puedeGestionar, onDevolverTodo, onDevolverItem, onReporte }) {
  const [abierto, setAbierto] = useState(false);
  const { resumen } = arriendo;
  const tono = TONO_ESTADO[arriendo.estadoReal] ?? TONO_ESTADO.default;

  const avisos = arriendo.alertas.filter((a) => textoAlerta(a));

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-semibold text-foreground break-words">{arriendo.name}</h3>
            {arriendo.proveedor ? (
              <span className="text-xs text-[var(--fg-muted)]">· {arriendo.proveedor}</span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] tabular-nums">
              <Package className="h-3 w-3" />
              {resumen.total} ítem{resumen.total === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
            {arriendo.codigoArriendo ? (
              <>
                Código: <span className="font-mono font-semibold text-[var(--accent)]">{arriendo.codigoArriendo}</span>
              </>
            ) : (
              <span className="text-[var(--warning)]">Sin código</span>
            )}
            {arriendo.categoria ? ` · ${arriendo.categoria}` : ""}
            {arriendo.tipoTarifa ? ` · ${arriendo.tipoTarifa}` : ""}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
        >
          {arriendo.estadoReal}
          {arriendo.estadoReal === "DEVUELTO" && resumen.porcentajeDevuelto === 100 ? " 100%" : ""}
        </span>
      </div>

      <div
        className={`mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-3 ${
          verCostos ? "lg:grid-cols-5" : "lg:grid-cols-3"
        }`}
      >
        <Dato icono={MapPin} label="Obra">
          {arriendo.obra || "Sin obra"}
        </Dato>
        <Dato icono={Clock} label="Permanencia" alerta={!resumen.cerrado && (resumen.permanencia ?? 0) >= 14}>
          {resumen.permanencia == null ? "—" : `${resumen.permanencia} día${resumen.permanencia === 1 ? "" : "s"}`}
        </Dato>
        <Dato icono={Package} label="En obra">
          <span className="tabular-nums">
            {resumen.unidadesEnObra} / {resumen.unidades}
          </span>
        </Dato>

        {/* El servidor ni manda los precios a quien no puede verlos, asi que
            `verCostos` y la ausencia del dato dicen lo mismo. Se miran las dos
            cosas por lo mismo que en herramientas: la sesion del navegador
            queda vieja si a alguien le cambian el rol y no volvio a entrar. */}
        {verCostos ? (
          <>
            <Dato icono={DollarSign} label="Costo diario" alerta={!resumen.confiable}>
              {resumen.confiable ? (
                <>
                  <span className="tabular-nums">
                    {resumen.diarioConIva > 0 ? `${formatearMonto(resumen.diarioConIva)}/día` : "—"}
                  </span>
                  <span className="block text-[10px] font-normal text-[var(--fg-muted)]">
                    IVA incl. · neto {formatearMonto(resumen.diarioNeto)}
                  </span>
                </>
              ) : (
                <span className="text-[var(--warning)]">Sin datos</span>
              )}
            </Dato>
            <Dato icono={TrendingUp} label="Acumulado" alerta={!resumen.confiable}>
              {resumen.confiable ? (
                <>
                  <span className="tabular-nums">{formatearMonto(resumen.conIva)}</span>
                  <span className="block text-[10px] font-normal text-[var(--fg-muted)]">
                    IVA incl. · neto {formatearMonto(resumen.neto)}
                  </span>
                </>
              ) : (
                <span className="text-[var(--warning)]">Sin datos</span>
              )}
            </Dato>
          </>
        ) : null}
      </div>

      <BarraDevolucion resumen={resumen} />

      {avisos.length ? (
        <div className="mt-2 space-y-1">
          {avisos.map((a) => (
            <p
              key={a.nivel}
              className="flex items-start gap-1.5 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--warning)_10%,transparent)] p-2 text-[11px] text-[var(--warning)]"
            >
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {textoAlerta(a)}
            </p>
          ))}
        </div>
      ) : null}

      {arriendo.desfasado ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[var(--fg-muted)]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          El tablero dice &quot;{arriendo.estadoArriendo}&quot; pero sus ítems dicen &quot;{arriendo.estadoReal}&quot;.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {puedeGestionar && onDevolverTodo && !resumen.cerrado ? (
          <button
            onClick={() => onDevolverTodo?.(arriendo)}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-xs font-medium text-[var(--accent-foreground)] ${FOCUS_RING}`}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Devolver todo
          </button>
        ) : null}
        {onReporte ? (
        <button
          onClick={() => onReporte(arriendo)}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-xs font-medium text-foreground ${FOCUS_RING}`}
        >
          <FileText className="h-3.5 w-3.5" />
          Generar reporte
        </button>
        ) : null}
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className={`ml-auto inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-md)] px-2 text-xs text-[var(--fg-muted)] ${FOCUS_RING}`}
        >
          Ver ítems ({resumen.enObra} en obra)
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </button>
      </div>

      {arriendo.fechaFinArriendo && !resumen.cerrado ? (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]">
          <Calendar className="h-3 w-3" />
          Fin pactado: {fechaCorta(arriendo.fechaFinArriendo)}
        </p>
      ) : null}

      {abierto ? (
        <Items
          arriendo={arriendo}
          verCostos={verCostos}
          puedeGestionar={puedeGestionar}
          onDevolverItem={onDevolverItem}
        />
      ) : null}
    </div>
  );
}
