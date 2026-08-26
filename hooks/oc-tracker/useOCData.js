"use client";

import { useState, useEffect, useMemo } from "react";
import { OrdenesDeCompraMaxxaBoard, FacturasIaBoard, fetchAllItemsWithRelations } from "@/lib/board-sdk";
import { BOARD_SCHEMAS, FACTURAS_GRUPO_DUPLICADAS_ID } from "@/lib/board-schemas";

const ordenesBoard = new OrdenesDeCompraMaxxaBoard();
const facturasBoard = new FacturasIaBoard();

// Grupo "oc duplicadas" en monday - la app original de monday excluye este
// grupo de todos sus totales (Control General, por obra, etc). Confirmado
// contra los numeros reales del board: Total OC de la app original
// ($523.003.159) = suma de "oc emitidas desde maxxa" + "Oc rechazadas",
// sin el grupo "oc duplicadas" (que solo son OCs re-emitidas, no montos
// reales adicionales).
const GRUPO_OC_DUPLICADAS = "group_mm3c59ax";

// El proveedor vive en una columna board_relation, y monday devuelve `text` en
// null para ese tipo de columna: hay que pedir linked_items. Por eso el OC
// Tracker mostraba "Sin proveedor" en todos lados, aunque el dato esta cargado
// en el 99% de las facturas y el 95% de las OCs. Se pide con relaciones y se
// aplana a string aca, para que el resto de las pantallas lo sigan usando igual.
const OC_COLUMNAS = [
  "numeroOc", "obra", "monto", "moneda", "estadoDocumento", "responsable",
  "validezDocumento", "condicionDeCompra", "rut1", "proveedores", "docOc",
];
const FACTURA_COLUMNAS = [
  "numeroFactura", "oc", "obra", "montoConIva", "fechaFactura", "estado",
  "proveedores", "fechaVencimiento", "centroDeCosto", "tipoDePago",
  "correoElectrnico", "archivo", "encargado",
];

function idsYMapa(boardKey, columnas) {
  const cols = BOARD_SCHEMAS[boardKey].columns;
  const ids = columnas.map((c) => cols[c]);
  const mapa = {};
  columnas.forEach((c) => {
    mapa[cols[c]] = c;
  });
  return [ids, mapa];
}

const [OC_IDS, OC_MAPA] = idsYMapa("OrdenesDeCompraMaxxaBoard", OC_COLUMNAS);
const [FACTURA_IDS, FACTURA_MAPA] = idsYMapa("FacturasIaBoard", FACTURA_COLUMNAS);

// board_relation -> nombre plano, para no cambiarle la forma del dato a las
// pantallas que ya consumen `proveedores` como string.
function aplanarProveedor(item) {
  const rel = item.proveedores;
  if (rel && Array.isArray(rel.linkedItems)) {
    return { ...item, proveedores: rel.linkedItems.map((l) => l.name).join(", ") || null };
  }
  return item;
}

export function useOCData() {
  const [ordenes, setOrdenes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async (isRefetch = false) => {
    try {
      if (isRefetch) {
        setRefetching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const [ordenesItems, facturasItems] = await Promise.all([
        fetchAllItemsWithRelations(
          ordenesBoard.items().withColumns(OC_COLUMNAS),
          OC_IDS,
          OC_MAPA
        ),
        fetchAllItemsWithRelations(
          facturasBoard.items().withColumns(FACTURA_COLUMNAS),
          FACTURA_IDS,
          FACTURA_MAPA
        ),
      ]);

      setOrdenes(ordenesItems.filter((oc) => oc.group?.id !== GRUPO_OC_DUPLICADAS).map(aplanarProveedor));
      // Antes traia TODAS las facturas sin excluir "Duplicadas" - inflaba
      // Total Facturado/Saldo Disponible/% Consumido, mientras que Total OC
      // si excluia correctamente su propio grupo de duplicadas. Igual que
      // GRUPO_OC_DUPLICADAS arriba: se excluye SOLO el grupo de duplicadas,
      // el resto de los grupos (Pendientes, Revision manual, Enviada a pago,
      // En revision) cuentan.
      setFacturas(facturasItems.filter((f) => f.group?.id !== FACTURAS_GRUPO_DUPLICADAS_ID).map(aplanarProveedor));
    } catch (err) {
      console.error("Error loading OC data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const facturasPorOc = useMemo(() => {
    const map = new Map();
    for (const f of facturas) {
      if (!f.oc) continue;
      const key = String(f.oc).trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return map;
  }, [facturas]);

  const enrichedOrdenes = useMemo(() => {
    return ordenes.map((oc) => {
      const facturasVinculadas = oc.numeroOc ? facturasPorOc.get(String(oc.numeroOc).trim()) ?? [] : [];

      const totalFacturado = facturasVinculadas.reduce((sum, f) => sum + (f.montoConIva || 0), 0);

      const montoOC = oc.monto || 0;
      const saldoDisponible = montoOC - totalFacturado;
      const porcentajeConsumido = montoOC > 0 ? (totalFacturado / montoOC) * 100 : 0;

      let semaforo = "OK";
      if (porcentajeConsumido > 100) {
        semaforo = "SOBRECONSUMO";
      } else if (porcentajeConsumido >= 95) {
        semaforo = "CRITICO";
      } else if (porcentajeConsumido >= 80) {
        semaforo = "ATENTO";
      }

      return {
        ...oc,
        facturasVinculadas,
        totalFacturado,
        saldoDisponible,
        porcentajeConsumido,
        semaforo,
      };
    });
  }, [ordenes, facturasPorOc]);

  const facturasSinOC = useMemo(() => {
    return facturas.filter((f) => !f.oc || String(f.oc).trim() === "");
  }, [facturas]);

  const ocsSinFacturas = useMemo(() => {
    return enrichedOrdenes.filter((oc) => oc.facturasVinculadas.length === 0);
  }, [enrichedOrdenes]);

  const ocsSobreconsumidas = useMemo(() => {
    return enrichedOrdenes.filter((oc) => oc.porcentajeConsumido > 100);
  }, [enrichedOrdenes]);

  const consumoPorObra = useMemo(() => {
    const obraMap = {};

    enrichedOrdenes.forEach((oc) => {
      const obra = oc.obra || "Sin Obra";
      if (!obraMap[obra]) {
        obraMap[obra] = {
          obra,
          ocs: [],
          totalMontoOC: 0,
          totalFacturado: 0,
          count: 0,
        };
      }

      obraMap[obra].ocs.push(oc);
      obraMap[obra].totalMontoOC += oc.monto || 0;
      obraMap[obra].totalFacturado += oc.totalFacturado;
      obraMap[obra].count += 1;
    });

    return Object.values(obraMap).map((item) => ({
      ...item,
      saldoDisponible: item.totalMontoOC - item.totalFacturado,
      porcentajeConsumido: item.totalMontoOC > 0 ? (item.totalFacturado / item.totalMontoOC) * 100 : 0,
    }));
  }, [enrichedOrdenes]);

  return {
    ordenes: enrichedOrdenes,
    facturas,
    facturasSinOC,
    ocsSinFacturas,
    ocsSobreconsumidas,
    consumoPorObra,
    loading,
    refetching,
    error,
    refetch: () => fetchData(true),
    updateOCStatus: async (itemId, newStatus) => {
      const prev = [...ordenes];
      setOrdenes(ordenes.map((oc) => (oc.id === itemId ? { ...oc, estadoDocumento: newStatus } : oc)));
      try {
        await ordenesBoard.item(itemId).update({ estadoDocumento: newStatus }).execute();
      } catch (err) {
        console.error("Error updating status:", err);
        setOrdenes(prev);
        throw err;
      }
    },
  };
}
