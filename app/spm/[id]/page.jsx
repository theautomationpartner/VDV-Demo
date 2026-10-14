"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
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
import { SpmVdvBoard, CotizacionesSpmBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { SinAcceso } from "@/components/spm/SinAcceso";
import { porQueNoPuedeEnviar } from "@/lib/spm-roles";
import { Estado } from "@/components/spm/Estado";
import { TarjetaCotizacion } from "@/components/spm/TarjetaCotizacion";
import { COLUMNAS_COTIZACION, COLUMNAS_LINEA_COTIZADA } from "@/lib/spm/cotizaciones";
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
const cotizacionesBoard = new CotizacionesSpmBoard();

export default function FichaSolicitudPage({ params }) {
  const { id } = use(params);
  const { cargando: cargandoSesion, tieneAcceso, puedeEnviar, rol } = useSesionSpm();

  const [solicitud, setSolicitud] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Mientras Make manda los correos y vuelve a escribir "Enviado".
  const [esperandoAMake, setEsperandoAMake] = useState(false);
  const [tardoDemasiado, setTardoDemasiado] = useState(false);
  const relojEspera = useRef(null);
  const [error, setError] = useState(null);


  // Si alguien se va de la pantalla, no queda un reloj corriendo.
  useEffect(() => () => {
    if (relojEspera.current) clearInterval(relojEspera.current);
  }, []);

  const cargar = useCallback(async () => {
    let fichaLeida = null;
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
        return null;
      }
      setSolicitud(ficha);
      // Se DEVUELVE para que la espera de Make mire el valor fresco. Leer el
      // estado desde el intervalo daria siempre el de la primera vuelta.
      fichaLeida = ficha;
      setError(null);
      setLineas(ficha.subitems ?? []);

      /**
       * Las cotizaciones se piden aparte y filtrando POR EL VINCULO al SPM.
       * `where` sobre una columna de conexion compara el id del item vinculado,
       * que es lo unico estable: el nombre de la solicitud lo puede cambiar
       * cualquiera. Es un extra: si falla, la ficha se muestra igual.
       */
      try {
        const c = await cotizacionesBoard
          .items()
          .withColumns(COLUMNAS_COTIZACION)
          .withSubItems("CotizacionesSpmItemsBoard", COLUMNAS_LINEA_COTIZADA)
          .withRelations()
          .where({ spm: { linkedItemId: id } })
          .withPagination({ limit: 50 })
          .execute();
        setCotizaciones(c.items ?? []);
      } catch (e) {
        console.error("[SPM] no se pudieron leer las cotizaciones:", e);
        setCotizaciones([]);
      }
    } catch (e) {
      console.error("[SPM] no se pudo leer la solicitud:", e);
      setError("No se pudo leer la solicitud. Probá recargar.");
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
    return fichaLeida;
  }, [id]);

  /**
   * ESPERAR A QUE MAKE TERMINE, SIN QUE EL USUARIO TENGA QUE RECARGAR.
   *
   * La app marca "Por enviar" y ahi termina SU trabajo: los correos los manda
   * Make, que tarda unos 8 segundos y recien despues escribe "Enviado". Como
   * la ficha se recarga en el acto, lee la columna ANTES de ese cambio y queda
   * mostrando "Por enviar / Esta saliendo en este momento" para siempre.
   *
   * A la vista parece que se colgo, y la reaccion natural es volver a apretar.
   *
   * Asi que se vuelve a consultar cada 10 segundos hasta que la columna cambie.
   * Es el mismo patron que la app del cliente ya usa para la comparacion
   * -polling con tope y un aviso si se pasa-, aplicado al envio, que es donde
   * mas se nota porque la espera es corta.
   *
   * El tope son 2 minutos: pasado eso, Make no corrio. No se insiste en
   * silencio, se dice -y ademas la solicitud ya le va a aparecer a su emisor en
   * Mis Pendientes, que es la red de seguridad de verdad.
   */
  const CADA = 10_000;
  const HASTA = 2 * 60 * 1000;

  const esperarAMake = useCallback(() => {
    if (relojEspera.current) clearInterval(relojEspera.current);
    setEsperandoAMake(true);
    setTardoDemasiado(false);
    const desde = Date.now();

    relojEspera.current = setInterval(async () => {
      if (Date.now() - desde > HASTA) {
        clearInterval(relojEspera.current);
        relojEspera.current = null;
        setEsperandoAMake(false);
        setTardoDemasiado(true);
        return;
      }
      const fresca = await cargar();
      if (fresca && fresca.envioCotizacion !== ENVIO.POR_ENVIAR) {
        clearInterval(relojEspera.current);
        relojEspera.current = null;
        setEsperandoAMake(false);
      }
    }, CADA);
  }, [cargar]);

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
      esperarAMake();
    } catch (e) {
      console.error("[SPM] no se pudo enviar:", e);
      toast.error("No se pudo conectar. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  // Mismo orden que el resto: acceso primero, carga despues. Ver el comentario
  // de app/spm/cotizaciones/page.jsx.
  if (cargandoSesion) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!tieneAcceso) return <SinAcceso />;

  if (cargando) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
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

      <section className="mt-3">
        <h2 className="text-sm font-semibold text-foreground">
          Lo que contestaron
          <span className="ml-2 font-normal text-[var(--fg-muted)]">
            {cotizaciones.length} de {destinatarios.length}
          </span>
        </h2>
        {cotizaciones.length === 0 ? (
          <p className="mt-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--fg-muted)]">
            {solicitud.envioCotizacion === ENVIO.ENVIADO
              ? "Todavía no contestó nadie. Las cotizaciones entran solas cuando el proveedor responde el correo."
              : "Cuando se mande a cotizar, las respuestas van a aparecer acá."}
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {cotizaciones.map((c) => (
              <TarjetaCotizacion
                key={c.id}
                cotizacion={c}
                lineasPedidas={lineas.length}
                onCambiado={cargar}
              />
            ))}
          </div>
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
        {/*
          Tres motivos distintos por los que puede no haber boton, y los tres se
          dicen en palabras: por el ESTADO de la solicitud (ya salio), por falta
          de DESTINATARIOS, o por el ROL de quien mira. El ultimo es el que mas
          confunde si se calla: la pantalla se ve completa, el boton no esta, y
          la persona cree que la app se rompio.
        */}
        {/*
          Mientras se espera a Make, el texto lo dice Y SE MUEVE: el punto que
          gira es lo que diferencia "esta pasando algo" de "se colgo". Sin eso,
          un cartel quieto que dice "esta saliendo" invita a apretar de nuevo.
        */}
        {esperandoAMake ? (
          <p className="flex items-center gap-2 text-xs text-[var(--accent)]">
            <Spinner className="h-3 w-3" />
            Saliendo… los correos tardan unos segundos. Esto se actualiza solo.
          </p>
        ) : tardoDemasiado ? (
          <p className="text-xs text-[var(--warning)]">
            Pasaron 2 minutos y sigue sin confirmarse. Los correos pueden haber salido igual:
            revisá en monday antes de volver a mandarla. Si no salieron, te va a aparecer en Mis
            Pendientes.
          </p>
        ) : (
          <p className="text-xs text-[var(--fg-muted)]">
            {motivo ??
              (!puedeEnviar
                ? porQueNoPuedeEnviar(rol)
                : destinatarios.length
                  ? `Al mandarla salen los correos a ${destinatarios.length} proveedor${destinatarios.length === 1 ? "" : "es"}. No se puede deshacer.`
                  : "Sin destinatarios no se puede mandar.")}
          </p>
        )}
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
