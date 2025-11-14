import { useEffect, useMemo, useState } from 'react';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import type { ApiKey } from '../../types';
import { formatTokens } from '../../utils/format';

type NotifyHandler = (message: string, tone?: 'success' | 'error' | 'info') => void;

interface KeyStudioProps {
    apiKeys: ApiKey[];
    onTestKey: (id: number) => void;
    onDeleteKey: (id: number, options?: { skipConfirm?: boolean }) => void;
    onShowAddKey: () => void;
    onUpdateKeyMeta: (id: number, updates: { usage_note?: string | null; token_budget?: number | null }) => void;
    onBulkDelete: (ids: number[]) => void;
    onBulkTest: (ids: number[]) => void;
    pinnedKeys: number[];
    onTogglePinKey: (id: number) => void;
    onFocusKeyAnalytics: (id: number) => void;
    notify: NotifyHandler;
}

const KeyStudio = ({
    apiKeys,
    onTestKey,
    onDeleteKey,
    onShowAddKey,
    onUpdateKeyMeta,
    onBulkDelete,
    onBulkTest,
    pinnedKeys,
    onTogglePinKey,
    onFocusKeyAnalytics,
    notify,
}: KeyStudioProps) => {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        setSelectedIds(prev => prev.filter(id => apiKeys.some(key => key.id === id)));
    }, [apiKeys]);

    const pinOrder = useMemo(() => new Map(pinnedKeys.map((id, index) => [id, index])), [pinnedKeys]);

    const filteredKeys = useMemo(() => {
        const normalized = search.trim().toLowerCase();
        const sorted = [...apiKeys].sort((a, b) => {
            const aPinned = pinOrder.has(a.id);
            const bPinned = pinOrder.has(b.id);
            if (aPinned && bPinned) {
                return (pinOrder.get(a.id) ?? 0) - (pinOrder.get(b.id) ?? 0);
            }
            if (aPinned) return -1;
            if (bPinned) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        if (!normalized) return sorted;
        return sorted.filter(key =>
            `${key.key_name ?? ''} ${key.provider}`.toLowerCase().includes(normalized)
        );
    }, [apiKeys, pinOrder, search]);

    const toggleSelection = (id: number) => {
        setSelectedIds(prev => (prev.includes(id) ? prev.filter(entry => entry !== id) : [...prev, id]));
    };

    const allVisibleSelected =
        filteredKeys.length > 0 && filteredKeys.every(key => selectedIds.includes(key.id));

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds(prev => prev.filter(id => !filteredKeys.some(key => key.id === id)));
        } else {
            setSelectedIds(prev => Array.from(new Set([...prev, ...filteredKeys.map(key => key.id)])));
        }
    };

    const handleBulkTest = () => {
        if (selectedIds.length === 0) {
            notify('Select at least one key to test', 'info');
            return;
        }
        onBulkTest(selectedIds);
    };

    const handleBulkDelete = () => {
        if (selectedIds.length === 0) {
            notify('Select keys to delete', 'info');
            return;
        }
        if (!confirm(`Delete ${selectedIds.length} key${selectedIds.length === 1 ? '' : 's'}?`)) {
            return;
        }
        onBulkDelete(selectedIds);
        setSelectedIds([]);
    };

    const handleCopy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            notify('Key label copied', 'success');
        } catch {
            notify('Clipboard unavailable', 'error');
        }
    };

    return (
        <div className="panel-shell flex h-full min-h-0 flex-1 flex-col gap-6 p-6 text-slate-100">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-bracket text-[0.55rem] text-slate-500">registry</p>
                    <p className="text-sm text-slate-400">Manage encrypted keys, budgets, and usage envelopes.</p>
                </div>
                <button
                    type="button"
                    onClick={onShowAddKey}
                    className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-5 py-2 text-xs uppercase tracking-[0.4em] text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/20"
                >
                    + add key
                </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr,0.7fr]">
                <label className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
                    search keys
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="mt-2 w-full rounded-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="filter by label or provider"
                    />
                </label>
                <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
                    <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">bulk actions</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.4em]">
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="rounded-full border border-white/10 px-4 py-1 text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
                        >
                            {allVisibleSelected ? 'clear' : 'select visible'}
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkTest}
                            className="rounded-full border border-cyan-400/40 px-4 py-1 text-white transition hover:border-cyan-300/60 hover:bg-cyan-400/10"
                        >
                            test
                        </button>
                        <button
                            type="button"
                            onClick={handleBulkDelete}
                            className="rounded-full border border-rose-400/40 px-4 py-1 text-rose-200 transition hover:border-rose-300/60 hover:bg-rose-400/10"
                        >
                            delete
                        </button>
                    </div>
                </div>
            </div>

            {apiKeys.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center font-mono text-xs text-slate-400">
                    empty registry · add your first API key to unlock chat, analytics, and map mode
                </div>
            ) : filteredKeys.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-10 text-center font-mono text-xs text-slate-400">
                    no keys match the current filter
                </div>
            ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                    {filteredKeys.map(key => (
                        <KeyCard
                            key={key.id}
                            data={key}
                            onTestKey={onTestKey}
                            onDeleteKey={onDeleteKey}
                            onUpdateKeyMeta={onUpdateKeyMeta}
                            isSelected={selectedIds.includes(key.id)}
                            onToggleSelect={toggleSelection}
                            onTogglePin={onTogglePinKey}
                            isPinned={pinOrder.has(key.id)}
                            onFocusAnalytics={onFocusKeyAnalytics}
                            onCopyLabel={handleCopy}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

interface KeyCardProps {
    data: ApiKey;
    onTestKey: (id: number) => void;
    onDeleteKey: (id: number) => void;
    onUpdateKeyMeta: (id: number, updates: { usage_note?: string | null; token_budget?: number | null }) => void;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    onTogglePin: (id: number) => void;
    isPinned: boolean;
    onFocusAnalytics: (id: number) => void;
    onCopyLabel: (label: string) => void;
}

const KeyCard = ({
    data,
    onTestKey,
    onDeleteKey,
    onUpdateKeyMeta,
    isSelected,
    onToggleSelect,
    onTogglePin,
    isPinned,
    onFocusAnalytics,
    onCopyLabel,
}: KeyCardProps) => {
    const [noteDraft, setNoteDraft] = useState(data.usage_note ?? '');
    const [budgetDraft, setBudgetDraft] = useState<string>(data.token_budget ? String(data.token_budget) : '');

    useEffect(() => {
        setNoteDraft(data.usage_note ?? '');
        setBudgetDraft(data.token_budget ? String(data.token_budget) : '');
    }, [data.usage_note, data.token_budget]);

    const totalTokens = data.total_prompt_tokens + data.total_completion_tokens;
    const tokenBudget = data.token_budget ?? null;
    const usagePercent = tokenBudget ? Math.min(100, Math.round((totalTokens / tokenBudget) * 100)) : null;

    const handleSaveMeta = async () => {
        await onUpdateKeyMeta(data.id, {
            usage_note: noteDraft.trim() ? noteDraft.trim() : null,
            token_budget: budgetDraft ? Number(budgetDraft) : null,
        });
    };

    return (
        <div className={`relative min-h-full ${isSelected ? 'ring-2 ring-cyan-300/60 ring-offset-2 ring-offset-slate-950/30' : ''}`}>
            <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-950/30 to-slate-900/40 p-5 font-mono text-xs text-slate-100 shadow-[0_35px_80px_rgba(2,6,23,0.65)]">
                <GlowingEffect spread={46} glow disabled={false} proximity={64} inactiveZone={0.01} />
                <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-60" />
                <div className="relative z-10 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => onToggleSelect(data.id)}
                                className="h-4 w-4 cursor-pointer rounded border-white/10 bg-black/40 text-cyan-400 focus:ring-0"
                            />
                            <div>
                                <p className="text-bracket text-[0.55rem] text-slate-500">{data.provider}</p>
                                <p className="text-xl font-semibold text-white">{data.key_name || 'unnamed_key'}</p>
                                <p className="text-[0.65rem] text-slate-500">
                                    created: {new Date(data.created_at).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 text-[0.65rem] uppercase tracking-[0.35em] text-slate-500">
                            <button
                                type="button"
                                onClick={() => onTogglePin(data.id)}
                                className={`transition hover:text-white ${isPinned ? 'text-cyan-300' : ''}`}
                            >
                                {isPinned ? '[ pinned ]' : '[ pin ]'}
                            </button>
                            <button
                                type="button"
                                onClick={() => onCopyLabel(data.key_name || 'unnamed_key')}
                                className="transition hover:text-white"
                            >
                                [ copy label ]
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-[0.75rem] text-slate-300">
                        <p>tokens_total: {formatTokens(totalTokens)}</p>
                        <p>max_answer: {formatTokens(data.max_tokens_per_answer)}</p>
                        <p>usage_note: {data.usage_note ? data.usage_note : '—'}</p>
                        {usagePercent !== null && (
                            <div className="mt-3">
                                <div className="flex justify-between text-[0.6rem] uppercase tracking-[0.35em] text-slate-500">
                                    <span>budget usage</span>
                                    <span>{usagePercent}%</span>
                                </div>
                                <div className="mt-1 h-2 rounded-full bg-white/5">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-500"
                                        style={{ width: `${usagePercent}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-bracket text-[0.55rem] text-slate-500" htmlFor={`budget-${data.id}`}>
                                token_budget
                            </label>
                            <input
                                id={`budget-${data.id}`}
                                type="number"
                                value={budgetDraft}
                                onChange={(e) => setBudgetDraft(e.target.value)}
                                placeholder="null"
                                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 placeholder:text-slate-500"
                            />
                            <p className="mt-1 text-[0.65rem] text-slate-500">
                                current_limit: {tokenBudget ? formatTokens(tokenBudget) : 'none'}
                            </p>
                        </div>

                        <div>
                            <label className="text-bracket text-[0.55rem] text-slate-500" htmlFor={`note-${data.id}`}>
                                usage_note
                            </label>
                            <textarea
                                id={`note-${data.id}`}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={4}
                                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-slate-100 placeholder:text-slate-500"
                                placeholder="describe scope or usage guardrails"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 text-[0.65rem] uppercase tracking-[0.3em]">
                        <button
                            type="button"
                            onClick={() => onTestKey(data.id)}
                            className="text-slate-300 transition hover:text-white"
                        >
                            [ test key ]
                        </button>
                        <button type="button" onClick={handleSaveMeta} className="text-slate-300 transition hover:text-white">
                            [ save ]
                        </button>
                        <button
                            type="button"
                            onClick={() => onFocusAnalytics(data.id)}
                            className="text-cyan-200 transition hover:text-white"
                        >
                            [ analytics ]
                        </button>
                        <button
                            type="button"
                            onClick={() => onDeleteKey(data.id)}
                            className="text-rose-300 transition hover:text-rose-200"
                        >
                            [ delete ]
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KeyStudio;
