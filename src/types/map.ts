import type { ProviderOption } from '../types';

export interface MapResultEntry {
    keyId: number;
    keyName: string;
    provider: ProviderOption;
    model: string;
    status: 'pending' | 'success' | 'error';
    response?: string;
    error?: string;
}
