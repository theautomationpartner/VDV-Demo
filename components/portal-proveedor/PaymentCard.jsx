"use client";

export default function PaymentCard({ pago, formatCurrency, formatDate, isPagado }) {
  return (
    <div className="p-3 border-b border-border last:border-b-0 space-y-2.5">
      {/* Nombre del pago */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm text-foreground leading-tight flex-1 min-w-0 break-words">
          {pago.name || 'Sin nombre'}
        </h3>
        <span className={`text-sm font-semibold tabular-nums shrink-0 ${isPagado ? 'text-green-400' : 'text-yellow-400'}`}>
          {formatCurrency(pago.monto)}
        </span>
      </div>

      {/* Grid de detalles */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {/* Folio */}
        <div>
          <p className="text-muted-foreground text-[10px] mb-0.5">Folio</p>
          <p className="text-foreground font-medium tabular-nums">{pago.folioPago || '-'}</p>
        </div>

        {/* N° Factura */}
        <div>
          <p className="text-muted-foreground text-[10px] mb-0.5">N° Factura</p>
          <p className="text-foreground font-medium tabular-nums">{pago.numeroFact || '-'}</p>
        </div>

        {/* Fecha */}
        <div>
          <p className="text-muted-foreground text-[10px] mb-0.5">Fecha Límite</p>
          <p className="text-foreground font-medium tabular-nums">{formatDate(pago.fechaLmite)}</p>
        </div>

        {/* Estado (solo si no está pagado) */}
        {!isPagado && (
          <div>
            <p className="text-muted-foreground text-[10px] mb-0.5">Estado</p>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border bg-yellow-600/20 text-yellow-400 border-yellow-600/30">
              {pago.estado || 'En proceso'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
