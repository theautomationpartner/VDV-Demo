"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { claveDe, traerDatosPortal, yaTraido } from "@/hooks/portal-proveedor/portalDatos";
import {
  marcarSinCobertura,
  pendientesDeContratos,
  puedeDeberContratos,
} from "@/lib/pendientes";

const COBERTURA_TTL_MS = 5 * 60 * 1000;
let _cobertura = { datos: null, time: 0, promise: null };

/**
 * Quien tiene asignado cada paso, para saber si un contrato esta cayendo en
 * esta bandeja porque nadie mas lo tiene. Cambia solo cuando alguien edita
 * Usuarios y Roles, asi que se cachea igual que el resto.
 *
 * Si falla se sigue sin ella: la bandeja funciona, solo que no marca los
 * huecos. Es un aviso extra, no el contenido.
 */
async function traerCobertura() {
  if (_cobertura.datos && Date.now() - _cobertura.time < COBERTURA_TTL_MS) return _cobertura.datos;
  if (_cobertura.promise) return _cobertura.promise;

  _cobertura.promise = (async () => {
    try {
      const res = await fetch("/api/contratos/cobertura");
      if (!res.ok) return null;
      const json = await res.json();
      _cobertura = { datos: json?.result ?? null, time: Date.now(), promise: null };
      return _cobertura.datos;
    } catch (error) {
      console.warn("[pendientes] no se pudo saber quien cubre cada paso:", error?.message);
      _cobertura.promise = null;
      return null;
    }
  })();

  return _cobertura.promise;
}

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
      const [datos, cobertura] = await Promise.all([
        traerDatosPortal(sesion),
        traerCobertura(),
      ]);
      if (!vigente.current) return;
      setEstado({
        items: marcarSinCobertura(pendientesDeContratos(datos.contratos, sesion), cobertura),
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
