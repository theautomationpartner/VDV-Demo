"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { BaseDeDatosMaterialesBoard } from '@/lib/board-sdk';

const board = new BaseDeDatosMaterialesBoard();

export function useMaterialSearch() {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);

    const search = useCallback(async (searchTerm) => {
        if (!searchTerm || searchTerm.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await board.items()
                .withColumns(['unidad', 'codigoInterno'])
                .where({ name: searchTerm })
                .withPagination({ limit: 15 })
                .execute();
            setResults(res.items || []);
        } catch (err) {
            console.error('Material search failed:', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            search(term);
        }, 300);
        return () => clearTimeout(debounceRef.current);
    }, [term, search]);

    return { term, setTerm, results, loading };
}
