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
import type { MapResultEntry } from './types/map';

const API_URL = 'http://localhost:5000/api';

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

    const headers = () => ({
        'Content-Type': 'application/json'
    });

    const loadKeys = async () => {
        try {
            const res = await fetch(`${API_URL}/keys`, { headers: headers() });
            const data = await res.json();
            setApiKeys(data);
        } catch (error) {
            console.error('Failed to load keys:', error);
        }
    };

    const loadSessions = () => {
        const stored = localStorage.getItem('chatSessions');
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as ChatSession[];
                setSessions(
                    parsed.map(session => ({
                        ...session,
                        keyId: session.keyId ?? null,
                        presetId: session.presetId ?? null,
                        systemPrompt: session.systemPrompt ?? '',
                    }))
                );
            } catch {
                setSessions([]);
            }
        }
    };

    const saveSessions = (updated: ChatSession[]) => {
        localStorage.setItem('chatSessions', JSON.stringify(updated));
        setSessions(updated);
    };

    const fetchAnalytics = async () => {
        setIsAnalyticsLoading(true);
        setAnalyticsError(null);
        try {
            const res = await fetch(`${API_URL}/analytics`, { headers: headers() });
            if (!res.ok) throw new Error(`Stats request failed (${res.status})`);
            const data: AnalyticsData = await res.json();
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
            const payload = {
                ...newKey,
                token_budget: newKey.token_budget === '' ? null : Number(newKey.token_budget),
            };
            await fetch(`${API_URL}/keys`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload)
            });
            setShowAddKey(false);
            setNewKey(defaultNewKey);
            loadKeys();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            alert('Failed to add key');
        }
    };

    const deleteKey = async (id: number) => {
        if (!confirm('Delete this key?')) return;
        try {
            await fetch(`${API_URL}/keys/${id}`, {
                method: 'DELETE',
                headers: headers()
            });
            loadKeys();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            alert('Failed to delete key');
        }
    };

    const testKey = async (id: number) => {
        try {
            const res = await fetch(`${API_URL}/keys/${id}/test`, {
                method: 'POST',
                headers: headers()
            });
            const data = await res.json();
            alert(data.message);
            loadKeys();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            alert('Test failed');
        }
    };

    const updateKeyMeta = async (id: number, updates: Partial<{ usage_note: string | null; token_budget: number | null }>) => {
        try {
            await fetch(`${API_URL}/keys/${id}`, {
                method: 'PATCH',
                headers: headers(),
                body: JSON.stringify(updates)
            });
            loadKeys();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            alert('Failed to update key details');
        }
    };

    const createSession = () => {
        const validKey = apiKeys.find(k => k.is_valid === 1);
        if (!validKey) {
            alert('Please add and validate an API key first');
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
            alert('Selected key is no longer available. Please validate it again.');
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
            alert('Validate at least two keys to launch map mode.');
            return;
        }
        setIsMapOpen(true);
        setMapResults([]);
        setMapPrompt('');
        setIsMapLoading(false);
    };

    const executeMapFetch = async () => {
        if (validatedKeys.length === 0) {
            alert('No validated keys available for map mode.');
            return;
        }
        const prompt = mapPrompt.trim();
        if (!prompt) {
            alert('Enter a prompt to broadcast.');
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
                    const res = await fetch(`${API_URL}/chat`, {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({
                            keyId: key.id,
                            model,
                            messages: requestMessages,
                            maxTokensPerAnswer: key.max_tokens_per_answer ?? undefined,
                        }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error ?? 'Map fetch failed');
                    }
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
            alert('No valid API key for this provider');
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

            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    keyId: validKey.id,
                    model: session.model,
                    messages: requestMessages,
                    maxTokensPerAnswer: validKey.max_tokens_per_answer ?? undefined
                }),
                signal: controller.signal
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

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
            alert('Failed to send message: ' + (error instanceof Error ? error.message : 'Unknown error'));
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
            alert('No validated key for selected provider');
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
        <div className="relative h-screen w-full overflow-hidden bg-[#0b0d12] text-neutral-100">
            <PlexusBackground />
            <div className="lightning-overlay" aria-hidden="true" />
            <BackgroundBeamsLayer />
            <div className="relative z-10 flex h-full w-full flex-col gap-6 px-4 py-6 lg:px-10">
                <header className="panel-shell panel-shell--tight px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <p className="text-bracket text-[0.6rem] text-neutral-400">NEXUS</p>
                            <p className="text-xs text-neutral-500">LLM control surface</p>
                        </div>
                        <p className="text-xs text-neutral-500">orchestrating LLM credentials</p>
                    </div>
                </header>

                <div className="flex flex-1 min-h-0 flex-col gap-6 lg:flex-row">
                    <div
                        className={`relative w-full transition-all duration-300 lg:flex-shrink-0 ${
                            isSidebarCollapsed
                                ? 'max-h-0 overflow-hidden opacity-0 lg:-translate-x-full lg:w-0'
                                : 'max-h-full opacity-100 lg:w-72'
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
                        />
                    </div>

                    <section className="flex w-full flex-1 min-h-0 flex-col">
                        {view === 'keys' && (
                            <div className="flex flex-1 min-h-0">
                                <KeyStudio
                                    apiKeys={apiKeys}
                                    onTestKey={testKey}
                                    onDeleteKey={deleteKey}
                                    onShowAddKey={() => setShowAddKey(true)}
                                    onUpdateKeyMeta={updateKeyMeta}
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
                className="fixed left-0 top-1/2 z-30 h-24 w-3 -translate-y-1/2 cursor-pointer rounded-r-full bg-cyan-400/25 transition hover:bg-cyan-300/70"
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
