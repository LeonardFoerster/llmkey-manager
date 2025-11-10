import type { ApiKey, ChatSession, ProviderOption } from '../types';
import { MarkdownRenderer, AnimatedMessage } from './MarkdownRenderer';
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
                ? 'inline-grid max-w-xl gap-2 rounded-2xl border border-white/15 bg-neutral-800/80 px-4 py-3 text-sm leading-relaxed text-neutral-50'
                : 'grid w-full text-sm leading-relaxed text-neutral-100';

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
            <div className="panel-shell flex h-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-neutral-400">
                <p className="text-bracket text-xs uppercase tracking-[0.3em] text-neutral-500">no active chat</p>
                <p className="text-sm text-neutral-400">Select a thread or spawn a new one from the left rail.</p>
            </div>
        );
    }

    return (
        <div className="panel-shell flex h-full min-h-0 flex-1 flex-col gap-6 p-5 text-neutral-100">
            <div className="flex flex-col gap-4 border-b border-white/15 pb-4">
                <div className="flex flex-col gap-1">
                    <h2 className="font-mono text-lg text-neutral-100">{currentSession.title}</h2>
                    <p className="text-xs uppercase text-neutral-500">
                        {currentSession.provider} · {currentSession.model}
                    </p>
                </div>
                <div className="flex flex-col gap-4 text-sm text-neutral-400 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-col gap-2">
                        <span className="text-bracket text-[0.6rem] text-neutral-500">key</span>
                        {validatedKeys.length === 0 ? (
                            <span className="font-mono text-neutral-500">no validated keys</span>
                        ) : (
                            <div className="flex flex-wrap gap-2 text-[0.65rem]">
                                {validatedKeys.map(key => (
                                    <button
                                        key={key.id}
                                        type="button"
                                        onClick={() => onSelectKey(currentSession.id, key.id)}
                                        className={`text-bracket transition ${
                                            currentSession.keyId === key.id
                                                ? 'text-white'
                                                : 'text-neutral-500 hover:text-neutral-200'
                                        }`}
                                    >
                                        [{key.key_name}]
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-2">
                        <span className="text-bracket text-[0.6rem] text-neutral-500">model</span>
                        <div className="flex flex-wrap gap-2 text-[0.65rem]">
                            {modeMap[currentSession.provider].map(model => (
                                <button
                                    key={model}
                                    type="button"
                                    onClick={() =>
                                        onUpdateSession(currentSession.id, session => ({ ...session, model }))
                                    }
                                    className={`text-bracket transition ${
                                        currentSession.model === model
                                            ? 'text-white'
                                            : 'text-neutral-500 hover:text-neutral-200'
                                    }`}
                                >
                                    [{model}]
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
                        <div className="flex flex-row gap-3 rounded-lg bg-white/5 p-3">
                            <div className="h-12 w-12 animate-pulse rounded-xl bg-white/20" />
                            <div className="flex flex-1 flex-col gap-2">
                                <div className="h-4 w-40 animate-pulse rounded-lg bg-white/15" />
                                <div className="h-3 w-56 animate-pulse rounded-lg bg-white/10" />
                                <div className="h-2 w-48 animate-pulse rounded-lg bg-white/5" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="border border-white/15 bg-neutral-900/70 p-4">
                    <div className="flex flex-col gap-4">
                        <textarea
                            rows={2}
                            value={input}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={onInputKeyDown}
                            placeholder="type request and press Enter"
                            disabled={isLoading}
                            className="min-h-[52px] resize-none border border-white/15 bg-neutral-950/70 p-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 disabled:opacity-50"
                        />
                        <div className="flex flex-wrap items-center gap-4 text-xs text-bracket">
                            <button
                                type="button"
                                onClick={onSendMessage}
                                disabled={isLoading || !input.trim()}
                                className={`text-sm transition ${
                                    isLoading || !input.trim()
                                        ? 'text-neutral-700'
                                        : 'text-neutral-200 hover:text-white hover:opacity-80'
                                }`}
                            >
                                [ Submit ]
                            </button>
                            {isLoading && (
                                <button
                                    type="button"
                                    onClick={onStopResponse}
                                    className="text-sm text-neutral-400 transition hover:text-white"
                                >
                                    [ Abort ]
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
