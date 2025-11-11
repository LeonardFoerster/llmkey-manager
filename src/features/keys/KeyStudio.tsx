import { useEffect, useState } from 'react';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import type { ApiKey } from '../../types';
import { formatTokens } from '../../utils/format';

interface KeyStudioProps {
    apiKeys: ApiKey[];
    onTestKey: (id: number) => void;
    onDeleteKey: (id: number) => void;
    onShowAddKey: () => void;
    onUpdateKeyMeta: (id: number, updates: { usage_note?: string | null; token_budget?: number | null }) => void;
}

const KeyStudio = ({ apiKeys, onTestKey, onDeleteKey, onShowAddKey, onUpdateKeyMeta }: KeyStudioProps) => (
    <div className="panel-shell flex h-full min-h-0 flex-1 flex-col gap-5 p-5 text-neutral-100">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
                <p className="text-bracket text-xs text-neutral-500">configuration</p>
                <p className="text-sm text-neutral-500">credentials · budgets · notes</p>
            </div>
            <button
                type="button"
                onClick={onShowAddKey}
                className="text-bracket text-xs text-neutral-300 transition hover:text-white hover:opacity-80"
            >
                [ + add key ]
            </button>
        </div>

        {apiKeys.length === 0 ? (
            <div className="flex flex-1 items-center justify-center border border-dashed border-white/25 bg-neutral-900/50 px-6 py-10 text-center font-mono text-xs text-neutral-300">
                empty registry · invoke config to add a credential
            </div>
        ) : (
            <div className="grid gap-4 lg:grid-cols-2">
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
    const [noteDraft, setNoteDraft] = useState(data.usage_note ?? '');
    const [budgetDraft, setBudgetDraft] = useState<string>(data.token_budget ? String(data.token_budget) : '');

    useEffect(() => {
        setNoteDraft(data.usage_note ?? '');
        setBudgetDraft(data.token_budget ? String(data.token_budget) : '');
    }, [data.usage_note, data.token_budget]);

    const totalTokens = data.total_prompt_tokens + data.total_completion_tokens;
    const tokenBudget = data.token_budget ?? null;

    const handleSaveMeta = async () => {
        await onUpdateKeyMeta(data.id, {
            usage_note: noteDraft.trim() ? noteDraft.trim() : null,
            token_budget: budgetDraft ? Number(budgetDraft) : null,
        });
    };

    return (
        <div className="relative min-h-full">
            <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-neutral-950/60 p-4 font-mono text-xs text-neutral-100">
                <GlowingEffect
                    spread={40}
                    glow
                    disabled={false}
                    proximity={64}
                    inactiveZone={0.01}
                />
                <div className="relative z-10">
                    <div className="space-y-1 border-b border-white/15 pb-3">
                        <p className="text-bracket text-[0.6rem] text-neutral-500">{data.provider}</p>
                        <p className="text-sm text-neutral-100">{data.key_name || 'unnamed_key'}</p>
                        <p className="text-[0.65rem] text-neutral-500">
                            status: {data.is_valid === 1 ? 'validated' : 'pending'}
                        </p>
                        <p className="text-[0.65rem] text-neutral-500">
                            created: {new Date(data.created_at).toLocaleString()}
                        </p>
                        <p className="text-[0.65rem] text-neutral-500">tokens_total: {formatTokens(totalTokens)}</p>
                    </div>

                    <div className="mt-3 space-y-4">
                        <div>
                            <label className="text-bracket text-[0.6rem] text-neutral-500" htmlFor={`budget-${data.id}`}>
                                token_budget
                            </label>
                            <input
                                id={`budget-${data.id}`}
                                type="number"
                                value={budgetDraft}
                                onChange={(e) => setBudgetDraft(e.target.value)}
                                placeholder="null"
                                className="mt-1 w-full border border-white/15 bg-neutral-900/60 px-3 py-2 text-neutral-100 placeholder:text-neutral-500"
                            />
                            <p className="mt-1 text-[0.65rem] text-neutral-500">
                                current_limit: {tokenBudget ? formatTokens(tokenBudget) : 'none'}
                            </p>
                        </div>

                        <div>
                            <label className="text-bracket text-[0.6rem] text-neutral-500" htmlFor={`note-${data.id}`}>
                                usage_note
                            </label>
                            <textarea
                                id={`note-${data.id}`}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={4}
                                className="mt-1 w-full border border-white/15 bg-neutral-900/60 p-3 text-neutral-100 placeholder:text-neutral-500"
                                placeholder="describe scope or usage guardrails"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-4 text-bracket text-[0.65rem]">
                        <button type="button" onClick={() => onTestKey(data.id)} className="text-neutral-300 hover:text-white">
                            [ test key ]
                        </button>
                        <button type="button" onClick={handleSaveMeta} className="text-neutral-300 hover:text-white">
                            [ save ]
                        </button>
                        <button
                            type="button"
                            onClick={() => onDeleteKey(data.id)}
                            className="text-red-400 hover:text-red-300"
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
