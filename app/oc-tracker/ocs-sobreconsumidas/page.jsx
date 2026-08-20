"use client";

import { useOCDataContext } from "@/hooks/oc-tracker/OCDataContext";
import { OCsSobreconsumidas } from "@/components/oc-tracker/OCsSobreconsumidas";

export default function OcsSobreconsumidasPage() {
  const { ocsSobreconsumidas } = useOCDataContext();
  return <OCsSobreconsumidas ordenes={ocsSobreconsumidas} />;
}
