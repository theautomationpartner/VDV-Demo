"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import { getUsuariosAprobadores } from "@/lib/generador-oc/datos";

/**
 * Quien tiene que aprobar esta orden. Se elige entre los usuarios de monday,
 * porque la columna APROBADOR del tablero guarda un usuario de monday.
 *
 * El emisor queda fuera de la lista: nadie aprueba su propia orden.
 */
export default function SelectorAprobador({ valor, onChange, emisorId }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(false);

    getUsuariosAprobadores(emisorId)
      .then((lista) => {
        if (activo) setUsuarios(lista ?? []);
      })
      .catch((e) => {
        console.error("[generador-oc] Error al cargar aprobadores:", e);
        if (activo) setError(true);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [emisorId]);

  if (cargando) {
    return (
      <div className="space-y-2">
        <Label>Aprobador *</Label>
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <Label>Aprobador *</Label>
        <p className="text-sm text-destructive">
          No se pudo cargar la lista de usuarios. Reintenta recargando la página.
        </p>
      </div>
    );
  }

  if (usuarios.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Aprobador *</Label>
        <p className="text-sm text-muted-foreground">
          No hay otros usuarios activos disponibles para aprobar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="aprobador">Aprobador *</Label>
      <Select
        value={valor ? String(valor.id) : ""}
        onValueChange={(v) => {
          const u = usuarios.find((x) => String(x.id) === v);
          onChange(u ? { id: u.id, name: u.name, cargo: u.cargo } : null);
        }}
      >
        <SelectTrigger id="aprobador">
          <SelectValue placeholder="Seleccionar quién aprueba esta orden" />
        </SelectTrigger>
        <SelectContent>
          {usuarios.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
              {u.cargo ? ` — ${u.cargo}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {valor && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Al emitir, la orden queda pendiente y {valor.name.split(" ")[0]} recibirá la notificación.
        </p>
      )}
    </div>
  );
}
