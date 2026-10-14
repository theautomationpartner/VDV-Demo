"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import {
  ESTADO,
  ESTADOS_ELEGIBLES,
  HOMOLOGACION,
  TONO_ESTADO,
  TONO_HOMOLOGACION,
  estaVencida,
  formatearFecha,
  formatearPrecio,
  lineasDudosas,
  quienCotizo,
} from "@/lib/spm/cotizaciones";

const TONOS = {
  neutro: "border-[var(--border-default)] text-[var(--fg-muted)]",
  ok: "border-[var(--success)] text-[var(--success)]",
  aviso: "border-[var(--warning)] text-[var(--warning)]",
  error: "border-[var(--danger)] text-[var(--danger)]",
};

function Pastilla({ texto, tono }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONOS[tono] ?? TONOS.neutro}`}>
      {texto}
    </span>
  );
}

/**
 * Una cotizacion, con sus lineas y la homologacion que decidio la IA.
 *
 * El numero que manda NO es el total: es cuantas lineas hay que mirar. Una
 * cotizacion con el total mas bajo y tres lineas "Distinto" no es la mas barata,
 * es otra cosa. Por eso el aviso va ARRIBA del precio y no escondido adentro.
 */
export function TarjetaCotizacion({
  cotizacion,
  lineasPedidas,
  onCambiado,
  esLaMasBarata = false,
  masBarataComparable = true,
}) {
  const [abierta, setAbierta] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const { puedeDecidir } = useSesionSpm();
  const quien = quienCotizo(cotizacion);
  const dudosas = lineasDudosas(cotizacion);
  const lineas = cotizacion.subitems ?? [];
  const cotizadas = lineas.filter((l) => l.homologacion !== HOMOLOGACION.NO_SOLICITADO).length;
  const faltan = lineasPedidas ? lineasPedidas - cotizadas : 0;
  const vencida = estaVencida(cotizacion);
  const automatica = cotizacion.origen === "Email Automático";

  const cambiarEstado = async (estado) => {
    setGuardando(true);
    try {
      const r = await fetch("/api/spm/cotizacion-estado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotizacionId: cotizacion.id, estado }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(json.error || "No se pudo guardar.");
        return;
      }
      toast.success(`Queda como ${estado}.`);
      onCambiado?.();
    } catch (e) {
      console.error("[SPM] no se pudo cambiar el estado:", e);
      toast.error("No se pudo conectar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{quien.nombre}</p>
            {automatica ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]"
                title="La leyó la inteligencia artificial desde el correo del proveedor"
              >
                <Sparkles className="h-3 w-3" />
                leída del correo
              </span>
            ) : (
              <span className="text-[11px] text-[var(--fg-subtle)]">cargada a mano</span>
            )}
          </div>
          {!quien.enElMaestro ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--fg-subtle)]">
              <Mail className="h-3 w-3" />
              No está enganchada a una ficha del maestro de proveedores
            </p>
          ) : null}
          {/*
            La FECHA no se mostraba, y es la primera pregunta frente a dos
            ofertas parecidas: cual es mas vieja. El numero y el plazo ya
            estaban, pero solo aparecen si el proveedor los puso -que en los
            datos de hoy casi nunca pasa-, asi que sin la fecha esta linea
            quedaba diciendo nada mas "sin condicion de pago".
          */}
          <p className="mt-1 text-xs text-[var(--fg-muted)]">
            {formatearFecha(cotizacion.fechaCotizacion) ?? "sin fecha"}
            {cotizacion.numeroCotizacion ? ` · N° ${cotizacion.numeroCotizacion}` : ""}
            {cotizacion.plazoEntrega ? ` · entrega en ${cotizacion.plazoEntrega} d` : ""}
            {` · ${cotizacion.condicionDePago || "sin condición de pago"}`}
          </p>
        </div>

        <div className="text-right">
          <p className="text-base font-semibold tabular-nums text-foreground">
            {formatearPrecio(cotizacion.precioTotal, cotizacion.moneda)}
          </p>
          {/*
            La mas barata del grupo. Se marca ACA, pegada al precio, y no en un
            cartel arriba: el cartel se lee como una recomendacion y esto es un
            dato. Y cuando no todos cotizaron lo mismo se dice, porque entonces
            el total mas bajo puede serlo por lo que le FALTA.
          */}
          {esLaMasBarata ? (
            <p
              className={`text-[11px] font-medium ${
                masBarataComparable ? "text-[var(--success)]" : "text-[var(--warning)]"
              }`}
              title={
                masBarataComparable
                  ? "Es el total más bajo de esta solicitud"
                  : "Es el total más bajo, pero no todos cotizaron la misma cantidad de líneas"
              }
            >
              {masBarataComparable ? "la más barata" : "la más barata, pero ojo"}
            </p>
          ) : null}
          {/*
            Cuantas lineas cotizo, y contra cuantas se pidieron SOLO cuando se
            sabe. En el listado general no se sabe -las cotizaciones vienen de
            varias solicitudes- y un "3 de ? lineas" no informa nada: deja al
            lector preguntandose si falta un dato.
          */}
          <p className="text-[11px] text-[var(--fg-muted)]">
            {lineasPedidas ? `${cotizadas} de ${lineasPedidas} líneas` : `${cotizadas} líneas`}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Pastilla texto={cotizacion.estado ?? "Sin estado"} tono={TONO_ESTADO[cotizacion.estado] ?? "neutro"} />
          {vencida && cotizacion.estado !== ESTADO.VENCIDA ? (
            <Pastilla texto="La validez ya pasó" tono="error" />
          ) : null}
        </div>
      </div>

      {dudosas > 0 || faltan > 0 || cotizacion.notasLectura ? (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[color-mix(in_hsl,var(--warning)_8%,transparent)] p-2.5 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning)]" />
          <div className="min-w-0 text-[var(--fg-muted)]">
            {faltan > 0 ? (
              <p className="text-foreground">
                Cotizó {faltan} línea{faltan === 1 ? "" : "s"} menos de las que se pidieron: el total no se
                puede comparar de frente con los demás.
              </p>
            ) : null}
            {dudosas > 0 ? (
              <p className="text-foreground">
                {dudosas} línea{dudosas === 1 ? "" : "s"} no coincide{dudosas === 1 ? "" : "n"} con lo pedido.
                Mirá el detalle antes de elegirla.
              </p>
            ) : null}
            {cotizacion.notasLectura ? <p className="mt-0.5">{cotizacion.notasLectura}</p> : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
        <button
          onClick={() => setAbierta((v) => !v)}
          className={`inline-flex min-h-9 items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-foreground ${FOCO_BOTON}`}
        >
          {abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {lineas.length} línea{lineas.length === 1 ? "" : "s"} cotizada{lineas.length === 1 ? "" : "s"}
        </button>

        {/*
          EL SELECTOR MIRA EL ROL. Decidir una cotizacion es decidir una compra,
          y eso lo puede el comprador. El servidor ya lo impedia
          (`requireDecidirSpm`), pero la pantalla lo ofrecia igual: el
          solicitante elegia un estado y recien ahi le saltaba un error.
          Ofrecer algo que va a rebotar es peor que no mostrarlo.
        */}
        <label
          className="flex items-center gap-2 text-xs text-[var(--fg-muted)]"
          title={puedeDecidir ? undefined : "Tu rol no decide cotizaciones. Avisale a quien compra."}
        >
          Estado
          <select
            value={cotizacion.estado ?? ""}
            onChange={(e) => cambiarEstado(e.target.value)}
            disabled={guardando || !puedeDecidir}
            aria-label={`Estado de la cotización de ${quien.nombre}`}
            className={`h-9 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 text-xs text-foreground disabled:opacity-50 ${FOCO_CAMPO}`}
          >
            {cotizacion.estado && !ESTADOS_ELEGIBLES.includes(cotizacion.estado) ? (
              <option value={cotizacion.estado}>{cotizacion.estado}</option>
            ) : null}
            {ESTADOS_ELEGIBLES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
      </div>

      {abierta ? (
        <div className="overflow-x-auto border-t border-[var(--border-subtle)] px-4 py-3">
          {lineas.length === 0 ? (
            <p className="text-xs text-[var(--fg-muted)]">
              La IA no pudo separar las líneas. El total de arriba es lo único que leyó.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[var(--fg-muted)]">
                  <th className="py-1.5 pr-3 font-medium">Lo que cotizó</th>
                  <th className="w-20 py-1.5 pr-3 font-medium">Cant.</th>
                  <th className="w-28 py-1.5 pr-3 font-medium">Unitario</th>
                  <th className="w-32 py-1.5 font-medium">Corresponde a</th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--border-subtle)] align-top last:border-0">
                    <td className="py-1.5 pr-3">
                      <p className="text-foreground">{l.descripcionProveedor || l.name}</p>
                      {l.justificacion ? (
                        <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">{l.justificacion}</p>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-foreground">{l.cantidad ?? "—"}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-foreground">
                      {formatearPrecio(l.precioUnitario, cotizacion.moneda)}
                    </td>
                    <td className="py-1.5">
                      <Pastilla
                        texto={l.homologacion ?? "sin clasificar"}
                        tono={TONO_HOMOLOGACION[l.homologacion] ?? "neutro"}
                      />
                      {l.lineaSpm ? (
                        <span className="ml-1 text-[11px] text-[var(--fg-subtle)]">línea {l.lineaSpm}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </article>
  );
}
