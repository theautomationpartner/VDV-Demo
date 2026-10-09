"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { claveDe, traerDatosPortal, yaTraido } from "@/hooks/portal-proveedor/portalDatos";
import { aplicarVbRecientes } from "@/lib/client/vb-recientes";
import { ControlArriendosBoard, ControlHerramientasMovimientosBoard } from "@/lib/board-sdk";
import { COLUMNAS_ITEM, COLUMNAS_LISTADO, TOPE, prepararArriendo } from "@/lib/arriendos/listado";
import { COLUMNAS_CONFIRMACION, RECEPCION_PENDIENTE } from "@/lib/herramientas/dominio";
import {
  confirmacionesPendientes,
  contratosEsperandoFirma,
  marcarSinCobertura,
  ocSinAprobador,
  ordenarPendientes,
  pendientesDeArriendos,
  pendientesDeContratos,
  pendientesDeOc,
  puedeDeberArriendos,
  puedeDeberConfirmaciones,
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

/** La de Control de Herramientas, que es de donde cuelgan los arriendos. */
const leerSesionHerramientas = () => leerSesion("hr_session");

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

/**
 * Los arriendos activos, con sus items.
 *
 * Se leen en vivo: el tablero es chico -decenas de arriendos- y el costo se
 * calcula al leer, asi que no hay snapshot que pueda quedar viejo. Mismo TTL de
 * 5 minutos que las ordenes, por lo mismo: esto lo llama la bandeja Y el
 * contador del menu lateral.
 */
const ARR_TTL_MS = 5 * 60 * 1000;
let _arr = { datos: null, time: 0, promise: null };

async function traerArriendos() {
  if (_arr.datos && Date.now() - _arr.time < ARR_TTL_MS) return _arr.datos;
  if (_arr.promise) return _arr.promise;

  _arr.promise = (async () => {
    try {
      const r = await new ControlArriendosBoard()
        .items()
        .withColumns(COLUMNAS_LISTADO)
        .withSubItems("ControlArriendosItemsBoard", COLUMNAS_ITEM)
        .withPagination({ limit: TOPE })
        .execute();
      const listos = (r.items ?? []).map((f) => prepararArriendo(f));
      _arr = { datos: listos, time: Date.now(), promise: null };
      return listos;
    } catch (error) {
      // Un 403 aca significa que esta persona no tiene la app: no es un error.
      console.warn("[pendientes] no se pudieron traer los arriendos:", error?.message);
      _arr = { datos: [], time: Date.now(), promise: null };
      return [];
    }
  })();

  return _arr.promise;
}

/**
 * Los movimientos de herramienta que esperan que alguien confirme que llegaron.
 *
 * Se filtra en el SERVIDOR por el estado -`where`-, no trayendo todo y
 * descartando aca: el tablero de movimientos crece para siempre (una fila por
 * cada salida, devolucion y traslado de 145 herramientas) mientras que lo
 * pendiente son unas pocas filas en cualquier momento. Trayendo todo, esta
 * consulta se iria agrandando sola hasta volverse el pedido mas caro de la
 * suite, y corre en CADA navegacion.
 */
const CONF_TTL_MS = 5 * 60 * 1000;
let _conf = { datos: null, time: 0, promise: null };

async function traerConfirmaciones() {
  if (_conf.datos && Date.now() - _conf.time < CONF_TTL_MS) return _conf.datos;
  if (_conf.promise) return _conf.promise;

  _conf.promise = (async () => {
    try {
      const r = await new ControlHerramientasMovimientosBoard()
        .items()
        .withColumns(COLUMNAS_CONFIRMACION)
        .where({ recepcion: { eq: RECEPCION_PENDIENTE } })
        .withPagination({ limit: 200 })
        .execute();
      const filas = r.items ?? [];
      _conf = { datos: filas, time: Date.now(), promise: null };
      return filas;
    } catch (error) {
      // Un 403 aca significa que esta persona no tiene la app: no es un error.
      console.warn("[pendientes] no se pudieron traer las confirmaciones:", error?.message);
      _conf = { datos: [], time: Date.now(), promise: null };
      return [];
    }
  })();

  return _conf.promise;
}

/**
 * Tirar la foto de las confirmaciones, para que la proxima navegacion la pida
 * de nuevo.
 *
 * La llama la ficha de la herramienta despues de confirmar. Sin esto, el
 * recorrido natural -entro por la bandeja, confirmo, vuelvo- te devolvia a una
 * lista que seguia mostrando lo mismo y a un contador que seguia diciendo 1
 * durante cinco minutos. Volves a hacer click, llegas a la ficha, y el boton ya
 * no esta: la bandeja te mando a hacer algo que ya estaba hecho.
 */
export function olvidarConfirmaciones() {
  _conf = { datos: null, time: 0, promise: null };
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
    const sesionHr = leerSesionHerramientas();
    const conContratos = puedeDeberContratos(sesion);
    const conOc = puedeVerOc(sesionOc);
    const conArriendos = puedeDeberArriendos(sesionHr);
    const conConfirmaciones = puedeDeberConfirmaciones(sesionHr);

    if (!conContratos && !conOc && !conArriendos && !conConfirmaciones) {
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
      const [datos, cobertura, ordenes, arriendos, confirmaciones] = await Promise.all([
        conContratos ? traerDatosPortal(sesion) : Promise.resolve({ contratos: [] }),
        conContratos ? traerCobertura() : Promise.resolve(null),
        conOc ? traerOrdenes() : Promise.resolve([]),
        conArriendos ? traerArriendos() : Promise.resolve([]),
        conConfirmaciones ? traerConfirmaciones() : Promise.resolve([]),
      ]);
      const contratos = aplicarVbRecientes(datos.contratos);
      publicar({
        items: ordenarPendientes([
          ...marcarSinCobertura(pendientesDeContratos(contratos, sesion), cobertura),
          ...contratosEsperandoFirma(contratos, sesion),
          ...pendientesDeOc(ordenes, sesionOc),
          ...pendientesDeArriendos(arriendos, sesionHr),
          ...confirmacionesPendientes(confirmaciones, sesionHr),
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

    // Ponerse al dia con lo que haya pasado ENTRE el render y este efecto.
    //
    // React dibuja todos los componentes primero y recien despues corre los
    // efectos, en orden. El menu lateral -que va antes en el arbol- se
    // suscribe, llama a recargar(), y para una cuenta sin nada que aprobar eso
    // se resuelve SIN esperar ninguna consulta: publicar() sale ahi mismo, con
    // un solo oyente suscrito. Cuando le toca el turno a la pantalla, el aviso
    // ya paso y no va a haber otro, asi que se quedaba con el `cargando: true`
    // que habia leido al dibujarse. Para siempre: el esqueleto de carga no se
    // iba mas, sin ningun error ni pedido colgado, y con el menu al lado
    // mostrando el estado correcto.
    //
    // setEstado con el mismo valor no cuesta nada: React descarta el update si
    // el objeto es identico.
    setEstado(compartido);

    return () => {
      oyentes.delete(setEstado);
    };
  }, []);

  useEffect(() => {
    recargar();
  }, [pathname]);

  return { ...estado, recargar };
}
