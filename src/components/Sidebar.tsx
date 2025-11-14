import { useMemo } from 'react';
import type { ChatSession } from '../types';
import { formatTokens } from '../utils/format';
import type { ToastTone } from './ToastStack';

type ViewMode = 'keys' | 'chat' | 'analytics';

interface SidebarProps {
    view: ViewMode;
    onChangeView: (view: ViewMode) => void;
    onNewChat: () => void;
    onOpenMap: () => void;
    onToggleCollapse: () => void;
    onAddKey: () => void;
    sessions: ChatSession[];
    activeSession: string | null;
    onSelectSession: (id: string) => void;
    onDeleteSession: (id: string) => void;
    validatedKeysCount: number;
    totalTokensUsed: number;
    canLaunchMap: boolean;
    pinnedSessionIds: string[];
    onTogglePinSession: (id: string) => void;
    sessionSearch: string;
    onSessionSearchChange: (value: string) => void;
    onNotify: (message: string, tone?: ToastTone) => void;
}

const Sidebar = ({
    view,
    onChangeView,
    onNewChat,
    onOpenMap,
    onToggleCollapse,
    onAddKey,
    sessions,
    activeSession,
    onSelectSession,
    onDeleteSession,
    validatedKeysCount,
    totalTokensUsed,
    canLaunchMap,
    pinnedSessionIds,
    onTogglePinSession,
    sessionSearch,
    onSessionSearchChange,
    onNotify,
}: SidebarProps) => {
    const normalizedQuery = sessionSearch.trim().toLowerCase();
    const pinOrder = useMemo(() => new Map(pinnedSessionIds.map((id, index) => [id, index])), [pinnedSessionIds]);

    const filteredSessions = useMemo(() => {
        if (!normalizedQuery) return sessions;
        return sessions.filter(session => {
            const composite = `${session.title} ${session.provider} ${session.model}`.toLowerCase();
            return composite.includes(normalizedQuery);
        });
    }, [sessions, normalizedQuery]);

    const pinnedSessionsList = filteredSessions
        .filter(session => pinOrder.has(session.id))
        .sort((a, b) => (pinOrder.get(a.id) ?? 0) - (pinOrder.get(b.id) ?? 0));
    const remainingSessions = filteredSessions.filter(session => !pinOrder.has(session.id));

    const handleCopyTitle = async (title: string) => {
        try {
            await navigator.clipboard.writeText(title);
            onNotify('Session title copied', 'success');
        } catch {
            onNotify('Clipboard unavailable', 'error');
        }
    };

    const renderSession = (session: ChatSession, isPinned: boolean) => {
        const createdAt = session.messages[0]?.timestamp ?? Number(session.id);
        return (
            <div
                key={session.id}
                className={`rounded-2xl border px-3 py-3 transition ${
                    activeSession === session.id
                        ? 'border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_25px_rgba(56,189,248,0.25)]'
                        : 'border-white/10 bg-white/5 hover:border-cyan-300/30 hover:bg-white/10'
                }`}
            >
                <div className="flex items-start justify-between gap-2">
                    <button type="button" className="flex-1 text-left" onClick={() => onSelectSession(session.id)}>
                        <p className="truncate font-semibold text-white">{session.title}</p>
                        <p className="text-[0.7rem] text-slate-400">
                            {session.provider} · {session.model}
                        </p>
                    </button>
                    <button
                        type="button"
                        onClick={() => onTogglePinSession(session.id)}
                        className={`text-xs uppercase tracking-[0.3em] ${
                            isPinned ? 'text-cyan-300' : 'text-slate-500'
                        } transition hover:text-white`}
                    >
                        {isPinned ? '[ pinned ]' : '[ pin ]'}
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between text-[0.6rem] text-slate-500">
                    <span>{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</span>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => handleCopyTitle(session.title)}
                            className="text-bracket text-[0.55rem] uppercase tracking-[0.3em] text-slate-500 transition hover:text-cyan-200"
                        >
                            [ copy ]
                        </button>
                        <button
                            type="button"
                            onClick={() => onDeleteSession(session.id)}
                            className="text-bracket text-[0.55rem] uppercase tracking-[0.3em] text-slate-500 transition hover:text-rose-300"
                        >
                            [ delete ]
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <aside className="panel-shell flex h-full min-h-0 w-full flex-col gap-5 p-5 text-sm text-slate-100">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-bracket text-[0.55rem] text-slate-500">navigator</p>
                    <p className="text-xs text-slate-500">Switch desks, launch maps, and add credentials.</p>
                </div>
                <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label="Collapse sidebar"
                    className="rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/60 hover:text-white"
                >
                    hide
                </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 font-mono text-[0.72rem] text-slate-300 shadow-inner shadow-black/20">
                <div className="flex items-center justify-between text-[0.6rem] uppercase tracking-[0.35em] text-slate-500">
                    <span>status</span>
                    <span className="text-cyan-200">online</span>
                </div>
                <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                        <span>validated_keys</span>
                        <span className="text-cyan-200">{validatedKeysCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>tokens_recorded</span>
                        <span>{formatTokens(totalTokensUsed)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>threads_open</span>
                        <span>{sessions.length}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <label className="text-xs uppercase tracking-[0.3em] text-slate-500">filter threads</label>
                <div className="mt-2 flex items-center gap-2">
                    <input
                        value={sessionSearch}
                        onChange={(e) => onSessionSearchChange(e.target.value)}
                        className="flex-1 rounded-full border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="search title or provider"
                    />
                    {sessionSearch && (
                        <button
                            type="button"
                            onClick={() => onSessionSearchChange('')}
                            className="text-xs uppercase tracking-[0.3em] text-slate-500 transition hover:text-white"
                        >
                            clear
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-2 text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
                <button
                    type="button"
                    onClick={() => {
                        onChangeView('chat');
                        onNewChat();
                    }}
                    className="group flex items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-slate-900/80 to-slate-900/30 px-4 py-3 text-left transition hover:border-cyan-400/50 hover:text-white"
                >
                    <span>[ new chat ]</span>
                    <span className="text-[0.55rem] text-slate-600 transition group-hover:text-cyan-200">spawn</span>
                </button>
                <button
                    type="button"
                    onClick={onOpenMap}
                    disabled={!canLaunchMap}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                        canLaunchMap
                            ? 'border-cyan-400/40 bg-gradient-to-r from-slate-900/80 to-cyan-900/20 text-white hover:border-cyan-300/70'
                            : 'cursor-not-allowed border-white/5 bg-white/5 text-slate-600 opacity-50'
                    }`}
                >
                    [ map mode ]
                </button>
                <div className="grid grid-cols-2 gap-2 text-[0.6rem]">
                    {(['keys', 'analytics', 'chat'] as ViewMode[]).map(mode => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onChangeView(mode)}
                            className={`rounded-2xl border px-3 py-2 text-center capitalize tracking-[0.2em] transition ${
                                view === mode
                                    ? 'border-cyan-400/60 bg-cyan-400/10 text-white'
                                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/30 hover:text-white'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={onAddKey}
                    className="rounded-2xl border border-dashed border-cyan-400/40 bg-cyan-400/5 px-4 py-3 text-left tracking-[0.3em] text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/10"
                >
                    [ add key ]
                </button>
            </div>

            <div className="flex flex-1 min-h-0 flex-col gap-2">
                <div className="flex items-center justify-between text-[0.65rem] text-slate-400">
                    <span className="text-bracket">threads</span>
                    <span>{filteredSessions.length} shown</span>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {pinnedSessionsList.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[0.6rem] uppercase tracking-[0.3em] text-cyan-300">Pinned</p>
                            {pinnedSessionsList.map(session => renderSession(session, true))}
                            <hr className="border-white/10" />
                        </div>
                    )}
                    {remainingSessions.map(session => renderSession(session, false))}
                    {filteredSessions.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-[0.7rem] text-slate-500">
                            <p>no threads match the filter</p>
                            <p className="mt-1 text-[0.65rem] text-slate-400">launch a new chat to get started</p>
                        </div>
                    )}
                    {sessions.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-[0.7rem] text-slate-500">
                            <p>no threads yet</p>
                            <p className="mt-1 text-[0.65rem] text-slate-400">
                                add an API key then spawn a new chat to begin logging history.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
