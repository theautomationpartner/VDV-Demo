"use client";

import Link from "next/link";
import { MailWarning } from "lucide-react";
import { Estado } from "@/components/spm/Estado";
import { FOCO_BOTON } from "@/lib/ui-foco";
import { emisorDe, leerDestinatarios } from "@/lib/spm/dominio";

/**
 * El reparto de columnas, compartido con la cabecera del listado.
 *
 * Esta exportado a proposito: si la cabecera y la fila declaran su propia
 * grilla, alcanza con tocar una para que los titulos dejen de caer sobre su
 * columna, y es de esas cosas que nadie nota hasta que el cliente la ve.
 *
 * Abajo de 1024px la grilla no se aplica y cada dato lleva su etiqueta adentro.
 */
export const COLUMNAS_FILA =
  "lg:grid-cols-[minmax(170px,1.5fr)_56px_minmax(110px,0.9fr)_minmax(160px,1.4fr)_64px_minmax(190px,auto)] lg:gap-x-4 lg:items-center";

export function FilaSolicitud({ solicitud: s }) {
  const { pedidas, recibidas, dias, completa, sinRespuesta } = s.respuestas;
  const destinatarios = leerDestinatarios(s);
  const ocasionales = destinatarios.filter((d) => d.ocasional).length;
  const emisor = emisorDe(s);

  return (
    <li>
      <Link
        href={`/spm/${s.id}`}
        /* Enganche para las pruebas. Sin esto hay que buscar las filas por
           `a[href^="/spm/"]`, que tambien agarra los links del menu lateral:
           el test clickeaba "Cotizaciones" creyendo que abria una ficha. */
        data-solicitud={s.id}
        className={`block rounded-[var(--radius-lg)] border bg-[var(--surface-1)] px-4 py-3 transition-colors hover:border-[var(--border-default)] ${FOCO_BOTON} ${
          sinRespuesta ? "border-[var(--danger)]" : "border-[var(--border-subtle)]"
        } flex flex-col gap-2 lg:grid lg:gap-y-0 ${COLUMNAS_FILA}`}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{s.numero || "Sin número"}</p>
          <p className="truncate text-xs text-[var(--fg-muted)]">
            {s.obra || "Sin obra"}
            {s.centroCosto ? ` · ${s.centroCosto}` : ""}
          </p>
        </div>

        <Dato etiqueta="Líneas" alineado="right">
          {s.lineas > 0 ? (
            <span className="text-sm tabular-nums text-[var(--fg-muted)]">{s.lineas}</span>
          ) : (
            /* Una solicitud sin lineas no se puede mandar: no pide nada. */
            <span className="text-xs text-[var(--warning)]">0</span>
          )}
        </Dato>

        <Dato etiqueta="Quién la pidió">
          <span className="block truncate text-xs text-[var(--fg-muted)]">
            {emisor ?? <span className="text-[var(--fg-subtle)]">Sin emisor</span>}
          </span>
        </Dato>

        <Dato etiqueta="Proveedores">
          <Proveedores destinatarios={destinatarios} ocasionales={ocasionales} />
        </Dato>

        {/*
          El dato que mas se mira y el que no estaba: cuantos de los que se
          citaron contestaron. Sin esto hay que entrar a cada solicitud para
          saber a quien falta apurar.
        */}
        <Dato etiqueta="Cotizaciones" alineado="right">
          {pedidas > 0 ? (
            <span
              className={`text-sm tabular-nums ${
                completa
                  ? "text-[var(--success)]"
                  : recibidas === 0
                    ? "text-[var(--fg-subtle)]"
                    : "text-[var(--accent)]"
              }`}
              title={`${recibidas} de ${pedidas} proveedores contestaron`}
            >
              {recibidas}/{pedidas}
            </span>
          ) : (
            <span className="text-xs text-[var(--warning)]">Sin citar</span>
          )}
        </Dato>

        <div className="flex flex-wrap items-center gap-1.5">
          <Estado valor={s.envioCotizacion} tipo="envio" />
          {/* Sin comparacion todavia no se dibuja nada: el guion al lado de la
              pastilla de "Borrador" se lee como un dato que falta cargar. */}
          {s.comparacion ? <Estado valor={s.comparacion} tipo="comparacion" /> : null}
          {sinRespuesta ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--danger)] px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]">
              <MailWarning className="h-3 w-3 shrink-0" aria-hidden />
              Sin respuesta{dias !== null ? ` · ${dias} d` : ""}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/**
 * Un dato con su etiqueta.
 *
 * La etiqueta se ve SOLO en celular, donde la fila se apila y la cabecera de
 * columnas no esta. En pantalla ancha la cabecera ya dice que es cada cosa y
 * repetirlo seria ruido.
 */
function Dato({ etiqueta, alineado, children }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 lg:block ${
        alineado === "right" ? "lg:text-right" : ""
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] lg:hidden">
        {etiqueta}
      </span>
      {children}
    </div>
  );
}

/**
 * A quien se le pidio.
 *
 * Se muestran nombres y no un numero porque "2 proveedores" no deja ver el
 * error mas comun: que se cito al mismo de siempre. Los OCASIONALES se marcan
 * aparte: no estan en el maestro, asi que su correo no lo validó nadie.
 */
function Proveedores({ destinatarios, ocasionales }) {
  if (destinatarios.length === 0) {
    return <span className="text-xs text-[var(--warning)]">Sin destinatarios</span>;
  }
  const primeros = destinatarios.slice(0, 2).map((d) => d.nombre).join(", ");
  const resto = destinatarios.length - 2;
  return (
    <span className="block min-w-0">
      <span className="block truncate text-xs text-[var(--fg-muted)]">
        {primeros}
        {resto > 0 ? ` +${resto}` : ""}
      </span>
      {ocasionales > 0 ? (
        <span className="text-[11px] text-[var(--fg-subtle)]">
          {ocasionales} ocasional{ocasionales === 1 ? "" : "es"}
        </span>
      ) : null}
    </span>
  );
}
