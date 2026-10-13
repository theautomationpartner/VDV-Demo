"use client";

import { useEffect, useState } from "react";
import {
  normalizarRolSpm,
  puedeCrearSolicitud,
  puedeDecidirCotizacion,
  puedeEnviarACotizar,
} from "@/lib/spm-roles";

/**
 * Quien esta usando Solicitudes de Material.
 *
 * Sale de `spm_session` en localStorage, que escribe el login
 * (lib/client/fixed-accounts.js). No pega a la red: el rol ya viajo con la
 * sesion, asi que esto se resuelve en el primer tick y la pantalla no parpadea
 * entre "no podes" y "si podes".
 *
 * Lo que decide aca es QUE SE DIBUJA. Quien decide de verdad es el servidor
 * (requireSpm en board-access-policy.js), que mira la misma asignacion firmada
 * en el JWT: esconder un boton no es un permiso.
 *
 * El MAIL es lo que identifica a la persona contra su ficha en Equipo VDV. Sin
 * ficha no se puede crear una solicitud -el correo al proveedor saldria sin
 * remitente- y el servidor corta antes de reservar un numero.
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
          return JSON.parse(localStorage.getItem("spm_session") || "null");
        } catch {
          // Navegador con el almacenamiento bloqueado: se trata como sin sesion.
          return null;
        }
      })
      .then((guardada) => {
        if (!activo) return;
        setSesion(guardada);
        setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const rol = normalizarRolSpm(sesion?.role);

  return {
    cargando,
    sesion,
    rol,
    mail: sesion?.email ?? null,
    nombre: sesion?.userName ?? sesion?.email ?? null,
    tieneAcceso: Boolean(sesion),
    puedeCrear: puedeCrearSolicitud(sesion?.role),
    puedeEnviar: puedeEnviarACotizar(sesion?.role),
    puedeDecidir: puedeDecidirCotizacion(sesion?.role),
  };
}
