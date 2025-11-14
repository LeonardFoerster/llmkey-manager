import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import Sidebar from './components/Sidebar';
import KeyStudio from './features/keys/KeyStudio';
import AnalyticsPanel from './features/analytics/AnalyticsPanel';
import ChatPanel from './features/chat/ChatPanel';
import AddKeyModal from './features/keys/AddKeyModal';
import PlexusBackground from './components/PlexusBackground';
import BackgroundBeamsLayer from './components/BackgroundBeamsLayer';
import type { ApiKey, ProviderOption, ChatSession, Message, AnalyticsData } from './types';
import LLMMapOverlay from './features/map/MapOverlay';
import ToastStack from './components/ToastStack';
import type { MapResultEntry } from './types/map';
import { useToastQueue } from './hooks/useToastQueue';
import { usePinnedList } from './hooks/usePinnedList';
import { analyticsService, chatService, keyService, type NewKeyPayload } from './services/api';

const MODELS: Record<ProviderOption, string[]> = {
    openai: ['gpt-5-mini'],
    grok: ['grok-4-fast-reasoning'],
    claude: ['claude-4.5-haiku'],
    google: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest']
};

interface AnalyticsSnapshot {
    todayTokens: number;
    sevenDayAverageTokens: number;
    todayCost: number;
    sevenDayAverageCost: number;
    generatedAt: string;
}

type MapResultStatus = 'pending' | 'success' | 'error';

const SNAPSHOT_STORAGE_KEY = 'analyticsSnapshotCache';

type NewKeyFormState = {
    provider: ProviderOption;
    key_name: string;
    api_key: string;
    max_tokens_per_answer: number;
    usage_note: string;
    token_budget: number | '';
};

const defaultNewKey: NewKeyFormState = {
    provider: 'openai',
    key_name: '',
    api_key: '',
    max_tokens_per_answer: 12288,
    usage_note: '',
    token_budget: '',
};

export default function LLMKeyManager() {
    const [view, setView] = useState<'keys' | 'chat' | 'analytics'>('keys');
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [showAddKey, setShowAddKey] = useState(false);
    const [newKey, setNewKey] = useState<NewKeyFormState>(defaultNewKey);
    const [costMode, setCostMode] = useState<'auto' | 'manual'>('auto');
    const [manualRates, setManualRates] = useState<{ prompt: number; completion: number }>({
        prompt: 5,
        completion: 15
    });
    const [showCostSettings, setShowCostSettings] = useState(false);
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [analyticsSnapshot, setAnalyticsSnapshot] = useState<AnalyticsSnapshot | null>(() => {
        if (typeof window === 'undefined') return null;
        try {
            const cached = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
            return cached ? (JSON.parse(cached) as AnalyticsSnapshot) : null;
        } catch {
            return null;
        }
    });
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [mapResults, setMapResults] = useState<MapResultEntry[]>([]);
    const [mapUnifiedResult, setMapUnifiedResult] = useState<MapResultEntry | null>(null);
    const [mapPrompt, setMapPrompt] = useState('');
    const [isMapLoading, setIsMapLoading] = useState(false);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const { toasts, addToast, removeToast } = useToastQueue();
    const {
        list: pinnedSessions,
        toggle: togglePinnedSessionRaw,
        replace: replacePinnedSessions,
    } = usePinnedList<string>('pinnedSessions');
    const {
        list: pinnedKeyIds,
        toggle: togglePinnedKeyRaw,
        replace: replacePinnedKeys,
    } = usePinnedList<number>('pinnedKeyIds');
    const [sessionSearch, setSessionSearch] = useState('');
    const [analyticsFocusKey, setAnalyticsFocusKey] = useState<number | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const fetchControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        loadKeys();
        loadSessions();
    }, []);

    useEffect(() => {
        if (view === 'analytics') {
            fetchAnalytics();
        }
    }, [view]);

useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [sessions, activeSession]);

    useEffect(() => {
        if (view !== 'analytics') {
            setAnalyticsFocusKey(null);
        }
    }, [view]);

    useEffect(() => {
        if (isMapLoading || !isMapOpen) return;
        setMapUnifiedResult(prev => {
            const best = selectUnifiedResult(mapResults);
            return best ?? null;
        });
    }, [mapResults, isMapLoading, isMapOpen]);

    const validatedKeys = apiKeys.filter(key => key.is_valid === 1);
    const updateMapResult = (keyId: number, patch: Partial<MapResultEntry> & { status: MapResultStatus }) => {
        setMapResults(prev =>
            prev.map(result => (result.keyId === keyId ? { ...result, ...patch } : result))
        );
    };

    const loadKeys = async () => {
        try {
            const data = await keyService.list();
            setApiKeys(data);
            replacePinnedKeys(prev => prev.filter(id => data.some(key => key.id === id)));
        } catch (error) {
            console.error('Failed to load keys:', error);
        }
    };

    const loadSessions = () => {
        const stored = localStorage.getItem('chatSessions');
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as ChatSession[];
                const normalized = parsed.map(session => ({
                    ...session,
                    keyId: session.keyId ?? null,
                    presetId: session.presetId ?? null,
                    systemPrompt: session.systemPrompt ?? '',
                }));
                setSessions(normalized);
                replacePinnedSessions(prev => prev.filter(id => normalized.some(session => session.id === id)));
            } catch {
                setSessions([]);
                replacePinnedSessions([]);
            }
        } else {
            setSessions([]);
            replacePinnedSessions([]);
        }
    };

    const toggleSessionPin = (id: string) => {
        const isPinned = pinnedSessions.includes(id);
        togglePinnedSessionRaw(id);
        addToast(isPinned ? 'Thread unpinned' : 'Thread pinned for quick access', 'info');
    };

    const toggleKeyPin = (id: number) => {
        const isPinned = pinnedKeyIds.includes(id);
        togglePinnedKeyRaw(id);
        addToast(isPinned ? 'Key removed from favorites' : 'Key pinned for quick access', 'info');
    };

    const focusAnalyticsOnKey = (keyId: number) => {
        setAnalyticsFocusKey(keyId);
        setView('analytics');
        addToast('Focusing analytics on selected key', 'info');
    };

    const saveSessions = (updated: ChatSession[]) => {
        localStorage.setItem('chatSessions', JSON.stringify(updated));
        setSessions(updated);
    };

    const fetchAnalytics = async () => {
        setIsAnalyticsLoading(true);
        setAnalyticsError(null);
        try {
            const data = await analyticsService.fetch();
            setAnalyticsData(data);
            const snapshot = computeSnapshot(data);
            if (snapshot) {
                setAnalyticsSnapshot(snapshot);
                localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
            setAnalyticsError(error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsAnalyticsLoading(false);
        }
    };

    const addKey = async () => {
        try {
            const payload: NewKeyPayload = {
                ...newKey,
                token_budget: newKey.token_budget === '' ? null : Number(newKey.token_budget),
            };
            await keyService.create(payload);
            setShowAddKey(false);
            setNewKey(defaultNewKey);
            addToast('API key stored securely', 'success');
            loadKeys();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to add key', 'error');
        }
    };

    const deleteKey = async (id: number, options?: { skipConfirm?: boolean }) => {
        if (!options?.skipConfirm && !confirm('Delete this key?')) return;
        try {
            await keyService.remove(id);
            addToast('Key removed from registry', 'success');
            loadKeys();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to delete key', 'error');
        }
    };

    const bulkDeleteKeys = async (ids: number[]) => {
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map(id => keyService.remove(id)));
            addToast(`Deleted ${ids.length} key${ids.length === 1 ? '' : 's'}`, 'success');
            loadKeys();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to delete selected keys', 'error');
        }
    };

    const testKey = async (id: number) => {
        try {
            const message = await keyService.test(id);
            addToast(message ?? 'Key validated successfully', 'success');
            loadKeys();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Test failed', 'error');
        }
    };

    const bulkTestKeys = async (ids: number[]) => {
        if (ids.length === 0) return;
        try {
            await Promise.all(ids.map(id => keyService.test(id)));
            addToast(`Triggered ${ids.length} key test${ids.length === 1 ? '' : 's'}`, 'info');
            loadKeys();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to test keys', 'error');
            loadKeys();
        }
    };

    const updateKeyMeta = async (id: number, updates: Partial<{ usage_note: string | null; token_budget: number | null }>) => {
        try {
            await keyService.updateMeta(id, updates);
            addToast('Key details updated', 'success');
            loadKeys();
        } catch (error) {
            addToast(error instanceof Error ? error.message : 'Failed to update key details', 'error');
        }
    };

    const createSession = () => {
        const validKey = apiKeys.find(k => k.is_valid === 1);
        if (!validKey) {
            addToast('Please add and validate an API key first', 'info');
            return;
        }
        const newSession: ChatSession = {
            id: Date.now().toString(),
            keyId: validKey.id,
            title: 'New Chat',
            messages: [],
            provider: validKey.provider,
            model: MODELS[validKey.provider][0],
            presetId: null,
            systemPrompt: '',
        };
        const updated = [...sessions, newSession];
        saveSessions(updated);
        setActiveSession(newSession.id);
        setView('chat');
        addToast('New chat ready', 'success');
    };

    const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };

    const handleUpdateSession = (sessionId: string, updater: (session: ChatSession) => ChatSession) => {
        const updated = sessions.map(session => (session.id === sessionId ? updater(session) : session));
        saveSessions(updated);
    };

    const handleSelectKey = (sessionId: string, keyId: number) => {
        const selected = apiKeys.find(key => key.id === keyId && key.is_valid === 1);
        if (!selected) {
            addToast('Selected key is no longer available. Please validate it again.', 'info');
            return;
        }
        handleUpdateSession(sessionId, session => ({
            ...session,
            keyId: selected.id,
            provider: selected.provider,
            model: MODELS[selected.provider][0],
        }));
    };

    const openMapOverlay = () => {
        if (validatedKeys.length < 2) {
            addToast('Validate at least two keys to launch map mode.', 'info');
            return;
        }
        setIsMapOpen(true);
        setMapResults([]);
        setMapPrompt('');
        setIsMapLoading(false);
    };

    const executeMapFetch = async () => {
        if (validatedKeys.length === 0) {
            addToast('No validated keys available for map mode.', 'info');
            return;
        }
        const prompt = mapPrompt.trim();
        if (!prompt) {
            addToast('Enter a prompt to broadcast.', 'info');
            return;
        }

        const initialResults: MapResultEntry[] = validatedKeys.map(key => ({
            keyId: key.id,
            keyName: key.key_name || 'unnamed_key',
            provider: key.provider,
            model: MODELS[key.provider]?.[0] ?? 'n/a',
            status: 'pending',
        }));
        setMapResults(initialResults);
        setMapUnifiedResult(null);
        setIsMapLoading(true);

        await Promise.all(
            validatedKeys.map(async (key) => {
                const model = MODELS[key.provider]?.[0];
                if (!model) {
                    updateMapResult(key.id, {
                        status: 'error',
                        error: 'No default model configured for provider.',
                    });
                    return;
                }

                const requestMessages: Message[] = [
                    {
                        role: 'user',
                        content: prompt,
                        timestamp: Date.now(),
                    },
                ];

                try {
                    const data = await chatService.send({
                        keyId: key.id,
                        model,
                        messages: requestMessages,
                        maxTokensPerAnswer: key.max_tokens_per_answer ?? undefined,
                    });
                    updateMapResult(key.id, {
                        status: 'success',
                        response: typeof data.content === 'string' ? data.content : JSON.stringify(data),
                    });
                } catch (error) {
                    updateMapResult(key.id, {
                        status: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            })
        );

        setIsMapLoading(false);
    };

    const sendMessage = async () => {
        if (!input.trim() || !activeSession || isLoading) return;
        const session = sessions.find(s => s.id === activeSession);
        if (!session) return;
        const validKey =
            apiKeys.find(k => k.id === session.keyId && k.is_valid === 1) ??
            apiKeys.find(k => k.provider === session.provider && k.is_valid === 1);
        if (!validKey) {
            addToast('No valid API key for this provider', 'info');
            return;
        }

        if (session.keyId !== validKey.id) {
            handleUpdateSession(session.id, current => ({
                ...current,
                keyId: validKey.id,
            }));
        }

        const userMessage: Message = {
            role: 'user',
            content: input,
            timestamp: Date.now()
        };
        const updatedMessages = [...session.messages, userMessage];
        const updatedSession = {
            ...session,
            title: session.messages.length === 0 ? input.slice(0, 50) : session.title,
            messages: updatedMessages
        };
        const updatedSessions = sessions.map(s => (s.id === activeSession ? updatedSession : s));
        saveSessions(updatedSessions);
        setInput('');
        setIsLoading(true);

        fetchControllerRef.current?.abort();
        const controller = new AbortController();
        fetchControllerRef.current = controller;

        try {
        const requestMessages = [
            ...(session.systemPrompt
                ? [{
                    role: 'system' as const,
                    content: session.systemPrompt,
                    timestamp: Date.now()
                }]
                : []),
            ...updatedMessages
        ];

            const data = await chatService.send(
                {
                    keyId: validKey.id,
                    model: session.model,
                    messages: requestMessages,
                    maxTokensPerAnswer: validKey.max_tokens_per_answer ?? undefined,
                },
                controller.signal
            );

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.content,
                timestamp: Date.now()
            };
            const finalMessages = [...updatedMessages, assistantMessage];
            const finalSession = { ...updatedSession, messages: finalMessages };
            const finalSessions = sessions.map(s => (s.id === activeSession ? finalSession : s));
            saveSessions(finalSessions);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            addToast(
                `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'error'
            );
        } finally {
            fetchControllerRef.current = null;
            setIsLoading(false);
        }
    };

    const stopResponse = () => {
        fetchControllerRef.current?.abort();
        fetchControllerRef.current = null;
        setIsLoading(false);
    };

    const deleteSession = (id: string) => {
        if (!confirm('Delete this chat?')) return;
        const updated = sessions.filter(s => s.id !== id);
        saveSessions(updated);
        if (activeSession === id) setActiveSession(null);
        addToast('Chat deleted', 'success');
    };

    const availableProviders = Array.from(new Set(validatedKeys.map(key => key.provider))) as ProviderOption[];
    const validatedKeysCount = validatedKeys.length;
    const totalTokensUsed = apiKeys.reduce(
        (sum, key) => sum + (key.total_prompt_tokens ?? 0) + (key.total_completion_tokens ?? 0),
        0
    );

    const manualTokenTotals = analyticsData?.usageByProvider?.reduce(
        (acc, provider) => {
            acc.prompt += provider.promptTokens;
            acc.completion += provider.completionTokens;
            return acc;
        },
        { prompt: 0, completion: 0 }
    );
    const manualCostEstimate = manualTokenTotals
        ? ((manualTokenTotals.prompt / 1_000_000) * manualRates.prompt) +
          ((manualTokenTotals.completion / 1_000_000) * manualRates.completion)
        : 0;
    const estimatedCostValue = costMode === 'auto' ? analyticsData?.totalCost ?? 0 : manualCostEstimate;
    const currentSession = sessions.find(s => s.id === activeSession) ?? null;

    const handleProviderChange = (provider: ProviderOption) => {
        if (!currentSession) return;
        const keyForProvider = validatedKeys.find(key => key.provider === provider && key.is_valid === 1);
        if (!keyForProvider) {
            addToast('No validated key for selected provider', 'info');
            return;
        }
        handleUpdateSession(currentSession.id, session => ({
            ...session,
            provider,
            model: MODELS[provider][0],
            keyId: keyForProvider.id,
        }));
    };

    return (
        <div className="relative min-h-screen w-full overflow-hidden text-slate-100">
            <PlexusBackground />
            <div className="grid-lights" aria-hidden="true" />
            <div className="lightning-overlay" aria-hidden="true" />
            <BackgroundBeamsLayer />
            <div className="relative z-10 flex min-h-screen w-full flex-col gap-6 px-4 py-8 lg:px-10">
                <header className="panel-shell panel-shell--tight px-6 py-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="pulse-dot flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900/80 to-slate-800/40 text-[0.6rem] font-semibold tracking-[0.35em] text-cyan-200">
                                ops
                            </div>
                            <div className="space-y-1">
                                <p className="text-bracket text-[0.55rem] text-slate-400">nexus</p>
                                <h1 className="text-2xl font-semibold tracking-tight text-white">LLM Control Surface</h1>
                                <p className="text-sm text-slate-400">Grey + blue flight deck for every credential.</p>
                            </div>
                        </div>
                        <div className="grid w-full gap-3 text-sm text-slate-200 sm:grid-cols-2 lg:w-auto lg:grid-cols-4">
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                                <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">validated</p>
                                <p className="mt-1 text-2xl font-semibold text-white">{validatedKeysCount}</p>
                                <p className="text-[0.65rem] text-slate-500">keys ready</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                                <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">tokens</p>
                                <p className="mt-1 text-xl font-semibold text-white">{totalTokensUsed.toLocaleString()}</p>
                                <p className="text-[0.65rem] text-slate-500">lifetime usage</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                                <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">threads</p>
                                <p className="mt-1 text-2xl font-semibold text-white">{sessions.length}</p>
                                <p className="text-[0.65rem] text-slate-500">stored chats</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                                <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">mode</p>
                                <p className="mt-1 text-xl font-semibold capitalize text-white">{view}</p>
                                <p className="text-[0.65rem] text-slate-500">active panel</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 min-h-0 flex-col gap-6 lg:flex-row">
                    <div
                        className={`relative w-full transition-all duration-500 lg:flex-shrink-0 ${
                            isSidebarCollapsed
                                ? 'max-h-0 overflow-hidden opacity-0 lg:-translate-x-full lg:w-0'
                                : 'max-h-[110vh] opacity-100 lg:w-80'
                        }`}
                    >
                        <Sidebar
                            view={view}
                            onChangeView={setView}
                            onNewChat={createSession}
                            onOpenMap={openMapOverlay}
                            onToggleCollapse={() => setIsSidebarCollapsed(true)}
                            onAddKey={() => setShowAddKey(true)}
                            sessions={sessions}
                            activeSession={activeSession}
                            onSelectSession={(id) => {
                                setActiveSession(id);
                                setView('chat');
                            }}
                            onDeleteSession={deleteSession}
                            validatedKeysCount={validatedKeysCount}
                            totalTokensUsed={totalTokensUsed}
                            canLaunchMap={validatedKeys.length >= 2}
                            pinnedSessionIds={pinnedSessions}
                            onTogglePinSession={toggleSessionPin}
                            sessionSearch={sessionSearch}
                            onSessionSearchChange={setSessionSearch}
                            onNotify={addToast}
                        />
                    </div>

                    <section className="flex w-full flex-1 min-h-0 flex-col gap-6">
                        {view === 'keys' && (
                            <div className="flex flex-1 min-h-0">
                                <KeyStudio
                                    apiKeys={apiKeys}
                                    onTestKey={testKey}
                                    onDeleteKey={deleteKey}
                                    onShowAddKey={() => setShowAddKey(true)}
                                    onUpdateKeyMeta={updateKeyMeta}
                                    onBulkDelete={bulkDeleteKeys}
                                    onBulkTest={bulkTestKeys}
                                    pinnedKeys={pinnedKeyIds}
                                    onTogglePinKey={toggleKeyPin}
                                    onFocusKeyAnalytics={focusAnalyticsOnKey}
                                    notify={addToast}
                                />
                            </div>
                        )}

                        {view === 'analytics' && (
                            <div className="flex flex-1 min-h-0">
                                <AnalyticsPanel
                                    analyticsData={analyticsData}
                                    isLoading={isAnalyticsLoading}
                                    error={analyticsError}
                                    costMode={costMode}
                                    manualRates={manualRates}
                                    onManualRateChange={setManualRates}
                                    onCostModeChange={setCostMode}
                                    showCostSettings={showCostSettings}
                                    onToggleCostSettings={() => setShowCostSettings(prev => !prev)}
                                    estimatedCostValue={estimatedCostValue}
                                    snapshot={analyticsSnapshot}
                                    focusKeyId={analyticsFocusKey}
                                    onClearFocus={() => setAnalyticsFocusKey(null)}
                                />
                            </div>
                        )}

                        {view === 'chat' && (
                            <div className="flex flex-1 min-h-0">
                                <ChatPanel
                                    currentSession={currentSession}
                                    modeMap={MODELS}
                                    onUpdateSession={handleUpdateSession}
                                    input={input}
                                    onInputChange={setInput}
                                    onInputKeyDown={handleInputKeyDown}
                                    onSendMessage={sendMessage}
                                    onStopResponse={stopResponse}
                                    isLoading={isLoading}
                                    messagesEndRef={messagesEndRef}
                                    validatedKeys={validatedKeys}
                                    onSelectKey={handleSelectKey}
                                    availableProviders={availableProviders}
                                    onSelectProvider={handleProviderChange}
                                />
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <LLMMapOverlay
                open={isMapOpen}
                prompt={mapPrompt}
                results={mapResults}
                unifiedResult={mapUnifiedResult}
                isLoading={isMapLoading}
                onPromptChange={setMapPrompt}
                onRun={executeMapFetch}
                onClose={() => setIsMapOpen(false)}
            />

            {isSidebarCollapsed && (
                <div
                    className="fixed left-0 top-1/2 z-30 h-28 w-3 -translate-y-1/2 cursor-pointer rounded-r-3xl bg-gradient-to-b from-cyan-400/60 via-sky-500/40 to-transparent shadow-[0_0_35px_rgba(56,189,248,0.45)] transition hover:from-cyan-300/70 hover:via-sky-400/60"
                    onMouseEnter={() => setIsSidebarCollapsed(false)}
                    onClick={() => setIsSidebarCollapsed(false)}
                    aria-hidden
                />
            )}

            <AddKeyModal
                show={showAddKey}
                onClose={() => setShowAddKey(false)}
                onSubmit={addKey}
                newKey={newKey}
                onChange={setNewKey}
                validatedKeysCount={validatedKeysCount}
                totalTokensUsed={totalTokensUsed}
            />
            <ToastStack toasts={toasts} onDismiss={removeToast} />
        </div>
    );
}

function computeSnapshot(data: AnalyticsData | null): AnalyticsSnapshot | null {
    if (!data) return null;
    const usageSeries = data.usageByTime ?? [];
    if (usageSeries.length === 0) {
        return {
            todayTokens: 0,
            sevenDayAverageTokens: 0,
            todayCost: 0,
            sevenDayAverageCost: 0,
            generatedAt: new Date().toISOString()
        };
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayEntry = usageSeries.find(entry => entry.day === todayKey) ?? usageSeries[0];
    const recentEntries = usageSeries.slice(0, 7);
    const avgTokens = recentEntries.length
        ? recentEntries.reduce((sum, entry) => sum + entry.tokens, 0) / recentEntries.length
        : 0;
    const avgCost = recentEntries.length
        ? recentEntries.reduce((sum, entry) => sum + entry.cost, 0) / recentEntries.length
        : 0;

    return {
        todayTokens: todayEntry?.tokens ?? 0,
        sevenDayAverageTokens: avgTokens,
        todayCost: todayEntry?.cost ?? 0,
        sevenDayAverageCost: avgCost,
        generatedAt: new Date().toISOString()
    };
}

function selectUnifiedResult(results: MapResultEntry[]): MapResultEntry | null {
    const successes = results.filter(entry => entry.status === 'success' && entry.response);
    if (successes.length > 0) {
        return successes.reduce((best, entry) => {
            const bestLen = best.response?.length ?? 0;
            const entryLen = entry.response?.length ?? 0;
            return entryLen > bestLen ? entry : best;
        }, successes[0]);
    }
    return results[0] ?? null;
}
