"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ControlHerramientasBoard, ControlHerramientasMovimientosBoard, EquipoVdvBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  ArrowLeft,
  Wrench,
  MapPin,
  User,
  RefreshCw,
  History,
  Image as ImageIcon,
  CircleDollarSign,
  Check,
  Clock3,
  AlertTriangle,
} from "lucide-react";
import { useSesionHerramientas } from "@/hooks/herramientas/useSesionHerramientas";
import { useColumnOptions } from "@/hooks/useColumnOptions";
import { AccionesHerramienta } from "@/components/herramientas/AccionesHerramienta";
import { HistorialHerramienta } from "@/components/herramientas/HistorialHerramienta";
import { FotosHerramienta } from "@/components/herramientas/FotosHerramienta";
import { NOMBRE_COLUMNA, RECEPCION_PENDIENTE, desfaseConElHistorial } from "@/lib/herramientas/dominio";
import {
  DIAS_PARA_ALERTA,
  formatoDias,
  mantencionVencida,
  permanenciaDe,
  COLUMNAS_FICHA,
  COLUMNAS_VALORIZACION,
  ESTADO_TONO,
  formatearFecha,
  formatearMonto,
} from "@/lib/herramientas/inventario";

const herramientasBoard = new ControlHerramientasBoard();
const movimientosBoard = new ControlHerramientasMovimientosBoard();
const equipoBoard = new EquipoVdvBoard();

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
  "recepcion",
  "confirmadaPor",
  "fechaConfirmacion",
];

/**
 * Cuantos movimientos se traen para buscar los de ESTA herramienta.
 *
 * El tablero de movimientos no tiene vinculo a la herramienta: guarda el id del
 * maestro como TEXTO (`idMaestro`), asi lo dejo el cliente. Se filtra por ese
 * texto en la consulta, pero el tope igual se pone alto porque un filtro por
 * texto en monday no siempre usa indice.
 *
 * No se pagina a proposito: medido el 08-oct, la herramienta con mas historial
 * tiene 5 movimientos, asi que a una que se mueva dos veces por mes le faltan
 * ocho años para llegar a 200. Lo que si hay es un aviso cuando se toca el tope
 * -ver `truncado`-, porque un historial al que le faltan movimientos sin decirlo
 * es peor que uno incompleto que lo avisa.
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

export default function FichaHerramientaPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { cargando: cargandoSesion, tieneAcceso, verValorizacion, puedeModificar, obrasPermitidas } =
    useSesionHerramientas();

  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [herramienta, setHerramienta] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [error, setError] = useState(null);

  // Las obras salen de los labels reales de la columna, no del inventario: hay
  // que poder mandar una herramienta a una obra donde todavia no hay ninguna.
  const { options: todasLasObras } = useColumnOptions(herramientasBoard, "ubicacionActual", []);
  const obras = useMemo(
    () => (obrasPermitidas ? todasLasObras.filter((o) => obrasPermitidas.includes(o)) : todasLasObras),
    [todasLasObras, obrasPermitidas],
  );

  // Sugerencias para el campo de custodio: los que ya figuran en el inventario,
  // leidos de lo que el listado dejo guardado. Sin consulta extra, y si no hay
  // cache el campo sigue siendo texto libre, que es como el cliente lo quiere
  // para un maestro sin usuario. Se resuelve al cargar la ficha (ver `cargar`).
  const [custodios, setCustodios] = useState([]);
  // Si el historial toco el tope y puede estar faltando lo mas viejo.
  const [truncado, setTruncado] = useState(false);
  const [poniendoAlDia, setPoniendoAlDia] = useState(false);

  const cargar = useCallback(async () => {
    setRefetching(true);
    try {
      // Se piden siempre: quien no puede verlas no las recibe, porque el
      // servidor las borra de la respuesta (quitarColumnasRestringidas en
      // lib/server/board-access-policy.js). Pedir menos columnas NO alcanza:
      // /api/monday/board devuelve todas las del schema igual.
      const columnas = [...COLUMNAS_FICHA, ...COLUMNAS_VALORIZACION];

      const [ficha, historial, equipo] = await Promise.all([
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
        // El directorio del equipo, para elegir el custodio de una lista. Es un
        // extra: si falla, el campo sigue andando como texto libre, que es lo
        // que igual hace falta para un maestro sin usuario.
        equipoBoard
          .items()
          .withColumns(["estado"])
          .withPagination({ limit: 200 })
          .execute()
          .catch((err) => {
            console.error("[HERRAMIENTAS] No se pudo traer Equipo VDV:", err);
            return { items: [] };
          }),
      ]);

      if (!ficha) {
        setError("No se encontró esa herramienta.");
        return;
      }
      setHerramienta(ficha);
      setError(null);

      // Quien puede quedar a cargo: SOLO la gente activa de "Equipo VDV". No se
      // mezclan los custodios que ya figuran cargados -hay nombres sueltos de
      // antes- porque el servidor rechaza cualquiera que no este en el
      // directorio, y ofrecer algo que va a rebotar es peor que no ofrecerlo.
      setCustodios(
        [
          ...new Set(
            (equipo.items || [])
              .filter((p) => (p.estado ?? "").toUpperCase() !== "INACTIVO")
              .map((p) => p.name?.trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b, "es")),
      );

      // Se compara contra lo que devolvio monday ANTES de filtrar por esta
      // herramienta: el tope es de la consulta, no del resultado.
      setTruncado((historial.items || []).length >= TOPE_MOVIMIENTOS);

      const filas = (historial.items || [])
        .filter((m) => String(m.idMaestro ?? "").trim() === String(id))
        /**
         * Por FECHA DE CREACION, no por "fecha del movimiento".
         *
         * Los dos guardan el dia, asi que dos movimientos del mismo dia empatan
         * y el orden queda librado al que devolvio monday. Eso rompia dos cosas
         * a la vez: el mapa podia mostrar el recorrido al reves, y el detector
         * de desfase comparaba contra el movimiento VIEJO -decia que la ficha
         * estaba mal cuando estaba bien, y "Poner al dia" habria revertido el
         * movimiento nuevo. Lo que vale es cual se escribio ultimo.
         *
         * El mismo criterio que usa ultimoMovimientoDe en el servidor.
         */
        .sort((a, b) => {
          const porCreacion = new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0);
          if (porCreacion !== 0) return porCreacion;
          return new Date(b.fechaMovimiento ?? 0) - new Date(a.fechaMovimiento ?? 0);
        });
      setMovimientos(filas);
    } catch (err) {
      console.error("[HERRAMIENTAS] No se pudo traer la ficha:", err);
      // Si el servidor CONTESTO y dijo que no, su motivo es el que sirve: "Tu
      // cuenta no tiene acceso a esa obra" explica algo que recargar no va a
      // arreglar nunca, y mandar a recargar ahi es hacerle perder el tiempo a
      // alguien. El mensaje generico queda para cuando no hubo respuesta.
      setError(
        err?.respondioServidor && err.message
          ? err.message
          : "No se pudo cargar la ficha. Probá recargar.",
      );
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

  const confirmar = async (movimientoId) => {
    try {
      const respuesta = await fetch("/api/herramientas/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimientoId }),
      });
      const json = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo confirmar.");
        return;
      }
      toast.success("Recepción confirmada.");
      cargar();
    } catch (err) {
      console.error("[HERRAMIENTAS] No se pudo confirmar:", err);
      toast.error("No se pudo conectar. Probá de nuevo.");
    }
  };

  const ponerAlDia = async () => {
    setPoniendoAlDia(true);
    try {
      const respuesta = await fetch("/api/herramientas/poner-al-dia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id }),
      });
      const json = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo poner al día.");
        return;
      }
      toast.success(json.yaEstaba ? "Ya estaba al día." : "Ficha puesta al día.");
      cargar();
    } catch (err) {
      console.error("[HERRAMIENTAS] No se pudo poner al dia:", err);
      toast.error("No se pudo conectar. Probá de nuevo.");
    } finally {
      setPoniendoAlDia(false);
    }
  };

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
          {tieneAcceso && /obra/i.test(error ?? "") ? (
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              Esa herramienta está en una obra que tu cuenta no tiene asignada.
            </p>
          ) : null}
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
  const dias = permanenciaDe(h);
  const vencida = mantencionVencida(h);
  const ultimo = movimientos[0] ?? null;
  /**
   * Si la ficha quedo diciendo algo distinto de lo que dice su ultimo
   * movimiento. Pasa cuando el movimiento se escribio pero la herramienta no
   * -monday caido, la conexion que se corta- y es grave para el negocio: la
   * herramienta figura donde ya no esta y alguien la va a ir a buscar. Se
   * detecta ACA, al abrir la ficha, para no depender de que alguien haya visto
   * un cartel en el momento en que fallo.
   */
  const desfase = desfaseConElHistorial(h, ultimo);
  const pendientes = movimientos.filter((m) => m.recepcion === RECEPCION_PENDIENTE).length;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Toaster richColors position="top-center" />

      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto w-full">
          <button
            onClick={() => router.push("/herramientas")}
            className={`flex items-center justify-center min-h-12 min-w-12 sm:h-9 sm:w-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`}
            aria-label="Volver al inventario"
          >
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold tracking-[-0.01em] truncate">{h.name}</h1>
            <p className="text-xs text-[var(--fg-subtle)]">
              <span className="font-mono tabular-nums">{h.codigo || "sin código"}</span>
              {h.marca ? <span className="text-[var(--fg-muted)]"> · {h.marca}</span> : null}
            </p>
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

      <main className="px-4 py-4 pb-10 space-y-3 max-w-3xl mx-auto">
        {desfase ? (
          <section className="rounded-[var(--radius-lg)] border border-[var(--warning)] bg-[color-mix(in_hsl,var(--warning)_10%,transparent)] p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--warning)]">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Esta ficha no coincide con su historial
            </h2>
            <p className="mt-1.5 text-sm text-foreground">
              El último movimiento fue <strong>{ultimo.tipoMovimiento}</strong> del{" "}
              {formatearFecha(ultimo.fechaMovimiento)}, pero la ficha no llegó a actualizarse.
            </p>
            <ul className="mt-2 space-y-0.5 text-sm text-[var(--fg-muted)]">
              {desfase.diferencias.map((d) => (
                <li key={d.clave}>
                  El <strong className="text-foreground">{NOMBRE_COLUMNA[d.clave] ?? d.clave}</strong> dice{" "}
                  <strong className="text-foreground">{d.dice || "(vacío)"}</strong> y debería decir{" "}
                  <strong className="text-foreground">{d.deberia || "(vacío)"}</strong>.
                </li>
              ))}
            </ul>
            {puedeModificar ? (
              <button
                onClick={ponerAlDia}
                disabled={poniendoAlDia}
                className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--warning)] px-4 text-sm font-medium text-[var(--background)] disabled:opacity-50 ${FOCUS_RING}`}
              >
                <RefreshCw className={`h-4 w-4 ${poniendoAlDia ? "animate-spin" : ""}`} />
                Poner al día
              </button>
            ) : (
              <p className="mt-2 text-xs text-[var(--fg-muted)]">
                Pedile a un bodeguero o administrador que la ponga al día.
              </p>
            )}
          </section>
        ) : null}

        {/* Donde esta, con quien, hace cuanto, y que se puede hacer: todo junto
            y arriba. Es lo que alguien viene a mirar y a resolver; el resto de
            la ficha es consulta. */}
        <section className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-xs px-2 py-1 rounded-[var(--radius-sm)] font-semibold"
              style={{ background: `color-mix(in hsl, ${tono} 14%, transparent)`, color: tono }}
            >
              {h.estadoOperativo || "sin estado"}
            </span>
            {h.condicionFisica ? (
              <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)]">
                {h.condicionFisica}
              </span>
            ) : null}
            {h.tipoUbicacion ? (
              <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)]">
                {h.tipoUbicacion}
              </span>
            ) : null}
            {h.categoria ? (
              <span className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] text-[var(--fg-muted)]">
                {h.categoria}
              </span>
            ) : null}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-lg font-semibold">
            <MapPin className="mt-1 w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
            <span className="min-w-0 break-words">{h.ubicacionActual || "sin ubicación"}</span>
          </p>
          <div className="mt-1 space-y-0.5 text-sm text-[var(--fg-muted)]">
            <p className="flex items-start gap-1.5">
              <User className="mt-0.5 w-3.5 h-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                {h.custodioActual || <span className="text-[var(--fg-subtle)]">sin custodio asignado</span>}
              </span>
            </p>
            {dias !== null ? (
              <p className={`flex items-center gap-1.5 ${dias >= DIAS_PARA_ALERTA ? "text-[var(--warning)]" : ""}`}>
                <Clock3 className="w-3.5 h-3.5 shrink-0" />
                {/* "Lleva hoy aca" no se entiende, y pasa en toda herramienta
                    que se movio el mismo dia -que son casi todas el dia que se
                    empieza a usar la app. */}
                {dias === 0 ? "Llegó hoy" : `Lleva ${formatoDias(dias).toLowerCase()} acá`}
              </p>
            ) : null}
            {ultimo ? (
              <p className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 shrink-0" />
                Último movimiento: {ultimo.tipoMovimiento} del {formatearFecha(ultimo.fechaMovimiento)}
              </p>
            ) : null}
            {vencida ? (
              <p className="flex items-center gap-1.5 text-[var(--warning)]">
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                Mantención vencida desde el {formatearFecha(h.proximoMantenimiento)}
              </p>
            ) : null}
            {pendientes ? (
              <p className="flex items-center gap-1.5 text-[var(--warning)]">
                <Clock3 className="w-3.5 h-3.5 shrink-0" />
                {pendientes === 1 ? "Hay 1 movimiento sin confirmar" : `Hay ${pendientes} movimientos sin confirmar`}
              </p>
            ) : null}
          </div>

          {/* Los botones salen del estado de hoy: una herramienta en uso se
              devuelve o se traslada, no se vuelve a sacar. */}
          {puedeModificar ? (
            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
              <AccionesHerramienta
                herramienta={h}
                obras={obras}
                custodiosConocidos={custodios}
                onHecho={cargar}
              />
            </div>
          ) : null}
        </section>

        <FotosHerramienta
          itemId={id}
          tieneFoto={Boolean(h.foto)}
          puedeSubir={puedeModificar}
          onSubida={cargar}
        />

        {/* Detalles y las tres formas de mirar el historial, como en la app del
            cliente: el mapa del recorrido, la linea de tiempo y la lista. */}
        <HistorialHerramienta
          herramienta={h}
          movimientos={movimientos}
          puedeConfirmar={puedeModificar}
          onConfirmar={confirmar}
          verValorizacion={verValorizacion}
          truncado={truncado}
        />
      </main>
    </div>
  );
}
