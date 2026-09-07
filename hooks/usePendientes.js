"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { claveDe, traerDatosPortal, yaTraido } from "@/hooks/portal-proveedor/portalDatos";
import { aplicarVbRecientes } from "@/lib/client/vb-recientes";
import {
  marcarSinCobertura,
  pendientesDeContratos,
  puedeDeberContratos,
} from "@/lib/pendientes";

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

/**
 * ESTADO COMPARTIDO, no uno por componente.
 *
 * Lo leen dos lugares a la vez: la bandeja y el numero del menu lateral. El
 * menu vive en el layout y no se vuelve a montar al navegar, asi que con un
 * estado por componente su contador se congelaba: despues de aprobar un
 * contrato la pantalla mostraba 10 y el menu seguia diciendo 11, los dos a la
 * vista al mismo tiempo. Un numero en el que no se puede confiar es peor que no
 * ponerlo, porque la gente entra por ese numero.
 */
let compartido = { items: [], cargando: true, activo: false };
const oyentes = new Set();
let cargando = null;

function publicar(nuevo) {
  compartido = nuevo;
  for (const avisar of oyentes) avisar(nuevo);
}

async function recargar() {
  if (cargando) return cargando;

  cargando = (async () => {
    const sesion = leerSesionPortal();

    if (!puedeDeberContratos(sesion)) {
      publicar({ items: [], cargando: false, activo: false });
      return;
    }

    // Lo que ya esta en cache se pinta al instante: el contador tiene que
    // aparecer enseguida o no cumple su funcion, que es que la gente entre.
    const cacheado = yaTraido(claveDe(sesion));
    if (cacheado) {
      publicar({
        items: pendientesDeContratos(aplicarVbRecientes(cacheado.contratos), sesion),
        cargando: false,
        activo: true,
      });
    }

    try {
      const [datos, cobertura] = await Promise.all([traerDatosPortal(sesion), traerCobertura()]);
      publicar({
        items: marcarSinCobertura(
          pendientesDeContratos(aplicarVbRecientes(datos.contratos), sesion),
          cobertura,
        ),
        cargando: false,
        activo: true,
      });
    } catch (error) {
      console.error("[pendientes] No se pudieron cargar:", error);
      // Con datos viejos en pantalla es mejor dejarlos que vaciar la lista.
      publicar({ ...compartido, cargando: false, activo: true });
    }
  })().finally(() => {
    cargando = null;
  });

  return cargando;
}

/**
 * Los pendientes de quien esta usando la app.
 *
 * Se releen en cada navegacion: es cuando cambia lo que hay para mostrar -se
 * vuelve de aprobar un contrato, o de editar los roles- y no cuesta una
 * consulta, porque los datos del Portal estan cacheados 5 minutos y el visto
 * bueno recien dado se aplica desde el navegador.
 *
 * `activo` es distinto de "no tiene pendientes": false significa que esta
 * persona no puede deber un VB de contrato -un subcontratista, alguien sin
 * pasos asignados- y entonces la seccion no va ni en el menu.
 */
export function usePendientes() {
  const pathname = usePathname();
  const [estado, setEstado] = useState(compartido);

  useEffect(() => {
    oyentes.add(setEstado);
    return () => {
      oyentes.delete(setEstado);
    };
  }, []);

  useEffect(() => {
    recargar();
  }, [pathname]);

  return { ...estado, recargar };
}
