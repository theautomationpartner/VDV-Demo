"use client";

import { useState, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCentrosCosto } from "@/lib/generador-oc/datos";

/**
 * A que centro de costo se imputa una linea de la orden.
 *
 * La lista sale de las etiquetas reales del desplegable en monday, no de una
 * copia en el codigo: la Vibe tenia 65 centros escritos a mano y cada centro
 * nuevo del cliente quedaba fuera hasta tocar el codigo.
 *
 * El catalogo no cambia dentro de una sesion, asi que se cachea en memoria.
 */
let cache = null;

export default function SelectorCentroCosto({ valor, onChange, onAplicarATodas }) {
  const [abierto, setAbierto] = useState(false);
  const [centros, setCentros] = useState(cache ?? []);
  const [cargando, setCargando] = useState(!cache);

  useEffect(() => {
    if (cache) return undefined;
    let activo = true;

    getCentrosCosto()
      .then((lista) => {
        if (!activo) return;
        cache = lista ?? [];
        setCentros(cache);
      })
      .catch((e) => console.error("[generador-oc] Error al cargar centros de costo:", e))
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              !valor && "text-muted-foreground",
            )}
          />
        }
      >
        <span className="min-w-0 flex-1 truncate">{valor || "Sin asignar"}</span>
        {cargando ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,340px)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar centro de costo…" />
          <CommandList>
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {centros.map((centro) => (
                <CommandItem
                  key={centro}
                  value={centro}
                  onSelect={() => {
                    onChange(centro);
                    setAbierto(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", valor === centro ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{centro}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {valor && onAplicarATodas && (
          <div className="border-t border-border p-2">
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onAplicarATodas(valor);
                setAbierto(false);
              }}
            >
              Aplicar «{valor}» a todas las líneas
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
