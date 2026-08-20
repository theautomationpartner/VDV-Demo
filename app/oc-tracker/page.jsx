"use client";

import { useOCDataContext } from "@/hooks/oc-tracker/OCDataContext";
import { ControlGeneral } from "@/components/oc-tracker/ControlGeneral";

export default function OcTrackerControlGeneralPage() {
  const { ordenes } = useOCDataContext();
  return <ControlGeneral ordenes={ordenes} />;
}
