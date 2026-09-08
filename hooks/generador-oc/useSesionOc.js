"use client";

import { useEffect, useState } from "react";
import { getUsuariosMonday } from "@/lib/generador-oc/datos";

/**
 * Quien esta emitiendo la orden.
 *
 * En la Vibe esto era `board.users.me()`: la app corria dentro de monday, asi
 * que el usuario de monday y el de la app eran el mismo. Aca no: la sesion es
 * la de la whitelist de VDV Suite (login propio + 2FA), y el vinculo con monday
 * es el `mondayUserId` que se carga por persona en /admin/whitelist.
 *
 * Ese id no es un detalle: la Orden de Compra escribe Responsable y APROBADOR,
 * que son columnas de persona de monday. Si falta, la app lo dice en pantalla y
 * no deja emitir, en vez de crear una orden sin responsable.
 *
 * Viene en dos tiempos a proposito:
 *
 *   1. Quien sos y si tenes acceso sale de localStorage: esta al instante.
 *   2. El cargo, el telefono y la foto viven en el perfil de monday y tardan
 *      una consulta.
 *
 * Antes la pantalla entera esperaba el paso 2 aunque el historial de ordenes no
 * necesita nada de eso, asi que la lista tardaba en aparecer de mas.
 */
export function useSesionOc() {
  const [usuario, setUsuario] = useState(null);
  // "Todavia no se si tenes acceso". Se resuelve en el primer tick, sin red.
  const [cargando, setCargando] = useState(true);
  // El id de monday de la sesion no corresponde a ningun usuario vivo: la
  // cuenta fue eliminada en monday y el vinculo quedo guardado. La pantalla
  // dejaba de ofrecer el lapiz y el desplegable de estado sin decir por que, y
  // al emitir monday devolvia "unable to assign person with id: ...".
  const [perfilDesconocido, setPerfilDesconocido] = useState(false);

  useEffect(() => {
    let activo = true;

    let sesion = null;
    try {
      sesion = JSON.parse(localStorage.getItem("og_session") || "null");
    } catch {
      sesion = null;
    }

    if (!sesion) {
      setCargando(false);
      return undefined;
    }

    const base = {
      id: sesion.mondayUserId ? Number(sesion.mondayUserId) : null,
      name: sesion.userName || sesion.email,
      email: sesion.email ?? "",
      rol: sesion.role ?? null,
      // Puede aprobar aunque no sea el aprobador designado. Antes esto salia
      // del cargo del perfil de monday; ahora es una casilla (ver oc-roles.js).
      apruebaTodo: sesion.apruebaCualquierOrden === true,
      // Puede elegirse a si mismo como aprobador (ver lib/oc-roles.js).
      apruebaSusOrdenes: sesion.apruebaSusOrdenes === true,
      cargo: null,
      telefono: "",
      foto: null,
    };

    setUsuario(base);
    setCargando(false);

    if (!base.id) return undefined;

    // El perfil completa lo que falta cuando llega. Es la misma consulta que
    // usa el selector de aprobador, asi que se pide una sola vez (ver cache).
    getUsuariosMonday()
      .then((lista) => {
        if (!activo) return;
        const perfil = lista.find((u) => u.id === base.id);
        if (!perfil) {
          setPerfilDesconocido(true);
          return;
        }
        setUsuario({
          ...base,
          name: perfil.name || base.name,
          email: perfil.email || base.email,
          cargo: perfil.cargo,
          telefono: perfil.telefono,
          foto: perfil.foto,
        });
      })
      .catch((error) => {
        // Sin el perfil se puede emitir igual: solo falta el cargo en la firma.
        console.error("[generador-oc] No se pudo leer el perfil de monday:", error);
      });

    return () => {
      activo = false;
    };
  }, []);

  return { usuario, cargando, perfilDesconocido };
}
