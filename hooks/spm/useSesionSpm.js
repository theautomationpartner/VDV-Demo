"use client";

import { useEffect, useState } from "react";

/**
 * Quien esta usando Solicitudes de Material.
 *
 * SPM TODAVIA NO TIENE ROLES. VDV no los definio -esta preguntado: quien puede
 * mandar la solicitud a los proveedores, y si un jefe de obra ve solo lo suyo-.
 * Mientras tanto el piso es el mismo que usa el servidor en `requireSpm`: tener
 * alguna app de VDV, que es lo que distingue al equipo de un subcontratista del
 * Portal.
 *
 * Cuando VDV conteste, esto pasa a leer un rol como el resto de las apps y la
 * pantalla ya tiene donde colgarlo: `puedeEnviar` deja de ser siempre true.
 *
 * El mail sale de la sesion del navegador y es lo que identifica a la persona
 * contra su ficha en Equipo VDV. Sin ficha no se puede crear una solicitud: el
 * servidor corta, porque el correo al proveedor saldria sin remitente.
 */
export function useSesionSpm() {
  const [sesion, setSesion] = useState(null);
  // "Todavia no se" es distinto de "no tenes": sin esto la pantalla muestra el
  // cartel de sin acceso por un instante a todo el mundo.
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    Promise.resolve()
      .then(() => {
        try {
          const og = JSON.parse(localStorage.getItem("og_session") || "null");
          const ve = JSON.parse(localStorage.getItem("ve_session") || "null");
          const pp = JSON.parse(localStorage.getItem("pp_session") || "null");
          const hr = JSON.parse(localStorage.getItem("hr_session") || "null");
          return { og, ve, pp, hr };
        } catch {
          // Navegador con el almacenamiento bloqueado: se trata como sin sesion.
          return { og: null, ve: null, pp: null, hr: null };
        }
      })
      .then((s) => {
        if (!activo) return;
        setSesion(s);
        setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const mail = sesion?.og?.email ?? sesion?.ve?.email ?? null;
  // Tener el Portal Y NADA MAS es ser subcontratista. Mismo criterio que
  // requireSpm en el servidor, que es quien decide de verdad.
  const soloPortal = Boolean(sesion?.pp) && !sesion?.og && !sesion?.ve && !sesion?.hr;

  return {
    cargando,
    mail,
    nombre: sesion?.og?.userName ?? sesion?.ve?.userName ?? mail,
    tieneAcceso: Boolean(sesion && !soloPortal && (sesion.og || sesion.ve || sesion.hr)),
    /**
     * Hoy todos los que entran pueden. Queda como funcion y no como `true`
     * suelto para que el dia que VDV defina los roles se cambie ACA y no haya
     * que ir a buscar los botones por las pantallas.
     */
    puedeCrear: true,
    puedeEnviar: true,
  };
}
