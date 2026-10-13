"use client";

import { ClipboardList } from "lucide-react";

/**
 * Lo que ve alguien que entra a SPM sin tenerla asignada.
 *
 * Existe para que el cartel diga UNA cosa sola y la correcta. El listado decia
 * "pedile que te asigne alguna app de VDV", y eso ya no es cierto desde que SPM
 * es una app aparte: tener el Generador de OC o Herramientas no alcanza, hace
 * falta SPM. Quien lee ese cartel pide el permiso equivocado, se lo dan, vuelve
 * a entrar y sigue sin poder.
 *
 * Y dice DONDE se arregla -Usuarios y Roles- porque el que lee esto no es el
 * que lo resuelve: lo tiene que reenviar.
 */
export function SinAcceso({ titulo = "Solicitudes de Material", icono: Icono = ClipboardList }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Icono className="mx-auto h-10 w-10 text-[var(--fg-subtle)]" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-foreground">{titulo}</h1>
      <p className="mt-1 text-sm text-[var(--fg-muted)]">
        Tu cuenta todavía no tiene asignada la app <strong>Solicitudes de Material</strong>. Pedile a un
        administrador que te la agregue desde Usuarios y Roles: tener otras apps de VDV no alcanza.
      </p>
    </div>
  );
}
