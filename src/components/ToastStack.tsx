import { useMemo } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
    id: string;
    message: string;
    tone: ToastTone;
}

interface ToastStackProps {
    toasts: Toast[];
    onDismiss: (id: string) => void;
}

const toneStyles: Record<ToastTone, { bg: string; accent: string }> = {
    success: { bg: 'from-emerald-500/20 via-emerald-500/10 to-slate-900/60', accent: 'text-emerald-200' },
    error: { bg: 'from-rose-500/20 via-rose-500/10 to-slate-900/60', accent: 'text-rose-200' },
    info: { bg: 'from-cyan-500/20 via-cyan-500/10 to-slate-900/60', accent: 'text-cyan-200' },
};

const ToastStack = ({ toasts, onDismiss }: ToastStackProps) => {
    const ordered = useMemo(() => [...toasts].slice(-4), [toasts]);

    if (ordered.length === 0) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-end px-4 py-6 sm:px-6">
            <div className="flex w-full max-w-sm flex-col gap-3">
                {ordered.map(toast => {
                    const tone = toneStyles[toast.tone];
                    return (
                        <div
                            key={toast.id}
                            className={`pointer-events-auto rounded-3xl border border-white/10 bg-gradient-to-br ${tone.bg} px-4 py-3 text-sm text-slate-100 shadow-[0_20px_40px_rgba(3,7,18,0.45)] backdrop-blur`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <p className="flex-1 text-left">{toast.message}</p>
                                <button
                                    type="button"
                                    onClick={() => onDismiss(toast.id)}
                                    className={`text-xs uppercase tracking-[0.4em] ${tone.accent} transition hover:text-white`}
                                >
                                    [ close ]
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ToastStack;
