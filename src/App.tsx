import { useState, useEffect, useRef, type KeyboardEvent, type AnchorHTMLAttributes, type HTMLAttributes } from 'react';
import { Send, Key, MessageSquare, Trash2, Plus } from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Types
interface ApiKey {
    id: number;
    provider: 'openai' | 'grok';
    key_name: string;
    is_valid: number;
    created_at: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
}


const markdownComponents: Components = {
    a: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
            {...props}
            target="_blank"
            rel="noreferrer"
            className="underline text-blue-300 hover:text-blue-200"
        >
            {children}
        </a>
    ),
    p: ({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
        <p {...props} className={`${className ?? ''} m-0`}>
            {children}
        </p>
    ),
};

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => (
    <div className={className}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
            //linkTarget="_blank"
        >
            {content}
        </ReactMarkdown>
    </div>
);

interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface ChatSession {
    id: string;
    title: string;
    messages: Message[];
    provider: 'openai' | 'grok';
    model: string;
}

const API_URL = 'http://localhost:5000/api';

export default function LLMKeyManager() {
    const [view, setView] = useState<'keys' | 'chat'>('keys');
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [showAddKey, setShowAddKey] = useState(false);
    const [newKey, setNewKey] = useState({ provider: 'openai', key_name: '', api_key: '' });

    // Chat state
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // App.tsx
    const MODELS =
    {
        openai: ['gpt-5-mini', 'GPT-5', 'gpt-4o'], // Deine gewünschten Modelle
        grok: ['grok-4-fast-reasoning', 'grok-4'] // Deine gewünschten Modelle
    };

    useEffect(() => {
        loadKeys();
        loadSessions();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [sessions, activeSession]);

    const headers = () => ({
        'Content-Type': 'application/json'
    });

    const formatTokens = (value?: number) => (value ?? 0).toLocaleString();

    const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    };

    // Key management
    const loadKeys = async () => {
        try {
            const res = await fetch(`${API_URL}/keys`, { headers: headers() });
            const data = await res.json();
            setApiKeys(data);
        } catch (error) {
            console.error('Failed to load keys:', error);
        }
    };

    const addKey = async () =>
    {
        try
        {
            await fetch(`${API_URL}/keys`,
                {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(newKey)
            });
            setShowAddKey(false);
            setNewKey({ provider: 'openai', key_name: '', api_key: '' });
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

    // Chat functions
    const loadSessions = () => {
        const stored = localStorage.getItem('chatSessions');
        if (stored) {
            setSessions(JSON.parse(stored));
        }
    };

    const saveSessions = (newSessions: ChatSession[]) => {
        localStorage.setItem('chatSessions', JSON.stringify(newSessions));
        setSessions(newSessions);
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
            model: MODELS[validKey.provider][0]
        };
        const updated = [...sessions, newSession];
        saveSessions(updated);
        setActiveSession(newSession.id);
        setView('chat');
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
        const updatedSession = { ...session, messages: updatedMessages };

        if (session.messages.length === 0) {
            updatedSession.title = input.slice(0, 50);
        }

        const updatedSessions = sessions.map(s => s.id === activeSession ? updatedSession : s);
        saveSessions(updatedSessions);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    keyId: validKey.id,
                    model: session.model,
                    messages: updatedMessages
                })
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
            const finalSessions = sessions.map(s => s.id === activeSession ? finalSession : s);
            saveSessions(finalSessions);
        } catch (error) {
            alert('Failed to send message: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setIsLoading(false);
        }
    };

    const deleteSession = (id: string) => {
        if (!confirm('Delete this chat?')) return;
        const updated = sessions.filter(s => s.id !== id);
        saveSessions(updated);
        if (activeSession === id) setActiveSession(null);
    };

    const currentSession = sessions.find(s => s.id === activeSession);

    // Main App
    return (
        <div className="h-screen bg-gray-900 flex">
            {/* Sidebar */}
            <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
                <div className="p-4 border-b border-gray-700">
                    <div className="flex items-center gap-2 text-white font-bold text-xl">
                        <MessageSquare className="w-6 h-6 text-blue-500" />
                        LLM Manager
                    </div>
                </div>

                <div className="p-4 space-y-2 flex-1 overflow-y-auto">
                    <button
                        onClick={() => setView('keys')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                            view === 'keys' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                    >
                        <Key className="w-5 h-5" />
                        API Keys
                    </button>

                    <button
                        onClick={createSession}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition"
                    >
                        <Plus className="w-5 h-5" />
                        New Chat
                    </button>

                    <div className="pt-4 space-y-1">
                        {sessions.map(session => (
                            <div
                                key={session.id}
                                onClick={() => {
                                    setActiveSession(session.id);
                                    setView('chat');
                                }}
                                className={`group flex items-center justify-between px-4 py-2 rounded-lg cursor-pointer transition ${
                                    activeSession === session.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                                }`}
                            >
                                <span className="truncate flex-1">{session.title}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSession(session.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 transition"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {view === 'keys' && (
                    <div className="flex-1 overflow-y-auto p-8">
                        <div className="max-w-4xl mx-auto">
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-3xl font-bold text-white">API Keys</h2>
                                <button
                                    onClick={() => setShowAddKey(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                                >
                                    <Plus className="w-5 h-5" />
                                    Add Key
                                </button>
                            </div>

                            <div className="space-y-4">
                                {apiKeys.map(key => (
                                    <div key={key.id} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className={`w-3 h-3 rounded-full ${key.is_valid ? 'bg-green-500' : 'bg-red-500'}`} />
                                                    <h3 className="text-xl font-semibold text-white">{key.key_name}</h3>
                                                </div>
                                                <p className="text-gray-400 capitalize">{key.provider}</p>
                                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/60">
                                                        <p className="text-xs uppercase tracking-wide text-gray-500">Input tokens</p>
                                                        <p className="mt-1 text-2xl font-semibold text-white">{formatTokens(key.total_prompt_tokens)}</p>
                                                    </div>
                                                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/60">
                                                        <p className="text-xs uppercase tracking-wide text-gray-500">Output tokens</p>
                                                        <p className="mt-1 text-2xl font-semibold text-white">{formatTokens(key.total_completion_tokens)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => testKey(key.id)}
                                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                                                >
                                                    Test
                                                </button>
                                                <button
                                                    onClick={() => deleteKey(key.id)}
                                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {apiKeys.length === 0 && (
                                    <div className="text-center py-12 text-gray-500">
                                        No API keys yet. Add one to get started.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {view === 'chat' && currentSession && (
                    <>
                        <div className="border-b border-gray-700 p-4 bg-gray-800">
                            <div className="max-w-4xl mx-auto flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-semibold text-white">{currentSession.title}</h2>
                                    <p className="text-sm text-gray-400 capitalize">{currentSession.provider} - {currentSession.model}</p>
                                </div>
                                <select
                                    value={currentSession.model}
                                    onChange={(e) => {
                                        const updated = sessions.map(s =>
                                            s.id === activeSession ? { ...s, model: e.target.value } : s
                                        );
                                        saveSessions(updated);
                                    }}
                                    className="px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none"
                                >
                                    {MODELS[currentSession.provider].map(model => (
                                        <option key={model} value={model}>{model}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="max-w-4xl mx-auto space-y-6">
                                {currentSession.messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-2xl px-6 py-4 rounded-2xl ${
                                            msg.role === 'user'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-800 text-white border border-gray-700'
                                        }`}>
                                            <MarkdownRenderer
                                                content={msg.content}
                                                className="whitespace-pre-wrap break-words text-white"
                                            />
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-gray-800 text-gray-400 px-6 py-4 rounded-2xl border border-gray-700">
                                            Thinking...
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        <div className="border-t border-gray-700 p-4 bg-gray-800">
                            <div className="max-w-4xl mx-auto space-y-3">
                                <div className="flex gap-4">
                                    <textarea
                                        rows={3}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleInputKeyDown}
                                        placeholder="Type your message..."
                                        disabled={isLoading}
                                        className="flex-1 min-h-[96px] resize-none px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                                    />
                                    <button
                                        onClick={sendMessage}
                                        disabled={isLoading || !input.trim()}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Send className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="rounded-2xl border border-gray-700/80 bg-gray-900/50 px-4 py-3">
                                    <p className="text-xs uppercase tracking-wide text-gray-500">Markdown preview</p>
                                    <div className="mt-2 max-h-40 overflow-y-auto text-sm text-white">
                                        {input.trim() ? (
                                            <MarkdownRenderer
                                                content={input}
                                                className="whitespace-pre-wrap break-words text-white"
                                            />
                                        ) : (
                                            <p className="text-gray-500 m-0">Start typing markdown to preview your message.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {view === 'chat' && !currentSession && (
                    <div className="flex-1 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                            <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-xl">Select a chat or create a new one</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Key Modal */}
            {showAddKey && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700">
                        <h3 className="text-2xl font-bold text-white mb-6">Add API Key</h3>
                        <div className="space-y-4">
                            <select
                                value={newKey.provider}
                                onChange={(e) => setNewKey({ ...newKey, provider: e.target.value as 'openai' | 'grok' })}
                                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none"
                            >
                                <option value="openai">OpenAI</option>
                                <option value="grok">Grok (xAI)</option>
                            </select>
                            <input
                                type="text"
                                placeholder="Key Name"
                                value={newKey.key_name}
                                onChange={(e) => setNewKey({ ...newKey, key_name: e.target.value })}
                                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none"
                            />
                            <input
                                type="password"
                                placeholder="API Key"
                                value={newKey.api_key}
                                onChange={(e) => setNewKey({ ...newKey, api_key: e.target.value })}
                                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none"
                            />
                            <div className="flex gap-3">
                                <button
                                    onClick={addKey}
                                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                                >
                                    Add Key
                                </button>
                                <button
                                    onClick={() => setShowAddKey(false)}
                                    className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
