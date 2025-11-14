import type { ApiKey, ChatSession, ProviderOption } from '../../types';
import { MarkdownRenderer, AnimatedMessage } from '../../components/MarkdownRenderer';
import { useCallback, useMemo, type KeyboardEvent, type RefObject } from 'react';

interface ChatPanelProps {
    currentSession: ChatSession | null;
    modeMap: Record<ProviderOption, string[]>;
    onUpdateSession: (sessionId: string, updater: (session: ChatSession) => ChatSession) => void;
    input: string;
    onInputChange: (value: string) => void;
    onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onSendMessage: () => void;
    onStopResponse: () => void;
    isLoading: boolean;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    validatedKeys: ApiKey[];
    onSelectKey: (sessionId: string, keyId: number) => void;
    availableProviders: ProviderOption[];
    onSelectProvider: (provider: ProviderOption) => void;
}

const ChatPanel = ({
    currentSession,
    modeMap,
    onUpdateSession,
    input,
    onInputChange,
    onInputKeyDown,
    onSendMessage,
    onStopResponse,
    isLoading,
    messagesEndRef,
    validatedKeys,
    onSelectKey,
    availableProviders,
    onSelectProvider,
}: ChatPanelProps) => {
    const handleAnimationProgress = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messagesEndRef]);

    const renderedMessages = useMemo(() => {
        if (!currentSession) return null;
        return currentSession.messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const wrapperClass = isUser ? 'flex justify-end' : 'flex justify-start w-full';
            const bubbleClass = isUser
                ? 'inline-grid max-w-xl gap-2 rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/10 to-slate-900/70 px-4 py-3 text-sm leading-relaxed text-slate-50 shadow-[0_20px_35px_rgba(56,189,248,0.2)]'
                : 'grid w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-100';

            return (
                <div key={`${msg.timestamp}-${idx}`} className={wrapperClass}>
                    <div className={bubbleClass}>
                        {isUser ? (
                            <MarkdownRenderer
                                content={msg.content}
                                className="break-words leading-relaxed text-neutral-100"
                            />
                        ) : (
                            <AnimatedMessage
                                role="assistant"
                                content={msg.content}
                                className="break-words leading-relaxed text-neutral-100"
                                onProgress={handleAnimationProgress}
                            />
                        )}
                    </div>
                </div>
            );
        });
    }, [currentSession, handleAnimationProgress]);

    if (!currentSession) {
        return (
            <div className="panel-shell flex h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
                <p className="text-bracket text-xs uppercase tracking-[0.3em] text-slate-500">no active chat</p>
                <p className="text-sm text-slate-400">Select a thread or spawn a new one from the left rail.</p>
            </div>
        );
    }

    return (
        <div className="panel-shell flex h-full min-h-0 flex-1 flex-col gap-6 p-6 text-slate-100">
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1 border-b border-white/10 pb-4">
                    <h2 className="text-2xl font-semibold text-white">{currentSession.title}</h2>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
                        {currentSession.provider} · {currentSession.model}
                    </p>
                </div>
                <div className="grid gap-4 text-sm text-slate-300 md:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <span className="text-bracket text-[0.55rem] text-slate-500">validated keys</span>
                        {validatedKeys.length === 0 ? (
                            <p className="mt-3 font-mono text-xs text-slate-500">no validated keys</p>
                        ) : (
                            <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem]">
                                {validatedKeys.map(key => (
                                    <button
                                        key={key.id}
                                        type="button"
                                        onClick={() => onSelectKey(currentSession.id, key.id)}
                                        className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.3em] transition ${
                                            currentSession.keyId === key.id
                                                ? 'border-cyan-400/60 bg-cyan-400/10 text-white'
                                                : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/40 hover:text-white'
                                        }`}
                                    >
                                        {key.key_name || key.provider}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                        <span className="text-bracket text-[0.55rem] text-slate-500">models</span>
                        <div className="mt-3 flex flex-wrap gap-2 text-[0.65rem]">
                            {modeMap[currentSession.provider]?.map(model => (
                                <button
                                    key={model}
                                    type="button"
                                    onClick={() =>
                                        onUpdateSession(currentSession.id, session => ({ ...session, model }))
                                    }
                                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.3em] transition ${
                                        currentSession.model === model
                                            ? 'border-cyan-400/60 bg-cyan-400/10 text-white'
                                            : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/40 hover:text-white'
                                    }`}
                                    disabled={!currentSession}
                                >
                                    {model}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 flex-col gap-4">
                <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto pr-2">
                    {renderedMessages}
                    {isLoading && (
                        <div className="flex flex-row gap-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                            <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/20" />
                            <div className="flex flex-1 flex-col gap-2">
                                <div className="h-4 w-40 animate-pulse rounded-lg bg-white/15" />
                                <div className="h-3 w-56 animate-pulse rounded-lg bg-white/10" />
                                <div className="h-2 w-48 animate-pulse rounded-lg bg-white/5" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-col gap-4">
                        <textarea
                            rows={2}
                            value={input}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={onInputKeyDown}
                            placeholder="type request and press Enter"
                            disabled={isLoading}
                            className="min-h-[60px] resize-none rounded-2xl border border-white/10 bg-black/30 p-3 font-mono text-sm text-slate-100 placeholder:text-slate-500 disabled:opacity-50"
                        />
                        <div className="flex flex-wrap items-center gap-4 text-xs text-bracket">
                            <div className="flex items-center gap-2 text-[0.65rem] text-slate-400">
                                <label className="text-bracket" htmlFor="provider-select">
                                    provider
                                </label>
                                <select
                                    id="provider-select"
                                    value={currentSession?.provider ?? ''}
                                    onChange={(e) => onSelectProvider(e.target.value as ProviderOption)}
                                    className="min-w-[8rem] rounded-full border border-white/10 bg-black/30 px-4 py-1 text-center text-xs font-semibold text-slate-100"
                                >
                                    {availableProviders.map(provider => (
                                        <option key={provider} value={provider}>
                                            {provider}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                type="button"
                                onClick={onSendMessage}
                                disabled={isLoading || !input.trim()}
                                className={`rounded-full border px-5 py-2 text-[0.65rem] uppercase tracking-[0.4em] transition ${
                                    isLoading || !input.trim()
                                        ? 'cursor-not-allowed border-white/10 text-slate-600'
                                        : 'border-cyan-400/50 text-white hover:border-cyan-300 hover:bg-cyan-400/10'
                                }`}
                            >
                                submit
                            </button>
                            {isLoading && (
                                <button
                                    type="button"
                                    onClick={onStopResponse}
                                    className="rounded-full border border-rose-400/40 px-4 py-2 text-[0.65rem] uppercase tracking-[0.4em] text-rose-200 transition hover:border-rose-300 hover:bg-rose-400/10"
                                >
                                    abort
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
