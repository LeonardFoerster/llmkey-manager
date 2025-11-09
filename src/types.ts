export type ProviderOption = 'openai' | 'grok' | 'claude' | 'google';

export interface ApiKey {
    id: number;
    provider: ProviderOption;
    key_name: string;
    is_valid: number;
    created_at: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    max_tokens_per_answer?: number;
    usage_note?: string | null;
    token_budget?: number | null;
    key_fingerprint?: string | null;
    last_validated_at?: string | null;
}

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: Message[];
    provider: ProviderOption;
    model: string;
    presetId?: string | null;
    systemPrompt?: string;
    tokenSoftLimit?: number | null;
}

export interface ChatPreset {
    id: string;
    label: string;
    description: string;
    provider: ProviderOption;
    model: string;
    systemPrompt: string;
}

export interface AnalyticsData {
    totalTokens: number;
    totalCost: number;
    usageByProvider: Array<{
        provider: ProviderOption;
        promptTokens: number;
        completionTokens: number;
        cost: number;
    }>;
    usageByModel: Array<{
        provider: ProviderOption;
        model: string;
        promptTokens: number;
        completionTokens: number;
        cost: number;
    }>;
    usageByTime: Array<{
        day: string;
        tokens: number;
        cost: number;
    }>;
    lastUpdated: string;
}
