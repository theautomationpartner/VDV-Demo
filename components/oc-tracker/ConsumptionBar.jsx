import { cn } from "@/lib/utils";

export function ConsumptionBar({ percentage, className }) {
  const capped = Math.min(percentage, 150);
  const width = Math.min(capped, 100);

  // Umbrales explícitos e independientes del orden de evaluación (antes ">100"
  // y ">=100" dependían de evaluarse en ese orden exacto para que ">=100"
  // terminara significando "=100" en la práctica).
  const getBarColor = () => {
    if (percentage > 100) return "bg-[var(--primary)]"; // sobreconsumo: morado
    if (percentage === 100) return "bg-[var(--destructive)]"; // exactamente 100%: rojo
    if (percentage >= 80) return "bg-[var(--chart-2)]"; // amarillo
    return "bg-[var(--chart-4)]"; // verde
  };

  const getTrackGlow = () => {
    if (percentage > 100) return "shadow-[0_0_8px_color-mix(in_hsl,var(--primary)_40%,transparent)]";
    if (percentage === 100) return "shadow-[0_0_8px_color-mix(in_hsl,var(--destructive)_40%,transparent)]";
    return "";
  };

  return (
    <div className={cn("flex items-center gap-3 min-w-[160px]", className)}>
      <div className="flex-1 h-2.5 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getBarColor(), getTrackGlow())}
          style={{ width: `${width}%` }}
        />
      </div>
      <span
        className={cn(
          "text-sm font-semibold font-mono tabular-nums min-w-[52px] text-right",
          percentage > 100 && "text-[var(--primary)]",
          percentage === 100 && "text-[var(--destructive)]",
          percentage >= 80 && percentage < 100 && "text-[var(--chart-2)]",
          percentage < 80 && "text-foreground"
        )}
      >
        {percentage.toFixed(1)}%
      </span>
    </div>
  );
}
