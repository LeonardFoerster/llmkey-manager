import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import type { MapResultEntry } from '../../types/map';

interface LLMMapOverlayProps {
    open: boolean;
    prompt: string;
    results: MapResultEntry[];
    unifiedResult: MapResultEntry | null;
    isLoading: boolean;
    onPromptChange: (value: string) => void;
    onRun: () => void;
    onClose: () => void;
}

const statusTone = {
    pending: 'text-cyan-200',
    success: 'text-emerald-300',
    error: 'text-rose-300',
} as const;

const LLMMapOverlay = ({
    open,
    prompt,
    results,
    unifiedResult,
    isLoading,
    onPromptChange,
    onRun,
    onClose,
}: LLMMapOverlayProps) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-4 py-10 backdrop-blur">
            <div className="relative w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900/80 p-6 text-slate-100 shadow-[0_35px_90px_rgba(3,7,18,0.85)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.15),transparent_60%),radial-gradient(circle_at_80%_0,rgba(14,165,233,0.15),transparent_55%)]" />
                <div className="pointer-events-none absolute -top-32 -right-16 h-72 w-72 animate-[spin_14s_linear_infinite] rounded-full bg-cyan-400/20 blur-[120px]" />
                <div className="pointer-events-none absolute -bottom-12 -left-20 h-64 w-64 animate-[spin_18s_linear_infinite] rounded-full bg-sky-500/15 blur-[120px]" />

                <div className="relative z-10 flex max-h-[80vh] flex-col gap-6 overflow-y-auto pr-2">
                    <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-[0.35em] text-cyan-200">LLM MAP FETCH</p>
                                <p className="text-sm text-slate-400">Broadcast a single prompt across every validated endpoint.</p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-full border border-white/10 px-4 py-2 text-[0.65rem] uppercase tracking-[0.35em] text-slate-300 transition hover:border-cyan-300/40 hover:text-white"
                            >
                                close
                            </button>
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs uppercase tracking-[0.3em] text-slate-500">Prompt</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => onPromptChange(e.target.value)}
                                rows={3}
                                placeholder="Describe the request you want to broadcast"
                                className="w-full rounded-2xl border border-white/20 bg-black/30 p-3 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                            />
                            <div className="flex flex-wrap items-center gap-4 text-xs text-bracket">
                                <button
                                    type="button"
                                    onClick={onRun}
                                    disabled={isLoading || !prompt.trim()}
                                    className={`rounded-full border px-4 py-2 transition ${
                                        isLoading || !prompt.trim()
                                            ? 'cursor-not-allowed border-white/5 text-slate-600'
                                            : 'border-cyan-400/60 bg-cyan-400/10 text-white hover:border-cyan-300/60'
                                    }`}
                                >
                                    broadcast
                                </button>
                                {isLoading && <span className="text-slate-500">dispatching...</span>}
                                {!isLoading && results.length === 0 && (
                                    <span className="text-slate-500">enter prompt then broadcast</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/30 p-6 text-sm text-slate-200">
                        {unifiedResult && unifiedResult.response ? (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-500">
                                    <span>unified answer</span>
                                    <span className="text-slate-400">
                                        {unifiedResult.provider} · {unifiedResult.model}
                                    </span>
                                </div>
                                <MarkdownRenderer
                                    content={unifiedResult.response}
                                    className="prose prose-invert text-base leading-relaxed"
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-slate-500">
                                <div className="h-10 w-10 rounded-full border-2 border-cyan-200/40 border-t-cyan-400 animate-spin" />
                                <p>orchestrating best answer…</p>
                            </div>
                        )}
                    </div>

                    {isLoading && (
                        <div className="flex items-center justify-center gap-3 text-xs uppercase tracking-[0.4em] text-cyan-200">
                            <span className="h-2 w-2 animate-ping rounded-full bg-cyan-300" />
                            Broadcasting map fetch…
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LLMMapOverlay;
