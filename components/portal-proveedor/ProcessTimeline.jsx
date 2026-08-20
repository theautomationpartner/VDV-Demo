"use client";

import { Check, X, Clock, Circle } from 'lucide-react';

function getStepStatus(value) {
  if (!value) return 'pending';
  const v = value.toUpperCase();
  if (['VB', 'APROBADO', 'FIRMADO', 'COMPLETED', 'LISTO', '2 SIGNED', '1 SIGNED'].some((s) => v.includes(s))) return 'approved';
  if (['RECHAZADO', 'SIN EFECTO', 'FAILED', 'CANCELLED', 'CON OBS', 'DETENIDO'].some((s) => v.includes(s))) return 'rejected';
  if (['REVISAR', 'REVISIÓN', 'PENDIENTE', 'ENVIADA', 'SENT', 'VIEWED', 'GENERATING', 'GENERAR'].some((s) => v.includes(s))) return 'in_progress';
  return 'in_progress';
}

const statusConfig = {
  approved: { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', line: 'bg-green-500/50', Icon: Check },
  rejected: { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', line: 'bg-red-500/50', Icon: X },
  in_progress: { bg: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', line: 'bg-yellow-500/50', Icon: Clock },
  pending: { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', line: 'bg-border', Icon: Circle },
};

export default function ProcessTimeline({ steps }) {
  return (
    <div className="relative">
      {steps.map((step, idx) => {
        const status = getStepStatus(step.value);
        const cfg = statusConfig[status];
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.label} className="flex items-start gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-7 h-7 rounded-full border-2 ${cfg.border} ${cfg.bg} flex items-center justify-center`}>
                <cfg.Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
              </div>
              {!isLast && <div className={`w-0.5 h-5 ${cfg.line}`} />}
            </div>
            <div className={`pb-3 min-w-0 ${isLast ? '' : ''}`}>
              <p className="text-[10px] text-muted-foreground leading-none">{step.label}</p>
              <p className={`text-xs font-medium mt-0.5 ${cfg.text}`}>
                {step.value || 'Pendiente'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
