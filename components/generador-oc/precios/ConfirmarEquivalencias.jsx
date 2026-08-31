"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import { guardarEquivalencia } from "@/lib/generador-oc/historial-precios";

/**
 * Cuando el algoritmo no puede decidir si dos nombres son el mismo material, se
 * lo pregunta a la persona. La respuesta queda guardada en el tablero
 * EQUIVALENCIAS DE MATERIALES y sirve para las comparaciones siguientes.
 */
export default function ConfirmarEquivalencias({ nombreActual, posibles, usuario, onRegistrado }) {
  const [guardando, setGuardando] = useState(null);
  const [resueltos, setResueltos] = useState({});

  const unicos = [...new Map(posibles.map((p) => [p.nombre.toUpperCase(), p])).values()];
  if (unicos.length === 0) return null;

  const confirmar = async (nombre, esMismo) => {
    setGuardando(nombre);
    setResueltos((prev) => ({ ...prev, [nombre]: esMismo ? "MISMO" : "DISTINTO" }));
    try {
      const res = await guardarEquivalencia({
        nombreA: nombreActual,
        nombreB: nombre,
        esMismo,
        usuario,
      });
      if (!res?.ok) {
        // No se guardo: se deshace la marca para no mentirle al usuario.
        setResueltos((prev) => {
          const copia = { ...prev };
          delete copia[nombre];
          return copia;
        });
      } else {
        onRegistrado();
      }
    } catch (error) {
      console.error("[generador-oc] Error al confirmar equivalencia:", error);
      setResueltos((prev) => {
        const copia = { ...prev };
        delete copia[nombre];
        return copia;
      });
    } finally {
      setGuardando(null);
    }
  };

  return (
    <section className="space-y-3 rounded-md border bg-muted/40 p-3">
      <div>
        <h4 className="text-sm font-semibold">Compras posiblemente relacionadas</h4>
        <p className="text-xs text-muted-foreground">
          Confirmá si corresponden al mismo material, para mejorar las comparaciones futuras.
        </p>
      </div>

      <ul className="space-y-2">
        {unicos.map((p) => {
          const estado = resueltos[p.nombre];
          return (
            <li
              key={p.nombre}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background p-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{p.nombre}</span>

              {estado ? (
                <span className="text-xs text-muted-foreground">
                  {estado === "MISMO"
                    ? "Marcado como el mismo material"
                    : "Marcado como material distinto"}
                </span>
              ) : (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={guardando === p.nombre}
                    onClick={() => confirmar(p.nombre, true)}
                  >
                    {guardando === p.nombre ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-3 w-3" />
                    )}
                    Es el mismo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={guardando === p.nombre}
                    onClick={() => confirmar(p.nombre, false)}
                  >
                    <X className="mr-1 h-3 w-3" />
                    No lo es
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
