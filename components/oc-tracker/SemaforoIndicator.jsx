import { cn } from "@/lib/utils";

const semaforoConfig = {
  OK: {
    label: "OK",
    textClass: "text-[var(--chart-4)]",
    dotClass: "bg-[var(--chart-4)]",
    bgClass: "bg-[color-mix(in_hsl,var(--chart-4)_12%,transparent)]",
    borderClass: "border-[var(--chart-4)]",
  },
  ATENTO: {
    label: "Atento",
    textClass: "text-[var(--chart-5)]",
    dotClass: "bg-[var(--chart-5)]",
    bgClass: "bg-[color-mix(in_hsl,var(--chart-5)_12%,transparent)]",
    borderClass: "border-[var(--chart-5)]",
  },
  CRITICO: {
    label: "Crítico",
    textClass: "text-[var(--accent)]",
    dotClass: "bg-[var(--accent)]",
    bgClass: "bg-[color-mix(in_hsl,var(--accent)_12%,transparent)]",
    borderClass: "border-[var(--accent)]",
  },
  SOBRECONSUMO: {
    label: "Sobreconsumo",
    textClass: "text-[var(--primary)]",
    dotClass: "bg-[var(--primary)]",
    bgClass: "bg-[color-mix(in_hsl,var(--primary)_12%,transparent)]",
    borderClass: "border-[var(--primary)]",
  },
};

export function SemaforoIndicator({ semaforo, className }) {
  const config = semaforoConfig[semaforo] || semaforoConfig.OK;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-xs font-medium tracking-tight",
        config.bgClass,
        config.borderClass,
        config.textClass,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dotClass)} />
      {config.label}
    </span>
  );
}
