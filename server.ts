// server.ts
import express, { Request, Response } from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? "default-encryption-secret-change-me";
const LOCAL_VAULT_PASSPHRASE = process.env.LOCAL_VAULT_PASSPHRASE ?? ENCRYPTION_SECRET;
const LOCAL_VAULT_SALT = process.env.LOCAL_VAULT_SALT ?? "llmkey-manager-salt";
const PORT = Number.parseInt(process.env.PORT ?? "5000", 10) || 5000;
const allowedOrigins = (process.env.CLIENT_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const DB_PATH = path.join(__dirname, "..", "db.sqlite");

const derivedVaultKey = CryptoJS.PBKDF2(
    LOCAL_VAULT_PASSPHRASE,
    CryptoJS.enc.Utf8.parse(LOCAL_VAULT_SALT),
    { keySize: 256 / 32, iterations: 2500 },
).toString();

const encryptSecret = (value: string) => CryptoJS.AES.encrypt(value, derivedVaultKey).toString();
const decryptSecret = (value: string) =>
    CryptoJS.AES.decrypt(value, derivedVaultKey).toString(CryptoJS.enc.Utf8);
const fingerprintSecret = (value: string) =>
    CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex).slice(0, 16).toUpperCase();

// --- Middleware ---
app.use(
    cors({
        origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    }),
);
app.use(express.json());
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
        return res.status(403).json({ error: "Origin not allowed" });
    }
    next();
});

// --- DB ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("DB Error:", err.message);
    else console.log("DB connected:", DB_PATH);
});

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
    db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      key_name TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      is_valid INTEGER DEFAULT 0 CHECK (is_valid IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
      total_completion_tokens INTEGER NOT NULL DEFAULT 0
    )
  `);

    const ensureColumn = (column: string, definition: string) => {
        db.run(`ALTER TABLE api_keys ADD COLUMN ${column} ${definition}`, (err) => {
            if (err && !/duplicate column name/i.test(err.message ?? "")) {
                console.error(`Failed to add column ${column}:`, err.message);
            }
        });
    };

    ensureColumn("total_prompt_tokens", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("total_completion_tokens", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("usage_note", "TEXT");
    ensureColumn("token_budget", "INTEGER");
    ensureColumn("key_fingerprint", "TEXT");
    ensureColumn("last_validated_at", "DATETIME");

    db.run(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id INTEGER,
      provider TEXT NOT NULL,
      model TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      event_type TEXT DEFAULT 'chat',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(key_id) REFERENCES api_keys(id)
    )
  `);
});

const migrateProviderConstraint = () => {
    db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type='table' AND name='api_keys'", (err, row) => {
        if (err || !row || typeof row.sql !== "string") return;
        if (!row.sql.includes("provider IN")) return;
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");
            db.run("DROP TABLE IF EXISTS api_keys_temp");
            db.run("CREATE TABLE IF NOT EXISTS api_keys_temp (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "provider TEXT NOT NULL," +
                "key_name TEXT NOT NULL," +
                "encrypted_key TEXT NOT NULL," +
                "is_valid INTEGER DEFAULT 0 CHECK (is_valid IN (0,1))," +
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP," +
                "total_prompt_tokens INTEGER NOT NULL DEFAULT 0," +
                "total_completion_tokens INTEGER NOT NULL DEFAULT 0" +
            ")");
            db.run("INSERT INTO api_keys_temp (id, provider, key_name, encrypted_key, is_valid, created_at, total_prompt_tokens, total_completion_tokens) SELECT id, provider, key_name, encrypted_key, is_valid, created_at, total_prompt_tokens, total_completion_tokens FROM api_keys");
            db.run("DROP TABLE api_keys");
            db.run("ALTER TABLE api_keys_temp RENAME TO api_keys");
            db.run("COMMIT");
        });
    });
};

migrateProviderConstraint();

// --- Types ---
type Provider = "openai" | "grok" | "claude" | "google";

interface ApiKeyRow {
    id: number;
    provider: string;
    key_name: string;
    is_valid: number;
    created_at: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    usage_note?: string | null;
    token_budget?: number | null;
    key_fingerprint?: string | null;
    last_validated_at?: string | null;
}

type StatementParams = readonly unknown[];

interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
}

const runStatement = (sql: string, params: StatementParams = []) =>
    new Promise<sqlite3.RunResult>((resolve, reject) => {
        db.run(sql, params, function (this: sqlite3.RunResult, err) {
            if (err) {
                reject(err);
                return;
            }
            resolve(this);
        });
    });

const getStatement = <T>(sql: string, params: StatementParams = []) =>
    new Promise<T | undefined>((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row as T | undefined);
        });
    });

const allStatements = <T>(sql: string, params: StatementParams = []) =>
    new Promise<T[]>((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows as T[]);
        });
    });

const firstValidNumber = (...values: unknown[]): number => {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            return value;
        }
        if (typeof value === "string") {
            const parsed = Number.parseFloat(value);
            if (Number.isFinite(parsed) && parsed >= 0) {
                return parsed;
            }
        }
    }
    return 0;
};

const extractUsageFromPayload = (payload: unknown): TokenUsage => {
    if (!payload || typeof payload !== "object") {
        return { promptTokens: 0, completionTokens: 0 };
    }

    const payloadObj = payload as Record<string, unknown>;
    const usageSource =
        payloadObj["usage"] && typeof payloadObj["usage"] === "object"
            ? (payloadObj["usage"] as Record<string, unknown>)
            : payloadObj;

    const promptTokens = firstValidNumber(
        usageSource["prompt_tokens"],
        usageSource["promptTokens"],
        usageSource["input_tokens"],
        usageSource["inputTokens"],
        usageSource["tokens_in"],
        usageSource["tokensIn"],
    );
    const completionTokens = firstValidNumber(
        usageSource["completion_tokens"],
        usageSource["completionTokens"],
        usageSource["output_tokens"],
        usageSource["outputTokens"],
        usageSource["tokens_out"],
        usageSource["tokensOut"],
        usageSource["generated_tokens"],
        usageSource["generatedTokens"],
    );

    return {
        promptTokens,
        completionTokens,
    };
};

const logUsageEvent = async (keyId: number, provider: Provider, model: string, usage: TokenUsage, eventType: string) => {
    await runStatement(
        "INSERT INTO usage_events (key_id, provider, model, prompt_tokens, completion_tokens, event_type) VALUES (?, ?, ?, ?, ?, ?)",
        [keyId, provider, model, usage.promptTokens ?? 0, usage.completionTokens ?? 0, eventType],
    );
};

const incrementTokenUsage = async (
    keyId: number,
    provider: Provider,
    model: string,
    usage: TokenUsage,
    eventType: "chat" | "test" = "chat",
) => {
    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;

    if (promptTokens === 0 && completionTokens === 0) {
        return;
    }

    await runStatement(
        "UPDATE api_keys SET total_prompt_tokens = total_prompt_tokens + ?, total_completion_tokens = total_completion_tokens + ? WHERE id = ?",
        [promptTokens, completionTokens, keyId],
    );

    await logUsageEvent(keyId, provider, model, usage, eventType);
};

// --- Routes ---
app.get("/api/keys", async (req: Request, res: Response) => {
    try {
        const rows = await allStatements<ApiKeyRow>(
            "SELECT id, provider, key_name, is_valid, created_at, total_prompt_tokens, total_completion_tokens, usage_note, token_budget, key_fingerprint, last_validated_at FROM api_keys ORDER BY created_at DESC",
            [],
        );
        res.json(rows);
    } catch (error) {
        console.error("Failed to load API keys:", error);
        res.status(500).json({ error: "Database error" });
    }
});

app.post("/api/keys", async (req: Request, res: Response) => {
    try {
        const { provider, key_name, api_key, usage_note, token_budget } = req.body as {
            provider?: string;
            key_name?: string;
            api_key?: string;
            usage_note?: string | null;
            token_budget?: number | null;
        };

        const normalizedProvider = provider?.toLowerCase() as Provider | undefined;
        const trimmedName = key_name?.trim();
        const trimmedKey = api_key?.trim();

        if (
            !normalizedProvider ||
            !["openai", "grok", "claude", "google"].includes(normalizedProvider)
        )
            return res.status(400).json({ error: "Invalid provider" });
        if (!trimmedName || !trimmedKey)
            return res.status(400).json({ error: "Name/Key missing" });

        const sanitizedNote = typeof usage_note === "string" ? usage_note.trim().slice(0, 600) : null;
        const tokenBudget = typeof token_budget === "number" && token_budget > 0 ? Math.round(token_budget) : null;

        const encrypted = encryptSecret(trimmedKey);
        const fingerprint = fingerprintSecret(trimmedKey);
        const result = await runStatement(
            "INSERT INTO api_keys (provider, key_name, encrypted_key, usage_note, token_budget, key_fingerprint) VALUES (?, ?, ?, ?, ?, ?)",
            [normalizedProvider, trimmedName, encrypted, sanitizedNote, tokenBudget, fingerprint],
        );
        res.status(201).json({ id: result.lastID });
    } catch (error) {
        console.error("Failed to save API key:", error);
        res.status(500).json({ error: "Database error" });
    }
});

app.delete("/api/keys/:id", async (req: Request, res: Response) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
    }

    try {
        const result = await runStatement(
            "DELETE FROM api_keys WHERE id = ?",
            [id],
        );
        if (result.changes === 0)
            return res.status(404).json({ error: "Not found" });
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to delete API key:", error);
        res.status(500).json({ error: "Database error" });
    }
});

app.patch("/api/keys/:id", async (req: Request, res: Response) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
    }

    try {
        const { usage_note, token_budget } = req.body as {
            usage_note?: string | null;
            token_budget?: number | null;
        };

        const sanitizedNote =
            typeof usage_note === "string"
                ? usage_note.trim().slice(0, 600)
                : usage_note === null
                    ? null
                    : undefined;
        const sanitizedBudget =
            typeof token_budget === "number"
                ? token_budget > 0
                    ? Math.round(token_budget)
                    : null
                : token_budget === null
                    ? null
                    : undefined;

        const updates: string[] = [];
        const params: unknown[] = [];

        if (sanitizedNote !== undefined) {
            updates.push("usage_note = ?");
            params.push(sanitizedNote ?? null);
        }
        if (sanitizedBudget !== undefined) {
            updates.push("token_budget = ?");
            params.push(sanitizedBudget);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: "No valid fields to update" });
        }

        params.push(id);
        const result = await runStatement(
            `UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`,
            params as StatementParams,
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Key not found" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Failed to update API key metadata:", error);
        res.status(500).json({ error: "Database error" });
    }
});

type ProviderClientType = "openai" | "anthropic" | "vertex";

interface ProviderConfig {
    url: string;
    type: ProviderClientType;
    defaultModel: string;
    extraHeaders?: Record<string, string>;
}

const providerRates: Record<Provider, { promptPer1k: number; completionPer1k: number }> = {
    openai: { promptPer1k: 0.03, completionPer1k: 0.06 },
    grok: { promptPer1k: 0.005, completionPer1k: 0.01 },
    claude: { promptPer1k: 0.004, completionPer1k: 0.007 },
    google: { promptPer1k: 0.02, completionPer1k: 0.02 },
};

const keyTestLimiter = new Map<string, { count: number; expiresAt: number }>();

const providerConfig: Record<Provider, ProviderConfig> = {
    openai: {
        url: "https://api.openai.com/v1/chat/completions",
        type: "openai",
        defaultModel: "gpt-5-mini",
    },
    grok: {
        url: "https://api.x.ai/v1/chat/completions",
        type: "openai",
        defaultModel: "grok-4-fast-reasoning",
    },
    claude: {
        url: "https://api.anthropic.com/v1/chat/completions",
        type: "anthropic",
        defaultModel: "claude-3.5-sonic",
        extraHeaders: {
            "Anthropic-Version": "2024-06-11",
        },
    },
    google: {
        url: "https://generativelanguage.googleapis.com/v1beta/models/chat-bison-001:generateMessage",
        type: "vertex",
        defaultModel: "models/chat-bison-001",
    },
};

interface MessageEntry {
    role: "user" | "assistant" | "system";
    content: string;
}

const buildPayload = (config: ProviderConfig, model: string, messages: MessageEntry[]) => {
    switch (config.type) {
        case "anthropic":
        case "openai":
            return {
                model,
                messages,
                temperature: 0.7,
                max_tokens: config.type === "openai" ? 4000 : undefined,
            };
        case "vertex":
            return {
                model,
                messages: messages.map((msg) => ({
                    author: msg.role === "assistant" ? "assistant" : "user",
                    content: [
                        {
                            type: "text",
                            text: msg.role === "system" ? `(system) ${msg.content}` : msg.content,
                        },
                    ],
                })),
                temperature: 0.7,
                max_output_tokens: 1024,
            };
        default:
            return {
                model,
                messages,
                temperature: 0.7,
            };
    }
};

const decodeResponseText = (config: ProviderConfig, data: unknown) => {
    const payload = data as Record<string, unknown>;
    if (config.type === "vertex") {
        const candidates = payload["candidates"];
        if (Array.isArray(candidates) && candidates.length > 0) {
            const firstCandidate = candidates[0] as Record<string, unknown>;
            if (typeof firstCandidate["content"] === "string") {
                return firstCandidate["content"] as string;
            }
        }
        const output = payload["output"];
        if (Array.isArray(output) && output.length > 0) {
            const firstOutput = output[0] as Record<string, unknown>;
            const contentList = firstOutput["content"];
            if (Array.isArray(contentList)) {
                return contentList
                    .map((item) => (typeof item === "object" && item ? (item as Record<string, unknown>)["text"] : undefined))
                    .filter((text): text is string => typeof text === "string")
                    .join("\n")
                    .trim();
            }
        }
    }

    const choices = payload["choices"];
    if (Array.isArray(choices) && choices.length > 0) {
        const firstChoice = choices[0] as Record<string, unknown>;
        const message = firstChoice["message"] as Record<string, unknown> | undefined;
        if (message && typeof message["content"] === "string") {
            return message["content"];
        }
        if (typeof firstChoice["content"] === "string") {
            return firstChoice["content"];
        }
    }

    if (typeof payload["content"] === "string") {
        return payload["content"];
    }

    return "No response";
};

const buildHeaders = (config: ProviderConfig, key: string) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    ...config.extraHeaders,
});

app.post("/api/keys/:id/test", async (req: Request, res: Response) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
    }

    const limiterKey = req.ip ?? "unknown";
    const now = Date.now();
    const existing = keyTestLimiter.get(limiterKey);
    if (!existing || existing.expiresAt <= now) {
        keyTestLimiter.set(limiterKey, { count: 1, expiresAt: now + 60_000 });
    } else if (existing.count >= 5) {
        return res.status(429).json({ error: "Too many key tests. Please wait a minute." });
    } else {
        existing.count += 1;
        keyTestLimiter.set(limiterKey, existing);
    }

    try {
        const row = await getStatement<{ provider: Provider; encrypted_key: string }>(
            "SELECT provider, encrypted_key FROM api_keys WHERE id = ?",
            [id],
        );

        if (!row) return res.status(404).json({ error: "Key not found" });

        const decrypted = decryptSecret(row.encrypted_key);

        if (!decrypted) {
            return res.status(400).json({ error: "Failed to decrypt API key" });
        }

        const config = providerConfig[row.provider];
        if (!config) {
            return res.status(400).json({ error: "Invalid provider" });
        }

        const payload = buildPayload(config, config.defaultModel, [
            { role: "user", content: "Say hello" },
        ]);

        let valid = false;
        let message = "Failed";

        try {
            const response = await fetch(config.url, {
                method: "POST",
                headers: buildHeaders(config, decrypted),
                body: JSON.stringify(payload),
            });

            const responseText = await response.text();
            let responseBody: unknown;
            try {
                responseBody = responseText ? JSON.parse(responseText) : undefined;
            } catch {
                responseBody = undefined;
            }

            valid = response.ok;
            if (!valid) {
                const bodyRecord =
                    responseBody && typeof responseBody === "object"
                        ? (responseBody as Record<string, unknown>)
                        : undefined;
                const errorRecord =
                    bodyRecord?.["error"] && typeof bodyRecord["error"] === "object"
                        ? (bodyRecord["error"] as Record<string, unknown>)
                        : undefined;

                if (errorRecord && typeof errorRecord["message"] === "string") {
                    message = errorRecord["message"] as string;
                } else {
                    message = response.statusText || message;
                }
            } else {
                message = decodeResponseText(config, responseBody ?? {});
                if (!message) {
                    message = "Success!";
                }
                if (responseBody) {
                    incrementTokenUsage(
                        id,
                        row.provider,
                        config.defaultModel,
                        extractUsageFromPayload(responseBody),
                        "test",
                    ).catch((usageError) => {
                        console.error("Failed to store token usage (test):", usageError);
                    });
                }
            }
        } catch (error) {
            console.error("API test failed:", error);
            message = "Network error";
        }

        try {
            await runStatement(
                "UPDATE api_keys SET is_valid = ?, last_validated_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_validated_at END WHERE id = ?",
                [
                    valid ? 1 : 0,
                    valid ? 1 : 0,
                    id,
                ],
            );
        } catch (error) {
            console.error("Failed to update status:", error);
        }

        res.json({ valid, message });
    } catch (error) {
        console.error("API key test failed:", error);
        res.status(500).json({ error: "Database error" });
    }
});

// --- Chat Endpoint with Security Measures ---
app.post("/api/chat", async (req: Request, res: Response) => {
    try {
        const { keyId, model, messages } = req.body as {
            keyId?: number;
            model?: string;
            messages?: Array<{ role: string; content: string }>;
        };

        // Validate input
        if (!keyId || !model || !messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: "Invalid request data" });
        }

        // Sanitize messages
        const sanitizedMessages: MessageEntry[] = messages.map(msg => {
            const role = msg.role === "user" || msg.role === "assistant" || msg.role === "system" ? msg.role : "user";
            return {
                role,
                content: String(msg.content || "").slice(0, 10000), // Limit message length
            };
        });

        if (sanitizedMessages.length > 50) {
            return res.status(400).json({ error: "Too many messages in conversation" });
        }

        // Fetch API key
        const row = await getStatement<{ provider: Provider; encrypted_key: string; is_valid: number }>(
            "SELECT provider, encrypted_key, is_valid FROM api_keys WHERE id = ?",
            [keyId],
        );

        if (!row) {
            return res.status(404).json({ error: "API key not found" });
        }

        if (row.is_valid !== 1) {
            return res.status(400).json({ error: "API key is not validated. Please test it first." });
        }

        // Decrypt API key
        const decrypted = decryptSecret(row.encrypted_key);

        if (!decrypted) {
            return res.status(400).json({ error: "Failed to decrypt API key" });
        }

        // Get provider configuration
        const config = providerConfig[row.provider];
        if (!config) {
            return res.status(400).json({ error: "Invalid provider" });
        }

        // Make API request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            const payload = buildPayload(config, model ?? config.defaultModel, sanitizedMessages);
            const response = await fetch(config.url, {
                method: "POST",
                headers: buildHeaders(config, decrypted),
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
                return res.status(response.status).json({
                    error: errorBody.error?.message || "API request failed"
                });
            }

            const data = await response.json();
            const parsedData = data as Record<string, unknown>;

            const content = decodeResponseText(config, parsedData);

            const usageSource = parsedData["usage"] ?? parsedData;
            incrementTokenUsage(
                keyId,
                row.provider,
                model ?? config.defaultModel,
                extractUsageFromPayload(usageSource),
            ).catch((usageError) => {
                console.error("Failed to store token usage:", usageError);
            });

            res.json({ content });
        } catch (error) {
            clearTimeout(timeout);
            if (error instanceof Error && error.name === "AbortError") {
                return res.status(408).json({ error: "Request timeout" });
            }
            console.error("Chat API error:", error);
            res.status(500).json({ error: "Failed to communicate with AI provider" });
        }
    } catch (error) {
        console.error("Chat endpoint error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

const calculateCost = (provider: Provider, promptTokens: number, completionTokens: number) => {
    const rates = providerRates[provider] ?? { promptPer1k: 0, completionPer1k: 0 };
    return ((promptTokens * rates.promptPer1k) + (completionTokens * rates.completionPer1k)) / 1000;
};

app.get("/api/analytics", async (_req: Request, res: Response) => {
    try {
        const usageByModelRows = await allStatements<{
            provider: Provider;
            model: string;
            prompt_sum: number;
            completion_sum: number;
        }>(
            `SELECT provider, COALESCE(model, 'unknown') as model, SUM(prompt_tokens) as prompt_sum, SUM(completion_tokens) as completion_sum
             FROM usage_events
             GROUP BY provider, model
             ORDER BY SUM(prompt_tokens + completion_tokens) DESC`,
        );

        const totalTokensRow = await allStatements<{
            total_prompt: number;
            total_completion: number;
        }>(
            `SELECT SUM(prompt_tokens) as total_prompt, SUM(completion_tokens) as total_completion FROM usage_events`,
        );

        const usageByTimeRows = await allStatements<{
            day: string;
            tokens: number;
            prompt_sum: number;
            completion_sum: number;
        }>(
            `SELECT DATE(timestamp) as day, SUM(prompt_tokens + completion_tokens) as tokens, SUM(prompt_tokens) as prompt_sum, SUM(completion_tokens) as completion_sum
             FROM usage_events
             GROUP BY day
             ORDER BY day DESC
             LIMIT 31`,
        );

        const usageByProviderRows = await allStatements<{
            provider: Provider;
            prompt_sum: number;
            completion_sum: number;
        }>(
            `SELECT provider, SUM(prompt_tokens) as prompt_sum, SUM(completion_tokens) as completion_sum
             FROM usage_events
             GROUP BY provider`,
        );

        const usageByModel = usageByModelRows.map(row => ({
            provider: row.provider,
            model: row.model,
            promptTokens: row.prompt_sum,
            completionTokens: row.completion_sum,
            cost: calculateCost(row.provider, row.prompt_sum, row.completion_sum),
        }));

        const usageByProvider = usageByProviderRows.map(row => ({
            provider: row.provider,
            promptTokens: row.prompt_sum,
            completionTokens: row.completion_sum,
            cost: calculateCost(row.provider, row.prompt_sum, row.completion_sum),
        }));

        const usageByTime = usageByTimeRows.map(row => ({
            day: row.day,
            tokens: row.tokens,
            cost: calculateCost("openai", row.prompt_sum, row.completion_sum),
        }));

        const totalPrompt = totalTokensRow[0]?.total_prompt ?? 0;
        const totalCompletion = totalTokensRow[0]?.total_completion ?? 0;
        const totalTokens = totalPrompt + totalCompletion;
        const totalCost = usageByProvider.reduce((sum, entry) => sum + entry.cost, 0);

        const response = {
            totalTokens,
            totalCost,
            usageByProvider,
            usageByModel,
            usageByTime,
            lastUpdated: new Date().toLocaleString(),
        };

        res.json(response);
    } catch (error) {
        console.error("Failed to load analytics:", error);
        res.status(500).json({ error: "Failed to load analytics" });
    }
});

// --- Start ---
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
