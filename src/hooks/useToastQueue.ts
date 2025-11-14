import { useCallback, useState } from 'react';
import type { Toast, ToastTone } from '../components/ToastStack';

const FALLBACK_TIMEOUT = 4200;

export const useToastQueue = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const addToast = useCallback(
        (message: string, tone: ToastTone = 'info') => {
            const id =
                typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()}`;
            setToasts(prev => [...prev, { id, message, tone }]);
            if (typeof window !== 'undefined') {
                window.setTimeout(() => removeToast(id), FALLBACK_TIMEOUT);
            }
        },
        [removeToast]
    );

    return { toasts, addToast, removeToast };
};

export type UseToastQueueReturn = ReturnType<typeof useToastQueue>;
