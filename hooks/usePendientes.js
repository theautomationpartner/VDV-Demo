"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { claveDe, traerDatosPortal, yaTraido } from "@/hooks/portal-proveedor/portalDatos";
import { pendientesDeContratos, puedeDeberContratos } from "@/lib/pendientes";

/** La sesion del Portal, que es donde viven los pasos de contrato asignados. */
function leerSesionPortal() {
  if (typeof window === "undefined") return null;
  try {
    const crudo = localStorage.getItem("pp_session");
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

/**
 * Los pendientes de quien esta usando la app.
 *
 * Lo usan dos lugares con necesidades distintas: la pantalla, que los muestra,
 * y el menu lateral, que solo quiere el numero. Por eso se apoya en el mismo
 * traido del Portal que ya usan sus pantallas (una sola consulta cada 5
 * minutos, compartida) y pinta primero lo que haya en cache: el contador tiene
 * que aparecer al instante o no cumple su funcion, que es que la gente entre.
 *
 * `activo` es distinto de "no tiene pendientes": false significa que esta
 * persona no puede deber un VB de contrato -un subcontratista, alguien sin
 * pasos asignados- y entonces la seccion no va ni en el menu.
 */
export function usePendientes() {
  const [estado, setEstado] = useState({ items: [], cargando: true, activo: false });
  const vigente = useRef(true);

  const cargar = useCallback(async () => {
    const sesion = leerSesionPortal();

    if (!puedeDeberContratos(sesion)) {
      if (vigente.current) setEstado({ items: [], cargando: false, activo: false });
      return;
    }

    const cacheado = yaTraido(claveDe(sesion));
    if (cacheado && vigente.current) {
      setEstado({
        items: pendientesDeContratos(cacheado.contratos, sesion),
        cargando: false,
        activo: true,
      });
    }

    try {
      const datos = await traerDatosPortal(sesion);
      if (!vigente.current) return;
      setEstado({
        items: pendientesDeContratos(datos.contratos, sesion),
        cargando: false,
        activo: true,
      });
    } catch (error) {
      console.error("[pendientes] No se pudieron cargar:", error);
      // Con datos viejos en pantalla es mejor dejarlos que vaciar la lista.
      if (vigente.current) setEstado((previo) => ({ ...previo, cargando: false, activo: true }));
    }
  }, []);

  useEffect(() => {
    vigente.current = true;
    cargar();
    return () => {
      vigente.current = false;
    };
  }, [cargar]);

  return { ...estado, recargar: cargar };
}
