"use client";

import { useOCDataContext } from "@/hooks/oc-tracker/OCDataContext";
import { FacturasSinOC } from "@/components/oc-tracker/FacturasSinOC";

export default function FacturasSinOCPage() {
  const { facturasSinOC } = useOCDataContext();
  return <FacturasSinOC facturas={facturasSinOC} />;
}
