import type { ChatSession } from '../types';
import { formatTokens } from '../utils/format';

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
    }: SidebarProps) => (
    <aside className="panel-shell flex h-full min-h-0 w-full flex-col p-4 text-sm text-neutral-100">
        <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">control</p>
            <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-300 transition hover:bg-white/15"
            >
                ←
            </button>
        </div>
        <div className="space-y-2 border-b border-white/15 pb-4">
            <p className="text-bracket text-[0.65rem] text-neutral-400">status</p>
            <div className="font-mono text-xs text-neutral-300">
                <p>validated_keys: {validatedKeysCount}</p>
                <p>tokens_recorded: {formatTokens(totalTokensUsed)}</p>
                <p>threads_open: {sessions.length}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
                <button
                    type="button"
                    onClick={() => {
                        onChangeView('chat');
                        onNewChat();
                    }}
                    className="text-left text-bracket text-xs text-neutral-200 transition hover:text-white hover:opacity-80"
                >
                    [ New Chat ]
                </button>
                <button
                    type="button"
                    onClick={onOpenMap}
                    disabled={!canLaunchMap}
                    className={`text-left text-bracket text-xs transition ${
                        canLaunchMap ? 'text-neutral-400 hover:text-neutral-100' : 'text-neutral-700 cursor-not-allowed'
                    }`}
                >
                    [ Map ]
                </button>
                <button
                    type="button"
                    onClick={() => onChangeView('keys')}
                    className={`text-left text-bracket text-xs transition ${
                        view === 'keys' ? 'text-white' : 'text-neutral-400 hover:text-neutral-100'
                    }`}
                >
                    [ Keys ]
                </button>
                <button
                    type="button"
                    onClick={() => onChangeView('analytics')}
                    className={`text-left text-bracket text-xs transition ${
                        view === 'analytics' ? 'text-white' : 'text-neutral-400 hover:text-neutral-100'
                    }`}
                >
                    [ Analytics ]
                </button>
                <button
                    type="button"
                    onClick={onAddKey}
                    className="text-left text-bracket text-xs text-neutral-400 transition hover:text-neutral-100"
                >
                    [ Add Key ]
                </button>
            </div>
        </div>

        <div className="mt-4 flex flex-1 min-h-0 flex-col space-y-2">
            <div className="flex items-center justify-between text-[0.65rem] text-neutral-400">
                <span className="text-bracket">history</span>
                <span>{sessions.length} entries</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {sessions.map(session => {
                    const createdAt = session.messages[0]?.timestamp ?? Number(session.id);
                    return (
                        <div
                            key={session.id}
                            className={`border border-white/15 px-3 py-2 transition ${
                                activeSession === session.id ? 'bg-white/15 text-white' : 'bg-transparent hover:bg-white/10'
                            }`}
                        >
                            <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => onSelectSession(session.id)}
                            >
                                <p className="truncate font-mono text-sm text-neutral-100">{session.title}</p>
                                    <p className="text-xs text-neutral-400">
                                    {session.provider} · {session.model}
                                </p>
                            </button>
                                <div className="mt-1 flex items-center justify-between text-[0.65rem] text-neutral-400">
                                <span>{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}</span>
                                <button
                                    type="button"
                                    onClick={() => onDeleteSession(session.id)}
                                    className="text-bracket text-xs text-neutral-500 transition hover:text-red-400"
                                >
                                    [ delete ]
                                </button>
                            </div>
                        </div>
                    );
                })}
                {sessions.length === 0 && <p className="text-xs text-neutral-500">no threads yet</p>}
            </div>
        </div>
    </aside>
);

export default Sidebar;
