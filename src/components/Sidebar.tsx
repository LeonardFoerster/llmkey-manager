import { Key, MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatSession } from '../types';
import { formatTokens } from '../utils/format';

type ViewMode = 'keys' | 'chat' | 'analytics';

interface SidebarProps {
    view: ViewMode;
    onChangeView: (view: ViewMode) => void;
    onNewChat: () => void;
    onAddKey: () => void;
    sessions: ChatSession[];
    activeSession: string | null;
    onSelectSession: (id: string) => void;
    onDeleteSession: (id: string) => void;
    validatedKeysCount: number;
    totalTokensUsed: number;
}

const Sidebar = ({
    view,
    onChangeView,
    onNewChat,
    onAddKey,
    sessions,
    activeSession,
    onSelectSession,
    onDeleteSession,
    validatedKeysCount,
    totalTokensUsed,
}: SidebarProps) => (
    <aside className="flex h-full w-full flex-col gap-5 overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-b from-[#f7f8ff] via-[#f4f5fb] to-[#fef6ff] p-5 shadow-[0_35px_60px_rgba(15,23,42,0.08)] lg:w-80 lg:min-h-[calc(100vh-3rem)]">
        <div className="hover-lift rounded-2xl border border-[#e0e7ff] bg-white/90 p-4 shadow-[0_18px_35px_rgba(79,70,229,0.08)]">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Command center</p>
                    <h1 className="text-2xl font-semibold text-gray-900">Key Control</h1>
                </div>
                <div className="rounded-2xl bg-[#eef2ff] p-3 text-[#4c1d95]">
                    <MessageSquare className="h-6 w-6" />
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs uppercase tracking-[0.2em] text-gray-500">
                <div className="accent-chip rounded-2xl px-3 py-4">
                    <p>Validated</p>
                    <p className="mt-1 text-2xl font-semibold text-gray-900">{validatedKeysCount}</p>
                </div>
                <div className="accent-chip rounded-2xl px-3 py-4">
                    <p>Tokens</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{formatTokens(totalTokensUsed)}</p>
                </div>
            </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 text-xs font-semibold uppercase tracking-[0.3em] text-gray-600 shadow-sm">
            <p className="mb-3 text-[0.65rem] text-gray-400">Workspace</p>
            <div className="flex flex-col gap-2">
                <SidebarButton
                    active={view === 'keys'}
                    label="Key overview"
                    icon={<Key className="h-4 w-4" />}
                    badge={view === 'keys' ? 'Active' : ''}
                    onClick={() => onChangeView('keys')}
                />
                <button
                    onClick={() => {
                        onChangeView('chat');
                        onNewChat();
                    }}
                    className="hover-lift flex items-center justify-between rounded-2xl border border-transparent bg-gradient-to-r from-[#e0f2ff] to-[#fce7ff] px-4 py-2 text-sm text-gray-800 shadow-[0_12px_30px_rgba(14,165,233,0.15)] transition"
                >
                    <span className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        New chat
                    </span>
                    <span className="text-[0.6rem]">⇧N</span>
                </button>
                <SidebarButton
                    active={view === 'analytics'}
                    label="Analytics"
                    badge={view === 'analytics' ? 'Active' : ''}
                    onClick={() => onChangeView('analytics')}
                />
                <button
                    onClick={onAddKey}
                    className="hover-lift flex items-center justify-between rounded-2xl border border-dashed border-[#c4b5fd] bg-[#f7f3ff] px-4 py-2 text-sm text-[#553c9a] transition hover:border-[#a855f7] hover:bg-[#f2e9ff]"
                >
                    <span>Add key</span>
                    <span className="text-[0.6rem]">+</span>
                </button>
            </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-gray-500">
                <p>Chat history</p>
                <span className="text-[0.6rem] text-gray-400">{sessions.length} threads</span>
            </div>
            <div className="flex-1 overflow-y-auto rounded-2xl border border-gray-200 bg-white/70 p-3 shadow-inner">
                <div className="space-y-2">
                    {sessions.map(session => (
                        <div
                            key={session.id}
                            onClick={() => onSelectSession(session.id)}
                            className={`hover-lift group flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-sm transition ${
                                activeSession === session.id
                                    ? 'border-transparent bg-gradient-to-r from-[#4338ca] to-[#6d28d9] text-white shadow-lg shadow-purple-600/40'
                                    : 'border-gray-200 bg-white text-gray-800 hover:border-[#c4b5fd] hover:bg-[#f8f7ff]'
                            }`}
                        >
                            <div className="flex-1 overflow-hidden">
                                <p className={`truncate font-semibold ${activeSession === session.id ? 'text-white' : 'text-gray-900'}`}>
                                    {session.title}
                                </p>
                                <p className={`text-xs ${activeSession === session.id ? 'text-gray-100' : 'text-gray-500'}`}>
                                    {session.provider} · {session.model}
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSession(session.id);
                                }}
                                className={`rounded-full p-2 text-xs transition ${
                                    activeSession === session.id
                                        ? 'text-white hover:bg-white/20'
                                        : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'
                                }`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                    {sessions.length === 0 && (
                        <p className="text-xs text-gray-500">No chats yet. Start a new one.</p>
                    )}
                </div>
            </div>
        </div>
    </aside>
);

const SidebarButton = ({
    active,
    label,
    icon,
    badge,
    onClick,
}: {
    active: boolean;
    label: string;
    icon?: ReactNode;
    badge?: string;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-between rounded-2xl px-4 py-2 text-sm transition ${
            active
                ? 'btn-accent hover-lift shadow-lg shadow-purple-500/30'
                : 'border border-gray-200 bg-gray-100 text-gray-700 hover:border-[#c7d2fe] hover:bg-[#fbfbff]'
        }`}
    >
        <span className="flex items-center gap-2">
            {icon}
            {label}
        </span>
        <span className={`text-[0.6rem] ${active ? 'text-white/80' : 'text-gray-500'}`}>{badge}</span>
    </button>
);

export default Sidebar;
