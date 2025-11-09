export const formatTokens = (value?: number) => (value ?? 0).toLocaleString();

export const formatCurrency = (value: number, decimals = 2) => `$${value.toFixed(decimals)}`;
