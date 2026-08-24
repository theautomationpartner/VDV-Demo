"use client";

import { useState } from 'react';
import { BaseDeDatosMaterialesBoard } from '@/lib/board-sdk';
import { Spinner } from '@/components/ui/spinner';
import { X, Package, ChevronDown } from 'lucide-react';

const materialesBoard = new BaseDeDatosMaterialesBoard();

// Foco visible (teclado) para los botones nativos de este dialogo - ninguno usa
// el componente Button de shadcn/ui (que ya trae su propio focus-visible), asi
// que cada <button> a mano necesita este anillo para cumplir WCAG 2.1 AA.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const UNIDADES = ["pieza", "caja", "litro", "metro", "TI", "UNID", "RO", "LT", "ML", "SC", "M2", "TN", "KG", "PAR", "KM", "L", "GLN", "MTs", "BL", "BALDE 5 KG", "TIRA", "TINETA", "BOLSA", "GAL"];
const CATEGORIAS = ["EPP", "ASEO", "YESO CARTON", "HERRAMIENTAS MANUALES", "FIJACIONES", "GUARDAPOLVO", "PEGAMENTOS", "ACCESORIO BAÑO", "PORCELANATO", "AISLANTE", "LAVAPLATOS", "ARTEFACTO COCINA", "PUERTA", "INSUMO", "MADERAS", "CORNISAS", "METALCON", "MELÓN", "QUINCALLERIA", "TRAZADO", "CERAMICA", "PISO", "FIBROCEMENTO", "MOLDURA MADERA", "quinca", "FUNJIGLES", "PINTURA", "MATERIAL GENERAL", "SANITARIO", "NIVELADOR DE PISO", "GRIFERIA", "SILICONA", "PERFILES IPE", "PERFIL METALICO", "EQUIPAMIENTO BAÑO", "HORMIGON LISTO", "FIERRO CONSTRUCCION"];

export function CreateMaterialDialog({ searchTerm, onClose, onMaterialCreated }) {
    const [nombre, setNombre] = useState(searchTerm || '');
    const [unidad, setUnidad] = useState('');
    const [categoria, setCategoria] = useState('');
    const [precio, setPrecio] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const canSubmit = nombre.trim() && unidad;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit || submitting) return;

        setSubmitting(true);
        try {
            const payload = {
                name: nombre.trim(),
                unidad: [unidad]
            };

            if (categoria) {
                payload.categoriaMaterial = [categoria];
            }
            if (precio) {
                payload.precioLista = Number(precio);
            }

            const result = await materialesBoard.item()
                .create(payload)
                .inGroup("group_mm1hfvp7")
                .returnColumns(["unidad"])
                .execute();

            // Return the created material in the expected format
            onMaterialCreated({
                id: result.id,
                name: result.name,
                unidad: result.unidad,
                codigoInterno: result.id
            });
        } catch (err) {
            console.error('Error creating material:', err);
            alert('Error al crear el material. Intenta nuevamente.');
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 animate-in fade-in duration-200">
            <div
                role="dialog"
                aria-labelledby="create-material-title"
                className="w-full max-w-md bg-[var(--surface-1)] rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)] border border-[var(--border-subtle)] shadow-xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-2)_12%,transparent)] flex items-center justify-center">
                            <Package className="w-[18px] h-[18px] text-[var(--chart-2)]" />
                        </div>
                        <div>
                            <h2 id="create-material-title" className="text-base font-semibold text-foreground">Crear Material</h2>
                            <p className="text-xs text-[var(--fg-subtle)]">Nuevo en base de datos</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`flex items-center justify-center min-h-12 min-w-12 sm:h-8 sm:w-8 rounded-[var(--radius-md)] text-[var(--fg-subtle)] active:text-foreground active:bg-[var(--surface-2)] transition-colors ${FOCUS_RING}`}
                        aria-label="Cerrar"
                    >
                        <X className="w-[18px] h-[18px]" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label htmlFor="mat-nombre" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                            Nombre del Material <span className="text-destructive">*</span>
                        </label>
                        <input
                            id="mat-nombre"
                            type="text"
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            placeholder="Ej: CEMENTO MELÓN 25KG"
                            className="w-full h-12 px-3 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                        />
                    </div>

                    <div>
                        <label htmlFor="mat-unidad" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                            Unidad <span className="text-destructive">*</span>
                        </label>
                        <div className="relative">
                            <select
                                id="mat-unidad"
                                value={unidad}
                                onChange={(e) => setUnidad(e.target.value)}
                                className="w-full h-12 px-3 pr-9 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors appearance-none cursor-pointer"
                            >
                                <option value="">Seleccionar...</option>
                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="mat-categoria" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                            Categoría
                        </label>
                        <div className="relative">
                            <select
                                id="mat-categoria"
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                                className="w-full h-12 px-3 pr-9 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors appearance-none cursor-pointer"
                            >
                                <option value="">Seleccionar...</option>
                                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)] pointer-events-none" />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="mat-precio" className="block text-xs font-medium text-[var(--fg-muted)] mb-1.5">
                            Precio Lista
                        </label>
                        <input
                            id="mat-precio"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={precio}
                            onChange={(e) => setPrecio(e.target.value)}
                            placeholder="0"
                            className="w-full h-12 px-3 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className={`flex-1 h-12 flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-sm font-medium text-foreground active:bg-[var(--surface-3)] transition-colors ${FOCUS_RING}`}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!canSubmit || submitting}
                            className={`flex-1 h-12 flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--chart-2)] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed active:opacity-90 transition-all ${FOCUS_RING}`}
                        >
                            {submitting ? (
                                <>
                                    <Spinner className="size-4" />
                                    <span>Creando...</span>
                                </>
                            ) : (
                                <span>Crear Material</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
