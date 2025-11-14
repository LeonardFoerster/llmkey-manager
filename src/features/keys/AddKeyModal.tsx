import { useEffect, useRef } from 'react';
import type { ProviderOption } from '../../types';
import { formatTokens } from '../../utils/format';

interface NewKeyState {
    provider: ProviderOption;
    key_name: string;
    api_key: string;
    max_tokens_per_answer: number;
    usage_note: string;
    token_budget: number | '';
}

interface AddKeyModalProps {
    show: boolean;
    onClose: () => void;
    onSubmit: () => void;
    newKey: NewKeyState;
    onChange: (key: NewKeyState) => void;
    validatedKeysCount: number;
    totalTokensUsed: number;
}

const AddKeyModal = ({
    show,
    onClose,
    onSubmit,
    newKey,
    onChange,
    validatedKeysCount,
    totalTokensUsed,
}: AddKeyModalProps) => {
    const scrubTimers = useRef<number[]>([]);

    const update = (updates: Partial<NewKeyState>) => onChange({ ...newKey, ...updates });

    useEffect(() => {
        if (!show) return;
        const handler = (event: ClipboardEvent) => {
            const copied = event.clipboardData?.getData('text') ?? '';
            if (/sk-[\w-]+/i.test(copied)) {
                const timer = window.setTimeout(async () => {
                    try {
                        await navigator.clipboard.writeText('');
                    } catch (error) {
                        console.warn('Clipboard scrub failed', error);
                    }
                }, 8000);
                scrubTimers.current.push(timer);
            }
        };
        document.addEventListener('copy', handler);
        return () => {
            document.removeEventListener('copy', handler);
            scrubTimers.current.forEach(id => window.clearTimeout(id));
            scrubTimers.current = [];
        };
    }, [show]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur">
            <div className="relative w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-slate-950/95 via-slate-900/80 to-slate-900/60 p-6 text-slate-100 shadow-[0_35px_80px_rgba(2,6,23,0.85)]">
                <div className="pointer-events-none absolute inset-0 opacity-60">
                    <div className="absolute -left-16 top-0 h-64 w-64 rounded-full bg-cyan-400/20 blur-[120px]" />
                    <div className="absolute -bottom-16 right-0 h-64 w-64 rounded-full bg-indigo-500/20 blur-[140px]" />
                </div>
                <div className="relative z-10 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
                    <header className="lg:col-span-2 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-bracket text-[0.55rem] text-slate-500">registry intake</p>
                            <p className="text-sm text-slate-400">Store encrypted credentials locally with scrubbed clipboard.</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-white/10 px-4 py-2 text-[0.65rem] uppercase tracking-[0.35em] text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
                        >
                            close
                        </button>
                    </header>

                    <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-4 font-mono text-xs text-slate-300">
                        <div className="space-y-1 text-slate-100">
                            <p>validated_keys: {validatedKeysCount}</p>
                            <p>tokens_recorded: {formatTokens(totalTokensUsed)}</p>
                            <p>scrub_policy: clipboard · 8s</p>
                            <p>storage: sqlite + aes-256</p>
                        </div>
                        <p className="text-slate-500">
                            Paste raw secrets only. Values are encrypted at rest and never rendered once saved.
                        </p>
                        <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-[0.65rem] text-slate-400">
                            <p className="text-bracket text-[0.55rem] text-slate-500">guidance</p>
                            <p>
                                Provide an explicit label, provider, and optional budget + notes to keep large fleets organized.
                            </p>
                        </div>
                    </section>

                    <section className="space-y-4 rounded-3xl border border-white/10 bg-black/30 p-4 text-sm text-slate-100">
                        <label className="space-y-1 text-xs text-slate-400">
                            provider
                            <select
                                value={newKey.provider}
                                onChange={(e) => update({ provider: e.target.value as ProviderOption })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100"
                            >
                                <option value="openai">openai</option>
                                <option value="grok">grok (x.ai)</option>
                                <option value="claude">anthropic</option>
                                <option value="google">google</option>
                            </select>
                        </label>

                        <label className="space-y-1 text-xs text-slate-400">
                            key_name
                            <input
                                value={newKey.key_name}
                                onChange={(e) => update({ key_name: e.target.value })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                                placeholder="workspace or environment label"
                            />
                        </label>

                        <label className="space-y-1 text-xs text-slate-400">
                            api_key
                            <input
                                value={newKey.api_key}
                                onChange={(e) => update({ api_key: e.target.value })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                                placeholder="sk-..."
                            />
                        </label>

                        <label className="space-y-1 text-xs text-slate-400">
                            max_tokens_per_answer
                            <input
                                type="number"
                                value={newKey.max_tokens_per_answer}
                                onChange={(e) => update({ max_tokens_per_answer: Number(e.target.value) })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100"
                            />
                        </label>

                        <label className="space-y-1 text-xs text-slate-400">
                            token_budget (optional)
                            <input
                                type="number"
                                value={newKey.token_budget}
                                onChange={(e) =>
                                    update({ token_budget: e.target.value === '' ? '' : Number(e.target.value) })
                                }
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                                placeholder="null"
                            />
                        </label>

                        <label className="space-y-1 text-xs text-slate-400">
                            usage_note
                            <textarea
                                value={newKey.usage_note}
                                onChange={(e) => update({ usage_note: e.target.value })}
                                rows={4}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500"
                                placeholder="document guardrails or owners"
                            />
                        </label>
                    </section>

                    <div className="lg:col-span-2 mt-4 flex flex-wrap justify-end gap-4 text-bracket text-xs">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-white/10 px-4 py-2 text-slate-400 transition hover:text-white"
                        >
                            [ cancel ]
                        </button>
                        <button
                            type="button"
                            onClick={onSubmit}
                            className="rounded-full border border-cyan-400/50 bg-cyan-400/10 px-5 py-2 text-white transition hover:border-cyan-300 hover:bg-cyan-400/20"
                        >
                            [ store key ]
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddKeyModal;
