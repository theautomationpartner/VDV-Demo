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
import { getAprobadoresDelEquipo } from "@/lib/generador-oc/datos";
import { personasActivas } from "@/lib/generador-oc/equipo-vdv";

/**
 * Quien tiene que aprobar esta orden. Se elige del tablero "Equipo VDV".
 *
 * Antes se elegia de los usuarios de monday, y ahi estaba el problema: cada
 * persona aparecia con el nombre de SU usuario de monday, y a quien no tenia
 * uno propio se le habia cargado el de una cuenta compartida. Agustin figuraba
 * como "obras@vergaradelvalle.com", y cuatro OC reales -2250, 2252, 2257 y
 * 2258- salieron con ese aprobador impreso en el PDF que recibio el proveedor.
 *
 * La lista trae solo a quien tiene ficha ACTIVA y el rol Aprobador en el OC
 * Tracker, y sin el emisor: nadie aprueba su propia orden. Ver
 * getAprobadoresDelEquipo.
 *
 * El aprobador que ya viene cargado puede no estar en esa lista, y por motivos
 * que se arreglan distinto:
 *
 *   - le sacaron el rol Aprobador -> se lo vuelven a dar, o se elige a otro
 *   - no tiene ficha, o esta inactiva -> hay que cargarla en Equipo VDV
 *   - es un borrador viejo, guardado cuando esto iba por id de monday -> hay
 *     que volver a elegirlo
 *
 * El borrador automatico del formulario guarda el aprobador entero en
 * localStorage (ver borradores.js) y lo restaura meses despues, asi que los
 * tres casos aparecen de verdad.
 *
 * Ademas, sin un <SelectItem> que le corresponda, Base UI muestra el value
 * crudo en vez del nombre; ver components/ui/select.jsx.
 */
export default function SelectorAprobador({ valor, onChange, emisorMail, puedeAprobarSusOrdenes = false }) {
  const [personas, setPersonas] = useState([]);
  // Todas las fichas activas, no solo las que aprueban: es lo que permite
  // distinguir "le falta el rol" de "no esta en el directorio".
  const [enDirectorio, setEnDirectorio] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(false);

    Promise.all([
      getAprobadoresDelEquipo(emisorMail, puedeAprobarSusOrdenes),
      personasActivas().catch(() => []),
    ])
      .then(([lista, todas]) => {
        if (!activo) return;
        setPersonas(lista ?? []);
        setEnDirectorio(todas ?? []);
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
  }, [emisorMail, puedeAprobarSusOrdenes]);

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
          No se pudo leer el tablero Equipo VDV. Reintentá recargando la página.
        </p>
      </div>
    );
  }

  const mailDe = (p) => String(p?.mail ?? p?.email ?? "").trim().toLowerCase();
  const mailValor = mailDe(valor);
  const nombreValor = valor?.name ?? valor?.nombre ?? "";

  // El que ya figura en la orden, cuando no esta entre los que pueden aprobar.
  const fueraDeLista =
    valor && !personas.some((p) => mailDe(p) === mailValor && mailValor) ? valor : null;

  // Y de esos, por que. Sin mail es un borrador viejo: se guardo cuando el
  // aprobador se identificaba por id de monday.
  const motivoFuera = !fueraDeLista
    ? null
    : !mailValor
      ? "guardado de antes, elegilo de nuevo"
      : enDirectorio.some((p) => mailDe(p) === mailValor)
        ? "sin rol Aprobador"
        : "no figura en Equipo VDV";

  // Si la orden ya tiene un aprobador, el desplegable se dibuja igual aunque no
  // haya nadie mas: sin el, la pantalla no mostraria a quien tiene designado.
  if (personas.length === 0 && !fueraDeLista) {
    return (
      <div className="space-y-2">
        <Label>Aprobador *</Label>
        <p className="text-sm text-muted-foreground">
          No hay nadie más con el rol Aprobador y ficha en Equipo VDV. Se asigna en Usuarios y
          Roles.
        </p>
      </div>
    );
  }

  // Los valores del desplegable son el MAIL. Un borrador viejo no lo tiene, y
  // para esos se usa una clave aparte para que igual se dibuje su fila.
  const CLAVE_SIN_MAIL = "__sin-mail__";
  const valorSelect = mailValor || (fueraDeLista ? CLAVE_SIN_MAIL : "");

  return (
    <div className="space-y-2">
      <Label htmlFor="aprobador">Aprobador *</Label>
      <Select
        value={valorSelect}
        onValueChange={(v) => {
          const p = personas.find((x) => mailDe(x) === v);
          // El MAIL es con lo que la emision encuentra su ficha. `itemVdv` va
          // para poder comparar por id sin tener que resolver de nuevo.
          onChange(p ? { mail: p.mail, name: p.nombre, cargo: p.cargo, itemVdv: p.id } : null);
        }}
      >
        <SelectTrigger id="aprobador">
          <SelectValue placeholder="Seleccionar quién aprueba esta orden" />
        </SelectTrigger>
        <SelectContent>
          {fueraDeLista && (
            <SelectItem value={valorSelect}>
              {nombreValor} — {motivoFuera}
            </SelectItem>
          )}
          {personas.map((p) => (
            <SelectItem key={p.id} value={mailDe(p)}>
              {p.nombre}
              {p.cargo ? ` — ${p.cargo}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {fueraDeLista ? (
        <p className="flex items-start gap-1.5 text-xs text-[hsl(var(--precio-alto))]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {motivoFuera === "sin rol Aprobador"
              ? `${nombreValor} no tiene el rol Aprobador en el OC Tracker, así que no va a poder firmar esta orden. Elegí a otra persona, o dale el rol en Usuarios y Roles.`
              : motivoFuera === "no figura en Equipo VDV"
                ? `${nombreValor} no figura en el tablero Equipo VDV. Elegí a otra persona, o pedí que le carguen la ficha con su mail.`
                : "Este aprobador quedó guardado de antes y ya no se puede identificar. Elegí a la persona de nuevo en la lista."}
          </span>
        </p>
      ) : valor ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Al emitir, la orden queda pendiente y {nombreValor.split(" ")[0]} recibirá la notificación.
        </p>
      ) : null}
    </div>
  );
}
