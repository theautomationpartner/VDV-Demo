"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Deja la pantalla en la version publicada, sin que la persona tenga que
 * refrescar ni enterarse.
 *
 * El problema: quien deja la app abierta sigue con el codigo viejo hasta que
 * refresca a mano. Skew Protection de Vercel evita que eso ROMPA nada (le sigue
 * sirviendo su version, coherente, por 12 horas), pero no lo actualiza: se
 * queda sin los arreglos que salieron mientras tanto.
 *
 * La regla es no interrumpir NUNCA. Recargar de golpe le borraria lo escrito a
 * alguien cargando un vale o una orden de compra, asi que solo se recarga en
 * momentos donde no hay nada que perder:
 *
 *   - cuando cambia de pantalla: ya estaba dejando la anterior, y recargar en
 *     vez de navegar por dentro es invisible (tarda un poco mas, nada mas);
 *   - cuando vuelve a la pestaña despues de haber estado en otra cosa, y no
 *     dejo nada escrito ni ningun dialogo abierto.
 *
 * Si esta en medio de algo, la actualizacion espera. No hay cartel ni boton:
 * pasa solo.
 */

const RUTA = "/api/version";

/** Algo a medio hacer que una recarga se llevaria puesto. */
function estaEnMedioDeAlgo() {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;

  for (const campo of document.querySelectorAll("input, textarea")) {
    if (campo.type === "hidden" || campo.disabled || campo.readOnly) continue;
    // Casillas y botones no tienen nada que perder; lo escrito si.
    if (campo.type === "checkbox" || campo.type === "radio") continue;
    if (campo.value?.trim()) return true;
  }
  return false;
}

async function versionPublicada() {
  try {
    const res = await fetch(RUTA, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json())?.version ?? null;
  } catch {
    // Sin conexion no hay nada que decidir: se reintenta en el proximo momento.
    return null;
  }
}

export function ActualizacionAutomatica() {
  const pathname = usePathname();
  // La version con la que arranco esta pestaña. Se fija una sola vez.
  const versionInicial = useRef(null);

  useEffect(() => {
    let vigente = true;

    const revisar = async ({ puedeRecargar }) => {
      const actual = await versionPublicada();
      if (!vigente || !actual || actual === "local") return;

      if (versionInicial.current === null) {
        versionInicial.current = actual;
        return;
      }
      if (actual === versionInicial.current) return;

      if (puedeRecargar && !estaEnMedioDeAlgo()) location.reload();
    };

    // Al cambiar de pantalla: momento seguro, la anterior ya quedo atras.
    // En la primera vuelta solo anota con que version arranco.
    revisar({ puedeRecargar: true });

    const alVolver = () => {
      if (document.visibilityState === "visible") revisar({ puedeRecargar: true });
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vigente = false;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [pathname]);

  return null;
}
