"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  ExternalLink,
  Mail,
  RefreshCw,
  Send,
} from "lucide-react";
import { SpmVdvBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { Estado } from "@/components/spm/Estado";
import { BOARD_SPM, urlItemMonday } from "@/lib/monday-links";
import { FOCO_BOTON } from "@/lib/ui-foco";
import {
  COLUMNAS_FICHA,
  COLUMNAS_LINEA,
  ENVIO,
  diasDesde,
  leerDestinatarios,
  leerLinea,
  porQueNoSePuedeEnviar,
  sePuedeEnviar,
} from "@/lib/spm/dominio";

const board = new SpmVdvBoard();

export default function FichaSolicitudPage({ params }) {
  const { id } = use(params);
  const { cargando: cargandoSesion, tieneAcceso, puedeEnviar } = useSesionSpm();

  const [solicitud, setSolicitud] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setRefrescando(true);
    try {
      /**
       * Las lineas vienen ANIDADAS en la solicitud, no de una consulta aparte.
       *
       * El tablero de subelementos es uno solo para todas las solicitudes y lo
       * que devuelve la API no trae de quien es cada linea: no hay `parentId`.
       * Leerlas sueltas y filtrar por el padre deja la tabla vacia SIEMPRE, sin
       * ningun error. `withSubItems` las trae colgando de su solicitud, que es
       * la unica forma de saber cuales son.
       */
      /**
       * Sin `withRelations`, y no es un olvido: leer UN item siempre devuelve
       * los vinculos resueltos -el servidor los pide siempre en ese camino-.
       * `ItemReader` ni siquiera tiene ese metodo, asi que llamarlo revienta la
       * pantalla entera con "is not a function". Es distinto del listado, que
       * si tiene que pedirlo.
       */
      const ficha = await board
        .get(id)
        .withColumns(COLUMNAS_FICHA)
        .withSubItems("SpmVdvItemsBoard", COLUMNAS_LINEA)
        .execute();

      if (!ficha) {
        setError("No se encontró esa solicitud.");
        return;
      }
      setSolicitud(ficha);
      setError(null);
      setLineas(ficha.subitems ?? []);
    } catch (e) {
      console.error("[SPM] no se pudo leer la solicitud:", e);
      setError("No se pudo leer la solicitud. Probá recargar.");
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [id]);

  useEffect(() => {
    if (cargandoSesion || !tieneAcceso) return;
    cargar();
  }, [cargandoSesion, tieneAcceso, cargar]);

  const mandar = async () => {
    setEnviando(true);
    try {
      const respuesta = await fetch("/api/spm/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spmId: id }),
      });
      const json = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo enviar.");
        return;
      }
      toast.success("Saliendo. Los correos salen en unos segundos.");
      cargar();
    } catch (e) {
      console.error("[SPM] no se pudo enviar:", e);
      toast.error("No se pudo conectar. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoSesion || cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-[var(--fg-subtle)]" />
        <p className="mt-3 text-sm text-[var(--fg-muted)]">
          Tu cuenta no tiene acceso a Solicitudes de Material.
        </p>
      </div>
    );
  }

  if (error || !solicitud) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-[var(--danger)]">{error ?? "No se encontró la solicitud."}</p>
        <Link href="/spm" className={`mt-3 inline-block text-sm text-[var(--accent)] ${FOCO_BOTON}`}>
          Volver a las solicitudes
        </Link>
      </div>
    );
  }

  const destinatarios = leerDestinatarios(solicitud);
  const dias = diasDesde(solicitud.fechaEnvio);
  const motivo = porQueNoSePuedeEnviar(solicitud);
  const fallo =
    solicitud.envioCotizacion === ENVIO.ERROR || solicitud.comparacion === "Error comparación";

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5">
      <Toaster />

      <Link
        href="/spm"
        className={`inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-foreground ${FOCO_BOTON}`}
      >
        <ArrowLeft className="h-4 w-4" />
        Solicitudes
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{solicitud.numero || "Sin número"}</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {solicitud.obra || "Sin obra"}
            {solicitud.centroCosto ? ` · ${solicitud.centroCosto}` : ""}
            {solicitud.emisorVdv?.linkedItems?.[0]?.name
              ? ` · la pidió ${solicitud.emisorVdv.linkedItems[0].name}`
              : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Estado valor={solicitud.envioCotizacion} tipo="envio" />
            <Estado valor={solicitud.comparacion} tipo="comparacion" />
            {dias !== null ? (
              <span className="text-xs text-[var(--fg-subtle)]">
                {dias === 0 ? "enviada hoy" : `enviada hace ${dias} d`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={cargar}
            disabled={refrescando}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground disabled:opacity-50 ${FOCO_BOTON}`}
          >
            <RefreshCw className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <a
            href={urlItemMonday(solicitud.id, BOARD_SPM)}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] px-3 text-sm font-medium text-foreground ${FOCO_BOTON}`}
          >
            <ExternalLink className="h-4 w-4" />
            Ver en monday
          </a>
        </div>
      </header>

      {fallo ? (
        <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger)] bg-[color-mix(in_hsl,var(--danger)_8%,transparent)] p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {solicitud.envioCotizacion === ENVIO.ERROR
                ? "No se pudieron mandar los correos."
                : "No se pudo armar el cuadro comparativo."}
            </p>
            <p className="text-[var(--fg-muted)]">
              El motivo queda escrito como nota en el item de monday.{" "}
              <a
                href={urlItemMonday(solicitud.id, BOARD_SPM)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline underline-offset-2"
              >
                Verlo
              </a>
              .
            </p>
          </div>
        </div>
      ) : null}

      <section className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Materiales pedidos
          <span className="ml-2 font-normal text-[var(--fg-muted)]">{lineas.length}</span>
        </h2>
        {lineas.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--fg-muted)]">Esta solicitud no tiene líneas cargadas.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] text-left text-xs text-[var(--fg-muted)]">
                <th className="py-2 pr-3 font-medium">Material</th>
                <th className="w-24 py-2 pr-3 font-medium">Cantidad</th>
                <th className="w-28 py-2 font-medium">Unidad</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const linea = leerLinea(l);
                return (
                  <tr key={l.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-2 pr-3 text-foreground">
                      {linea.nombre}
                      {linea.suelta ? (
                        <span
                          className="ml-2 rounded-full border border-[var(--border-default)] px-1.5 text-[10px] text-[var(--fg-subtle)]"
                          title="No está en el catálogo de materiales"
                        >
                          fuera de catálogo
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-foreground">{l.cantidad || "—"}</td>
                    <td className="py-2 text-[var(--fg-muted)]">{linea.unidad || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
        <h2 className="text-sm font-semibold text-foreground">
          A quién se le pide
          <span className="ml-2 font-normal text-[var(--fg-muted)]">{destinatarios.length}</span>
        </h2>
        {destinatarios.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--warning)]">
            No tiene destinatarios, así que no se le puede pedir a nadie.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {destinatarios.map((d, i) => (
              <li key={`${d.nombre}-${i}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <Mail className="h-3.5 w-3.5 shrink-0 text-[var(--fg-subtle)]" />
                <span className="text-foreground">{d.nombre}</span>
                <span className="text-xs text-[var(--fg-muted)]">{d.mails.join(", ")}</span>
                {d.ocasional ? (
                  <span className="rounded-full border border-[var(--border-default)] px-1.5 text-[10px] text-[var(--fg-subtle)]">
                    ocasional
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {solicitud.proveedorRecomendado || solicitud.cuadroComparativo ? (
        <section className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <h2 className="text-sm font-semibold text-foreground">Comparativo</h2>
          {solicitud.proveedorRecomendado ? (
            <p className="mt-1 text-sm text-foreground">
              Recomendado: <span className="font-medium text-[var(--success)]">{solicitud.proveedorRecomendado}</span>
            </p>
          ) : null}
          {solicitud.cuadroComparativo ? (
            /**
             * El cuadro lo escribe la IA como texto plano en una columna de
             * monday. Se muestra tal cual, en monoespaciada: cualquier intento
             * de re-formatearlo seria inventar una estructura que ese texto no
             * tiene garantizada.
             */
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] bg-[var(--surface-2)] p-3 text-xs leading-relaxed text-[var(--fg-muted)]">
              {solicitud.cuadroComparativo}
            </pre>
          ) : null}
        </section>
      ) : null}

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--background)] py-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {motivo ??
            (destinatarios.length
              ? `Al mandarla salen los correos a ${destinatarios.length} proveedor${destinatarios.length === 1 ? "" : "es"}. No se puede deshacer.`
              : "Sin destinatarios no se puede mandar.")}
        </p>
        {puedeEnviar && sePuedeEnviar(solicitud) ? (
          <button
            onClick={mandar}
            disabled={enviando || destinatarios.length === 0}
            className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCO_BOTON}`}
          >
            {enviando ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            {solicitud.envioCotizacion === ENVIO.ERROR ? "Reintentar el envío" : "Mandar a cotizar"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
