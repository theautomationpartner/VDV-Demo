"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Truck } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

// Foco visible (teclado) para los botones nativos de este buscador - ninguno usa
// el componente Button de shadcn/ui (que ya trae su propio focus-visible), asi
// que cada <button> a mano necesita este anillo para cumplir WCAG 2.1 AA.
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function ProveedorSearch({ proveedores, loading, value, onChange }) {
    const [term, setTerm] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    const selected = useMemo(() => {
        if (!value) return null;
        return proveedores.find(p => p.id === value) || null;
    }, [value, proveedores]);

    const filtered = useMemo(() => {
        if (!term || term.length < 1) return proveedores.slice(0, 15);
        const lower = term.toLowerCase();
        return proveedores.filter(p => p.name.toLowerCase().includes(lower));
    }, [term, proveedores]);

    useEffect(() => {
        function handleClickOutside(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const handleSelect = (prov) => {
        onChange(prov.id);
        setTerm('');
        setShowDropdown(false);
    };

    const handleClear = () => {
        onChange('');
        setTerm('');
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    if (loading) {
        return (
            <div className="h-12 flex items-center gap-2 px-3 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                <Spinner className="size-4" />
                <span className="text-sm text-[var(--fg-subtle)]">Cargando proveedores...</span>
            </div>
        );
    }

    // Selected state
    if (selected) {
        return (
            <div className="flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--chart-2)_8%,transparent)] border border-[color-mix(in_hsl,var(--chart-2)_25%,transparent)]">
                <Truck className="w-4 h-4 text-[var(--chart-2)] shrink-0" />
                <span className="text-sm text-foreground flex-1 leading-snug truncate">
                    {selected.name}
                </span>
                <button
                    type="button"
                    onClick={handleClear}
                    className={`flex items-center justify-center min-h-12 min-w-12 sm:h-8 sm:w-8 rounded-full text-[var(--fg-subtle)] active:text-destructive active:bg-[var(--surface-2)] transition-colors shrink-0 ${FOCUS_RING}`}
                    aria-label="Cambiar proveedor"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        );
    }

    // Search state
    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
                <input
                    ref={inputRef}
                    type="text"
                    value={term}
                    onChange={(e) => {
                        setTerm(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder="Buscar proveedor..."
                    autoComplete="off"
                    aria-label="Buscar proveedor"
                    className="w-full h-12 pl-10 pr-4 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
                />
            </div>

            {showDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[260px] overflow-y-auto bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-xl overscroll-contain">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-[var(--fg-subtle)]">
                            No se encontró "{term}"
                        </div>
                    ) : (
                        <>
                            {term.length === 0 && (
                                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium border-b border-[var(--border-subtle)]">
                                    Primeros 15 proveedores - escribe para filtrar
                                </div>
                            )}
                            {filtered.map((prov, i) => (
                                <button
                                    key={prov.id}
                                    type="button"
                                    onClick={() => handleSelect(prov)}
                                    className={`w-full text-left px-4 py-3 active:bg-[color-mix(in_hsl,var(--chart-2)_10%,transparent)] transition-colors flex items-center gap-3 ${FOCUS_RING} ${
                                        i !== filtered.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
                                    }`}
                                >
                                    <Truck className="w-4 h-4 text-[var(--fg-subtle)] shrink-0" />
                                    <span className="text-sm text-foreground leading-snug truncate">{prov.name}</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
