"use client";

import { useState, useRef, useEffect } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { X, Search, Package, ChevronDown, BarChart3 } from 'lucide-react';
import { useMaterialSearch } from '@/hooks/vale-express/useMaterialSearch';

export function MaterialLineItem({ index, item, onUpdate, onRemove, canRemove, stockInfo }) {
    const { term, setTerm, results, loading } = useMaterialSearch();
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

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

    const handleSelectMaterial = (material) => {
        onUpdate({
            ...item,
            materialId: material.id,
            materialName: material.name,
            unidad: material.unidad || '-',
            codigoInterno: material.codigoInterno || ''
        });
        setTerm('');
        setShowDropdown(false);
    };

    const handleClearMaterial = () => {
        onUpdate({
            ...item,
            materialId: null,
            materialName: '',
            unidad: '',
            codigoInterno: ''
        });
    };

    const handleQuantityChange = (e) => {
        const val = e.target.value;
        onUpdate({ ...item, cantidad: val === '' ? '' : Number(val) });
    };

    const hasDropdownContent = showDropdown && !item.materialId && (
        (results.length > 0) || (term.length >= 2 && !loading && results.length === 0)
    );

    return (
        <div className="relative rounded-[var(--radius-lg)] bg-[var(--surface-1)] border border-[var(--border-subtle)] p-3 mb-3">
            {/* Top row: line number + remove */}
            <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--surface-3)] text-[11px] font-semibold text-[var(--fg-muted)]">
                        {index + 1}
                    </span>
                    {item.materialId && (
                        <span className="text-[11px] font-medium text-[var(--accent)]">
                            {item.codigoInterno}
                        </span>
                    )}
                </div>
                {canRemove && (
                    <button
                        onClick={onRemove}
                        className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] text-[var(--fg-subtle)] active:text-destructive active:bg-[color-mix(in_hsl,var(--destructive)_10%,transparent)] transition-colors"
                        aria-label={`Eliminar línea ${index + 1}`}
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Material search or selected display */}
            <div ref={wrapperRef} className="relative mb-3">
                {item.materialId ? (
                    <SelectedMaterial item={item} onClear={handleClearMaterial} stockInfo={stockInfo} />
                ) : (
                    <SearchInput
                        index={index}
                        term={term}
                        loading={loading}
                        inputRef={inputRef}
                        onTermChange={(val) => {
                            setTerm(val);
                            setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                    />
                )}

                {/* Full-width dropdown */}
                {hasDropdownContent && (
                    <SearchDropdown
                        results={results}
                        term={term}
                        loading={loading}
                        onSelect={handleSelectMaterial}
                    />
                )}
            </div>

            {/* Bottom row: unit + quantity */}
            <div className="flex gap-3">
                <div className="flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-1">
                        Unidad
                    </span>
                    <div className="h-11 flex items-center px-3 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border-subtle)] text-sm text-[var(--fg-muted)]">
                        {item.unidad || '-'}
                    </div>
                </div>
                <div className="w-28">
                    <label htmlFor={`qty-${index}`} className="block text-[10px] uppercase tracking-wider text-[var(--fg-subtle)] font-medium mb-1">
                        Cantidad
                    </label>
                    <input
                        id={`qty-${index}`}
                        type="number"
                        inputMode="decimal"
                        aria-label={`Cantidad línea ${index + 1}`}
                        min="0"
                        step="0.5"
                        value={item.cantidad}
                        onChange={handleQuantityChange}
                        placeholder="0"
                        className="w-full h-11 px-3 text-sm text-right bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                </div>
            </div>
        </div>
    );
}

/* Selected material display */
function SelectedMaterial({ item, onClear, stockInfo }) {
    const hasStock = stockInfo !== null && stockInfo !== undefined;
    const stockQty = hasStock ? stockInfo.stock : null;
    const stockLoading = hasStock ? stockInfo.loading : false;

    return (
        <div>
            <div className="flex items-center gap-2.5 min-h-[44px] px-3 py-2 rounded-[var(--radius-md)] bg-[color-mix(in_hsl,var(--accent)_8%,transparent)] border border-[color-mix(in_hsl,var(--accent)_25%,transparent)]">
                <Package className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <span className="text-sm text-foreground flex-1 leading-snug">
                    {item.materialName}
                </span>
                <button
                    onClick={onClear}
                    className="flex items-center justify-center w-8 h-8 rounded-full text-[var(--fg-subtle)] active:text-destructive active:bg-[var(--surface-2)] transition-colors shrink-0"
                    aria-label="Cambiar material"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            {/* Stock indicator */}
            {hasStock && (
                <StockBadge stock={stockQty} loading={stockLoading} />
            )}
        </div>
    );
}

/* Stock availability badge */
function StockBadge({ stock, loading }) {
    if (loading) {
        return (
            <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius)] bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                <Spinner className="size-3" />
                <span className="text-[11px] text-[var(--fg-subtle)]">Consultando stock...</span>
            </div>
        );
    }

    if (stock === null) return null;

    const isZero = stock === 0;
    const isLow = stock > 0 && stock <= 5;
    const isNegative = stock < 0;
    const isGood = stock > 5;

    let bgClass, borderClass, textClass, label;
    if (isNegative) {
        bgClass = 'bg-[color-mix(in_hsl,var(--destructive)_8%,transparent)]';
        borderClass = 'border-[color-mix(in_hsl,var(--destructive)_20%,transparent)]';
        textClass = 'text-destructive';
        label = 'Déficit';
    } else if (isZero) {
        bgClass = 'bg-[color-mix(in_hsl,var(--destructive)_8%,transparent)]';
        borderClass = 'border-[color-mix(in_hsl,var(--destructive)_20%,transparent)]';
        textClass = 'text-destructive';
        label = 'Sin stock';
    } else if (isLow) {
        bgClass = 'bg-[color-mix(in_hsl,var(--chart-4)_8%,transparent)]';
        borderClass = 'border-[color-mix(in_hsl,var(--chart-4)_20%,transparent)]';
        textClass = 'text-[var(--chart-4)]';
        label = 'Stock bajo';
    } else {
        bgClass = 'bg-[color-mix(in_hsl,var(--chart-2)_8%,transparent)]';
        borderClass = 'border-[color-mix(in_hsl,var(--chart-2)_20%,transparent)]';
        textClass = 'text-[var(--chart-2)]';
        label = 'Disponible';
    }

    return (
        <div className={`mt-1.5 flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius)] ${bgClass} border ${borderClass}`}>
            <div className="flex items-center gap-1.5">
                <BarChart3 className={`w-3 h-3 ${textClass}`} />
                <span className={`text-[11px] font-medium ${textClass}`}>{label}</span>
            </div>
            <span className={`text-[11px] font-semibold tabular-nums ${textClass}`}>
                {stock} {stock !== 0 ? 'en bodega' : ''}
            </span>
        </div>
    );
}

/* Search input */
function SearchInput({ index, term, loading, inputRef, onTermChange, onFocus }) {
    return (
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--fg-subtle)]" />
            <input
                ref={inputRef}
                type="text"
                aria-label={`Buscar material línea ${index + 1}`}
                value={term}
                onChange={(e) => onTermChange(e.target.value)}
                onFocus={onFocus}
                placeholder="Buscar material..."
                autoComplete="off"
                className="w-full h-11 pl-10 pr-10 text-base bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-foreground placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[color-mix(in_hsl,var(--accent)_30%,transparent)] focus:outline-none transition-colors"
            />
            {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner className="size-4" />
                </div>
            )}
        </div>
    );
}

/* Full-width search results dropdown */
function SearchDropdown({ results, term, loading, onSelect }) {
    if (term.length >= 2 && !loading && results.length === 0) {
        return (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 px-4 py-3 bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-xl text-sm text-[var(--fg-subtle)]">
                No se encontraron materiales
            </div>
        );
    }

    if (results.length === 0) return null;

    return (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-[280px] overflow-y-auto bg-[var(--surface-1)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-xl overscroll-contain">
            {results.map((mat, i) => (
                <button
                    key={mat.id}
                    onClick={() => onSelect(mat)}
                    className={`w-full text-left px-4 py-3 active:bg-[color-mix(in_hsl,var(--accent)_10%,transparent)] transition-colors ${
                        i !== results.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''
                    }`}
                >
                    <div className="text-sm text-foreground leading-snug mb-0.5">
                        {mat.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--fg-subtle)]">
                        <span className="font-mono">{mat.codigoInterno || '-'}</span>
                        <span className="w-1 h-1 rounded-full bg-[color-mix(in_hsl,var(--fg-subtle)_40%,transparent)]" />
                        <span>{mat.unidad || '-'}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}
