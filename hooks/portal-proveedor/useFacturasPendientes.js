"use client";

import { useState, useEffect, useCallback } from 'react';
import { claveDe, yaTraido, traerDatosPortal, limpiarDatosPortal } from '@/hooks/portal-proveedor/portalDatos';

const ALLOWED_GROUPS = [
  'topics',       // "PROVEEDORES"
  'new_group',    // "SUBCONTRATOS"
];

const STATS_VACIAS = { pendientes: 0, rechazadas: 0, aprobadas: 0, enRevision: 0, total: 0 };

/**
 * Cuenta los pagos de PAGOS VDV (grupos PROVEEDORES y SUBCONTRATOS) por estado.
 *
 * El filtro por proveedor ya lo aplico el servidor. Antes se hacia aca, y de
 * dos maneras distintas segun el caso: con el id iba a monday filtrado, y sin
 * el se bajaba el tablero ENTERO (4.626 pagos) para filtrar por substring en el
 * navegador, ignorando ademas la tabla de alias que si usaban los otros hooks.
 * O sea que un proveedor con variantes de nombre contaba de menos aca y de mas
 * en las otras pantallas. Ahora los seis hooks miran exactamente las mismas
 * filas.
 */
function contar(pagos) {
  const validos = pagos.filter((item) => ALLOWED_GROUPS.includes(item.group?.id || ''));

  let pendientes = 0, rechazadas = 0, aprobadas = 0, enRevision = 0, total = 0;
  validos.forEach((item) => {
    total++;
    const estado = (item.estado || '').toLowerCase();
    if (estado.includes('nuevo') || estado.includes('pendiente') || estado === '') {
      pendientes++;
    } else if (estado.includes('rechazad')) {
      rechazadas++;
    } else if (estado.includes('aprobad') || estado.includes('listo') || estado.includes('pago')) {
      aprobadas++;
    } else if (estado.includes('revisión') || estado.includes('revisar')) {
      enRevision++;
    }
  });

  return { pendientes, rechazadas, aprobadas, enRevision, total };
}

export function useFacturasPendientes(userContext) {
  const clave = claveDe(userContext);
  const [stats, setStats] = useState(() => {
    const datos = yaTraido(clave);
    return datos ? contar(datos.pagos) : STATS_VACIAS;
  });
  const [loading, setLoading] = useState(() => !yaTraido(clave));

  const load = useCallback(async () => {
    if (!userContext) return;
    if (!yaTraido(claveDe(userContext))) setLoading(true);

    try {
      const datos = await traerDatosPortal(userContext);
      setStats(contar(datos.pagos));
    } catch (error) {
      console.error('Error loading facturas pendientes:', error);
    } finally {
      setLoading(false);
    }
  }, [userContext]);

  useEffect(() => { load(); }, [load]);

  return { stats, loading };
}

export function clearFacturasPendientesCache() {
  limpiarDatosPortal();
}
