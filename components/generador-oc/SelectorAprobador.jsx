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
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { getUsuariosAprobadores } from "@/lib/generador-oc/datos";

/**
 * Quien tiene que aprobar esta orden. Se elige entre los usuarios de monday,
 * porque la columna APROBADOR del tablero guarda un usuario de monday.
 *
 * La lista trae solo a quienes tienen el rol Aprobador en el OC Tracker, y sin
 * el emisor: nadie aprueba su propia orden. Ver getUsuariosAprobadores.
 *
 * Al EDITAR una orden vieja, el aprobador que ya tiene puede no estar en esa
 * lista: alcanza con que le hayan sacado el rol, o que nunca lo haya tenido
 * (las ordenes cargadas a mano en monday designan a cualquiera). Sin un
 * <SelectItem> que le corresponda, Base UI muestra el value crudo -el id de
 * monday, "36851962"- en vez del nombre; ver components/ui/select.jsx. Se lo
 * agrega igual, avisando que esa persona hoy no puede firmar.
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

  // El que ya figura en la orden, cuando no esta entre los que pueden aprobar.
  const fueraDeLista =
    valor && !usuarios.some((u) => String(u.id) === String(valor.id)) ? valor : null;

  // Si la orden ya tiene un aprobador, el desplegable se dibuja igual aunque no
  // haya nadie mas: sin el, la pantalla no mostraria a quien tiene designado.
  if (usuarios.length === 0 && !fueraDeLista) {
    return (
      <div className="space-y-2">
        <Label>Aprobador *</Label>
        <p className="text-sm text-muted-foreground">
          No hay nadie mas con el rol Aprobador y usuario de monday cargado. Se asigna en
          Usuarios y Roles.
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
          {fueraDeLista && (
            <SelectItem value={String(fueraDeLista.id)}>
              {fueraDeLista.name} — sin rol Aprobador
            </SelectItem>
          )}
          {usuarios.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.name}
              {u.cargo ? ` — ${u.cargo}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {fueraDeLista ? (
        <p className="flex items-start gap-1.5 text-xs text-[hsl(var(--precio-medio))]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {fueraDeLista.name} no tiene el rol Aprobador en el OC Tracker, así que no va a poder
            firmar esta orden. Elegí a otra persona, o dale el rol en Usuarios y Roles.
          </span>
        </p>
      ) : valor ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Al emitir, la orden queda pendiente y {valor.name.split(" ")[0]} recibirá la notificación.
        </p>
      ) : null}
    </div>
  );
}
