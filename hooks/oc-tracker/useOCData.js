"use client";

import { useState, useEffect, useMemo } from "react";
import { OrdenesDeCompraMaxxaBoard, FacturasIaBoard } from "@/lib/board-sdk";

const ordenesBoard = new OrdenesDeCompraMaxxaBoard();
const facturasBoard = new FacturasIaBoard();

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

      const [ordenesResult, facturasResult] = await Promise.all([
        ordenesBoard
          .items()
          .withColumns([
            "numeroOc",
            "obra",
            "monto",
            "moneda",
            "estadoDocumento",
            "responsable",
            "validezDocumento",
            "condicionDeCompra",
            "rut1",
            "proveedores",
          ])
          .withPagination({ limit: 500 })
          .execute(),
        facturasBoard
          .items()
          .withColumns([
            "numeroFactura",
            "oc",
            "obra",
            "montoConIva",
            "fechaFactura",
            "estado",
            "proveedores",
            "fechaVencimiento",
            "centroDeCosto",
            "tipoDePago",
            "correoElectrnico",
          ])
          .withPagination({ limit: 500 })
          .execute(),
      ]);

      setOrdenes(ordenesResult.items);
      setFacturas(facturasResult.items);
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

  const enrichedOrdenes = useMemo(() => {
    return ordenes.map((oc) => {
      const facturasVinculadas = facturas.filter((f) => f.oc && oc.numeroOc && String(f.oc).trim() === String(oc.numeroOc).trim());

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
  }, [ordenes, facturas]);

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
