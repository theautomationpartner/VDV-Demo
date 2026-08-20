import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner({ className, ...props }) {
  return (
    <Loader2
      role="status"
      aria-label="Cargando"
      className={cn("animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
