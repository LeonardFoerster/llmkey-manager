import type { AnalyticsData } from '../types';
import { formatCurrency, formatTokens } from '../utils/format';

interface AnalyticsSnapshot {
    todayTokens: number;
    sevenDayAverageTokens: number;
    todayCost: number;
    sevenDayAverageCost: number;
    generatedAt: string;
}

interface ManualRates {
    prompt: number;
    completion: number;
}

interface AnalyticsPanelProps {
    analyticsData: AnalyticsData | null;
    isLoading: boolean;
    error: string | null;
    costMode: 'auto' | 'manual';
    manualRates: ManualRates;
    onManualRateChange: (rates: ManualRates) => void;
    onCostModeChange: (mode: 'auto' | 'manual') => void;
    showCostSettings: boolean;
    onToggleCostSettings: () => void;
    estimatedCostValue: number;
    providerMaxCost: number;
    providerMaxTokens: number;
    dailyVolumeMax: number;
    dailyVolumeTicks: number[];
    snapshot: AnalyticsSnapshot | null;
}

const AnalyticsPanel = ({
    analyticsData,
    isLoading,
    error,
    costMode,
    manualRates,
    onManualRateChange,
    onCostModeChange,
    showCostSettings,
    onToggleCostSettings,
    estimatedCostValue,
    providerMaxCost,
    providerMaxTokens,
    dailyVolumeMax,
    dailyVolumeTicks,
    snapshot,
}: AnalyticsPanelProps) => {
    if (isLoading) {
        return <div className="flex flex-1 items-center justify-center rounded-3xl border border-gray-200 bg-white p-6 text-gray-500">Loading analytics…</div>;
    }
    if (error) {
        return <div className="flex flex-1 items-center justify-center rounded-3xl border border-gray-200 bg-white p-6 text-red-500">{error}</div>;
    }

    if (!analyticsData) {
        return <div className="flex flex-1 items-center justify-center rounded-3xl border border-gray-200 bg-white p-6 text-gray-500">No analytics yet.</div>;
    }

    return (
        <div className="flex h-full flex-1 flex-col gap-6 rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-[0_30px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.5em] text-gray-500">Insights</p>
                <h2 className="text-3xl font-semibold text-gray-900">Usage & Cost Overview</h2>
                <p className="text-sm text-gray-500">Analytics refresh on-demand; data covers recorded usage events.</p>
            </div>

            {snapshot && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <SnapshotCard
                        label="Today's tokens"
                        primaryValue={formatTokens(snapshot.todayTokens)}
                        delta={snapshot.sevenDayAverageTokens ? snapshot.todayTokens - snapshot.sevenDayAverageTokens : 0}
                        reference={snapshot.sevenDayAverageTokens}
                        helper="vs 7-day average"
                    />
                    <SnapshotCard
                        label="Today's estimated cost"
                        primaryValue={formatCurrency(snapshot.todayCost)}
                        delta={snapshot.sevenDayAverageCost ? snapshot.todayCost - snapshot.sevenDayAverageCost : 0}
                        reference={snapshot.sevenDayAverageCost}
                        helper="vs 7-day average"
                    />
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                <div className="hover-lift rounded-2xl border border-[#e0e7ff] bg-white p-6 text-center shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
                    <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Total tokens</p>
                    <p className="mt-2 text-4xl font-semibold text-[#4c1d95]">{formatTokens(analyticsData.totalTokens)}</p>
                    <p className="mt-1 text-xs text-gray-500">All providers · lifetime</p>
                </div>
                <div className="relative hover-lift rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_25px_55px_rgba(79,70,229,0.08)]">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Estimated cost</p>
                            <p className="text-3xl font-semibold text-[#4c1d95]">{`$${estimatedCostValue.toFixed(4)}`}</p>
                            <p className="text-xs text-gray-500">
                                {costMode === 'auto'
                                    ? 'Auto · server reported'
                                    : `Manual · $${manualRates.prompt.toFixed(2)}/M input • $${manualRates.completion.toFixed(2)}/M output`}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onToggleCostSettings}
                            className="hover-lift rounded-full border border-[#e0e7ff] p-2 text-[#4c1d95] transition hover:bg-[#f5f3ff]"
                        >
                            ⋮
                        </button>
                    </div>
                    {showCostSettings && (
                        <div className="absolute right-4 top-24 z-20 w-72 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-[0_30px_65px_rgba(79,70,229,0.15)]">
                            <div className="flex items-center justify-between">
                                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Cost mode</p>
                                <button
                                    type="button"
                                    onClick={onToggleCostSettings}
                                    className="text-xs text-gray-400 hover:text-gray-900"
                                >
                                    Close
                                </button>
                            </div>
                            <div className="mt-3 flex gap-2">
                                {(['auto', 'manual'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => onCostModeChange(mode)}
                                        className={`flex-1 rounded-2xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] ${
                                            costMode === mode
                                                ? 'btn-accent text-white'
                                                : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-[#c7d2fe]'
                                        }`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 space-y-3">
                                <RateInput
                                    label="Input price ($ / 1M tokens)"
                                    value={manualRates.prompt}
                                    onChange={(value) => onManualRateChange({ ...manualRates, prompt: value })}
                                />
                                <RateInput
                                    label="Output price ($ / 1M tokens)"
                                    value={manualRates.completion}
                                    onChange={(value) => onManualRateChange({ ...manualRates, completion: value })}
                                />
                            </div>
                            <p className="mt-3 text-[0.7rem] text-gray-500">
                                Manual mode multiplies total prompt and completion tokens by the provided per-million rates.
                            </p>
                        </div>
                    )}
                </div>
                <div className="hover-lift rounded-2xl border border-gray-200 bg-white p-6 text-center">
                    <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Last updated</p>
                    <p className="mt-2 text-xl font-semibold text-[#4c1d95]">{analyticsData.lastUpdated}</p>
                    <p className="text-xs text-gray-500">UTC</p>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="hover-lift rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_22px_55px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Provider spend</p>
                            <p className="text-sm text-gray-500">Cost & volume share</p>
                        </div>
                        <span className="text-xs font-semibold text-gray-400">dual bars</span>
                    </div>
                    <div className="mt-6 space-y-5">
                        {analyticsData.usageByProvider.map(provider => {
                            const totalTokensProvider = provider.promptTokens + provider.completionTokens;
                            const costPercent = Math.max(4, Math.round((provider.cost / providerMaxCost) * 100));
                            const tokenPercent = Math.max(4, Math.round((totalTokensProvider / providerMaxTokens) * 100));
                            return (
                                <div key={provider.provider} className="space-y-3">
                                    <div className="flex items-center justify-between text-sm font-semibold text-gray-800">
                                        <span className="capitalize">{provider.provider}</span>
                                        <span>{formatCurrency(provider.cost)}</span>
                                    </div>
                                    <Bar widthPercent={costPercent} className="h-2 bg-gradient-to-r from-[#0ea5e9] via-[#6366f1] to-[#8b5cf6]" />
                                    <div className="flex items-center justify-between text-[0.7rem] text-gray-500">
                                        <span>{formatTokens(totalTokensProvider)} tokens</span>
                                        <span>{tokenPercent}% volume</span>
                                    </div>
                                    <Bar widthPercent={tokenPercent} className="h-1.5 bg-gradient-to-r from-[#fb7185] to-[#f97316]" />
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="hover-lift rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_22px_55px_rgba(15,23,42,0.06)]">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Daily token volume</p>
                            <p className="text-sm text-gray-500">Axis fixed at 1M max</p>
                        </div>
                        <span className="text-xs font-semibold text-gray-400">height = tokens</span>
                    </div>
                    <div className="mt-6 flex gap-4">
                        <div className="flex h-36 flex-col justify-between text-[0.65rem] font-semibold text-gray-400">
                            {dailyVolumeTicks.map(tick => (
                                <span key={tick}>{formatTokens(tick)}</span>
                            ))}
                        </div>
                        <div className="relative flex flex-1 items-end gap-4 overflow-x-auto pb-2">
                            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex flex-col justify-between">
                                {dailyVolumeTicks.map(tick => (
                                    <span key={`line-${tick}`} className="block border-t border-dashed border-gray-200" />
                                ))}
                            </div>
                            {analyticsData.usageByTime.map(entry => {
                                const ratio = Math.min(entry.tokens, dailyVolumeMax) / dailyVolumeMax;
                                const heightPercent = Math.max(8, Math.round(ratio * 100));
                                return (
                                    <div key={entry.day} className="relative flex flex-col items-center gap-2 text-center">
                                        <div className="flex h-36 w-12 flex-col justify-end bg-white p-1">
                                            <div
                                                className="w-full rounded-[12px] bg-gradient-to-t from-[#4ade80] via-[#38bdf8] to-[#6366f1] transition-all"
                                                style={{ height: `${heightPercent}%` }}
                                            />
                                        </div>
                                        <span className="text-[0.7rem] font-semibold text-gray-800">{entry.day}</span>
                                        <span className="text-[0.65rem] text-gray-500">{formatTokens(entry.tokens)} tokens</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const RateInput = ({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (val: number) => void;
}) => (
    <label className="block text-xs uppercase tracking-[0.3em] text-gray-500">
        {label}
        <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="mt-1 w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
        />
    </label>
);

const SnapshotCard = ({
    label,
    primaryValue,
    delta,
    reference,
    helper,
}: {
    label: string;
    primaryValue: string;
    delta: number;
    reference: number;
    helper: string;
}) => {
    const deltaPercent = reference ? (delta / reference) * 100 : 0;
    const statusClass = reference
        ? delta >= 0
            ? 'text-emerald-600'
            : 'text-rose-500'
        : 'text-gray-400';
    const deltaLabel = reference ? `${delta >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%` : 'n/a';
    return (
        <div className="hover-lift rounded-2xl border border-[#e0e7ff] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#4c1d95]">{primaryValue}</p>
            <p className={`text-xs font-semibold ${statusClass}`}>
                {deltaLabel} {helper}
            </p>
        </div>
    );
};

const Bar = ({ widthPercent, className }: { widthPercent: number; className: string }) => (
    <div className="h-full w-full rounded-full bg-gradient-to-r from-[#f1f5f9] to-[#e0e7ff]">
        <div
            className={`rounded-full ${className}`}
            style={{ width: `${widthPercent}%` }}
        />
    </div>
);

export default AnalyticsPanel;
