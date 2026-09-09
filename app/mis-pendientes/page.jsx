"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  UserX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendientes } from "@/hooks/usePendientes";
import { paraHacerAhora } from "@/lib/pendientes";

// Los contratos son siempre en pesos; las ordenes de compra pueden estar en UF
// o en dolares, y mostrar "US$ 1.200" como "$ 1.200" cambia el numero por 1.000.
const fmt = (v, moneda = "CLP") => {
  if (moneda === "UF") return `UF ${(v || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 })}`;
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "CLP",
    maximumFractionDigits: 0,
  }).format(v || 0);
};

/**
 * Cuanto hace que esta ahi, y cuanto tiene que preocuparte. Los umbrales
 * salen de los datos reales del tablero: la mediana de lo que esta trabado en
 * VB Administrador es 90 dias y hay un contrato de 181, asi que un mes ya es
 * mucho y tres meses es una alarma.
 */
function Antiguedad({ dias }) {
  if (dias === null || dias === undefined) return null;
  const tono =
    dias >= 90
      ? "text-red-400 border-red-500/30 bg-red-950/20"
      : dias >= 30
        ? "text-yellow-400 border-yellow-500/30 bg-yellow-950/20"
        : "text-muted-foreground border-border bg-muted/30";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${tono}`}>
      <Clock className="h-3 w-3" aria-hidden />
      {dias === 0 ? "hoy" : `${dias} d`}
    </span>
  );
}

/**
 * Dos renglones y nada mas: el nombre del contrato -que es lo que te dice de
 * que estamos hablando- y debajo el paso, la obra y el monto juntos.
 *
 * Antes eran tres renglones con el paso arriba en una etiqueta. Se leia
 * "VB ADMINISTRADOR" primero en todas las filas, que es justo el dato que no
 * distingue una de otra, y entraban 7 en una pantalla. Al super aprobador le
 * tocan 11: tenia que scrollear para ver la mitad de lo que le falta aprobar,
 * que es exactamente lo que el pedido queria evitar.
 *
 * Los avisos (nadie asignado, falta el paso anterior) agregan un renglon, pero
 * son la excepcion y no la regla. "Lo devolviste con observaciones" no esta:
 * esas filas van en su propio grupo y el titulo del grupo ya lo dice.
 */
function Fila({ item }) {
  const contenido = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-foreground">
            {item.titulo}
          </p>
          <Antiguedad dias={item.dias} />
        </div>
        <p className="truncate text-xs leading-snug text-muted-foreground">
          <span className="text-foreground/70">{item.accion}</span>
          {" · "}
          {item.obra}
          {item.monto ? (
            <span className="tabular-nums">{` · ${fmt(item.monto, item.moneda)}`}</span>
          ) : null}
          {item.pasosExtra > 0
            ? ` · +${item.pasosExtra} paso${item.pasosExtra > 1 ? "s" : ""} tuyo${item.pasosExtra > 1 ? "s" : ""} acá`
            : null}
        </p>
        {item.sinCobertura ? (
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-red-400">
            <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Nadie tiene asignado este paso en {item.obra}: se configura en Usuarios y Roles.</span>
          </p>
        ) : null}
        {item.motivo ? (
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{item.motivo}</span>
          </p>
        ) : null}
      </div>
    </>
  );

  // Lo bloqueado se muestra pero no se linkea: llevarte a una pantalla donde el
  // boton va a estar deshabilitado es prometer algo que no se puede hacer.
  //
  // Lo que espera la firma del proveedor SI se linkea, aunque no sea accionable
  // en el sentido de aprobar: la ficha del contrato muestra el documento que se
  // mando a firmar y a que correo, que es exactamente lo que hace falta para ir
  // a perseguir al que lo tiene hace 45 dias.
  if (!item.habilitado && !item.esperandoFirma) {
    return (
      <Card className="flex items-start gap-3 border-border px-3 py-2.5 opacity-70">{contenido}</Card>
    );
  }

  return (
    <Card className="border-border py-0 transition-colors hover:border-foreground/20">
      <Link
        href={item.href}
        className="flex items-center gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {contenido}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </Card>
  );
}

export default function MisPendientesPage() {
  const { items, cargando, activo, ocHuerfanas } = usePendientes();
  // DIAGNOSTICO TEMPORAL: esto lo imprime la PAGINA, no el hook compartido.
  console.log("[PAGINA mis-pendientes] render. cargando:", cargando, "| activo:", activo, "| items:", items?.length, "| ocHuerfanas:", ocHuerfanas);
  const [verEsperando, setVerEsperando] = useState(false);

  // Tres estados distintos, y mezclarlos era el problema: lo que hay que hacer,
  // lo que ya devolviste con observaciones (espera al proveedor) y lo que
  // todavia no te toca porque falta el paso anterior.
  const ahora = paraHacerAhora(items);
  const observados = items.filter((i) => i.habilitado && i.observado);
  // Los cinco VB dados y el documento en la mano del proveedor. Antes estos
  // contratos DESAPARECIAN de la bandeja, aunque el circuito no hubiera
  // terminado: es lo que reporto el cliente.
  const enFirma = items.filter((i) => i.esperandoFirma);
  const esperando = items.filter((i) => !i.habilitado && !i.esperandoFirma);

  return (
    <div className="mx-auto max-w-[900px] space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-2.5">
        <Inbox className="h-5 w-5 shrink-0 text-foreground" aria-hidden />
        <h1 className="text-lg font-semibold text-foreground">Mis Pendientes</h1>
        {!cargando && activo ? (
          <span className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {ahora.length}
          </span>
        ) : null}
      </div>

      {cargando ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`pend-sk-${i}`} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : !activo ? (
        <Card className="border-border p-8">
          <p className="text-center text-sm text-muted-foreground">
            No tenés tareas de aprobación asignadas. Los pasos que da cada persona se configuran en
            Usuarios y Roles.
          </p>
        </Card>
      ) : items.length === 0 && ocHuerfanas === 0 ? (
        <Card className="border-border p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden />
            <p className="text-sm font-medium text-foreground">Estás al día</p>
            <p className="text-sm text-muted-foreground">No hay nada esperando tu aprobación.</p>
          </div>
        </Card>
      ) : (
        <>
          {ahora.length === 0 ? (
            <Card className="border-border p-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-6 w-6 text-green-400" aria-hidden />
                <p className="text-sm font-medium text-foreground">Nada para firmar ahora</p>
                <p className="text-sm text-muted-foreground">
                  {items.length > 0
                    ? "Hay cosas tuyas más abajo, pero ninguna depende de vos hoy."
                    : "No hay nada esperando tu aprobación."}
                </p>
              </div>
            </Card>
          ) : null}

          {ahora.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Para hacer ahora
              </h2>
              {ahora.map((item) => (
                <Fila key={item.clave} item={item} />
              ))}
            </section>
          )}

          {observados.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Devueltos con observaciones
              </h2>
              <p className="text-xs text-muted-foreground">
                Ya los revisaste: esperan que el proveedor conteste. Cuando lo resuelva, dale el
                visto bueno desde acá.
              </p>
              {observados.map((item) => (
                <Fila key={item.clave} item={item} />
              ))}
            </section>
          )}

          {ocHuerfanas > 0 && (
            <Card className="border-border px-3 py-2.5">
              <p className="flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-400" aria-hidden />
                <span>
                  Hay <span className="font-medium text-foreground">{ocHuerfanas}</span> órdenes de
                  compra en PENDIENTE sin aprobador asignado. No le aparecen a nadie acá porque
                  nadie las tiene a cargo.{" "}
                  <Link
                    href="/generador-oc"
                    className="text-foreground underline underline-offset-2"
                  >
                    Verlas en el historial
                  </Link>
                  .
                </span>
              </p>
            </Card>
          )}

          {enFirma.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Esperando la firma del proveedor
              </h2>
              <p className="text-xs text-muted-foreground">
                Ya tienen los cinco vistos buenos. El documento está en manos del representante
                legal del proveedor y se firma fuera de la app.
              </p>
              {enFirma.map((item) => (
                <Fila key={item.clave} item={item} />
              ))}
            </section>
          )}

          {esperando.length > 0 && (
            <section className="space-y-1.5">
              <button
                type="button"
                onClick={() => setVerEsperando((v) => !v)}
                aria-expanded={verEsperando}
                className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {verEsperando ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                {esperando.length} esperando un paso anterior
              </button>
              {verEsperando && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Te tocan a vos, pero todavía no: falta que firme quien va antes en el circuito.
                  </p>
                  {esperando.map((item) => (
                    <Fila key={item.clave} item={item} />
                  ))}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
