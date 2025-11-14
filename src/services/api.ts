import type { ApiKey, AnalyticsData, Message } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

const handleJson = async <T>(response: Response) => {
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const errorMessage = data?.error ?? `Request failed (${response.status})`;
        throw new Error(errorMessage);
    }
    return data as T;
};

export interface NewKeyPayload {
    provider: ApiKey['provider'];
    key_name: string;
    api_key: string;
    max_tokens_per_answer: number;
    usage_note: string;
    token_budget: number | null;
}

export interface ChatRequestPayload {
    keyId: number;
    model: string;
    messages: Message[];
    maxTokensPerAnswer?: number;
}

export interface ChatResponse {
    content: string;
    [key: string]: unknown;
}

export const keyService = {
    list: async (): Promise<ApiKey[]> => {
        const response = await fetch(`${API_URL}/keys`, { headers: JSON_HEADERS });
        return handleJson<ApiKey[]>(response);
    },
    create: async (payload: NewKeyPayload): Promise<void> => {
        const response = await fetch(`${API_URL}/keys`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify(payload),
        });
        await handleJson(response);
    },
    remove: async (id: number): Promise<void> => {
        const response = await fetch(`${API_URL}/keys/${id}`, {
            method: 'DELETE',
            headers: JSON_HEADERS,
        });
        await handleJson(response);
    },
    test: async (id: number): Promise<string | undefined> => {
        const response = await fetch(`${API_URL}/keys/${id}/test`, {
            method: 'POST',
            headers: JSON_HEADERS,
        });
        const data = await handleJson<{ message?: string }>(response);
        return data?.message;
    },
    updateMeta: async (
        id: number,
        updates: Partial<{ usage_note: string | null; token_budget: number | null }>
    ): Promise<void> => {
        const response = await fetch(`${API_URL}/keys/${id}`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify(updates),
        });
        await handleJson(response);
    },
};

export const analyticsService = {
    fetch: async (): Promise<AnalyticsData> => {
        const response = await fetch(`${API_URL}/analytics`, { headers: JSON_HEADERS });
        return handleJson<AnalyticsData>(response);
    },
};

export const chatService = {
    send: async (payload: ChatRequestPayload, signal?: AbortSignal): Promise<ChatResponse> => {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: JSON_HEADERS,
            body: JSON.stringify({
                keyId: payload.keyId,
                model: payload.model,
                messages: payload.messages,
                maxTokensPerAnswer: payload.maxTokensPerAnswer,
            }),
            signal,
        });
        return handleJson<ChatResponse>(response);
    },
};

export { API_URL };
