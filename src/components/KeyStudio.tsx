import { useEffect, useState } from 'react';
import type { ApiKey } from '../types';
import { formatTokens } from '../utils/format';
import { MarkdownRenderer } from './MarkdownRenderer';

interface KeyStudioProps {
    apiKeys: ApiKey[];
    onTestKey: (id: number) => void;
    onDeleteKey: (id: number) => void;
    onShowAddKey: () => void;
    onUpdateKeyMeta: (id: number, updates: { usage_note?: string | null; token_budget?: number | null }) => void;
}

const KeyStudio = ({ apiKeys, onTestKey, onDeleteKey, onShowAddKey, onUpdateKeyMeta }: KeyStudioProps) => (
    <div className="flex h-full flex-1 flex-col gap-5 rounded-3xl border border-gray-200 bg-white p-6 shadow-[0_30px_70px_rgba(15,23,42,0.07)]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Key studio</p>
                <h2 className="text-3xl font-semibold text-gray-900">Manage keys</h2>
            </div>
            <button
                onClick={onShowAddKey}
                className="btn-accent hover-lift rounded-2xl px-4 py-2 text-sm font-semibold shadow-lg shadow-purple-500/30"
            >
                Add Key
            </button>
        </div>

        {apiKeys.length === 0 ? (
            <div className="flex h-full flex-1 items-center justify-center rounded-3xl border border-dashed border-[#dbeafe] bg-gradient-to-br from-[#f8fbff] to-[#fff6fb] px-6 py-10 text-center text-sm text-gray-500">
                No keys yet. Add one to get started.
            </div>
        ) : (
            <div className="grid gap-4 md:grid-cols-2">
                {apiKeys.map(key => (
                    <KeyCard
                        key={key.id}
                        data={key}
                        onTestKey={onTestKey}
                        onDeleteKey={onDeleteKey}
                        onUpdateKeyMeta={onUpdateKeyMeta}
                    />
                ))}
            </div>
        )}
    </div>
);

const KeyCard = ({
    data,
    onTestKey,
    onDeleteKey,
    onUpdateKeyMeta,
}: {
    data: ApiKey;
    onTestKey: (id: number) => void;
    onDeleteKey: (id: number) => void;
    onUpdateKeyMeta: (id: number, updates: { usage_note?: string | null; token_budget?: number | null }) => void;
}) => {
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [noteDraft, setNoteDraft] = useState(data.usage_note ?? '');
    const [budgetDraft, setBudgetDraft] = useState<string>(data.token_budget ? String(data.token_budget) : '');
    const totalTokens = data.total_prompt_tokens + data.total_completion_tokens;
    const tokenBudget = data.token_budget ?? null;
    const usageRatio = tokenBudget ? Math.min(totalTokens / tokenBudget, 1) : 0;
    const budgetState = !tokenBudget
        ? 'text-gray-500'
        : usageRatio >= 1
            ? 'text-rose-600'
            : usageRatio >= 0.8
                ? 'text-amber-600'
                : 'text-emerald-600';

    useEffect(() => {
        setNoteDraft(data.usage_note ?? '');
        setBudgetDraft(data.token_budget ? String(data.token_budget) : '');
    }, [data.usage_note, data.token_budget]);

    const handleSaveMeta = async () => {
        await onUpdateKeyMeta(data.id, {
            usage_note: noteDraft.trim() ? noteDraft.trim() : null,
            token_budget: budgetDraft ? Number(budgetDraft) : null,
        });
        setIsEditingNote(false);
    };

    return (
        <div className="hover-lift rounded-3xl border border-gray-200 bg-white p-5 shadow-[0_25px_55px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-gray-500">
                        {data.provider.toUpperCase()}
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                        {data.key_name || 'Unnamed Key'}
                    </p>
                </div>
                <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                        data.is_valid === 1
                            ? 'accent-chip bg-white/60'
                            : 'border border-dashed border-gray-300 bg-gray-50 text-gray-500'
                    }`}
                >
                    {data.is_valid === 1 ? 'Validated' : 'Unverified'}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
                <p>Created {new Date(data.created_at).toLocaleDateString()}</p>
                <p>Tokens {formatTokens(totalTokens)}</p>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    <p className="font-semibold text-gray-900">Max answer tokens</p>
                    <p>{formatTokens(data.max_tokens_per_answer ?? 0)}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    <p className="font-semibold text-gray-900">Fingerprint</p>
                    <p>{data.key_fingerprint ?? '—'}</p>
                </div>
            </div>
            <div className="mt-2 text-xs text-gray-500">
                <p>
                    Last validated:{' '}
                    <span className={data.last_validated_at ? 'text-gray-900' : 'text-gray-400'}>
                        {data.last_validated_at ? new Date(data.last_validated_at).toLocaleString() : 'Never'}
                    </span>
                </p>
            </div>
            <div className="mt-4 space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
                    Token budget (soft limit)
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="number"
                            min={0}
                            placeholder="e.g. 50000"
                            value={budgetDraft}
                            onChange={(e) => setBudgetDraft(e.target.value)}
                            className="w-40 rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                        />
                        <button
                            type="button"
                            onClick={() =>
                                onUpdateKeyMeta(data.id, {
                                    token_budget: budgetDraft ? Number(budgetDraft) : null,
                                })
                            }
                            className="rounded-2xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-[#c7d2fe] hover:bg-white"
                        >
                            Save budget
                        </button>
                        {tokenBudget && (
                            <span className={`text-xs font-semibold ${budgetState}`}>
                                {formatTokens(totalTokens)} / {formatTokens(tokenBudget)} used
                            </span>
                        )}
                    </div>
                    {tokenBudget && (
                        <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
                            <div
                                className={`h-full rounded-full ${usageRatio >= 1 ? 'bg-rose-500' : usageRatio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${usageRatio * 100}%` }}
                            />
                        </div>
                    )}
                </label>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Usage note</p>
                        <button
                            type="button"
                            onClick={() => setIsEditingNote(prev => !prev)}
                            className="text-xs text-[#4c1d95] hover:underline"
                        >
                            {isEditingNote ? 'Cancel' : data.usage_note ? 'Edit' : 'Add'}
                        </button>
                    </div>
                    {isEditingNote ? (
                        <div className="mt-3 space-y-2">
                            <textarea
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={3}
                                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                                placeholder="Document where this key is used…"
                            />
                            <button
                                type="button"
                                onClick={handleSaveMeta}
                                className="btn-accent hover-lift rounded-2xl px-4 py-2 text-sm font-semibold"
                            >
                                Save note & budget
                            </button>
                        </div>
                    ) : data.usage_note ? (
                        <div className="mt-3 text-sm text-gray-700">
                            <MarkdownRenderer content={data.usage_note} />
                        </div>
                    ) : (
                        <p className="mt-3 text-xs text-gray-500">No notes yet.</p>
                    )}
                </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
                <button
                    onClick={() => onTestKey(data.id)}
                    className="hover-lift rounded-2xl border border-[#c7d2fe] bg-[#f4f3ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#4c1d95]"
                >
                    Test
                </button>
                <button
                    onClick={() => onDeleteKey(data.id)}
                    className="glow-danger btn-danger-soft hover-lift rounded-2xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em]"
                >
                    Delete
                </button>
            </div>
        </div>
    );
};

export default KeyStudio;
