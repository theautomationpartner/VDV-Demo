"use client";

import {
  ValesBoard,
  IngresosBoard,
  PagosVdvBoard,
  FlujoContratacionSubcontratoBoard,
} from "@/lib/board-sdk";
import { ALL_OBRAS } from "@/hooks/vale-express/useUserRole";
import { useColumnOptions } from "@/hooks/useColumnOptions";

/**
 * Lista de obras leida en vivo de monday, para no mantenerla copiada a mano.
 *
 * La misma lista de obras existe como columna "status" en varios boards (VALES,
 * INGRESOS, PAGOS VDV, FACTURAS IA, OC...). Hoy las cuatro tienen exactamente
 * los mismos 32 labels, pero son columnas independientes: si el cliente agrega
 * una obra en una sola, cada app tiene que ver la suya. Por eso hay un hook por
 * board en vez de una unica fuente global.
 *
 * El fallback (por defecto ALL_OBRAS, de hooks/vale-express/useUserRole.js) es
 * lo que se muestra mientras carga y si monday no responde. Portal Proveedor
 * pasa el suyo propio, que es la lista que ya tenia hardcodeada.
 */

const valesBoard = new ValesBoard();
const contratosBoard = new FlujoContratacionSubcontratoBoard();
const ingresosBoard = new IngresosBoard();
const pagosBoard = new PagosVdvBoard();

/** Obras de la columna OBRA del board VALES (Vale Express). */
export function useObrasVales(fallback = ALL_OBRAS) {
  return useColumnOptions(valesBoard, "obra", fallback);
}

/** Obras de la columna OBRA/BODEGA del board INGRESOS (Vale Express - ingreso). */
export function useObrasIngresos(fallback = ALL_OBRAS) {
  return useColumnOptions(ingresosBoard, "obrabodega", fallback);
}

/** Obras de la columna OBRA del board PAGOS VDV (Portal Proveedor). */
export function useObrasPagos(fallback = ALL_OBRAS) {
  return useColumnOptions(pagosBoard, "obra", fallback);
}

/**
 * Obras de la columna OBRA del board FLUJO CONTRATACION SUBCONTRATO.
 *
 * Es la lista que hace falta para decir en que obras da cada visto bueno una
 * persona (ver lib/contratos-vb.js). Va aparte de las otras a proposito: hoy en
 * ese tablero se usan 8 obras y en VALES 32, asi que ofrecer las de VALES seria
 * hacer elegir entre obras que ningun contrato tiene.
 *
 * Sin fallback: si monday no responde, mejor una lista vacia -y que se note-
 * que ofrecer obras que en contratos no existen.
 */
export function useObrasContratos() {
  return useColumnOptions(contratosBoard, "obra", []);
}
