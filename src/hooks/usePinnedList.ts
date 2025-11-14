import { useCallback, useEffect, useState } from 'react';

export const usePinnedList = <T extends string | number>(storageKey: string) => {
    const [list, setList] = useState<T[]>(() => {
        if (typeof window === 'undefined') return [];
        try {
            const stored = localStorage.getItem(storageKey);
            return stored ? (JSON.parse(stored) as T[]) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(list));
        } catch {
            /* ignore */
        }
    }, [list, storageKey]);

    const toggle = useCallback((value: T) => {
        setList(prev => (prev.includes(value) ? prev.filter(entry => entry !== value) : [...prev, value]));
    }, []);

    const replace = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
        setList(prev => (typeof updater === 'function' ? (updater as (prev: T[]) => T[])(prev) : updater));
    }, []);

    return { list, toggle, replace };
};

export type UsePinnedListReturn<T extends string | number> = ReturnType<typeof usePinnedList<T>>;
