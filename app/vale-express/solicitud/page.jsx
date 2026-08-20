"use client";

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ValesBoard } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { MaterialLineItem } from '@/components/vale-express/MaterialLineItem';
import { Plus, ClipboardCheck, FileText, RotateCcw, ChevronDown, X, ArrowLeft } from 'lucide-react';
import { getAllRoles, canAccessSolicitud, getRoleFromData, getObrasFromData, isObrasRestricted, getAllowedObras, ALL_OBRAS } from '@/hooks/vale-express/useUserRole';
import { useObraStock } from '@/hooks/vale-express/useObraStock';

const valesBoard = new ValesBoard();
const SOLICITANTES = ["BASILIO GUZMAN", "PATRICIO SAN JUAN", "JORGE MUÑOZ", "RODRIGO ROZBACZYLO", "FRANCISCO SEGURA", "ROMINTA TORO", "MACARENA LIZAMA", "ROMINA TORO", "CRISTIAN HIGUERAS", "ISABEL DELGADO", "NICOLAS HERNANDEZ"];
const DESTINOS = ["PISO 6", "PISO 5", "PISO 4", "PISO 3", "PISO 2", "PISO 1", "EXTERIORES", "GENERAL/obras pequeñas", "PATIO PARROQUIAL", "EPP", "ARTICULO ASEO", "POSVENTA LEON", "PRESTAMO OBRA FORESTAL", "AJUSTE INVENTARIO", "DORM 61", "DORM 62", "DORM 63", "DORM 64", "DORM 65", "DPTO 301", "601", "602", "603", "604", "605", "606", "607", "608", "609", "610", "501", "502", "503", "504", "505", "506", "507", "508", "509", "510", "101", "102", "103", "104", "105", "106", "107", "108", "109", "110", "201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "401", "402", "403", "404", "405", "406", "407", "408", "409", "410"];

const emptyLine = () => ({
    id: crypto.randomUUID(),
    materialId: null,
    materialName: '',
    unidad: '',
    codigoInterno: '',
    cantidad: ''
});

export default function SolicitudPage() {
    const router = useRouter();
    const [obra, setObra] = useState('');
    const [quienSolicita, setQuienSolicita] = useState('');
    const [destino, setDestino] = useState('');
    const [quienRetira, setQuienRetira] = useState('');
    const [lines, setLines] = useState([emptyLine()]);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [createdIds, setCreatedIds] = useState([]);
    const [errorDetails, setErrorDetails] = useState(null);
    const [allowedObras, setAllowedObras] = useState(ALL_OBRAS);

    // Fetch stock for the selected obra so users see availability
    const { getStock, loading: stockLoading, loaded: stockLoaded } = useObraStock(obra);

    useEffect(() => {
        const checkAccess = async () => {
            const session = localStorage.getItem('ve_session');
            if (!session) {
                router.push('/vale-express');
                return;
            }

            try {
                const sessionData = JSON.parse(session);
                const { roles } = await getAllRoles();
                const userData = roles[String(sessionData.userId)];
                const userRole = getRoleFromData(userData);
                const userObras = getObrasFromData(userData);
                const restricted = isObrasRestricted(userData);

                console.log('[SOLICITUD] User access:', { userRole, userObras, restricted });

                if (!canAccessSolicitud(userRole)) {
                    toast.error('No tienes permisos para solicitar material');
                    router.push('/vale-express/dashboard');
                    return;
                }

                // Set allowed obras for this user
                const allowed = getAllowedObras(userRole, userObras, restricted);
                console.log('[SOLICITUD] Allowed obras:', allowed);
                setAllowedObras(allowed);
            } catch (err) {
                console.error('Access check failed:', err);
                router.push('/vale-express/dashboard');
            }
        };

        checkAccess();
    }, [router]);

    const addLine = () => {
        if (lines.length >= 10) return;
        setLines([...lines, emptyLine()]);
    };

    const updateLine = (idx, updated) => {
        setLines(lines.map((l, i) => i === idx ? { ...l, ...updated } : l));
    };

    const removeLine = (idx) => {
        if (lines.length <= 1) return;
        setLines(lines.filter((_, i) => i !== idx));
    };

    const validLines = lines.filter(l => l.materialId && l.cantidad && l.cantidad > 0);
    const canSubmit = obra && quienSolicita && validLines.length > 0;

    const handleSubmit = useCallback(async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        setErrorDetails(null);

        const ids = [];
        const warnings = [];
        try {
            for (const line of validLines) {
                console.log('[VALE] Step 1: Creating item with name...');

                // Step 1: Create item with just the name - this ALWAYS works for any user
                const result = await valesBoard.item()
                    .create({ name: line.materialName || 'Material' })
                    .inGroup("group_mm1bc1c1")
                    .execute();

                console.log('[VALE] Created OK, id:', result.id);
                ids.push(result.id);

                // Step 2: Try to set columns individually (best effort, non-blocking)
                // Each column update is independent - if one fails, others still get set
                const columnUpdates = [
                    { label: 'estado', payload: { estado: 'SOLICITADA' } },
                    { label: 'obra', payload: { obra: obra } },
                    { label: 'cantidad', payload: { cantidad: Number(line.cantidad) } },
                    { label: 'quienSolicita', payload: { quienSolicita: [quienSolicita] } },
                ];

                if (destino) {
                    columnUpdates.push({ label: 'destino', payload: { destinoDelMaterial: [destino] } });
                }
                if (quienRetira) {
                    columnUpdates.push({ label: 'quienRetira', payload: { quienRetira: quienRetira } });
                }

                // Try all simple columns in one batch first
                try {
                    const batchPayload = {};
                    columnUpdates.forEach(u => Object.assign(batchPayload, u.payload));
                    await valesBoard.item(result.id).update(batchPayload).execute();
                    console.log('[VALE] All columns updated OK');
                } catch (batchErr) {
                    console.warn('[VALE] Batch update failed, trying one by one:', batchErr?.message);
                    // If batch fails, try each column individually
                    for (const col of columnUpdates) {
                        try {
                            await valesBoard.item(result.id).update(col.payload).execute();
                            console.log(`[VALE] Column ${col.label} OK`);
                        } catch (colErr) {
                            console.warn(`[VALE] Column ${col.label} failed:`, colErr?.message);
                            warnings.push(`${col.label}: ${colErr?.message}`);
                        }
                    }
                }

                // Step 3: Try board_relation separately (lowest priority)
                if (line.materialId) {
                    try {
                        await valesBoard.item(result.id)
                            .update({
                                baseDeDatosMateriales: {
                                    linkedItems: [{ id: String(line.materialId), sourceBoardId: 18404245681 }]
                                }
                            })
                            .execute();
                        console.log('[VALE] Material link OK');
                    } catch (linkErr) {
                        console.warn('[VALE] Material link failed:', linkErr?.message);
                        warnings.push(`material link: ${linkErr?.message}`);
                    }
                }
            }

            setCreatedIds(ids);
            setSubmitted(true);
            if (warnings.length > 0) {
                console.warn('[VALE] Completed with warnings:', warnings);
                toast.success(`Vale creado (${ids.length} ítem). Algunos campos pueden requerir revisión.`);
            } else {
                toast.success(`Vale creado con ${ids.length} ítem(s)`);
            }
        } catch (err) {
            console.error('Error creating vale:', err);
            console.error('Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2));
            const errorInfo = {
                message: err?.message || 'Error desconocido',
                step: ids.length > 0 ? 'Actualización de campos' : 'Creación del ítem',
                createdSoFar: ids.length,
                warnings,
                payload: validLines.map(line => ({
                    name: line.materialName,
                    obra,
                    quienSolicita,
                    destino,
                    materialId: line.materialId,
                    cantidad: line.cantidad
                }))
            };
            setErrorDetails(errorInfo);
            toast.error('Error al crear el vale. Ver detalles abajo.');
        } finally {
            setSubmitting(false);
        }
    }, [canSubmit, submitting, validLines, obra, quienSolicita, destino, quienRetira]);

    const handleReset = () => {
        setObra('');
        setQuienSolicita('');
        setDestino('');
        setQuienRetira('');
        setLines([emptyLine()]);
        setSubmitted(false);
        setCreatedIds([]);
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-5">
                <Toaster richColors position="top-center" />
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[color-mix(in_hsl,var(--success)_12%,transparent)] flex items-center justify-center">
                        <ClipboardCheck className="w-8 h-8 text-[var(--success)]" />
                    </div>
                    <h1 className="text-xl font-semibold tracking-[-0.02em] mb-2">Vale Enviado</h1>
                    <p className="text-sm text-[var(--fg-muted)] mb-6">
                        Se crearon {createdIds.length} ítem(s) en Vales Solicitados
                    </p>
                    <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 mb-6 text-left">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-3">Resumen</div>
                        <div className="text-sm text-[var(--fg-muted)] space-y-2">
                            <div className="flex justify-between">
                                <span>Obra</span>
                                <span className="text-foreground font-medium">{obra}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Solicitante</span>
                                <span className="text-foreground font-medium">{quienSolicita}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Materiales</span>
                                <span className="text-foreground font-medium">{createdIds.length}</span>
                            </div>
                        </div>
                        {createdIds.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-1.5">IDs creados</div>
                                <div className="text-xs font-mono text-[var(--accent)] space-y-0.5">
                                    {createdIds.map(id => <div key={id}>{id}</div>)}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="space-y-3">
                        <button
                            onClick={handleReset}
                            className="w-full h-12 flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-sm font-medium text-foreground active:bg-[var(--surface-3)] transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Crear Nuevo Vale
                        </button>
                        <button
                            onClick={() => router.push('/vale-express/dashboard')}
                            className="w-full h-12 flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium active:opacity-90 transition-all"
                        >
                            Volver al Panel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Toaster richColors position="top-center" />

            <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
                <div className="px-4 py-3 flex items-center gap-3">
                    <button
                        onClick={() => router.push('/vale-express/dashboard')}
                        className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-md)] text-[var(--fg-muted)] active:text-foreground active:bg-[var(--surface-2)] transition-colors shrink-0"
                        aria-label="Volver"
                    >
                        <ArrowLeft className="w-[18px] h-[18px]" />
                    </button>
                    <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--accent-soft)_12%,transparent)] flex items-center justify-center shrink-0">
                        <FileText className="w-[18px] h-[18px] text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Vale de Solicitud</h1>
                        <p className="text-xs text-[var(--fg-subtle)]">Retiro de materiales</p>
                    </div>
                </div>
            </header>

            {errorDetails && (
                <div className="mx-4 mt-4 p-4 rounded-[var(--radius-lg)] bg-destructive/10 border border-destructive/30">
                    <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold text-destructive">Error al crear vale</h3>
                        <button
                            onClick={() => setErrorDetails(null)}
                            className="text-destructive/70 hover:text-destructive"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="text-xs text-foreground/90 space-y-2 font-mono">
                        <div><strong>Mensaje:</strong> {errorDetails.message}</div>
                        {errorDetails.step && <div><strong>Falló en:</strong> {errorDetails.step}</div>}
                        {errorDetails.createdSoFar > 0 && (
                            <div><strong>Ítems creados:</strong> {errorDetails.createdSoFar} (pero sin datos completos)</div>
                        )}
                        {errorDetails.warnings && errorDetails.warnings.length > 0 && (
                            <div>
                                <strong>Columnas fallidas:</strong>
                                <ul className="list-disc pl-4 mt-1">
                                    {errorDetails.warnings.map((w) => <li key={w}>{w}</li>)}
                                </ul>
                            </div>
                        )}
                        <div><strong>Datos enviados:</strong></div>
                        <pre className="text-[10px] bg-black/20 p-2 rounded overflow-x-auto">
                            {JSON.stringify(errorDetails.payload, null, 2)}
                        </pre>
                        <div className="mt-3 p-2 bg-[color-mix(in_hsl,var(--accent-soft)_10%,transparent)] rounded border border-[color-mix(in_hsl,var(--accent)_20%,transparent)] text-[11px] text-foreground/80 font-sans">
                            <strong>💡 Solución:</strong> El usuario necesita permisos de "Editor" o "Miembro" en el tablero VALES de monday.com. Los permisos de la app no son suficientes - se requieren permisos a nivel de tablero.
                        </div>
                    </div>
                </div>
            )}

            <main className="px-4 py-5 pb-28">
                <section className="mb-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] mb-3">
                        Información General
                    </h2>
                    <div className="space-y-3">
                        <FormSelect
                            id="field-obra"
                            label="Obra"
                            required
                            value={obra}
                            onChange={setObra}
                            placeholder="Seleccionar obra..."
                            options={allowedObras}
                        />
                        <FormSelect
                            id="field-solicitante"
                            label="Quien Solicita"
                            required
                            value={quienSolicita}
                            onChange={setQuienSolicita}
                            placeholder="Seleccionar..."
                            options={SOLICITANTES}
                        />
                        <FormSelect
                            id="field-destino"
                            label="Destino del Material"
                            value={destino}
                            onChange={setDestino}
                            placeholder="Seleccionar destino..."
                            options={DESTINOS}
                        />
                        <div>
                            <label htmlFor="field-retira" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                                Quien Retira
                            </label>
                            <input
                                id="field-retira"
                                type="text"
                                value={quienRetira}
                                onChange={(e) => setQuienRetira(e.target.value)}
                                placeholder="Nombre de quien retira"
                                className="w-full h-11 px-3 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                            />
                        </div>
                    </div>
                </section>

                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                            Materiales ({validLines.length}/{lines.length})
                        </h2>
                        {lines.length < 10 && (
                            <button
                                onClick={addLine}
                                className="flex items-center gap-1 text-xs font-medium text-[var(--accent)] active:opacity-70 transition-opacity"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Agregar
                            </button>
                        )}
                    </div>

                    <div>
                        {lines.map((line, idx) => (
                            <MaterialLineItem
                                key={line.id}
                                index={idx}
                                item={line}
                                onUpdate={(updated) => updateLine(idx, updated)}
                                onRemove={() => removeLine(idx)}
                                canRemove={lines.length > 1}
                                stockInfo={obra && line.materialId ? {
                                    stock: getStock(line.materialId),
                                    loading: stockLoading && !stockLoaded
                                } : null}
                            />
                        ))}
                    </div>

                    {lines.length < 10 && (
                        <button
                            onClick={addLine}
                            className="w-full py-3.5 border border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] text-sm text-[var(--fg-subtle)] active:text-foreground active:border-[var(--accent)] transition-colors"
                        >
                            + Agregar material ({lines.length}/10)
                        </button>
                    )}
                </section>
            </main>

            <div className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--surface-1)] border-t border-[var(--border-subtle)] safe-area-bottom">
                <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--fg-muted)]">
                            {validLines.length > 0 ? (
                                <span>{validLines.length} material{validLines.length > 1 ? 'es' : ''} listo{validLines.length > 1 ? 's' : ''}</span>
                            ) : (
                                <span>Seleccione materiales</span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit || submitting}
                        className="flex items-center justify-center gap-2 h-11 px-6 rounded-[var(--radius-md)] bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed active:opacity-90 transition-all shrink-0"
                    >
                        {submitting ? (
                            <>
                                <Spinner className="size-4" />
                                <span>Enviando...</span>
                            </>
                        ) : (
                            <>
                                <ClipboardCheck className="w-4 h-4" />
                                <span>Generar Vale</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

function FormSelect({ id, label, required, value, onChange, placeholder, options }) {
    return (
        <div>
            <label htmlFor={id} className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                {label} {required && <span className="text-destructive">*</span>}
            </label>
            <div className="relative">
                <select
                    id={id}
                    aria-label={label}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full h-11 px-3 pr-9 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors appearance-none cursor-pointer"
                >
                    <option value="">{placeholder}</option>
                    {options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
            </div>
        </div>
    );
}
