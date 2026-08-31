"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, PackagePlus, Loader2 } from "lucide-react";
import { buscarMateriales } from "@/lib/generador-oc/datos";
import CrearMaterialForm from "./CrearMaterialForm";

/**
 * Buscador de materiales para una linea de la orden. Busca en la base completa
 * (server-side, por nombre o por codigo interno) y, si el material no existe,
 * deja crearlo sin abandonar la orden.
 */
export default function MaterialPicker({ codigo, descripcion, unidades, categorias, onSelect }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open || creating) return undefined;
    if (term.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await buscarMateriales(term));
      } catch (error) {
        console.error("[generador-oc] Error al buscar materiales:", error);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [term, open, creating]);

  const handlePick = (material) => {
    onSelect(material);
    setOpen(false);
    setCreating(false);
    setTerm("");
    setResults([]);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {descripcion ? (
            <>
              {codigo && (
                <span className="font-mono text-xs text-muted-foreground">{codigo} · </span>
              )}
              {descripcion}
            </>
          ) : (
            <span className="text-muted-foreground">Buscar código o material…</span>
          )}
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setCreating(false);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{creating ? "Nuevo material" : "Base de datos de materiales"}</DialogTitle>
            <DialogDescription>
              {creating
                ? "Se agregará a la base de datos de materiales y quedará disponible para futuras órdenes."
                : "Busca por nombre o por código interno."}
            </DialogDescription>
          </DialogHeader>

          {creating ? (
            <CrearMaterialForm
              nombreInicial={term}
              unidades={unidades}
              categorias={categorias}
              onCreated={handlePick}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <div className="space-y-3">
              <Input
                aria-label="Buscar material por nombre o código"
                placeholder="Escribe al menos 2 caracteres…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />

              <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {searching && (
                  <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando…
                  </div>
                )}
                {!searching && term.trim().length >= 2 && results.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    No se encontró el material en la base de datos.
                  </div>
                )}
                {!searching && term.trim().length < 2 && (
                  <div className="p-4 text-sm text-muted-foreground">
                    Escribe para buscar en la base de datos.
                  </div>
                )}
                {!searching &&
                  results.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted"
                      onClick={() => handlePick(m)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.nombre}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{m.codigo}</span>
                          {m.unidad && ` · ${m.unidad}`}
                          {m.categoria && ` · ${m.categoria}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        $ {m.precioLista.toLocaleString("es-CL")}
                      </span>
                    </button>
                  ))}
              </div>

              {results.length === 20 && (
                <p className="text-xs text-muted-foreground">
                  Mostrando los primeros 20 resultados. Afina la búsqueda para ver otros.
                </p>
              )}

              <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
                <PackagePlus className="mr-2 h-4 w-4" />
                Crear material nuevo
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
