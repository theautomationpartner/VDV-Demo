"use client";

import { useOCDataContext } from "@/hooks/oc-tracker/OCDataContext";
import { OCsSinFacturas } from "@/components/oc-tracker/OCsSinFacturas";

export default function OcsSinFacturasPage() {
  const { ocsSinFacturas } = useOCDataContext();
  return <OCsSinFacturas ordenes={ocsSinFacturas} />;
}
