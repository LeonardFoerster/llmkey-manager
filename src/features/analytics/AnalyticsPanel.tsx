import type { AnalyticsData } from '../../types';
import { formatCurrency, formatTokens } from '../../utils/format';

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
    snapshot: AnalyticsSnapshot | null;
    focusKeyId?: number | null;
    onClearFocus?: () => void;
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
    snapshot,
    focusKeyId,
    onClearFocus,
}: AnalyticsPanelProps) => {
    if (isLoading) {
        return (
            <div className="panel-shell flex flex-1 items-center justify-center p-6 font-mono text-xs text-slate-400">
                [ loading analytics ]
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel-shell flex flex-1 items-center justify-center p-6 font-mono text-xs text-rose-300">
                error: {error}
            </div>
        );
    }

    if (!analyticsData) {
        return (
            <div className="panel-shell flex flex-1 items-center justify-center p-6 font-mono text-xs text-slate-400">
                no usage recorded yet
            </div>
        );
    }

    const providerUsage = analyticsData.usageByProvider ?? [];
    const usageByTime = analyticsData.usageByTime ?? [];
    const modelUsage = analyticsData.usageByModel ?? [];
    const keyLeaderboard = analyticsData.usageByKey ?? [];
    const focusedEntry = focusKeyId ? keyLeaderboard.find(entry => entry.keyId === focusKeyId) : null;
    const providerStats = analyticsData.providerRequestStats ?? [];
    const budgetUsage = analyticsData.budgetUsage ?? [];

    const totalProviderTokens = providerUsage.reduce((sum, entry) => sum + entry.promptTokens + entry.completionTokens, 0);
    const totalPromptTokens = providerUsage.reduce((sum, entry) => sum + entry.promptTokens, 0);
    const totalCompletionTokens = providerUsage.reduce((sum, entry) => sum + entry.completionTokens, 0);
    const resolvedTotalTokens = analyticsData.totalTokens || totalProviderTokens;

    const topProvider = providerUsage.reduce(
        (peak, entry) => {
            const tokens = entry.promptTokens + entry.completionTokens;
            return tokens > peak.tokens
                ? { provider: entry.provider, tokens, cost: entry.cost }
                : peak;
        },
        { provider: 'n/a', tokens: 0, cost: 0 },
    );

    const topModel = modelUsage.reduce(
        (peak, entry) => {
            const tokens = entry.promptTokens + entry.completionTokens;
            return tokens > peak.tokens
                ? {
                    provider: entry.provider,
                    model: entry.model,
                    tokens,
                    cost: entry.cost,
                }
                : peak;
        },
        { provider: 'n/a', model: '—', tokens: 0, cost: 0 },
    );

    const peakDay = usageByTime.reduce(
        (peak, entry) => (entry.tokens > peak.tokens ? entry : peak),
        usageByTime[0] ?? { day: 'n/a', tokens: 0, cost: 0, requests: 0 },
    );

    const latestDay = usageByTime[0];
    const recentWindow = usageByTime.slice(0, 7);
    const averageTokens7d = recentWindow.length
        ? Math.round(recentWindow.reduce((sum, entry) => sum + entry.tokens, 0) / recentWindow.length)
        : 0;
    const latestTokens = latestDay?.tokens ?? 0;
    const latestDelta =
        averageTokens7d > 0 ? ((latestTokens - averageTokens7d) / averageTokens7d) * 100 : 0;

    const costPerK = resolvedTotalTokens > 0 ? analyticsData.totalCost / (resolvedTotalTokens / 1000) : 0;
    const promptShare = resolvedTotalTokens > 0 ? (totalPromptTokens / resolvedTotalTokens) * 100 : 0;
    const completionShare = 100 - promptShare;
    const rollingWindow30 = usageByTime.slice(0, 30);
    const rolling30AvgTokens = rollingWindow30.length
        ? Math.round(rollingWindow30.reduce((sum, entry) => sum + entry.tokens, 0) / rollingWindow30.length)
        : 0;
    const totalRequests = usageByTime.reduce((sum, entry) => sum + (entry.requests ?? 0), 0);
    const avgRequestsPerDay = usageByTime.length ? totalRequests / usageByTime.length : 0;
    const peakRequestDay = usageByTime.reduce(
        (peak, entry) => (entry.requests > peak.requests ? entry : peak),
        usageByTime[0] ?? { day: 'n/a', tokens: 0, cost: 0, requests: 0 },
    );

    return (
        <div className="panel-shell flex flex-1 min-h-0 flex-col gap-6 overflow-y-auto p-6 text-slate-100">
            <div className="grid gap-4 lg:grid-cols-[1.5fr,0.7fr]">
                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 to-slate-900/40 p-5 shadow-[0_25px_60px_rgba(3,7,18,0.65)]">
                    <div className="flex flex-col gap-1">
                        <p className="text-bracket text-[0.55rem] text-slate-500">usage snapshot</p>
                        <p className="text-sm text-slate-400">regenerated {snapshot?.generatedAt ?? 'n/a'}</p>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <SnapshotLine
                            label="tokens_today"
                            primary={formatTokens(snapshot?.todayTokens ?? latestTokens)}
                            secondary={`avg_7d=${formatTokens(Math.round(snapshot?.sevenDayAverageTokens ?? averageTokens7d))}`}
                        />
                        <SnapshotLine
                            label="cost_today"
                            primary={formatCurrency(snapshot?.todayCost ?? peakDay.cost)}
                            secondary={`avg_7d=${formatCurrency(snapshot?.sevenDayAverageCost ?? analyticsData.totalCost)}`}
                        />
                        <SnapshotLine
                            label="requests_mean"
                            primary={avgRequestsPerDay.toFixed(1)}
                            secondary={`${totalRequests} total`}
                        />
                        <SnapshotLine
                            label="velocity"
                            primary={`${latestDelta >= 0 ? '+' : ''}${latestDelta.toFixed(1)}%`}
                            secondary="vs 7d avg"
                        />
                    </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-slate-900/20 p-5">
                    <p className="text-bracket text-[0.55rem] text-slate-500">cost channel</p>
                    <p className="mt-4 text-3xl font-semibold text-white">{formatCurrency(estimatedCostValue)}</p>
                    <p className="text-sm text-slate-400">blended run-rate · mode {costMode}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.35em]">
                        <button
                            type="button"
                            onClick={() => onCostModeChange('auto')}
                            className={`rounded-full border px-4 py-2 transition ${
                                costMode === 'auto'
                                    ? 'border-cyan-400/60 bg-cyan-400/10 text-white'
                                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/40 hover:text-white'
                            }`}
                        >
                            auto
                        </button>
                        <button
                            type="button"
                            onClick={() => onCostModeChange('manual')}
                            className={`rounded-full border px-4 py-2 transition ${
                                costMode === 'manual'
                                    ? 'border-cyan-400/60 bg-cyan-400/10 text-white'
                                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/40 hover:text-white'
                            }`}
                        >
                            manual
                        </button>
                        <button
                            type="button"
                            onClick={onToggleCostSettings}
                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
                        >
                            {showCostSettings ? 'hide inputs' : 'adjust rates'}
                        </button>
                    </div>
                    {showCostSettings && (
                        <div className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-bracket text-[0.55rem] text-slate-500">prompt/million</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={manualRates.prompt}
                                    onChange={(e) => onManualRateChange({ ...manualRates, prompt: Number(e.target.value) })}
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100"
                                />
                            </label>
                            <label className="space-y-1">
                                <span className="text-bracket text-[0.55rem] text-slate-500">completion/million</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={manualRates.completion}
                                    onChange={(e) =>
                                        onManualRateChange({
                                            ...manualRates,
                                            completion: Number(e.target.value),
                                        })
                                    }
                                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-slate-100"
                                />
                            </label>
                        </div>
                    )}
                </div>
            </div>

            {focusKeyId && (
                <div className="rounded-3xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">
                    {focusedEntry ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p>
                                focused key: <span className="font-semibold">{focusedEntry.keyName}</span> ·{' '}
                                {formatTokens(focusedEntry.promptTokens + focusedEntry.completionTokens)} recorded
                            </p>
                            {onClearFocus && (
                                <button
                                    type="button"
                                    onClick={onClearFocus}
                                    className="text-xs uppercase tracking-[0.3em] text-cyan-200 transition hover:text-white"
                                >
                                    [ clear ]
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p>No analytics exist yet for the focused key.</p>
                            {onClearFocus && (
                                <button
                                    type="button"
                                    onClick={onClearFocus}
                                    className="text-xs uppercase tracking-[0.3em] text-cyan-200 transition hover:text-white"
                                >
                                    [ clear ]
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <section className="grid gap-4 text-[0.75rem] text-slate-200 md:grid-cols-4">
                <HighlightCard
                    label="top_provider"
                    title={topProvider.provider}
                    primary={formatTokens(topProvider.tokens)}
                    secondary={`cost ${formatCurrency(topProvider.cost)}`}
                />
                <HighlightCard
                    label="top_model"
                    title={topModel.model}
                    primary={formatTokens(topModel.tokens)}
                    secondary={`${topModel.provider} · ${formatCurrency(topModel.cost)}`}
                />
                <HighlightCard
                    label="peak_day"
                    title={peakDay.day}
                    primary={formatTokens(peakDay.tokens)}
                    secondary={formatCurrency(peakDay.cost)}
                />
                <HighlightCard
                    label="cost_per_1k"
                    title="efficiency"
                    primary={`$${costPerK.toFixed(4)}`}
                    secondary="per 1k tokens"
                />
            </section>

            <section className="grid gap-4 text-[0.75rem] text-slate-200 md:grid-cols-3">
                <HighlightCard
                    label="avg_requests/day"
                    title="traffic"
                    primary={avgRequestsPerDay.toFixed(1)}
                    secondary={`${totalRequests} total`}
                />
                <HighlightCard
                    label="peak_requests"
                    title={peakRequestDay.day}
                    primary={`${peakRequestDay.requests ?? 0}`}
                    secondary="requests"
                />
                <HighlightCard
                    label="rolling_30d"
                    title="tokens"
                    primary={formatTokens(rolling30AvgTokens)}
                    secondary={`vs 7d ${formatTokens(averageTokens7d)}`}
                />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-bracket text-[0.55rem] text-slate-500">usage_mix</p>
                    <div className="mt-3 space-y-3">
                        <MixBar label="prompt" value={promptShare} tone="from-cyan-400 to-cyan-600" />
                        <MixBar label="completion" value={completionShare} tone="from-violet-400 to-pink-500" />
                    </div>
                    <p className="mt-3 text-[0.65rem] text-slate-500">
                        prompt_tokens={formatTokens(totalPromptTokens)} · completion_tokens={formatTokens(totalCompletionTokens)}
                    </p>
                    <div className="mt-4 space-y-2 text-xs text-slate-300">
                        {providerUsage.map(entry => (
                            <div key={entry.provider} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-3 py-2">
                                <span>{entry.provider}</span>
                                <span className="text-slate-400">
                                    {formatTokens(entry.promptTokens + entry.completionTokens)} · {formatCurrency(entry.cost)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <p className="text-bracket text-[0.55rem] text-slate-500">models + keys</p>
                    <div className="mt-3 space-y-2 text-xs text-slate-300">
                        {modelUsage.map(entry => (
                            <div key={`${entry.provider}-${entry.model}`} className="rounded-2xl border border-white/5 bg-white/5 px-3 py-2">
                                <p className="text-slate-200">
                                    {entry.provider} · {entry.model}
                                </p>
                                <p className="text-slate-500">
                                    prompt={formatTokens(entry.promptTokens)} · completion={formatTokens(entry.completionTokens)} · cost={formatCurrency(entry.cost)}
                                </p>
                            </div>
                        ))}
                    </div>
                    {keyLeaderboard.length > 0 && (
                        <div className="mt-4 space-y-2 text-xs text-slate-300">
                            {keyLeaderboard.map(entry => (
                                <div
                                    key={entry.keyId}
                                    className={`flex flex-wrap items-center justify-between rounded-2xl border px-3 py-2 ${
                                        focusKeyId === entry.keyId
                                            ? 'border-cyan-400/40 bg-cyan-400/10'
                                            : 'border-white/5 bg-white/5'
                                    }`}
                                >
                                    <div>
                                        <p className="text-slate-100">{entry.keyName}</p>
                                        <p className="text-[0.65rem] text-slate-500">{entry.provider}</p>
                                    </div>
                                    <p className="text-slate-500">
                                        {formatTokens(entry.promptTokens + entry.completionTokens)} · {formatCurrency(entry.cost)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {budgetUsage.length > 0 && (
                <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300">
                    <p className="text-bracket text-[0.55rem] text-slate-500">budget_watch</p>
                    <div className="mt-3 space-y-3">
                        {budgetUsage.map(entry => (
                            <div key={entry.keyId}>
                                <div className="flex justify-between text-[0.65rem] text-slate-400">
                                    <span>{entry.keyName}</span>
                                    <span>{Math.min(100, Math.max(0, entry.utilization)).toFixed(1)}%</span>
                                </div>
                                <div className="mt-1 h-2 rounded-full bg-white/5">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-amber-500"
                                        style={{ width: `${Math.min(100, Math.max(0, entry.utilization))}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {providerStats.length > 0 && (
                <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300">
                    <p className="text-bracket text-[0.55rem] text-slate-500">provider_reliability</p>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="text-slate-500">
                                <tr className="uppercase tracking-[0.2em]">
                                    <th className="px-3 py-2">provider</th>
                                    <th className="px-3 py-2">requests</th>
                                    <th className="px-3 py-2">success</th>
                                    <th className="px-3 py-2">latency</th>
                                    <th className="px-3 py-2">tokens/req</th>
                                </tr>
                            </thead>
                            <tbody>
                                {providerStats.map(stat => (
                                    <tr key={stat.provider} className="border-t border-white/10 text-slate-200">
                                        <td className="px-3 py-2">{stat.provider}</td>
                                        <td className="px-3 py-2">{stat.requestCount}</td>
                                        <td className="px-3 py-2">{stat.successRate.toFixed(1)}%</td>
                                        <td className="px-3 py-2">{stat.avgLatencyMs != null ? `${stat.avgLatencyMs} ms` : '—'}</td>
                                        <td className="px-3 py-2">{formatTokens(Math.round(stat.tokensPerRequest ?? 0))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section className="rounded-3xl border border-white/10 bg-white/5 p-5 text-xs text-slate-300">
                <p className="text-bracket text-[0.55rem] text-slate-500">daily_volume</p>
                <div className="mt-3 space-y-1">
                    {usageByTime.slice(0, 10).map(entry => (
                        <div key={entry.day} className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-3 py-2">
                            <span>{entry.day}</span>
                            <span className="text-slate-500">
                                tokens={formatTokens(entry.tokens)} · cost={formatCurrency(entry.cost)}
                            </span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

const SnapshotLine = ({
    label,
    primary,
    secondary,
}: {
    label: string;
    primary: string;
    secondary: string;
}) => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-[0.75rem] text-slate-100">
        <p className="text-bracket text-[0.55rem] text-slate-500">{label}</p>
        <p className="text-xl font-semibold text-white">{primary}</p>
        <p className="text-[0.65rem] text-slate-500">{secondary}</p>
    </div>
);

const HighlightCard = ({
    label,
    title,
    primary,
    secondary,
}: {
    label: string;
    title: string;
    primary: string;
    secondary: string;
}) => (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <p className="text-bracket text-[0.55rem] text-slate-500">{label}</p>
        <p className="text-sm text-slate-300">{title}</p>
        <p className="text-2xl font-semibold text-white">{primary}</p>
        <p className="text-[0.65rem] text-slate-500">{secondary}</p>
    </div>
);

const MixBar = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div>
        <div className="flex justify-between text-[0.7rem] text-slate-400">
            <span>{label}</span>
            <span>{value.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-white/5">
            <div
                className={`h-full rounded-full bg-gradient-to-r ${tone}`}
                style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            />
        </div>
    </div>
);

export default AnalyticsPanel;
