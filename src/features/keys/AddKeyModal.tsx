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
    if (!show) return null;

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur">
            <div className="panel-shell panel-shell--tight w-full max-w-4xl p-6 text-neutral-100">
                <header className="flex flex-col gap-3 border-b border-white/15 pb-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-bracket text-xs text-neutral-500">registry</p>
                        <p className="text-sm text-neutral-500">store encrypted credentials locally</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-bracket text-xs text-neutral-500 transition hover:text-white"
                    >
                        [ close ]
                    </button>
                </header>

                <div className="mt-4 grid gap-6 md:grid-cols-[0.8fr,1.2fr]">
                    <section className="space-y-3 border border-white/15 bg-neutral-950/60 p-4 font-mono text-xs text-neutral-300">
                        <p>validated_keys: {validatedKeysCount}</p>
                        <p>tokens_recorded: {formatTokens(totalTokensUsed)}</p>
                        <p>scrub_policy: clipboard · 8s</p>
                        <p>storage: sqlite + aes-256</p>
                        <p className="text-neutral-500">
                            Paste raw secrets only. Values are encrypted at rest and never rendered once saved.
                        </p>
                    </section>

                    <section className="space-y-4 text-sm text-neutral-200">
                        <label className="space-y-1 text-xs text-neutral-400">
                            provider
                            <select
                                value={newKey.provider}
                                onChange={(e) => update({ provider: e.target.value as ProviderOption })}
                                className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100"
                            >
                                <option value="openai">openai</option>
                                <option value="grok">grok (x.ai)</option>
                                <option value="claude">anthropic</option>
                                <option value="google">google</option>
                            </select>
                        </label>

                        <label className="space-y-1 text-xs text-neutral-400">
                            key_name
                            <input
                                value={newKey.key_name}
                                onChange={(e) => update({ key_name: e.target.value })}
                                className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100"
                                placeholder="workspace or env label"
                            />
                        </label>

                        <label className="space-y-1 text-xs text-neutral-400">
                            api_key
                            <input
                                value={newKey.api_key}
                                onChange={(e) => update({ api_key: e.target.value })}
                                className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100"
                                placeholder="sk-..."
                            />
                        </label>

                        <label className="space-y-1 text-xs text-neutral-400">
                            max_tokens_per_answer
                            <input
                                type="number"
                                value={newKey.max_tokens_per_answer}
                                onChange={(e) => update({ max_tokens_per_answer: Number(e.target.value) })}
                                className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100"
                            />
                        </label>

                        <label className="space-y-1 text-xs text-neutral-400">
                            token_budget (optional)
                            <input
                                type="number"
                                value={newKey.token_budget}
                                onChange={(e) =>
                                    update({ token_budget: e.target.value === '' ? '' : Number(e.target.value) })
                                }
                                className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100"
                                placeholder="null"
                            />
                        </label>

                        <label className="space-y-1 text-xs text-neutral-400">
                            usage_note
                            <textarea
                                value={newKey.usage_note}
                                onChange={(e) => update({ usage_note: e.target.value })}
                                rows={4}
                                className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 font-mono text-sm text-neutral-100"
                                placeholder="document guardrails or owners"
                            />
                        </label>
                    </section>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-4 text-bracket text-xs">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-500 transition hover:text-neutral-300"
                    >
                        [ cancel ]
                    </button>
                    <button
                        type="button"
                        onClick={onSubmit}
                        className="text-neutral-200 transition hover:text-white"
                    >
                        [ store key ]
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddKeyModal;
