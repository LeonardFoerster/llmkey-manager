import { useEffect, useRef } from 'react';
import type { ProviderOption } from '../types';
import { formatTokens } from '../utils/format';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 py-6 backdrop-blur">
            <div className="w-full max-w-4xl rounded-[32px] border border-gray-200 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.18)]">
                <div className="flex flex-col gap-3 border-b border-gray-100 px-8 py-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Key onboarding</p>
                        <h3 className="text-3xl font-semibold text-gray-900">Register a new API credential</h3>
                        <p className="text-sm text-gray-500">Encrypted at rest, auto-redacted in logs.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="hover-lift rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-[#c7d2fe]"
                    >
                        Close
                    </button>
                </div>
                <div className="grid gap-6 px-8 py-8 lg:grid-cols-[0.85fr,1.15fr]">
                    <div className="space-y-5 rounded-3xl bg-gradient-to-br from-[#f7f8ff] to-[#fef3ff] p-6">
                        <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Status</p>
                            <p className="text-lg font-semibold text-gray-900">{validatedKeysCount} active keys</p>
                            <p className="text-sm text-gray-500">Tokens tracked: {formatTokens(totalTokensUsed)}</p>
                        </div>
                        <div className="space-y-3 text-sm text-gray-600">
                            <div className="rounded-2xl border border-gray-200 bg-white/90 p-4">
                                <p className="font-semibold text-gray-900">Security</p>
                                <p className="text-sm text-gray-600">Keys are stored encrypted with rotating secrets. You can rotate or revoke anytime.</p>
                            </div>
                            <div className="rounded-2xl border border-gray-200 bg-white/90 p-4">
                                <p className="font-semibold text-gray-900">Tips</p>
                                <ul className="list-disc space-y-1 pl-4 text-sm text-gray-600">
                                    <li>Label keys by workspace/team.</li>
                                    <li>Use provider dashboards to pre-limit spend.</li>
                                    <li>Paste only raw secrets (no env var syntax).</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                Provider
                                <select
                                    value={newKey.provider}
                                    onChange={(e) => update({ provider: e.target.value as ProviderOption })}
                                    className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                                >
                                    <option value="openai">OpenAI</option>
                                    <option value="grok">Grok (xAI)</option>
                                    <option value="claude">Claude (Anthropic)</option>
                                    <option value="google">Google (Vertex AI)</option>
                                </select>
                            </label>
                            <label className="text-xs uppercase tracking-[0.3em] text-gray-500">
                                Display name
                                <input
                                    type="text"
                                    placeholder="Marketing workspace"
                                    value={newKey.key_name}
                                    onChange={(e) => update({ key_name: e.target.value })}
                                    className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                                />
                            </label>
                        </div>
                        <label className="text-xs uppercase tracking-[0.3em] text-gray-500">
                            API Secret
                            <input
                                type="password"
                                placeholder="sk-live-..."
                                value={newKey.api_key}
                                onChange={(e) => update({ api_key: e.target.value })}
                                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                            />
                            <span className="mt-1 block text-[0.65rem] text-gray-400">Copied secrets are auto-cleared after 8 seconds.</span>
                        </label>
                        <label className="text-xs uppercase tracking-[0.3em] text-gray-500">
                            Usage note (markdown)
                            <textarea
                                rows={3}
                                placeholder="Where will this key be used?"
                                value={newKey.usage_note}
                                onChange={(e) => update({ usage_note: e.target.value })}
                                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                            />
                        </label>
                        <label className="text-xs uppercase tracking-[0.3em] text-gray-500">
                            Max tokens per answer
                            <div className="mt-1 flex gap-2">
                                <input
                                    type="number"
                                    min={16}
                                    max={32768}
                                    step={16}
                                    value={newKey.max_tokens_per_answer}
                                    onChange={(e) => {
                                        const parsed = Number(e.target.value);
                                        const sanitized = Number.isNaN(parsed)
                                            ? 16
                                            : Math.max(16, Math.min(32768, parsed));
                                        update({ max_tokens_per_answer: sanitized });
                                    }}
                                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                                />
                                <span className="self-center text-[0.7rem] text-gray-500">per reply</span>
                            </div>
                        </label>
                        <label className="text-xs uppercase tracking-[0.3em] text-gray-500">
                            Soft token budget
                            <input
                                type="number"
                                min={0}
                                placeholder="Optional e.g. 50000"
                                value={newKey.token_budget}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                        update({ token_budget: '' });
                                        return;
                                    }
                                    const parsed = Number(value);
                                    update({ token_budget: Number.isNaN(parsed) ? '' : Math.max(0, parsed) });
                                }}
                                className="mt-1 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                            />
                        </label>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-600">
                                <p className="font-semibold text-gray-900">Scopes</p>
                                <p>Full completion + embeddings access required for analytics.</p>
                            </div>
                            <div className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-600">
                                <p className="font-semibold text-gray-900">Visibility</p>
                                <p>Key stays private to your account unless shared explicitly.</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-3 md:flex-row">
                            <button
                                type="button"
                                onClick={onSubmit}
                                className="btn-accent hover-lift flex-1 rounded-2xl py-3 text-sm font-semibold shadow-lg shadow-purple-500/30"
                            >
                                Save key
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="hover-lift flex-1 rounded-2xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 transition hover:border-[#c7d2fe] hover:bg-[#fdfbff]"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddKeyModal;
