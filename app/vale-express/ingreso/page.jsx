"use client";

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IngresosBoard, ProveedoresBoard } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { IngresoLineItem } from '@/components/vale-express/IngresoLineItem';
import { ProveedorSearch } from '@/components/vale-express/ProveedorSearch';
import { Plus, PackageCheck, PackagePlus, RotateCcw, ChevronDown, X, ArrowLeft, Camera } from 'lucide-react';
import { getAllRoles, canAccessIngreso, getRoleFromData, getObrasFromData, isObrasRestricted, getAllowedObras, getUserRoleData, ALL_OBRAS } from '@/hooks/vale-express/useUserRole';

const ingresosBoard = new IngresosBoard();
const proveedoresBoard = new ProveedoresBoard();

const emptyLine = () => ({
    id: crypto.randomUUID(),
    materialId: null,
    materialName: '',
    unidad: '',
    codigoInterno: '',
    cantidad: ''
});

export default function IngresoPage() {
    const router = useRouter();
    const [obra, setObra] = useState('');
    const [proveedor, setProveedor] = useState('');
    const [proveedores, setProveedores] = useState([]);
    const [loadingProveedores, setLoadingProveedores] = useState(true);
    const [guiaDespacho, setGuiaDespacho] = useState('');
    const [ordenCompra, setOrdenCompra] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [lines, setLines] = useState([emptyLine()]);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [createdIds, setCreatedIds] = useState([]);
    const [errorDetails, setErrorDetails] = useState(null);
    const [allowedObras, setAllowedObras] = useState(ALL_OBRAS);

    useEffect(() => {
        const init = async () => {
            const session = localStorage.getItem('ve_session');
            if (!session) {
                router.push('/vale-express');
                return;
            }

            try {
                const sessionData = JSON.parse(session);

                // Check role-based access
                const { roles } = await getAllRoles();
                const userData = getUserRoleData(roles, sessionData.userId);
                const userRole = getRoleFromData(userData);
                const userObras = getObrasFromData(userData);
                const restricted = isObrasRestricted(userData);

                console.log('[INGRESO] User access:', { userRole, userObras, restricted });

                if (!canAccessIngreso(userRole)) {
                    toast.error('No tenés acceso a esta sección debido a tu rol.');
                    router.push('/vale-express/dashboard');
                    return;
                }

                // Set allowed obras for this user
                const allowed = getAllowedObras(userRole, userObras, restricted);
                console.log('[INGRESO] Allowed obras:', allowed);
                setAllowedObras(allowed);

                // Load proveedores from board
                await loadProveedores();
            } catch (err) {
                console.error('Init failed:', err);
                router.push('/vale-express/dashboard');
            }
        };

        init();
    }, [router]);

    const loadProveedores = async () => {
        setLoadingProveedores(true);
        try {
            const { items } = await proveedoresBoard
                .items()
                .withPagination({ limit: 500 })
                .execute();

            const proveedoresList = items.map(item => ({
                id: item.id,
                name: item.name
            }));

            setProveedores(proveedoresList);
            console.log(`Loaded ${proveedoresList.length} proveedores:`, proveedoresList.map(p => p.name).join(', '));
        } catch (err) {
            console.error('Error loading proveedores:', err);
            toast.error('Error al cargar proveedores');
            setProveedores([]);
        } finally {
            setLoadingProveedores(false);
        }
    };

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
    const canSubmit = obra && proveedor && guiaDespacho && photoFile && validLines.length > 0;

    const handleSubmit = useCallback(async () => {
        if (!canSubmit || submitting) return;
        setSubmitting(true);
        setErrorDetails(null);

        const ids = [];
        const errors = [];

        try {
            // Get provider info
            const selectedProvider = proveedores.find(p => p.id === proveedor);

            for (let i = 0; i < validLines.length; i++) {
                const line = validLines[i];

                try {
                    const payload = {
                        name: line.materialName,
                        obrabodega: obra,
                        material: {
                            linkedItems: [{ id: String(line.materialId), sourceBoardId: "18404245681" }]
                        },
                        proveedores: {
                            linkedItems: [{ id: String(proveedor), sourceBoardId: "7172768851" }]
                        },
                        cantidadIngresada: Number(line.cantidad),
                        guiaIngreso: guiaDespacho,
                        estado: 'PENDIENTE',
                        fechaDeIngreso: new Date()
                    };

                    if (ordenCompra) {
                        payload.oc = ordenCompra;
                    }
                    if (observaciones) {
                        payload.observaciones = observaciones;
                    }

                    console.log(`Creating item ${i + 1}/${validLines.length}:`, {
                        name: payload.name,
                        cantidad: payload.cantidadIngresada,
                        material: line.materialId,
                        proveedor: selectedProvider?.name
                    });

                    const result = await ingresosBoard.item()
                        .create(payload)
                        .inGroup("group_mm1bh14y")
                        .execute();

                    console.log(`Item created with ID: ${result.id}`);

                    // Upload the same photo to all items
                    if (photoFile) {
                        console.log(`Uploading photo for item ${result.id}`);
                        await ingresosBoard.item(result.id).uploadFile({
                            columnId: "filer6xhdtc6",
                            file: photoFile
                        });
                        console.log(`Photo uploaded for item ${result.id}`);
                    }

                    ids.push(result.id);

                    // Wait 2 seconds before creating the next item (except for the last one)
                    if (i < validLines.length - 1) {
                        console.log('Waiting 2 seconds before next item...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                } catch (itemErr) {
                    console.error(`Error creating item ${i + 1}:`, itemErr);
                    errors.push({ line: i + 1, material: line.materialName, error: itemErr.message });
                }
            }
            if (errors.length > 0) {
                console.error('Some items failed:', errors);
                const errorInfo = {
                    message: `${ids.length} de ${validLines.length} materiales creados. ${errors.length} fallaron.`,
                    details: JSON.stringify(errors, null, 2)
                };
                setErrorDetails(errorInfo);
                toast.error(`${ids.length} materiales creados, ${errors.length} fallaron`);
            }

            if (ids.length > 0) {
                setCreatedIds(ids);
                setSubmitted(true);
                toast.success(`Ingreso registrado con ${ids.length} ítem(s)`);
            } else {
                throw new Error('No se pudo crear ningún material');
            }
        } catch (err) {
            console.error('Error creating ingreso:', err);
            const errorInfo = {
                message: err?.message || 'Error desconocido',
                details: JSON.stringify(err, Object.getOwnPropertyNames(err || {}), 2)
            };
            setErrorDetails(errorInfo);
            toast.error('Error al registrar el ingreso. Ver detalles abajo.');
        } finally {
            setSubmitting(false);
        }
    }, [canSubmit, submitting, validLines, obra, proveedor, guiaDespacho, ordenCompra, observaciones]);

    const handleReset = () => {
        setObra('');
        setProveedor('');
        setGuiaDespacho('');
        setOrdenCompra('');
        setObservaciones('');
        setPhotoFile(null);
        setPhotoPreview(null);
        setLines([emptyLine()]);
        setSubmitted(false);
        setCreatedIds([]);
    };

    const handlePhotoCapture = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemovePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-5">
                <Toaster richColors position="top-center" />
                <div className="w-full max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center">
                        <PackageCheck className="w-8 h-8 text-[var(--chart-2)]" />
                    </div>
                    <h1 className="text-xl font-semibold tracking-[-0.02em] mb-2">Ingreso Registrado</h1>
                    <p className="text-sm text-[var(--fg-muted)] mb-6">
                        Se crearon {createdIds.length} ítem(s) en Ingresos Pendientes
                    </p>
                    <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-4 mb-6 text-left">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-3">Resumen</div>
                        <div className="text-sm text-[var(--fg-muted)] space-y-2">
                            <div className="flex justify-between">
                                <span>Obra/Bodega</span>
                                <span className="text-foreground font-medium">{obra}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Proveedor</span>
                                <span className="text-foreground font-medium">{proveedores.find(p => p.id === proveedor)?.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Guía despacho</span>
                                <span className="text-foreground font-medium">{guiaDespacho}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Materiales</span>
                                <span className="text-foreground font-medium">{createdIds.length}</span>
                            </div>
                        </div>
                        {createdIds.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                                <div className="text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-1.5">IDs creados</div>
                                <div className="text-xs font-mono text-[var(--chart-2)] space-y-0.5">
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
                            Registrar Nuevo Ingreso
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
                    <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center shrink-0">
                        <PackagePlus className="w-[18px] h-[18px] text-[var(--chart-2)]" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Ingreso de Material</h1>
                        <p className="text-xs text-[var(--fg-subtle)]">Entrada a bodega</p>
                    </div>
                </div>
            </header>

            {errorDetails && (
                <div className="mx-4 mt-4 p-4 rounded-[var(--radius-lg)] bg-destructive/10 border border-destructive/30">
                    <div className="flex items-start justify-between mb-2">
                        <h3 className="text-sm font-semibold text-destructive">Error al registrar ingreso</h3>
                        <button
                            onClick={() => setErrorDetails(null)}
                            className="text-destructive/70 hover:text-destructive"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="text-xs text-foreground/90 space-y-2 font-mono">
                        <div><strong>Mensaje:</strong> {errorDetails.message}</div>
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
                            label="Obra/Bodega"
                            required
                            value={obra}
                            onChange={setObra}
                            placeholder="Seleccionar obra..."
                            options={allowedObras}
                        />
                        <div>
                            <span className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                                Proveedor <span className="text-destructive">*</span>
                            </span>
                            <ProveedorSearch
                                proveedores={proveedores}
                                loading={loadingProveedores}
                                value={proveedor}
                                onChange={setProveedor}
                            />
                        </div>
                        <div>
                            <label htmlFor="field-guia" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                                N° Guía de Despacho <span className="text-destructive">*</span>
                            </label>
                            <input
                                id="field-guia"
                                type="text"
                                value={guiaDespacho}
                                onChange={(e) => setGuiaDespacho(e.target.value)}
                                placeholder="Ingrese número de guía"
                                className="w-full h-11 px-3 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label htmlFor="field-oc" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                                Orden de Compra
                            </label>
                            <input
                                id="field-oc"
                                type="text"
                                value={ordenCompra}
                                onChange={(e) => setOrdenCompra(e.target.value)}
                                placeholder="Número de OC (opcional)"
                                className="w-full h-11 px-3 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                            />
                        </div>
                        <div>
                            <label htmlFor="field-obs" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                                Observaciones
                            </label>
                            <textarea
                                id="field-obs"
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                placeholder="Observaciones adicionales (opcional)"
                                rows={3}
                                className="w-full px-3 py-2 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors resize-none"
                            />
                        </div>
                    </div>
                </section>

                {/* Section: Foto Guía de Despacho */}
                <section className="mb-6">
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] mb-3">
                        Foto Guía de Despacho <span className="text-destructive">*</span>
                    </h2>

                    {photoPreview ? (
                        <div className="relative rounded-[var(--radius-lg)] overflow-hidden bg-[var(--surface-1)] border-2 border-[var(--chart-2)] p-2">
                            <img
                                src={photoPreview}
                                alt="Guía de despacho"
                                className="w-full h-auto rounded-[var(--radius-md)]"
                            />
                            <button
                                onClick={handleRemovePhoto}
                                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--surface-1)] border-2 border-[var(--border-subtle)] flex items-center justify-center active:bg-[var(--surface-2)] transition-colors shadow-lg"
                                aria-label="Eliminar foto"
                            >
                                <X className="w-5 h-5 text-foreground" />
                            </button>
                            <div className="absolute bottom-4 left-4 bg-[var(--chart-2)] text-white px-3 py-1.5 rounded-[var(--radius-md)] text-sm font-medium">
                                ✓ Foto capturada
                            </div>
                        </div>
                    ) : (
                        <label className="flex flex-col items-center justify-center min-h-[220px] p-6 bg-[var(--surface-1)] border-2 border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] active:border-[var(--chart-2)] active:bg-[color-mix(in_hsl,var(--chart-2)_5%,transparent)] transition-all cursor-pointer">
                            <div className="w-16 h-16 rounded-full bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center mb-4">
                                <Camera className="w-8 h-8 text-[var(--chart-2)]" />
                            </div>
                            <span className="text-base font-semibold text-foreground mb-1.5">
                                Tomar foto de la guía
                            </span>
                            <span className="text-sm text-[var(--fg-muted)] text-center max-w-xs">
                                Esta foto se adjuntará a todos los materiales de esta solicitud
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoCapture}
                                className="hidden"
                                aria-label="Capturar foto de guía de despacho"
                            />
                        </label>
                    )}
                </section>

                {/* Section: Materiales */}
                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                            Materiales ({validLines.length}/{lines.length})
                        </h2>
                        {lines.length < 10 && (
                            <button
                                onClick={addLine}
                                className="flex items-center gap-1 text-xs font-medium text-[var(--chart-2)] active:opacity-70 transition-opacity"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Agregar
                            </button>
                        )}
                    </div>

                    <div>
                        {lines.map((line, idx) => (
                            <IngresoLineItem
                                key={line.id}
                                index={idx}
                                item={line}
                                onUpdate={(updated) => updateLine(idx, updated)}
                                onRemove={() => removeLine(idx)}
                                canRemove={lines.length > 1}
                            />
                        ))}
                    </div>

                    {lines.length < 10 && (
                        <button
                            onClick={addLine}
                            className="w-full py-3.5 border border-dashed border-[var(--border-default)] rounded-[var(--radius-lg)] text-sm text-[var(--fg-subtle)] active:text-foreground active:border-[var(--chart-2)] transition-colors"
                        >
                            + Agregar material ({lines.length}/10)
                        </button>
                    )}
                </section>

                <div className="mt-4 p-3 bg-[color-mix(in_hsl,var(--chart-2)_8%,transparent)] border border-[color-mix(in_hsl,var(--chart-2)_25%,transparent)] rounded-[var(--radius-md)] flex items-start gap-2.5">
                    <Camera className="w-4 h-4 text-[var(--chart-2)] shrink-0 mt-0.5" />
                    <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
                        <strong className="text-foreground">Foto obligatoria:</strong> Debes adjuntar una foto de la guía de despacho para cada material ingresado.
                    </p>
                </div>
            </main>

            <div className="fixed bottom-0 left-0 right-0 z-30 bg-[var(--surface-1)] border-t border-[var(--border-subtle)] safe-area-bottom">
                <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="text-xs text-[var(--fg-muted)]">
                            {validLines.length > 0 && photoFile ? (
                                <span>{validLines.length} material{validLines.length > 1 ? 'es' : ''} listo{validLines.length > 1 ? 's' : ''}</span>
                            ) : !photoFile ? (
                                <span>Falta foto de guía</span>
                            ) : (
                        <span>Seleccione materiales</span>
                    )}
                                            </div>
                                        </div>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit || submitting}
                        className="flex items-center justify-center gap-2 h-11 px-6 rounded-[var(--radius-md)] bg-[var(--chart-2)] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed active:opacity-90 transition-all shrink-0"
                    >
                        {submitting ? (
                            <>
                                <Spinner className="size-4" />
                                <span>Guardando...</span>
                            </>
                        ) : (
                            <>
                                <PackageCheck className="w-4 h-4" />
                                <span>Registrar Ingreso</span>
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
