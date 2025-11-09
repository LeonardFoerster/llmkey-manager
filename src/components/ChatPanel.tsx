import { Send } from 'lucide-react';
import type { ChatPreset, ChatSession, ProviderOption } from '../types';
import { AnimatedMessage, MarkdownRenderer } from './MarkdownRenderer';
import type { KeyboardEvent, RefObject } from 'react';
import { estimateTokensFromMessages } from '../utils/tokenEstimate';

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
    presets: ChatPreset[];
    onApplyPreset: (sessionId: string, presetId: string) => void;
    onSoftLimitChange: (sessionId: string, limit: number | null) => void;
    pendingInputTokens: number;
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
    presets,
    onApplyPreset,
    onSoftLimitChange,
    pendingInputTokens,
}: ChatPanelProps) => {
    if (!currentSession) {
        return (
            <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-[#cbd5f5] bg-gradient-to-br from-[#f8fbff] to-[#fdf6ff] p-6 text-center text-gray-600">
                <p className="text-lg font-semibold text-gray-900">No active chat</p>
                <p className="text-sm text-gray-500">Select a chat on the left or start a new one.</p>
            </div>
        );
    }

    const estimatedTokens =
        estimateTokensFromMessages(currentSession.messages) + Math.ceil(pendingInputTokens / 4);
    const softLimit = currentSession.tokenSoftLimit ?? null;
    const limitRatio = softLimit ? Math.min(estimatedTokens / softLimit, 1) : 0;
    const limitClass = !softLimit
        ? 'text-gray-500'
        : limitRatio >= 1
            ? 'text-rose-600'
            : limitRatio >= 0.8
                ? 'text-amber-600'
                : 'text-emerald-600';

    return (
        <div className="flex h-full flex-1 flex-col gap-4 rounded-3xl border border-gray-200 bg-white/95 p-6 shadow-[0_30px_70px_rgba(15,23,42,0.07)]">
            <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold text-gray-900">{currentSession.title}</h2>
                    <p className="text-sm text-gray-500 capitalize">
                        {currentSession.provider} · {currentSession.model}
                    </p>
                </div>
                <select
                    value={currentSession.model}
                    onChange={(e) =>
                        onUpdateSession(currentSession.id, session => ({ ...session, model: e.target.value }))
                    }
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.45)]"
                >
                    {modeMap[currentSession.provider].map(model => (
                        <option key={model} value={model}>
                            {model}
                        </option>
                    ))}
                </select>
            </div>

            <div className="rounded-3xl border border-dashed border-[#e0e7ff] bg-white/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">Chat presets</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {presets.map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => onApplyPreset(currentSession.id, preset.id)}
                            className={`rounded-2xl border px-3 py-2 text-xs text-left transition ${
                                currentSession.presetId === preset.id
                                    ? 'btn-accent text-white'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-[#c7d2fe]'
                            }`}
                            title={preset.description}
                            type="button"
                        >
                            <span className="block font-semibold">{preset.label}</span>
                            <span className="text-[0.65rem] uppercase tracking-[0.2em]">{preset.provider}</span>
                        </button>
                    ))}
                </div>
                {currentSession.systemPrompt ? (
                    <div className="mt-3 rounded-2xl bg-[#f7f3ff] px-4 py-3 text-sm text-gray-700">
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#4c1d95]">Active instructions</p>
                        <MarkdownRenderer content={currentSession.systemPrompt} className="mt-2 text-sm text-gray-700" />
                    </div>
                ) : (
                    <p className="mt-3 text-xs text-gray-500">No system prompt attached to this chat yet.</p>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-hidden">
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto pr-2 max-h-[calc(100vh-18rem)]">
                    {currentSession.messages.map((msg, idx) => (
                        <div
                            key={`${msg.timestamp}-${idx}`}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-2xl rounded-3xl border px-6 py-4 text-sm shadow-sm ${
                                    msg.role === 'user'
                                        ? 'border-transparent bg-gradient-to-br from-[#eef2ff] to-white text-gray-900 shadow-[0_15px_35px_rgba(99,102,241,0.2)]'
                                        : 'border border-[#e0e7ff] bg-white/90 text-gray-700'
                                }`}
                            >
                                {msg.role === 'assistant' ? (
                                    <AnimatedMessage
                                        content={msg.content}
                                        role="assistant"
                                        className="break-words text-gray-700 text-sm leading-relaxed"
                                        onProgress={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                                    />
                                ) : (
                                    <MarkdownRenderer
                                        content={msg.content}
                                        className="break-words text-gray-900 leading-relaxed"
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="rounded-3xl border border-[#c7d2fe] bg-[#f7f3ff] px-6 py-4 text-sm text-[#4c1d95]">
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row">
                        <div className="flex flex-1 flex-col gap-3">
                            <textarea
                                rows={3}
                                value={input}
                                onChange={(e) => onInputChange(e.target.value)}
                                onKeyDown={onInputKeyDown}
                                placeholder="Ask anything..."
                                disabled={isLoading}
                                className="min-h-[80px] resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)] disabled:opacity-60"
                            />
                            <div className="rounded-2xl border border-dashed border-[#dbeafe] bg-[#f8fbff] px-4 py-3 text-xs text-gray-600">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold uppercase tracking-[0.3em] text-gray-500">Soft token limit</p>
                                    <input
                                        type="number"
                                        min={0}
                                        value={softLimit ?? ''}
                                        onChange={(e) => onSoftLimitChange(
                                            currentSession.id,
                                            e.target.value ? Number(e.target.value) : null
                                        )}
                                        className="w-32 rounded-2xl border border-gray-200 px-2 py-1 text-sm text-gray-900 outline-none transition focus:border-[#c7d2fe] focus:shadow-[0_0_0_3px_rgba(196,181,253,0.35)]"
                                        placeholder="4000"
                                    />
                                </div>
                                <p className={`mt-1 text-sm font-semibold ${limitClass}`}>
                                    {softLimit ? `${estimatedTokens}/${softLimit} est. tokens` : `${estimatedTokens} est. tokens`}
                                </p>
                                {softLimit && (
                                    <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
                                        <div
                                            className={`h-full rounded-full ${limitRatio >= 1 ? 'bg-rose-500' : limitRatio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                            style={{ width: `${limitRatio * 100}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 md:flex-col md:justify-end">
                            {isLoading && (
                                <button
                                    type="button"
                                    onClick={onStopResponse}
                                    className="hover-lift rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-sm font-semibold text-[#9a3412] transition"
                                >
                                    Stop
                                </button>
                            )}
                            <button
                                onClick={onSendMessage}
                                disabled={isLoading || !input.trim()}
                                className="btn-accent hover-lift flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed"
                            >
                                <Send className="h-5 w-5 text-white" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;
