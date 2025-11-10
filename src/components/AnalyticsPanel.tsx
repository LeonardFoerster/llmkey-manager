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
    snapshot,
}: AnalyticsPanelProps) => {
    if (isLoading) {
        return (
            <div className="panel-shell flex flex-1 items-center justify-center p-6 font-mono text-xs text-neutral-300">
                [ loading analytics ]
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel-shell flex flex-1 items-center justify-center p-6 font-mono text-xs text-red-400">
                error: {error}
            </div>
        );
    }

    if (!analyticsData) {
        return (
            <div className="panel-shell flex flex-1 items-center justify-center p-6 font-mono text-xs text-neutral-300">
                no usage recorded yet
            </div>
        );
    }

    const providerUsage = analyticsData.usageByProvider ?? [];
    const usageByTime = analyticsData.usageByTime ?? [];
    const modelUsage = analyticsData.usageByModel ?? [];
    const keyLeaderboard = analyticsData.usageByKey ?? [];
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
        <div className="panel-shell flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto p-5 font-mono text-xs text-neutral-100">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-bracket text-[0.6rem] text-neutral-500">analytics</p>
                    <p className="text-sm text-neutral-500">observability stream · regenerated {snapshot?.generatedAt ?? 'n/a'}</p>
                </div>
                <div className="flex items-center gap-4">
                    <p className="text-sm text-neutral-300">
                        estimated_cost: {formatCurrency(estimatedCostValue)}
                    </p>
                    <button
                        type="button"
                        onClick={() => onCostModeChange(costMode === 'auto' ? 'manual' : 'auto')}
                        className="text-bracket text-[0.6rem] text-neutral-400 transition hover:text-white"
                    >
                        [ mode: {costMode} ]
                    </button>
                    <button
                        type="button"
                        onClick={onToggleCostSettings}
                        className="text-bracket text-[0.6rem] text-neutral-500 transition hover:text-white"
                    >
                        {showCostSettings ? '[ hide inputs ]' : '[ edit rates ]'}
                    </button>
                </div>
            </div>

            {snapshot && (
                <div className="grid gap-4 text-neutral-100 sm:grid-cols-2">
                    <SnapshotLine
                        label="tokens_today"
                        primary={formatTokens(snapshot.todayTokens)}
                        secondary={`avg_7d=${formatTokens(Math.round(snapshot.sevenDayAverageTokens))}`}
                    />
                    <SnapshotLine
                        label="cost_today"
                        primary={formatCurrency(snapshot.todayCost)}
                        secondary={`avg_7d=${formatCurrency(snapshot.sevenDayAverageCost)}`}
                    />
                </div>
            )}

            <section className="grid gap-4 text-[0.8rem] text-neutral-200 md:grid-cols-4">
                <HighlightCard
                    label="top_provider"
                    title={topProvider.provider}
                    primary={formatTokens(topProvider.tokens)}
                    secondary={`cost=${formatCurrency(topProvider.cost)}`}
                />
                <HighlightCard
                    label="peak_day"
                    title={peakDay.day}
                    primary={formatTokens(peakDay.tokens)}
                    secondary={`cost=${formatCurrency(peakDay.cost)}`}
                />
                <HighlightCard
                    label="velocity"
                    title={latestDay?.day ?? 'n/a'}
                    primary={formatTokens(latestTokens)}
                    secondary={`${latestDelta >= 0 ? '+' : ''}${latestDelta.toFixed(1)}% vs 7d avg`}
                />
                <HighlightCard
                    label="cost_per_1k"
                    title="efficiency"
                    primary={`$${costPerK.toFixed(4)}`}
                    secondary="per 1k tokens"
                />
            </section>

            <section className="grid gap-4 text-[0.75rem] text-neutral-200 md:grid-cols-3">
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

            {keyLeaderboard.length > 0 && (
                <section className="space-y-2 text-neutral-300">
                    <p className="text-bracket text-[0.6rem] text-neutral-500">top_keys</p>
                    <div className="space-y-2 text-[0.75rem] text-neutral-200">
                        {keyLeaderboard.map(entry => (
                            <div
                                key={entry.keyId}
                                className="flex flex-wrap items-center justify-between border-b border-white/10 pb-2"
                            >
                                <div>
                                    <p className="text-neutral-100">{entry.keyName}</p>
                                    <p className="text-[0.65rem] text-neutral-500">{entry.provider}</p>
                                </div>
                                <p className="text-neutral-500">
                                    tokens={formatTokens(entry.promptTokens + entry.completionTokens)} · cost={formatCurrency(entry.cost)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {providerStats.length > 0 && (
                <section className="space-y-2 text-neutral-300">
                    <p className="text-bracket text-[0.6rem] text-neutral-500">provider_reliability</p>
                    <div className="overflow-x-auto rounded-2xl bg-white/5">
                        <table className="w-full border-collapse text-[0.7rem]">
                            <thead className="text-neutral-500">
                                <tr className="text-left uppercase tracking-[0.2em]">
                                    <th className="px-3 py-2">provider</th>
                                    <th className="px-3 py-2">requests</th>
                                    <th className="px-3 py-2">success</th>
                                    <th className="px-3 py-2">latency</th>
                                    <th className="px-3 py-2">tokens/req</th>
                                </tr>
                            </thead>
                            <tbody>
                                {providerStats.map(stat => (
                                    <tr key={stat.provider} className="border-t border-white/10 text-neutral-200">
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

            {showCostSettings && (
                <div className="grid gap-3 border border-white/15 bg-neutral-950/60 p-4 text-neutral-100 sm:grid-cols-2">
                    <label className="space-y-1 text-[0.65rem] text-neutral-400">
                        prompt_per_million
                        <input
                            type="number"
                            step="0.01"
                            value={manualRates.prompt}
                            onChange={(e) =>
                                onManualRateChange({
                                    ...manualRates,
                                    prompt: Number(e.target.value),
                                })
                            }
                            className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 text-neutral-100"
                        />
                    </label>
                    <label className="space-y-1 text-[0.65rem] text-neutral-400">
                        completion_per_million
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
                            className="w-full border border-white/15 bg-neutral-900/60 px-3 py-2 text-neutral-100"
                        />
                    </label>
                </div>
            )}

            <section className="grid gap-4 text-[0.75rem] text-neutral-200 md:grid-cols-2">
                <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-bracket text-[0.6rem] text-neutral-500">usage_mix</p>
                    <div className="mt-3 space-y-2">
                        <MixBar label="prompt" value={promptShare} tone="from-sky-400/80 to-sky-600/70" />
                        <MixBar label="completion" value={completionShare} tone="from-purple-400/80 to-purple-600/70" />
                    </div>
                    <p className="mt-3 text-[0.65rem] text-neutral-500">
                        prompt_tokens={formatTokens(totalPromptTokens)} · completion_tokens={formatTokens(totalCompletionTokens)}
                    </p>
                </div>
                <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-bracket text-[0.6rem] text-neutral-500">model_spotlight</p>
                    <div className="mt-3 text-[0.9rem] text-neutral-100">
                        {topModel.model} <span className="text-neutral-500">({topModel.provider})</span>
                    </div>
                    <p className="text-[0.7rem] text-neutral-400">
                        tokens={formatTokens(topModel.tokens)} · cost={formatCurrency(topModel.cost)}
                    </p>
                </div>
            </section>

            {budgetUsage.length > 0 && (
                <section className="space-y-2 text-neutral-300">
                    <p className="text-bracket text-[0.6rem] text-neutral-500">budget_watch</p>
                    <div className="space-y-3 text-[0.75rem] text-neutral-200">
                        {budgetUsage.map(entry => (
                            <div key={entry.keyId} className="space-y-1">
                                <div className="flex justify-between text-[0.65rem] text-neutral-400">
                                    <span>{entry.keyName}</span>
                                    <span>{Math.min(100, Math.max(0, entry.utilization)).toFixed(1)}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-white/5">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-rose-400/80 to-amber-500/80"
                                        style={{ width: `${Math.min(100, Math.max(0, entry.utilization))}%` }}
                                    />
                                </div>
                                <p className="text-[0.6rem] text-neutral-500">
                                    used={formatTokens(entry.tokensUsed)} · budget={formatTokens(entry.tokenBudget)}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className="space-y-2 text-neutral-300">
                <p className="text-bracket text-[0.6rem] text-neutral-500">providers</p>
                <div className="space-y-1 text-[0.75rem] text-neutral-200">
                    {analyticsData.usageByProvider.map(entry => (
                        <div key={entry.provider} className="space-y-1 border-b border-white/10 pb-2">
                            <div className="flex flex-wrap items-center justify-between">
                                <span>{entry.provider}</span>
                                <span className="text-neutral-500">
                                    tokens={formatTokens(entry.promptTokens + entry.completionTokens)} · cost={formatCurrency(entry.cost)}
                                </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-500/70 to-purple-500/70"
                                    style={{
                                        width: `${resolvedTotalTokens > 0
                                            ? ((entry.promptTokens + entry.completionTokens) / resolvedTotalTokens) * 100
                                            : 0}%`,
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-2 text-neutral-300">
                <p className="text-bracket text-[0.6rem] text-neutral-500">top_models</p>
                <div className="space-y-1 text-[0.75rem] text-neutral-200">
                    {analyticsData.usageByModel.map(entry => (
                        <div key={`${entry.provider}-${entry.model}`} className="flex flex-col border-b border-white/10 pb-1">
                            <span>
                                {entry.provider} :: {entry.model}
                            </span>
                            <span className="text-neutral-500">
                                prompt={formatTokens(entry.promptTokens)} · completion={formatTokens(entry.completionTokens)} · cost={formatCurrency(entry.cost)}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-2 text-neutral-300">
                <p className="text-bracket text-[0.6rem] text-neutral-500">daily_volume</p>
                <div className="space-y-1 text-[0.75rem] text-neutral-200">
                    {analyticsData.usageByTime.slice(0, 10).map(entry => (
                        <div key={entry.day} className="flex items-center justify-between border-b border-white/10 pb-1">
                            <span>{entry.day}</span>
                            <span className="text-neutral-500">tokens={formatTokens(entry.tokens)} · cost={formatCurrency(entry.cost)}</span>
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
    <div className="border border-white/15 bg-neutral-950/60 p-3 text-[0.75rem] text-neutral-100">
        <p className="text-bracket text-[0.6rem] text-neutral-500">{label}</p>
        <p className="text-lg text-neutral-100">{primary}</p>
        <p className="text-[0.65rem] text-neutral-500">{secondary}</p>
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
    <div className="rounded-2xl bg-white/5 p-3">
        <p className="text-bracket text-[0.55rem] text-neutral-500">{label}</p>
        <p className="text-sm text-neutral-300">{title}</p>
        <p className="text-2xl text-neutral-100">{primary}</p>
        <p className="text-[0.65rem] text-neutral-500">{secondary}</p>
    </div>
);

const MixBar = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div>
        <div className="flex justify-between text-[0.7rem] text-neutral-400">
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
