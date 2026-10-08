"use client";

import { useMemo, useState } from "react";
import {
  Warehouse,
  HardHat,
  Wrench,
  AlertTriangle,
  Clock3,
  Repeat2,
  ChevronDown,
  ChevronUp,
  Check,
  MapPin,
  User,
  Hourglass,
  CalendarClock,
  DollarSign,
  ArrowRightLeft,
} from "lucide-react";
import {
  DIAS_PARA_ALERTA,
  diasDesde,
  fechaCorta,
  formatearFecha,
  formatearMonto,
  formatoDias,
} from "@/lib/herramientas/inventario";
import { RECEPCION_PENDIENTE } from "@/lib/herramientas/dominio";
import {
  FILTROS,
  agruparTramos,
  colorDeMovimiento,
  construirRecorrido,
  filtrarMovimientos,
  periodoEstacion,
  permanenciaEnEstacion,
} from "@/lib/herramientas/trazabilidad";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const ICONO_LUGAR = { bodega: Warehouse, obra: HardHat, reparacion: Wrench, incidencia: AlertTriangle };
const COLOR_LUGAR = {
  bodega: "var(--fg-muted)",
  obra: "var(--accent)",
  reparacion: "var(--warning)",
  incidencia: "var(--destructive)",
};

const VISTAS = [
  { clave: "detalles", label: "Detalles" },
  { clave: "mapa", label: "Mapa" },
  { clave: "linea", label: "Línea de tiempo" },
  { clave: "lista", label: "Lista" },
];

/** Marca de pendiente / confirmado, con el boton si corresponde. */
function Recepcion({ m, puedeConfirmar, onConfirmar }) {
  if (m.recepcion === RECEPCION_PENDIENTE) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs text-[var(--warning)]">
          <Clock3 className="h-3 w-3" />
          Falta confirmar que llegó
        </span>
        {puedeConfirmar ? (
          <button
            onClick={() => onConfirmar(m.id)}
            className={`inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-md)] border border-[var(--accent)] px-2.5 text-xs font-medium text-[var(--accent)] ${FOCUS_RING}`}
          >
            <Check className="h-3 w-3" />
            Confirmar
          </button>
        ) : null}
      </span>
    );
  }
  if (m.confirmadaPor || m.fechaConfirmacion) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
        <Check className="h-3 w-3" />
        Recibida{m.confirmadaPor ? ` por ${m.confirmadaPor}` : ""}
        {m.fechaConfirmacion ? ` el ${formatearFecha(m.fechaConfirmacion)}` : ""}
      </span>
    );
  }
  return null;
}

/** La pastilla de un movimiento: va SOBRE la linea, nunca es un nodo. */
function PastillaMovimiento({ m }) {
  const color = colorDeMovimiento(m.tipoMovimiento);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ borderColor: `color-mix(in hsl, ${color} 45%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="whitespace-nowrap">{m.tipoMovimiento ?? "Movimiento"}</span>
      <span className="whitespace-nowrap font-normal text-[var(--fg-subtle)]">· {fechaCorta(m.fechaMovimiento)}</span>
    </span>
  );
}

function Enlace({ m }) {
  return (
    <div className="flex flex-col items-center gap-1 py-1">
      <span className="h-4 w-px bg-[var(--border-default)]" aria-hidden="true" />
      <PastillaMovimiento m={m} />
      <span className="h-4 w-px bg-[var(--border-default)]" aria-hidden="true" />
      <ChevronDown className="h-4 w-4 shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
    </div>
  );
}

/** Un nodo del mapa: un LUGAR por donde pasó la herramienta. */
function Estacion({ e, esActual, puedeConfirmar, onConfirmar }) {
  const Icono = ICONO_LUGAR[e.clase] ?? HardHat;
  const permanencia = permanenciaEnEstacion(e, esActual);
  const pendiente = e.llegada?.recepcion === RECEPCION_PENDIENTE;

  return (
    <div className="flex w-full max-w-sm flex-col items-center">
      {esActual ? (
        <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold tracking-widest text-[var(--accent-foreground)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--success)]" />
          ACTUAL
        </span>
      ) : null}

      <div
        className={`w-full rounded-[var(--radius-lg)] bg-[var(--surface-2)] px-4 py-3 text-center ${
          esActual ? "border-2 border-[var(--accent)]" : "border border-[var(--border-subtle)]"
        }`}
      >
        <p className="flex items-center justify-center gap-1.5 text-sm font-bold uppercase tracking-wide text-foreground">
          <Icono className="h-4 w-4 shrink-0" style={{ color: COLOR_LUGAR[e.clase] }} aria-hidden="true" />
          <span className="min-w-0 break-words">{e.lugar}</span>
        </p>
        <p className="mt-0.5 text-sm text-foreground">
          {e.custodio || <span className="text-[var(--fg-subtle)]">Sin custodio registrado</span>}
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{periodoEstacion(e)}</p>

        {permanencia ? (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)]">
            <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
            {permanencia}
          </span>
        ) : null}

        {pendiente ? (
          <div className="mt-2 border-t border-[var(--border-subtle)] pt-2">
            <Recepcion m={e.llegada} puedeConfirmar={puedeConfirmar} onConfirmar={onConfirmar} />
          </div>
        ) : null}

        {/* Lo que paso SIN moverse de lugar: una devolucion a la misma bodega,
            un ajuste. Van adentro del nodo, no sobre la linea. */}
        {e.enSitio.length ? (
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 border-t border-[var(--border-subtle)] pt-2">
            {e.enSitio.map((m) => (
              <PastillaMovimiento key={m.id} m={m} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Mapa({ movimientos, puedeConfirmar, onConfirmar }) {
  const [abiertos, setAbiertos] = useState(() => new Set());

  const { estaciones, tramos } = useMemo(() => {
    const est = construirRecorrido(movimientos);
    return { estaciones: est, tramos: agruparTramos(est) };
  }, [movimientos]);

  if (estaciones.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
        {movimientos.length === 0 ? "Todavía no hay movimientos registrados." : "No hay movimientos de ese tipo."}
      </p>
    );
  }

  const idActual = estaciones[estaciones.length - 1]?.id;
  const alternar = (id) =>
    setAbiertos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const pintar = (e, primera) => (
    <div key={e.id} className="flex w-full flex-col items-center">
      {!primera && e.llegada ? <Enlace m={e.llegada} /> : null}
      <Estacion e={e} esActual={e.id === idActual} puedeConfirmar={puedeConfirmar} onConfirmar={onConfirmar} />
    </div>
  );

  return (
    <div className="flex flex-col items-center py-2">
      {tramos.map((t, i) =>
        t.tipo === "estacion" ? (
          pintar(t.estacion, i === 0)
        ) : abiertos.has(t.id) ? (
          <div key={t.id} className="flex w-full flex-col items-center">
            {t.estaciones.map((e, j) => pintar(e, i === 0 && j === 0))}
            <button
              onClick={() => alternar(t.id)}
              className={`mt-2 flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)] ${FOCUS_RING}`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Plegar estas {t.estaciones.length} paradas
            </button>
          </div>
        ) : (
          <div key={t.id} className="flex flex-col items-center gap-2 py-2">
            <span className="h-5 border-l-2 border-dashed border-[var(--border-default)]" aria-hidden="true" />
            <button
              onClick={() => alternar(t.id)}
              className={`flex min-h-11 flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-2 text-center ${FOCUS_RING}`}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Repeat2 className="h-3.5 w-3.5" />
                {t.lugares.join(" ↔ ")}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
                Ver {t.estaciones.length} paradas <ChevronDown className="h-3 w-3" />
              </span>
            </button>
            <span className="h-5 border-l-2 border-dashed border-[var(--border-default)]" aria-hidden="true" />
          </div>
        ),
      )}
    </div>
  );
}

function LineaDeTiempo({ movimientos, puedeConfirmar, onConfirmar }) {
  if (movimientos.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--fg-muted)]">No hay movimientos de ese tipo.</p>;
  }
  return (
    <ol className="relative space-y-5 border-l border-[var(--border-subtle)] pl-5">
      {movimientos.map((m) => (
        <li key={m.id} className="relative">
          <span
            className="absolute -left-[26px] top-1.5 h-3 w-3 rounded-full border-2 border-[var(--surface-1)]"
            style={{ backgroundColor: colorDeMovimiento(m.tipoMovimiento) }}
            aria-hidden="true"
          />
          <p className="text-xs text-[var(--fg-subtle)] tabular-nums">{formatearFecha(m.fechaMovimiento)}</p>
          <p className="text-sm font-semibold text-foreground">{m.tipoMovimiento ?? "Movimiento"}</p>
          <p className="text-sm text-[var(--fg-muted)]">
            {m.origen || "—"} <span className="mx-1">→</span> {m.destino || "—"}
            {m.recibeCustodio || m.entrega ? ` · ${m.recibeCustodio || m.entrega}` : ""}
          </p>
          {m.observaciones ? <p className="mt-0.5 text-xs text-foreground break-words">{m.observaciones}</p> : null}
          <div className="mt-1">
            <Recepcion m={m} puedeConfirmar={puedeConfirmar} onConfirmar={onConfirmar} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Lista({ movimientos, puedeConfirmar, onConfirmar }) {
  if (movimientos.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--fg-muted)]">No hay movimientos de ese tipo.</p>;
  }
  return (
    <div className="space-y-3">
      {movimientos.map((m) => (
        <div key={m.id} className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorDeMovimiento(m.tipoMovimiento) }}
                aria-hidden="true"
              />
              {m.tipoMovimiento ?? "Movimiento"}
            </p>
            <p className="shrink-0 text-xs text-[var(--fg-subtle)] tabular-nums">{formatearFecha(m.fechaMovimiento)}</p>
          </div>
          <dl className="grid gap-1 text-sm sm:grid-cols-2">
            {[
              ["Origen", m.origen],
              ["Destino", m.destino],
              ["Entrega", m.entrega],
              ["Recibe", m.recibeCustodio],
              ["Al salir", m.estadoAlSalir],
              ["Al recibir", m.estadoAlRecibir],
            ]
              .filter(([, valor]) => valor)
              .map(([label, valor]) => (
                <div key={label} className="text-[var(--fg-muted)]">
                  <span className="font-medium text-foreground">{label}:</span> {valor}
                </div>
              ))}
          </dl>
          {m.observaciones ? (
            <p className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-sm text-foreground break-words">
              {m.observaciones}
            </p>
          ) : null}
          <div className="mt-2">
            <Recepcion m={m} puedeConfirmar={puedeConfirmar} onConfirmar={onConfirmar} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * El historial de una herramienta, en las tres formas que el cliente ya tiene:
 * el mapa del recorrido, la linea de tiempo y la lista con todo el detalle.
 *
 * Son la misma informacion mirada distinto, y cada una contesta una pregunta:
 * el mapa "por donde anduvo", la linea "que paso y cuando", la lista "los datos
 * de cada movimiento".
 */

function DatoResumen({ icono: Icono, label, valor, nota }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--fg-subtle)]">
        <Icono className="h-3 w-3 shrink-0" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{valor}</p>
      {nota ? <p className="text-[11px] font-normal text-[var(--warning)]">{nota}</p> : null}
    </div>
  );
}

/**
 * Lo primero que se lee: donde esta, con quien, cuanto lleva, desde cuando,
 * cuanto vale y que paso ultimo. Es el mismo bloque que la app del cliente
 * tiene arriba del mapa.
 */
function ResumenActual({ herramienta, estaciones, ultimoMovimiento, verValorizacion }) {
  const h = herramienta;
  const ultima = estaciones[estaciones.length - 1];
  const desde = ultima?.desde ?? (ultimoMovimiento?.fechaMovimiento ? new Date(ultimoMovimiento.fechaMovimiento) : null);
  const dias = diasDesde(desde);
  const enTaller = h.estadoOperativo === "EN REPARACIÓN";

  const ultimo = ultimoMovimiento
    ? `${ultimoMovimiento.tipoMovimiento ?? "Movimiento"}${ultimoMovimiento.origen ? ` desde ${ultimoMovimiento.origen}` : ""}`
    : "Sin movimientos registrados";

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
      <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${verValorizacion ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        <DatoResumen icono={MapPin} label="Ubicación actual" valor={h.ubicacionActual || "—"} />
        <DatoResumen icono={User} label="Custodio" valor={h.custodioActual || "Sin custodio"} />
        <DatoResumen
          icono={Hourglass}
          label={enTaller ? "En reparación hace" : "Permanencia en sitio"}
          valor={formatoDias(dias)}
          nota={dias !== null && dias >= DIAS_PARA_ALERTA ? "Más de un mes" : null}
        />
        <DatoResumen icono={CalendarClock} label="Desde" valor={desde ? formatearFecha(desde) : "—"} />
        {verValorizacion ? (
          <DatoResumen
            icono={DollarSign}
            label="Valor referencial"
            valor={h.valorCompra > 0 ? formatearMonto(h.valorCompra) : "—"}
          />
        ) : null}
        <DatoResumen icono={ArrowRightLeft} label="Último movimiento" valor={ultimo} />
      </div>
      {h.estadoOperativo ? (
        <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--fg-muted)]">
          Estado operativo: <span className="font-semibold text-foreground">{h.estadoOperativo}</span>
        </p>
      ) : null}
    </div>
  );
}

function Detalle({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--fg-subtle)]">{label}</p>
      <p className="text-sm font-medium text-foreground break-words">{children || "—"}</p>
    </div>
  );
}

function Detalles({ herramienta, verValorizacion }) {
  const h = herramienta;
  return (
    <div className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 sm:grid-cols-2">
      <Detalle label="Código">
        <span className="font-mono">{h.codigo}</span>
      </Detalle>
      <Detalle label="Marca">{h.marca}</Detalle>
      <Detalle label="Modelo">{h.modelo}</Detalle>
      <Detalle label="N° de serie">{h.numeroSerie}</Detalle>
      <Detalle label="Categoría">{h.categoria}</Detalle>
      <Detalle label="Fuente de energía">{h.fuenteEnergia}</Detalle>
      <Detalle label="Condición física">{h.condicionFisica}</Detalle>
      <Detalle label="Tipo de ubicación">{h.tipoUbicacion}</Detalle>
      <Detalle label="Última salida">{formatearFecha(h.fechaUltimaSalida)}</Detalle>
      <Detalle label="Última devolución">{formatearFecha(h.fechaUltimaDevolucion)}</Detalle>
      <Detalle label="Próximo mantenimiento">{formatearFecha(h.proximoMantenimiento)}</Detalle>
      {/* Solo para Administrador y Oficina Tecnica: el servidor no manda estas
          dos columnas al resto. */}
      {verValorizacion ? <Detalle label="Valor referencial">{formatearMonto(h.valorCompra)}</Detalle> : null}
      {verValorizacion ? <Detalle label="Fecha de compra">{formatearFecha(h.fechaCompra)}</Detalle> : null}
      {h.observaciones ? (
        <div className="sm:col-span-2">
          <p className="text-xs text-[var(--fg-subtle)]">Observaciones</p>
          <p className="text-sm text-foreground break-words whitespace-pre-wrap">{h.observaciones}</p>
        </div>
      ) : null}
    </div>
  );
}

export function HistorialHerramienta({
  herramienta,
  movimientos,
  puedeConfirmar,
  onConfirmar,
  verValorizacion,
  truncado = false,
}) {
  const [vista, setVista] = useState("mapa");
  const [filtro, setFiltro] = useState("todos");

  const visibles = useMemo(() => filtrarMovimientos(movimientos, filtro), [movimientos, filtro]);
  const estaciones = useMemo(() => construirRecorrido(visibles), [visibles]);

  const props = { movimientos: visibles, puedeConfirmar, onConfirmar };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {VISTAS.map((v) => (
          <button
            key={v.clave}
            onClick={() => setVista(v.clave)}
            className={`min-h-9 rounded-[var(--radius-md)] px-3 text-xs font-medium transition-colors ${FOCUS_RING} ${
              vista === v.clave
                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                : "bg-[var(--surface-2)] text-[var(--fg-muted)]"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <ResumenActual
        herramienta={herramienta}
        estaciones={estaciones}
        ultimoMovimiento={movimientos[0]}
        verValorizacion={verValorizacion}
      />

      {/* Los atajos solo tienen sentido sobre el historial, no sobre Detalles. */}
      {vista === "detalles" ? null : (
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            onClick={() => setFiltro(f.clave)}
            className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors ${FOCUS_RING} ${
              filtro === f.clave
                ? "border-[var(--accent)] bg-[color-mix(in_hsl,var(--accent)_14%,transparent)] text-[var(--accent)]"
                : "border-[var(--border-subtle)] text-[var(--fg-muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      )}

      {/* Si se toco el tope de la consulta puede faltar lo mas viejo, y un
          historial incompleto que no lo dice es peor que uno que lo avisa. Hoy
          la herramienta con mas movimientos tiene 5, asi que esto no deberia
          verse nunca; si aparece, hay que paginar. */}
      {truncado && vista !== "detalles" ? (
        <p className="flex items-start gap-1.5 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--warning)_12%,transparent)] p-2.5 text-xs text-[var(--warning)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Esta herramienta tiene muchísimos movimientos y se muestran los más recientes. Puede que falten los más
          viejos: avisale a soporte.
        </p>
      ) : null}

      {vista === "detalles" ? <Detalles herramienta={herramienta} verValorizacion={verValorizacion} /> : null}
      {vista === "mapa" ? <Mapa {...props} /> : null}
      {vista === "linea" ? <LineaDeTiempo {...props} /> : null}
      {vista === "lista" ? <Lista {...props} /> : null}
    </div>
  );
}
