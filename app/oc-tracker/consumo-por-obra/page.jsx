"use client";

import { useOCDataContext } from "@/hooks/oc-tracker/OCDataContext";
import { ConsumoPorObra } from "@/components/oc-tracker/ConsumoPorObra";

export default function ConsumoPorObraPage() {
  const { consumoPorObra, updateOCStatus } = useOCDataContext();
  return <ConsumoPorObra consumoPorObra={consumoPorObra} onUpdateStatus={updateOCStatus} />;
}
