"use client";

import { useEffect, useState } from "react";
import {
  normalizarRolHerramientas,
  puedeGestionarArriendos,
  puedeModificarHerramientas,
  puedeVerCostosArriendo,
  puedeVerValorizacion,
  veTodaLaEmpresa,
} from "@/lib/herramientas-roles";

/**
 * Quien esta mirando el inventario y que puede hacer.
 *
 * Sale de `hr_session` en localStorage, que escribe el login
 * (lib/client/fixed-accounts.js). No pega a la red: el rol y las obras ya
 * viajaron con la sesion, asi que esto se resuelve en el primer tick y la
 * pantalla no parpadea entre "no podes" y "si podes".
 *
 * Lo que decide aca es QUE SE DIBUJA. Quien decide de verdad es el servidor
 * (lib/server/board-access-policy.js), que vuelve a mirar la misma asignacion
 * firmada en el JWT: esconder un boton no es un permiso.
 */
export function useSesionHerramientas() {
  const [sesion, setSesion] = useState(null);
  // "Todavia no se si tenes acceso" - distinto de "no tenes". Sin esto la
  // pantalla muestra el cartel de sin acceso por un instante a todo el mundo.
  const [cargando, setCargando] = useState(true);

  // La lectura es sincrona, pero el setState va en el `.then`: llamarlo en el
  // cuerpo del efecto encadena renders y lo prohibe la regla
  // react-hooks/set-state-in-effect. Mismo patron que el resto del repo.
  useEffect(() => {
    let activo = true;
    Promise.resolve()
      .then(() => {
        try {
          return JSON.parse(localStorage.getItem("hr_session") || "null");
        } catch {
          // Navegador con el almacenamiento bloqueado: se trata como "sin
          // sesion", que es lo que la pantalla ya sabe mostrar.
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

  const rol = normalizarRolHerramientas(sesion?.role);

  return {
    cargando,
    sesion,
    rol,
    tieneAcceso: Boolean(sesion),
    puedeModificar: puedeModificarHerramientas(sesion?.role),
    verValorizacion: puedeVerValorizacion(sesion?.role),
    /**
     * Arriendos. Va aparte de `verValorizacion` porque NO es la misma gente: el
     * Bodeguero ve lo que cuesta un arriendo pero no el precio de compra del
     * inventario. Ver puedeVerCostosArriendo en lib/herramientas-roles.js.
     */
    verCostosArriendo: puedeVerCostosArriendo(sesion?.role),
    gestionarArriendos: puedeGestionarArriendos(sesion?.role),
    /**
     * Las obras que esta persona puede ver, o `null` si las ve todas. El
     * Bodeguero ve todo aunque su cuenta este acotada: lo necesita para saber
     * que hay en las otras obras y pedir prestado en vez de arrendar.
     */
    obrasPermitidas:
      !sesion || veTodaLaEmpresa(sesion.role) || sesion.restrictObras !== true
        ? null
        : sesion.obras ?? [],
  };
}
