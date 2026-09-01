"use client";

import { useState, useEffect, useCallback } from 'react';
import { claveDe, yaTraido, traerDatosPortal, limpiarDatosPortal } from '@/hooks/portal-proveedor/portalDatos';

/**
 * Contratos, estados de pago y ordenes de compra del proveedor de esta sesion.
 *
 * El filtro por proveedor ya lo aplico el servidor (ver
 * app/api/portal-proveedor/datos/route.js), y los tres leen del mismo traido:
 * antes eran tres consultas separadas, cada una repitiendo el recorrido por las
 * variantes de nombre con 2 segundos de espera entre medio.
 */

// Solo incluir OC de estos grupos especificos
const OC_ALLOWED_GROUPS = [
  'topics',           // "oc emitidas desde maxxa"
  'group_mm2pmyq8',   // "Completadas"
];

function filterOCByAllowedGroups(items) {
  return items.filter((item) => OC_ALLOWED_GROUPS.includes(item.group?.id || ''));
}

/**
 * El molde de los tres hooks: elegir una parte del traido y avisar si esta
 * cargando. `elegir` corre sobre los datos ya filtrados por el servidor.
 */
function usePartePortal(userContext, elegir, recarga = 0) {
  const clave = claveDe(userContext);
  const [items, setItems] = useState(() => {
    const datos = yaTraido(clave);
    return datos ? elegir(datos) : [];
  });
  const [loading, setLoading] = useState(() => !yaTraido(clave));

  const load = useCallback(async () => {
    if (!userContext) return;
    if (!yaTraido(claveDe(userContext))) setLoading(true);

    try {
      const datos = await traerDatosPortal(userContext);
      setItems(elegir(datos));
    } catch (error) {
      console.error('Error al cargar datos del Portal:', error);
    } finally {
      setLoading(false);
    }
    // `elegir` se define en cada hook y no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userContext, recarga]);

  useEffect(() => { load(); }, [load]);

  return { items, loading };
}

/** `recarga` es un contador: subirlo fuerza a releer despues de un VB. */
export function useContracts(userContext, recarga = 0) {
  return usePartePortal(userContext, (d) => d.contratos, recarga);
}

export function useEstadosDePago(userContext) {
  return usePartePortal(userContext, (d) => d.estadosDePago);
}

export function useOrdenesCompra(userContext) {
  return usePartePortal(userContext, (d) => filterOCByAllowedGroups(d.ordenes));
}

/**
 * Se llama despues de dar un visto bueno (contratos/page.jsx): la proxima
 * lectura vuelve a pedirle al servidor en vez de reusar lo que ya tenia.
 */
export function clearSubcontractCache() {
  limpiarDatosPortal();
}
