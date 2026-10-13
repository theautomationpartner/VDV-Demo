"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardList, Send } from "lucide-react";
import { SpmVdvBoard } from "@/lib/board-sdk";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useColumnOptions } from "@/hooks/useColumnOptions";
import { useSesionSpm } from "@/hooks/spm/useSesionSpm";
import { ElegirMateriales } from "@/components/spm/ElegirMateriales";
import { ElegirProveedores, leerMails } from "@/components/spm/ElegirProveedores";
import { FOCO_CAMPO, FOCO_BOTON } from "@/lib/ui-foco";

const board = new SpmVdvBoard();

const CAMPO = `h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-foreground ${FOCO_CAMPO}`;

export default function NuevaSolicitudPage() {
  const router = useRouter();
  const { cargando: cargandoSesion, tieneAcceso, nombre } = useSesionSpm();

  /**
   * Las obras y los centros de costo salen de los DROPDOWNS DE MONDAY, no de
   * una lista en el codigo. La app del cliente los tenia copiados adentro -34
   * obras y 142 centros, con valores de prueba como "ZZ" y "sa k"-, asi que una
   * obra nueva no aparecia hasta que alguien tocara el codigo.
   */
  const { options: obras, stale: obrasViejas } = useColumnOptions(board, "obra", []);
  const { options: centros } = useColumnOptions(board, "centroCosto", []);

  const [obra, setObra] = useState("");
  const [centroCosto, setCentroCosto] = useState("");
  const [lineas, setLineas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [guardando, setGuardando] = useState(false);

  /**
   * Lo que falta para poder guardar, en palabras.
   *
   * Se muestra la lista en vez de dejar el boton gris sin explicacion: un boton
   * deshabilitado y mudo es la forma mas rapida de que alguien abandone un
   * formulario largo.
   */
  const faltan = useMemo(() => {
    const f = [];
    if (!obra) f.push("elegir la obra");
    if (!centroCosto) f.push("elegir el centro de costo");
    if (!lineas.length) f.push("agregar al menos un material");
    if (lineas.some((l) => !l.nombre.trim())) f.push("ponerle nombre a todas las líneas");
    if (lineas.some((l) => !String(l.cantidad).trim())) f.push("poner la cantidad de cada material");
    if (!proveedores.length) f.push("elegir al menos un proveedor");
    if (proveedores.some((p) => !p.nombre.trim())) f.push("ponerle nombre a los proveedores ocasionales");
    if (proveedores.some((p) => !leerMails(p.correos)?.length)) f.push("un correo válido por proveedor");
    return f;
  }, [obra, centroCosto, lineas, proveedores]);

  const guardar = async () => {
    if (faltan.length) return;
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/spm/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          obra,
          centroCosto,
          lineas: lineas.map((l) => ({
            materialId: l.materialId,
            nombre: l.nombre.trim(),
            cantidad: String(l.cantidad).trim(),
            unidad: l.unidad.trim(),
          })),
          destinatarios: proveedores.map((p) => ({
            id: p.id,
            nombre: p.nombre.trim(),
            mails: leerMails(p.correos) ?? [],
            ocasional: p.ocasional,
          })),
        }),
      });
      const json = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        toast.error(json.error || "No se pudo crear la solicitud.");
        return;
      }
      /**
       * Se crea en BORRADOR y no sale a cotizar sola. Mandarla es un segundo
       * paso, desde la ficha: asi se puede revisar lo que se armo antes de que
       * le llegue a un proveedor, que es lo unico que no tiene vuelta atras.
       */
      toast.success(`${json.numero} creada. Revisala y mandala a cotizar.`);
      router.push(`/spm/${json.id}`);
    } catch (e) {
      console.error("[SPM] no se pudo crear:", e);
      toast.error("No se pudo conectar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoSesion) {
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
        <h1 className="mt-3 text-lg font-semibold text-foreground">Nueva solicitud</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Tu cuenta no tiene acceso a Solicitudes de Material.
        </p>
      </div>
    );
  }

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

      <header className="mt-2">
        <h1 className="text-xl font-semibold text-foreground">Nueva solicitud de material</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          La firma <span className="text-foreground">{nombre ?? "tu cuenta"}</span>. El número se asigna solo
          al guardar.
        </p>
      </header>

      <div className="mt-4 space-y-3">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <h2 className="text-sm font-semibold text-foreground">Datos de la solicitud</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="spm-obra" className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">
                Obra <span className="text-[var(--accent)]">*</span>
              </label>
              <select id="spm-obra" value={obra} onChange={(e) => setObra(e.target.value)} className={CAMPO}>
                <option value="">Elegir…</option>
                {obras.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              {obrasViejas ? (
                <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">Cargando las obras de monday…</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="spm-cc" className="mb-1 block text-xs font-medium text-[var(--fg-muted)]">
                Centro de costo <span className="text-[var(--accent)]">*</span>
              </label>
              <select
                id="spm-cc"
                value={centroCosto}
                onChange={(e) => setCentroCosto(e.target.value)}
                className={CAMPO}
              >
                <option value="">Elegir…</option>
                {centros.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <ElegirMateriales lineas={lineas} onCambiar={setLineas} />
        <ElegirProveedores elegidos={proveedores} onCambiar={setProveedores} />
      </div>

      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--background)] py-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {faltan.length ? (
            <>
              Falta: <span className="text-[var(--warning)]">{faltan.join(", ")}</span>
            </>
          ) : (
            "Se va a guardar como borrador. No le llega nada a nadie todavía."
          )}
        </p>
        <button
          onClick={guardar}
          disabled={Boolean(faltan.length) || guardando}
          className={`inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-foreground)] disabled:opacity-50 ${FOCO_BOTON}`}
        >
          {guardando ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          Guardar borrador
        </button>
      </div>
    </div>
  );
}
