"use client";

import { useState } from "react";
import { MapPin, User, Clock, Calendar, Wrench, DollarSign, Camera, ChevronDown } from "lucide-react";
import {
  custodioDe,
  DIAS_PARA_ALERTA,
  ESTADO_TONO,
  fechaCorta,
  formatearMonto,
  formatoDias,
  mantencionVencida,
  permanenciaDe,
} from "@/lib/herramientas/inventario";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/**
 * La foto de la herramienta, o el icono de camara si no tiene.
 *
 * La URL que devuelve monday es `protected_static` y pide autenticacion, asi
 * que no sirve como src directo: va por nuestra ruta, que ademas verifica que
 * esta sesion pueda ver esa obra. Hoy solo 3 de las 145 tienen foto, asi que
 * son 3 pedidos, no 145.
 *
 * El icono se dibuja SIEMPRE, y la foto se apoya encima cuando llega. Esa
 * vuelta es porque la foto tarda un segundo de mas -son dos saltos: nuestra
 * ruta le pregunta la URL a monday y recien ahi redirige al archivo- y el
 * recuadro quedaba en blanco mientras tanto, que es lo que se notaba al abrir
 * el listado.
 */
function Miniatura({ herramienta }) {
  const [rota, setRota] = useState(false);
  const hayFoto = Boolean(herramienta.foto) && !rota;

  return (
    <div
      className="relative h-10 w-10 min-w-10 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--fg-subtle)]"
      aria-label={hayFoto ? undefined : `Sin foto: ${herramienta.name}`}
    >
      <Camera className="absolute inset-0 m-auto h-4 w-4" />
      {hayFoto ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={`/api/monday/archivo?boardKey=ControlHerramientasBoard&itemId=${encodeURIComponent(herramienta.id)}&columna=foto`}
          alt={`Foto de ${herramienta.name}`}
          onError={() => setRota(true)}
          className="relative h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

function Campo({ icono: Icono, label, children, alerta = false }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
        <Icono className={`h-3 w-3 shrink-0 ${alerta ? "text-[var(--warning)]" : ""}`} />
        {label}
      </p>
      <p className={`mt-0.5 truncate font-medium ${alerta ? "text-[var(--warning)]" : "text-foreground"}`}>
        {children}
      </p>
    </div>
  );
}

/**
 * Los cinco datos de abajo.
 *
 * El precio se muestra cuando el rol lo permite Y el dato llego: el servidor
 * BORRA la columna para quien no puede verla, asi que su ausencia es la
 * respuesta definitiva. `verValor` sale de la sesion guardada en el navegador,
 * que queda vieja si a alguien le cambian el rol y todavia no volvio a entrar
 * -y entonces la columna se dibujaba vacia para alguien que ya no deberia
 * verla. Mirar las dos cosas alinea la pantalla con lo que el servidor decidio.
 */
function Datos({ h, verValor }) {
  const mostrarValor = verValor && "valorCompra" in h;
  const dias = permanenciaDe(h);
  const vencida = mantencionVencida(h);
  const enTaller = h.estadoOperativo === "EN REPARACIÓN";

  return (
    <div
      className={`mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-3 ${
        mostrarValor ? "lg:grid-cols-5" : "lg:grid-cols-4"
      }`}
    >
      <Campo icono={MapPin} label="Destino actual">
        {h.ubicacionActual || "Sin destino"}
      </Campo>

      <Campo icono={Clock} label={enTaller ? "En taller" : "Permanencia"} alerta={dias !== null && dias >= DIAS_PARA_ALERTA}>
        {formatoDias(dias)}
      </Campo>

      <Campo icono={User} label="A cargo de">
        {custodioDe(h) || "Sin custodio"}
      </Campo>

      {/* Solo para Administrador y Oficina Tecnica. El servidor ni siquiera
          manda la columna al resto, asi que `h.valorCompra` llega undefined. */}
      {mostrarValor ? (
        <Campo icono={DollarSign} label="Valor referencial">
          <span className="tabular-nums">
            {h.valorCompra > 0 ? formatearMonto(h.valorCompra) : "—"}
          </span>
        </Campo>
      ) : null}

      <Campo icono={vencida ? Wrench : Calendar} label="Próx. mantención" alerta={vencida}>
        {h.proximoMantenimiento ? (
          <>
            {fechaCorta(h.proximoMantenimiento)}
            {vencida ? <span className="ml-1 text-[10px] font-bold uppercase">(vencida)</span> : null}
          </>
        ) : (
          "Sin programar"
        )}
      </Campo>
    </div>
  );
}

function Encabezado({ h, extra }) {
  const tono = ESTADO_TONO[h.estadoOperativo] ?? ESTADO_TONO.default;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Miniatura herramienta={h} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="font-semibold text-foreground break-words">{h.name}</h3>
            {h.marca ? <span className="text-xs text-[var(--fg-muted)]">· {h.marca}</span> : null}
            {extra}
          </div>
          <p className="font-mono text-xs text-[var(--fg-muted)]">
            Código: <span className="font-semibold text-[var(--accent)]">{h.codigo || "sin código"}</span>
          </p>
        </div>
      </div>
      {h.estadoOperativo ? (
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
        >
          {h.estadoOperativo}
        </span>
      ) : null}
    </div>
  );
}

/** Una herramienta suelta. */
export function HerramientaCard({ h, verValor, onAbrir }) {
  return (
    <button
      onClick={onAbrir}
      className={`w-full text-left rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] ${FOCUS_RING}`}
    >
      <Encabezado h={h} />
      <Datos h={h} verValor={verValor} />
    </button>
  );
}

/**
 * Varias unidades iguales en el mismo lugar: una fila con la cantidad, que se
 * despliega. Sin esto el listado repite cinco veces la misma tablet.
 */
export function GrupoCard({ grupo, verValor, onAbrir }) {
  const [abierto, setAbierto] = useState(false);
  const { unidades } = grupo;

  const estados = {};
  for (const u of unidades) estados[u.estadoOperativo || "SIN ESTADO"] = (estados[u.estadoOperativo || "SIN ESTADO"] ?? 0) + 1;

  const total =
    verValor && unidades.some((u) => "valorCompra" in u)
      ? unidades.reduce((suma, u) => suma + (Number(u.valorCompra) || 0), 0)
      : 0;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className={`w-full text-left p-4 ${FOCUS_RING} rounded-[var(--radius-lg)]`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Miniatura herramienta={unidades[0]} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 className="font-semibold text-foreground break-words">{grupo.nombre}</h3>
                {grupo.marca ? <span className="text-xs text-[var(--fg-muted)]">· {grupo.marca}</span> : null}
                <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] tabular-nums">
                  {unidades.length} unidades
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--fg-muted)]">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {grupo.ubicacion || "Sin destino"}
                </span>
                {verValor && total > 0 ? (
                  <span className="tabular-nums">{formatearMonto(total)}</span>
                ) : null}
              </p>
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--fg-subtle)] transition-transform ${abierto ? "rotate-180" : ""}`}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(estados).map(([estado, cuantas]) => {
            const tono = ESTADO_TONO[estado] ?? ESTADO_TONO.default;
            return (
              <span
                key={estado}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
              >
                {cuantas} {estado.toLowerCase()}
              </span>
            );
          })}
        </div>
      </button>

      {abierto ? (
        <div className="border-t border-[var(--border-subtle)] p-2 space-y-2">
          {unidades.map((u) => (
            <button
              key={u.id}
              onClick={() => onAbrir(u)}
              className={`w-full text-left rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3 transition-colors hover:bg-[var(--surface-3)] ${FOCUS_RING}`}
            >
              <Encabezado h={u} />
              <Datos h={u} verValor={verValor} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
