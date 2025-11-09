import type { Message } from '../types';

export const estimateTokensFromMessages = (messages: Message[]) => {
    if (!Array.isArray(messages)) return 0;
    return messages.reduce((sum, msg) => {
        if (!msg?.content) return sum;
        return sum + Math.ceil(msg.content.length / 4);
    }, 0);
};
