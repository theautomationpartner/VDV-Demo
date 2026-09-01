"use client";

import { useState, useEffect, useCallback } from 'react';
import { claveDe, yaTraido, traerDatosPortal, limpiarDatosPortal } from '@/hooks/portal-proveedor/portalDatos';

// Lista blanca fiel al Portal Proveedor original (code-text/Portal Proveedor.txt) -
// a proposito distinta del criterio de OC Tracker (que solo excluye el grupo
// de duplicadas, ver FACTURAS_GRUPO_DUPLICADAS_ID en board-schemas.js). Son
// dos apps originales separadas con logica propia para el mismo tablero;
// unificarlas en una sola constante compartida fue un error de una sesion
// anterior, revertido en su momento.
const FACTURAS_ALLOWED_GROUPS = [
  'topics',           // "Pendientes"
  'group_mm21cxe2',   // "Completadas"
];

const STATS_VACIAS = { pendientes: 0, rechazadas: 0, completadas: 0, total: 0 };

/**
 * Arma el mapa "numero de OC -> facturacion" y los contadores por estado.
 *
 * OJO, CAMBIO DE COMPORTAMIENTO: antes este hook no recibia contexto de usuario
 * y traia TODAS las facturas de la cuenta, para todos los roles. O sea que un
 * subcontratista veia en su dashboard contadores calculados sobre las facturas
 * de todos los proveedores, y el detalle de esas facturas (numero, monto, obra)
 * llegaba a su navegador. Ahora lee del traido del Portal, que el servidor ya
 * filtro por el proveedor de la sesion: un subcontratista ve LO SUYO.
 *
 * Para un admin o super admin no cambia nada (siguen viendo todo).
 */
function armar(facturas) {
  const validos = facturas.filter((item) => FACTURAS_ALLOWED_GROUPS.includes(item.group?.id || ''));

  const map = new Map();
  validos.forEach((item) => {
    const ocNum = (item.oc || '').trim();
    if (!ocNum) return;
    const monto = parseFloat(item.montoConIva) || 0;
    if (monto <= 0) return;

    if (!map.has(ocNum)) map.set(ocNum, { totalFacturado: 0, facturas: [] });
    const entry = map.get(ocNum);
    entry.totalFacturado += monto;
    entry.facturas.push({
      id: item.id,
      nombre: item.name || `Factura ${item.numeroFactura || ocNum}`,
      numeroFactura: item.numeroFactura || '-',
      monto,
      obra: item.obra || '-',
      estado: item.estado || '-',
    });
  });

  // Los contadores salen del MAPA, no de todas las facturas validas: solo
  // cuentan las que tienen numero de OC y monto mayor a cero. Es lo que hacia
  // la version anterior (recorria map.forEach -> entry.facturas) y se replica
  // tal cual para no mover los numeros del dashboard.
  let pendientes = 0, rechazadas = 0, completadas = 0, total = 0;
  map.forEach((entry) => {
    entry.facturas.forEach((f) => {
      total++;
      const estado = (f.estado || '').toLowerCase();
      if (estado.includes('pendiente') || estado.includes('revisión')) pendientes++;
      else if (estado.includes('rechazad') || estado.includes('duplicad')) rechazadas++;
      else if (estado.includes('completad') || estado.includes('enviada') || estado.includes('pago')) completadas++;
    });
  });

  return { map, stats: { pendientes, rechazadas, completadas, total } };
}

/**
 * Devuelve: { facturacionMap, loading, facturaStats }
 *
 * facturacionMap: Map<ocNumber, { totalFacturado, facturas }>
 */
export function useFacturacion(userContext) {
  const clave = claveDe(userContext);
  const inicial = () => {
    const datos = yaTraido(clave);
    return datos ? armar(datos.facturas) : null;
  };

  const [facturacionMap, setFacturacionMap] = useState(() => inicial()?.map ?? new Map());
  const [facturaStats, setFacturaStats] = useState(() => inicial()?.stats ?? STATS_VACIAS);
  const [loading, setLoading] = useState(() => !yaTraido(clave));

  const load = useCallback(async () => {
    if (!userContext) return;
    if (!yaTraido(claveDe(userContext))) setLoading(true);

    try {
      const datos = await traerDatosPortal(userContext);
      const { map, stats } = armar(datos.facturas);
      setFacturacionMap(map);
      setFacturaStats(stats);
    } catch (error) {
      console.error('Error loading facturacion:', error);
    } finally {
      setLoading(false);
    }
  }, [userContext]);

  useEffect(() => { load(); }, [load]);

  return { facturacionMap, loading, facturaStats };
}

export function clearFacturacionCache() {
  limpiarDatosPortal();
}
