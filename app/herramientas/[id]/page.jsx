"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ControlHerramientasBoard, ControlHerramientasMovimientosBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft, Wrench, MapPin, User, RefreshCw, History, Image as ImageIcon, CircleDollarSign } from "lucide-react";
import { useSesionHerramientas } from "@/hooks/herramientas/useSesionHerramientas";
import {
  COLUMNAS_FICHA,
  COLUMNAS_VALORIZACION,
  ESTADO_TONO,
  formatearFecha,
  formatearMonto,
} from "@/lib/herramientas/inventario";

const herramientasBoard = new ControlHerramientasBoard();
const movimientosBoard = new ControlHerramientasMovimientosBoard();

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const COLUMNAS_MOVIMIENTO = [
  "idMaestro",
  "tipoMovimiento",
  "fechaMovimiento",
  "obra",
  "origen",
  "destino",
  "entrega",
  "recibeCustodio",
  "estadoAlSalir",
  "estadoAlRecibir",
  "observaciones",
];

/**
 * Cuantos movimientos se traen para buscar los de ESTA herramienta.
 *
 * El tablero de movimientos no tiene vinculo a la herramienta: guarda el id del
 * maestro como TEXTO (`idMaestro`), asi lo dejo el cliente. Se filtra por ese
 * texto en la consulta, pero el tope igual se pone alto porque un filtro por
 * texto en monday no siempre usa indice. Hoy hay 22 movimientos en total.
 */
const TOPE_MOVIMIENTOS = 200;

function Dato({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-[var(--fg-subtle)] mb-0.5">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  );
}

function MovimientoFila({ m }) {
  const recorrido = [m.origen, m.destino].filter(Boolean).join(" → ");
  return (
    <li className="relative pl-5 pb-4 last:pb-0">
      <span className="absolute left-0 top-1.5 w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
      <span className="absolute left-[3px] top-4 bottom-0 w-px bg-[var(--border-subtle)] last:hidden" aria-hidden="true" />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-foreground">{m.tipoMovimiento || "Movimiento"}</span>
        <span className="text-xs text-[var(--fg-subtle)] tabular-nums">{formatearFecha(m.fechaMovimiento)}</span>
      </div>
      {recorrido ? <p className="text-xs text-[var(--fg-muted)] mt-0.5">{recorrido}</p> : null}
      {m.recibeCustodio ? (
        <p className="text-xs text-[var(--fg-muted)] mt-0.5">Recibe: {m.recibeCustodio}</p>
      ) : null}
      {m.observaciones ? (
        <p className="text-xs text-[var(--fg-subtle)] mt-1 break-words">{m.observaciones}</p>
      ) : null}
    </li>
  );
}

export default function FichaHerramientaPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { cargando: cargandoSesion, tieneAcceso, verValorizacion } = useSesionHerramientas();

  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [herramienta, setHerramienta] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [error, setError] = useState(null);
  const [fotoRota, setFotoRota] = useState(false);

  const cargar = useCallback(async () => {
    setRefetching(true);
    try {
      // Se piden siempre: quien no puede verlas no las recibe, porque el
      // servidor las borra de la respuesta (quitarColumnasRestringidas en
      // lib/server/board-access-policy.js). Pedir menos columnas NO alcanza:
      // /api/monday/board devuelve todas las del schema igual.
      const columnas = [...COLUMNAS_FICHA, ...COLUMNAS_VALORIZACION];

      const [ficha, historial] = await Promise.all([
        // .get() y no .item(): item(id) devuelve el mutador, no el lector.
        herramientasBoard.get(id).withColumns(columnas).execute(),
        movimientosBoard
          .items()
          .withColumns(COLUMNAS_MOVIMIENTO)
          .where({ idMaestro: { eq: String(id) } })
          .withPagination({ limit: TOPE_MOVIMIENTOS })
          .execute()
          // El historial es un extra: si falla, la ficha se muestra igual.
          .catch((err) => {
            console.error("[HERRAMIENTAS] No se pudo traer el historial:", err);
            return { items: [] };
          }),
      ]);

      if (!ficha) {
        setError("No se encontró esa herramienta.");
        return;
      }
      setHerramienta(ficha);
      setError(null);

      const filas = (historial.items || [])
        .filter((m) => String(m.idMaestro ?? "").trim() === String(id))
        .sort((a, b) => new Date(b.fechaMovimiento ?? 0) - new Date(a.fechaMovimiento ?? 0));
      setMovimientos(filas);
    } catch (err) {
      console.error("[HERRAMIENTAS] No se pudo traer la ficha:", err);
      setError("No se pudo cargar la ficha. Probá recargar.");
    } finally {
      setRefetching(false);
      setLoading(false);
    }
  }, [id]);

  // Ver el comentario gemelo en app/herramientas/page.jsx: el setState no puede
  // ir en el cuerpo del efecto (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (cargandoSesion) return undefined;
    let activo = true;
    Promise.resolve().then(() => {
      if (!activo) return undefined;
      if (!tieneAcceso) {
        setLoading(false);
        return undefined;
      }
      return cargar();
    });
    return () => {
      activo = false;
    };
  }, [cargandoSesion, tieneAcceso, cargar]);

  if (cargandoSesion || loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <Spinner className="size-8 text-accent" />
      </div>
    );
  }

  if (!tieneAcceso || error) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <Wrench className="w-10 h-10 mx-auto mb-3 text-[var(--fg-subtle)]" />
          <p className="text-sm font-medium text-foreground mb-1">
            {tieneAcceso ? error : "No tenés acceso a Control de Herramientas"}
          </p>
          <button
            onClick={() => router.push("/herramientas")}
            className={`mt-4 h-11 px-4 text-sm rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-foreground active:bg-[var(--surface-2)] ${FOCUS_RING}`}
          >
            Volver al inventario
          </button>
        </div>
      </div>
    );
  }

  const h = herramienta;
  const tono = ESTADO_TONO[h.estadoOperativo] ?? ESTADO_TONO.default;
  const srcFoto = h.foto
    ? `/api/monday/archivo?boardKey=ControlHerramientasBoard&itemId=${encodeURIComponent(id)}&columna=foto`
    : null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster richColors position="top-center" />

      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/herramientas")}
            className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`}
            aria-label="Volver al inventario"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] truncate">{h.name}</h1>
            <p className="text-xs text-[var(--fg-subtle)] font-mono tabular-nums">{h.codigo || "sin código"}</p>
          </div>
          <button
            onClick={cargar}
            disabled={refetching}
            className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`}
            aria-label="Recargar"
          >
            <RefreshCw className={`w-[18px] h-[18px] ${refetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="px-4 py-4 pb-10 space-y-3 max-w-2xl mx-auto">
        <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className="text-xs px-2 py-1 rounded-[var(--radius-sm)] font-medium"
              style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
            >
              {h.estadoOperativo || "sin estado"}
            </span>
            {h.condicionFisica ? (
              <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)]">
                {h.condicionFisica}
              </span>
            ) : null}
            {h.categoria ? (
              <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)]">
                {h.categoria}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <MapPin className="w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
              {h.ubicacionActual || "sin ubicación"}
              {h.tipoUbicacion ? <span className="text-[var(--fg-subtle)]">({h.tipoUbicacion})</span> : null}
            </span>
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <User className="w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
              {h.custodioActual || <span className="text-[var(--fg-subtle)]">sin custodio asignado</span>}
            </span>
          </div>
        </section>

        {srcFoto && !fotoRota ? (
          <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={srcFoto}
              alt={`Foto de ${h.name}`}
              onError={() => setFotoRota(true)}
              className="w-full max-h-[50vh] object-contain bg-[var(--surface-2)]"
            />
          </section>
        ) : null}

        <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[var(--accent)]" />
            Datos de la herramienta
          </h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Dato label="Marca">{h.marca}</Dato>
            <Dato label="Modelo">{h.modelo}</Dato>
            <Dato label="N° de serie">{h.numeroSerie}</Dato>
            <Dato label="Fuente de energía">{h.fuenteEnergia}</Dato>
            <Dato label="Última salida">{formatearFecha(h.fechaUltimaSalida)}</Dato>
            <Dato label="Última devolución">{formatearFecha(h.fechaUltimaDevolucion)}</Dato>
            <Dato label="Próximo mantenimiento">{formatearFecha(h.proximoMantenimiento)}</Dato>
          </dl>
          {h.observaciones ? (
            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
              <p className="text-[11px] uppercase tracking-wide text-[var(--fg-subtle)] mb-1">Observaciones</p>
              <p className="text-sm text-foreground break-words whitespace-pre-wrap">{h.observaciones}</p>
            </div>
          ) : null}
          {!h.marca && !h.modelo && !h.numeroSerie && !h.fuenteEnergia ? (
            <p className="text-sm text-[var(--fg-muted)]">
              Esta herramienta todavía no tiene cargados marca, modelo ni número de serie.
            </p>
          ) : null}
        </section>

        {/* Solo para Administrador y Oficina Tecnica: es para contabilidad y
            seguros. El servidor no manda estas columnas al resto. */}
        {verValorizacion && (h.valorCompra || h.fechaCompra) ? (
          <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CircleDollarSign className="w-4 h-4 text-[var(--chart-3)]" />
              Valorización
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato label="Valor de compra">
                <span className="tabular-nums">{formatearMonto(h.valorCompra)}</span>
              </Dato>
              <Dato label="Fecha de compra">{formatearFecha(h.fechaCompra)}</Dato>
            </dl>
          </section>
        ) : null}

        <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--accent)]" />
            Historial
            {movimientos.length ? (
              <span className="text-xs font-normal text-[var(--fg-subtle)] tabular-nums">
                ({movimientos.length})
              </span>
            ) : null}
          </h2>
          {movimientos.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">
              Esta herramienta todavía no tiene movimientos registrados.
            </p>
          ) : (
            <ol className="mt-1">
              {movimientos.map((m) => (
                <MovimientoFila key={m.id} m={m} />
              ))}
            </ol>
          )}
        </section>

        {srcFoto && fotoRota ? (
          <p className="text-center text-xs text-[var(--fg-subtle)] inline-flex items-center justify-center gap-1.5 w-full">
            <ImageIcon className="w-3.5 h-3.5" />
            No se pudo mostrar la foto de esta herramienta.
          </p>
        ) : null}
      </main>
    </div>
  );
}
