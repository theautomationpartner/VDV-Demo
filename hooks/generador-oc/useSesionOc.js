"use client";

import { useEffect, useState } from "react";
import { OrdenesDeCompraMaxxaBoard } from "@/lib/board-sdk";

const board = new OrdenesDeCompraMaxxaBoard();

/**
 * Quien esta emitiendo la orden.
 *
 * En la Vibe esto era `board.users.me()`: la app corria dentro de monday, asi
 * que el usuario de monday y el de la app eran el mismo. Aca no: la sesion es
 * la de la whitelist de VDV Suite (login propio + 2FA), y el vinculo con
 * monday es el `mondayUserId` que se carga por persona en /admin/whitelist.
 *
 * Ese id no es un detalle: la Orden de Compra escribe Responsable y APROBADOR,
 * que son columnas de persona de monday. Si falta, la app lo dice en pantalla y
 * no deja emitir, en vez de crear una orden sin responsable.
 *
 * El cargo (`cargo`) sale del perfil de monday, igual que antes: es lo que se
 * imprime bajo la firma y lo que identifica al Gerente General.
 */
export function useSesionOc() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

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
      cargo: null,
      telefono: "",
      foto: null,
    };

    if (!base.id) {
      setUsuario(base);
      setCargando(false);
      return undefined;
    }

    // El cargo, el telefono y la foto viven en el perfil de monday, no en la
    // whitelist: se completan con la lista de usuarios de la cuenta.
    board.users
      .withPagination({ limit: 500 })
      .execute()
      .then((lista) => {
        if (!activo) return;
        const perfil = (lista ?? []).find((u) => Number(u.id) === base.id);
        setUsuario({
          ...base,
          name: perfil?.name || base.name,
          email: perfil?.email || base.email,
          cargo: perfil?.title ?? null,
          telefono: (perfil?.mobile_phone || perfil?.phone || "").trim(),
          foto: perfil?.photo_thumb ?? null,
        });
      })
      .catch((error) => {
        // Sin el perfil se puede emitir igual: solo falta el cargo en la firma.
        console.error("[generador-oc] No se pudo leer el perfil de monday:", error);
        if (activo) setUsuario(base);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  return { usuario, cargando };
}
