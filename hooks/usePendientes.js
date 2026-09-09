"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { claveDe, traerDatosPortal, yaTraido } from "@/hooks/portal-proveedor/portalDatos";
import { aplicarVbRecientes } from "@/lib/client/vb-recientes";
import {
  contratosEsperandoFirma,
  marcarSinCobertura,
  ocSinAprobador,
  ordenarPendientes,
  pendientesDeContratos,
  pendientesDeOc,
  puedeDeberContratos,
  puedeVerOc,
} from "@/lib/pendientes";

/**
 * Un fetch con techo de tiempo.
 *
 * Sin esto, un pedido que se cuelga en la red -o un servidor que tarda de
 * mas- deja la bandeja mostrando el esqueleto de carga PARA SIEMPRE: no hay
 * timeout nativo en fetch(). Mejor mostrar "sin pendientes" a los pocos
 * segundos que quedar pegado, sobre todo porque esto corre en cada
 * navegacion, no una sola vez.
 */
const TIMEOUT_MS = 10000;
async function fetchConTiempo(url, opciones) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: control.signal });
  } finally {
    clearTimeout(reloj);
  }
}

function leerSesion(clave) {
  if (typeof window === "undefined") return null;
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

/** La sesion del Portal, que es donde viven los pasos de contrato asignados. */
const leerSesionPortal = () => leerSesion("pp_session");

/** La del OC Tracker, que es donde vive el vinculo con el usuario de monday. */
const leerSesionOc = () => leerSesion("og_session");

/**
 * Las ordenes del tablero, de la foto que ya mantiene la tarea programada.
 *
 * Se pide una sola vez cada 5 minutos y se comparte: esto lo llama la bandeja y
 * el contador del menu, y el menu se vuelve a evaluar en cada navegacion.
 *
 * Si devuelve 403 esta persona no tiene el OC Tracker asignado: no es un error,
 * es que esa fuente no le corresponde.
 */
const OC_TTL_MS = 5 * 60 * 1000;
let _oc = { datos: null, time: 0, promise: null };

async function traerOrdenes() {
  if (_oc.datos && Date.now() - _oc.time < OC_TTL_MS) return _oc.datos;
  if (_oc.promise) return _oc.promise;

  _oc.promise = (async () => {
    try {
      const res = await fetchConTiempo("/api/oc-tracker/datos");
      if (!res.ok) {
        _oc = { datos: [], time: Date.now(), promise: null };
        return [];
      }
      const json = await res.json();
      // OJO: este endpoint devuelve { ordenes, facturas, calculadoEn } AL RAS.
      // No usa el sobre { result } de /api/monday/board. Leerlo como
      // json.result.ordenes daba siempre una lista vacia, y por eso la seccion
      // de ordenes y el aviso de las que no tienen dueño no aparecian nunca.
      const ordenes = json?.ordenes ?? [];
      _oc = { datos: ordenes, time: Date.now(), promise: null };
      return ordenes;
    } catch (error) {
      console.warn("[pendientes] no se pudieron traer las órdenes:", error?.message);
      _oc.promise = null;
      return [];
    }
  })();

  return _oc.promise;
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
      const res = await fetchConTiempo("/api/contratos/cobertura");
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
let compartido = { items: [], cargando: true, activo: false, ocHuerfanas: 0 };
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
    const sesionOc = leerSesionOc();
    const conContratos = puedeDeberContratos(sesion);
    const conOc = puedeVerOc(sesionOc);

    if (!conContratos && !conOc) {
      publicar({ items: [], cargando: false, activo: false, ocHuerfanas: 0 });
      return;
    }

    // Lo que ya esta en cache se pinta al instante: el contador tiene que
    // aparecer enseguida o no cumple su funcion, que es que la gente entre.
    const cacheado = conContratos ? yaTraido(claveDe(sesion)) : null;
    if (cacheado) {
      publicar({
        items: ordenarPendientes([
          ...pendientesDeContratos(aplicarVbRecientes(cacheado.contratos), sesion),
          ...contratosEsperandoFirma(cacheado.contratos, sesion),
        ]),
        cargando: false,
        activo: true,
      });
    }

    try {
      const [datos, cobertura, ordenes] = await Promise.all([
        conContratos ? traerDatosPortal(sesion) : Promise.resolve({ contratos: [] }),
        conContratos ? traerCobertura() : Promise.resolve(null),
        conOc ? traerOrdenes() : Promise.resolve([]),
      ]);
      const contratos = aplicarVbRecientes(datos.contratos);
      publicar({
        items: ordenarPendientes([
          ...marcarSinCobertura(pendientesDeContratos(contratos, sesion), cobertura),
          ...contratosEsperandoFirma(contratos, sesion),
          ...pendientesDeOc(ordenes, sesionOc),
        ]),
        // No son filas: es un aviso de que hay ordenes que no le van a caer a
        // nadie. Ver ocSinAprobador.
        ocHuerfanas: ocSinAprobador(ordenes, sesionOc),
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
