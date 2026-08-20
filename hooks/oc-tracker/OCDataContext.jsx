"use client";

import { createContext, useContext } from "react";
import { useOCData } from "./useOCData";

const OCDataContext = createContext(null);

export function OCDataProvider({ children }) {
  const data = useOCData();
  return <OCDataContext.Provider value={data}>{children}</OCDataContext.Provider>;
}

export function useOCDataContext() {
  const ctx = useContext(OCDataContext);
  if (!ctx) throw new Error("useOCDataContext debe usarse dentro de <OCDataProvider>");
  return ctx;
}
