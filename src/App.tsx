import { useState, useEffect, useRef, useMemo, type KeyboardEvent } from 'react';
import Sidebar from './components/Sidebar';
import KeyStudio from './components/KeyStudio';
import AnalyticsPanel from './components/AnalyticsPanel';
import ChatPanel from './components/ChatPanel';
import AddKeyModal from './components/AddKeyModal';
import type { ApiKey, ProviderOption, ChatSession, Message, AnalyticsData, ChatPreset } from './types';

const API_URL = 'http://localhost:5000/api';

const MODELS: Record<ProviderOption, string[]> = {
    openai: ['gpt-5-mini', 'GPT-5', 'gpt-4o'],
    grok: ['grok-4-fast-reasoning', 'grok-4'],
    claude: ['claude-3.5-sonic', 'claude-3.5-pro'],
    google: ['models/chat-bison-001']
};

const CHAT_PRESETS: ChatPreset[] = [
    {
        id: 'brainstorm-lite',
        label: 'Brainstorm',
        description: 'Friendly collaborator that keeps answers short.',
        provider: 'openai',
        model: 'gpt-5-mini',
        systemPrompt: 'You are a cooperative brainstorming partner. Provide concise, high-signal ideas and ask clarifying questions when needed.',
    },
    {
        id: 'debug-sage',
        label: 'Debug',
        description: 'Code-focused with detailed reasoning.',
        provider: 'claude',
        model: 'claude-3.5-pro',
        systemPrompt: 'You are an expert software engineer. Explain bugs methodically and offer minimal, actionable fixes.',
    },
    {
        id: 'rapid-qa',
        label: 'Rapid QA',
        description: 'Fast answers for quick fact checks.',
        provider: 'grok',
        model: 'grok-4-fast-reasoning',
        systemPrompt: 'You answer questions rapidly with bullet summaries and cite assumptions explicitly.',
    },
];

interface AnalyticsSnapshot {
    todayTokens: number;
    sevenDayAverageTokens: number;
    todayCost: number;
    sevenDayAverageCost: number;
    generatedAt: string;
}

const SNAPSHOT_STORAGE_KEY = 'analyticsSnapshotCache';

const DAILY_VOLUME_MAX = 1_000_000;
const DAILY_VOLUME_TICKS = [1_000_000, 100_000, 10_000, 1_000];

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
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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
                        presetId: session.presetId ?? null,
                        systemPrompt: session.systemPrompt ?? '',
                        tokenSoftLimit: session.tokenSoftLimit ?? null,
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
            title: 'New Chat',
            messages: [],
            provider: validKey.provider,
            model: MODELS[validKey.provider][0],
            presetId: null,
            systemPrompt: '',
            tokenSoftLimit: null
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

    const handleApplyPreset = (sessionId: string, presetId: string) => {
        const preset = CHAT_PRESETS.find(item => item.id === presetId);
        if (!preset) return;
        const hasProvider = apiKeys.some(key => key.provider === preset.provider && key.is_valid === 1);
        if (!hasProvider) {
            alert('No validated key for that preset provider yet.');
            return;
        }
        handleUpdateSession(sessionId, session => ({
            ...session,
            provider: preset.provider,
            model: preset.model,
            systemPrompt: preset.systemPrompt,
            presetId: preset.id,
        }));
    };

    const handleSoftLimitChange = (sessionId: string, limit: number | null) => {
        handleUpdateSession(sessionId, session => ({
            ...session,
            tokenSoftLimit: limit,
        }));
    };

    const sendMessage = async () => {
        if (!input.trim() || !activeSession || isLoading) return;
        const session = sessions.find(s => s.id === activeSession);
        if (!session) return;
        const validKey = apiKeys.find(k => k.provider === session.provider && k.is_valid === 1);
        if (!validKey) {
            alert('No valid API key for this provider');
            return;
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

    const validatedKeysCount = apiKeys.filter(key => key.is_valid === 1).length;
    const totalTokensUsed = apiKeys.reduce(
        (sum, key) => sum + (key.total_prompt_tokens ?? 0) + (key.total_completion_tokens ?? 0),
        0
    );

    const providerMaxCost = analyticsData?.usageByProvider?.length
        ? Math.max(...analyticsData.usageByProvider.map(item => item.cost), 1)
        : 1;
    const providerMaxTokens = analyticsData?.usageByProvider?.length
        ? Math.max(...analyticsData.usageByProvider.map(item => item.promptTokens + item.completionTokens), 1)
        : 1;

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

    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-[#f9fafc] via-[#eef1f7] to-[#e3e8f2] text-gray-900">
            <div className="flex min-h-[calc(100vh-3rem)] w-full flex-col gap-6 px-4 py-4 lg:flex-row">
                <Sidebar
                    view={view}
                    onChangeView={setView}
                    onNewChat={createSession}
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
                />

                <section className="flex w-full flex-1 flex-col gap-5 lg:min-h-[calc(100vh-3rem)]">
                    {view === 'keys' && (
                        <KeyStudio
                            apiKeys={apiKeys}
                            onTestKey={testKey}
                            onDeleteKey={deleteKey}
                            onShowAddKey={() => setShowAddKey(true)}
                            onUpdateKeyMeta={updateKeyMeta}
                        />
                    )}

                    {view === 'analytics' && (
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
                            providerMaxCost={providerMaxCost}
                            providerMaxTokens={providerMaxTokens}
                            dailyVolumeMax={DAILY_VOLUME_MAX}
                            dailyVolumeTicks={DAILY_VOLUME_TICKS}
                            snapshot={analyticsSnapshot}
                        />
                    )}

                    {view === 'chat' && (
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
                            presets={CHAT_PRESETS}
                            onApplyPreset={handleApplyPreset}
                            onSoftLimitChange={handleSoftLimitChange}
                            pendingInputTokens={input.length}
                        />
                    )}
                </section>
            </div>

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
