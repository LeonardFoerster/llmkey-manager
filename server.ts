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
const normalizeEncryptedValue = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    if (Buffer.isBuffer(value)) return value.toString("utf8");
    if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
    if (typeof value === "object" && "toString" in (value as Record<string, unknown>)) {
        try {
            const text = (value as { toString: () => string }).toString();
            return text || undefined;
        } catch {
            return undefined;
        }
    }
    return undefined;
};

const MAX_TOKEN_LIMIT = 128_000;
const sanitizeMaxTokensValue = (value: unknown): number | null => {
    if (typeof value !== "number") return null;
    const coerced = Math.floor(value);
    if (!Number.isFinite(coerced) || coerced <= 0) return null;
    return Math.min(coerced, MAX_TOKEN_LIMIT);
};

const PLAINTEXT_KEY_PATTERNS = [
    /^sk-[A-Za-z0-9]{20,}/,
    /^gsk_[A-Za-z0-9]{20,}/,
    /^gpta_[A-Za-z0-9]{20,}/,
    /^xai-[A-Za-z0-9-]{10,}/,
    /^[A-Za-z0-9_\-]{32,}$/,
];

const looksLikePlaintextKey = (value: string) =>
    PLAINTEXT_KEY_PATTERNS.some((pattern) => pattern.test(value));

const parseLegacyVaultSecrets = () => {
    const raw = process.env.LEGACY_VAULT_SECRETS;
    if (!raw) return [];
    const trimmed = raw.trim();
    if (!trimmed) return [];

    type LegacyEntry = { passphrase: string; salt?: string };
    const entries: LegacyEntry[] = [];

    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (item && typeof item.passphrase === "string") {
                        entries.push({
                            passphrase: item.passphrase,
                            salt: typeof item.salt === "string" ? item.salt : undefined,
                        });
                    }
                }
                return entries;
            }
        } catch (error) {
            console.warn("Failed to parse LEGACY_VAULT_SECRETS JSON:", error);
        }
    }

    for (const part of trimmed.split(",")) {
        const token = part.trim();
        if (!token) continue;
        const [passphrase, salt] = token.split("|").map((piece) => piece.trim());
        if (!passphrase) continue;
        entries.push({ passphrase, salt: salt || undefined });
    }

    return entries;
};

interface VaultPassphraseCandidate {
    label: string;
    passphrase: string;
    requiresRotation: boolean;
}

const legacyVaultSecrets = parseLegacyVaultSecrets();
const legacyDerivedCandidates: VaultPassphraseCandidate[] = legacyVaultSecrets.map((entry, index) => ({
    label: `legacy_pbkdf2_${index + 1}`,
    passphrase: CryptoJS.PBKDF2(
        entry.passphrase,
        CryptoJS.enc.Utf8.parse(entry.salt ?? LOCAL_VAULT_SALT),
        { keySize: 256 / 32, iterations: 2500 },
    ).toString(),
    requiresRotation: true,
}));

const legacyRawPassphraseCandidates: VaultPassphraseCandidate[] = legacyVaultSecrets.map((entry, index) => ({
    label: `legacy_raw_${index + 1}`,
    passphrase: entry.passphrase,
    requiresRotation: true,
}));

const vaultPassphraseCandidates: VaultPassphraseCandidate[] = [
    { label: "primary_pbkdf2", passphrase: derivedVaultKey, requiresRotation: false },
    { label: "primary_raw", passphrase: LOCAL_VAULT_PASSPHRASE, requiresRotation: true },
    ...(ENCRYPTION_SECRET && ENCRYPTION_SECRET !== LOCAL_VAULT_PASSPHRASE
        ? [{ label: "primary_env", passphrase: ENCRYPTION_SECRET, requiresRotation: true }]
        : []),
    ...legacyDerivedCandidates,
    ...legacyRawPassphraseCandidates,
];

const tryDecryptValue = (cipherText: string, passphrase: string) => {
    try {
        const result = CryptoJS.AES.decrypt(cipherText, passphrase).toString(CryptoJS.enc.Utf8);
        if (result) return result;
    } catch {
        // ignore
    }
    return "";
};

const tryDecryptAsCipherParams = (cipherText: string, format: "base64" | "hex", passphrase: string) => {
    try {
        const ciphertextWordArray =
            format === "base64"
                ? CryptoJS.enc.Base64.parse(cipherText)
                : CryptoJS.enc.Hex.parse(cipherText);
        const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWordArray });
        const result = CryptoJS.AES.decrypt(cipherParams, passphrase).toString(CryptoJS.enc.Utf8);
        return result || "";
    } catch {
        return "";
    }
};

const tryDecryptJsonEnvelope = (cipherText: string, passphrase: string) => {
    try {
        const parsed = JSON.parse(cipherText) as {
            ct?: string;
            ciphertext?: string;
            iv?: string;
            salt?: string;
            s?: string;
        };
        const ct = parsed.ct ?? parsed.ciphertext;
        if (!ct) return "";
        const ciphertext = /^[0-9a-f]+$/i.test(ct)
            ? CryptoJS.enc.Hex.parse(ct)
            : CryptoJS.enc.Base64.parse(ct);
        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext,
            iv: parsed.iv ? CryptoJS.enc.Hex.parse(parsed.iv) : undefined,
            salt: parsed.s
                ? CryptoJS.enc.Hex.parse(parsed.s)
                : parsed.salt
                    ? CryptoJS.enc.Hex.parse(parsed.salt)
                    : undefined,
        });
        const result = CryptoJS.AES.decrypt(cipherParams, passphrase).toString(CryptoJS.enc.Utf8);
        return result || "";
    } catch {
        return "";
    }
};

const decryptWithPassphrase = (cipherText: string, passphrase: string) => {
    const attempts = [
        () => tryDecryptValue(cipherText, passphrase),
        () => (cipherText.trim().startsWith("{") ? tryDecryptJsonEnvelope(cipherText, passphrase) : ""),
        () => (/^[0-9a-f]+$/i.test(cipherText) ? tryDecryptAsCipherParams(cipherText, "hex", passphrase) : ""),
        () => (/^[A-Za-z0-9+/=]+$/.test(cipherText) ? tryDecryptAsCipherParams(cipherText, "base64", passphrase) : ""),
    ];

    for (const attempt of attempts) {
        const result = attempt();
        if (result) {
            return result;
        }
    }
    return "";
};

const decryptStoredKey = async (params: { id: number; encrypted: string | Buffer; fingerprint?: string | null }) => {
    const cipherText = normalizeEncryptedValue(params.encrypted)?.trim();
    if (!cipherText) return null;

    for (const candidate of vaultPassphraseCandidates) {
        const plaintext = decryptWithPassphrase(cipherText, candidate.passphrase);
        if (!plaintext) {
            continue;
        }

        if (params.fingerprint) {
            const computed = fingerprintSecret(plaintext);
            if (computed !== params.fingerprint) {
                continue;
            }
        }

        if (candidate.requiresRotation) {
            try {
                const encrypted = encryptSecret(plaintext);
                const fingerprint = params.fingerprint ?? fingerprintSecret(plaintext);
                await runStatement(
                    "UPDATE api_keys SET encrypted_key = ?, key_fingerprint = ? WHERE id = ?",
                    [encrypted, fingerprint, params.id],
                );
                console.info(`Re-encrypted API key ${params.id} with primary vault secret.`);
            } catch (error) {
                console.error(`Failed to re-encrypt API key ${params.id}:`, error);
            }
        }

        return plaintext;
    }

    if (looksLikePlaintextKey(cipherText)) {
        if (params.fingerprint && fingerprintSecret(cipherText) !== params.fingerprint) {
            console.error(`Detected plaintext key for ${params.id} but fingerprint mismatch.`);
            return null;
        }
        try {
            const encrypted = encryptSecret(cipherText);
            const fingerprint = params.fingerprint ?? fingerprintSecret(cipherText);
            await runStatement(
                "UPDATE api_keys SET encrypted_key = ?, key_fingerprint = ? WHERE id = ?",
                [encrypted, fingerprint, params.id],
            );
            console.warn(`Plaintext key detected for ${params.id}; re-encrypted with current vault secret.`);
        } catch (error) {
            console.error(`Failed to re-encrypt plaintext key ${params.id}:`, error);
        }
        return cipherText;
    }

    console.error(`Unable to decrypt API key ${params.id}: incompatible vault secret or corrupted data.`);
    return null;
};
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
    ensureColumn("max_tokens_per_answer", "INTEGER");
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
      latency_ms INTEGER,
      status TEXT DEFAULT 'success',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(key_id) REFERENCES api_keys(id)
    )
  `);

    const ensureUsageColumn = (column: string, definition: string) => {
        db.run(`ALTER TABLE usage_events ADD COLUMN ${column} ${definition}`, (err) => {
            if (err && !/duplicate column name/i.test(err.message ?? "")) {
                console.error(`Failed to add usage_events column ${column}:`, err.message);
            }
        });
    };

    ensureUsageColumn("latency_ms", "INTEGER");
    ensureUsageColumn("status", "TEXT DEFAULT 'success'");
    db.run("UPDATE usage_events SET status = 'success' WHERE status IS NULL", () => {});
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
    max_tokens_per_answer?: number | null;
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

const parseJsonSafely = (text: string): Record<string, unknown> | undefined => {
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text) as Record<string, unknown>;
    } catch {
        return undefined;
    }
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

const logUsageEvent = async (
    keyId: number,
    provider: Provider,
    model: string,
    usage: TokenUsage,
    eventType: string,
    latencyMs?: number | null,
    status: "success" | "error" = "success",
) => {
    await runStatement(
        "INSERT INTO usage_events (key_id, provider, model, prompt_tokens, completion_tokens, event_type, latency_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [keyId, provider, model, usage.promptTokens ?? 0, usage.completionTokens ?? 0, eventType, latencyMs ?? null, status],
    );
};

const incrementTokenUsage = async (
    keyId: number,
    provider: Provider,
    model: string,
    usage: TokenUsage,
    eventType: "chat" | "test" = "chat",
    latencyMs?: number,
) => {
    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;

    if (promptTokens !== 0 || completionTokens !== 0) {
        await runStatement(
            "UPDATE api_keys SET total_prompt_tokens = total_prompt_tokens + ?, total_completion_tokens = total_completion_tokens + ? WHERE id = ?",
            [promptTokens, completionTokens, keyId],
        );
    }

    await logUsageEvent(keyId, provider, model, usage, eventType, latencyMs ?? null, "success");
};

// --- Routes ---
app.get("/api/keys", async (req: Request, res: Response) => {
    try {
        const rows = await allStatements<ApiKeyRow>(
            "SELECT id, provider, key_name, is_valid, created_at, total_prompt_tokens, total_completion_tokens, usage_note, token_budget, max_tokens_per_answer, key_fingerprint, last_validated_at FROM api_keys ORDER BY created_at DESC",
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
        const { provider, key_name, api_key, usage_note, token_budget, max_tokens_per_answer } = req.body as {
            provider?: string;
            key_name?: string;
            api_key?: string;
            usage_note?: string | null;
            token_budget?: number | null;
            max_tokens_per_answer?: number | null;
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
        const sanitizedMaxTokens = sanitizeMaxTokensValue(max_tokens_per_answer);

        const encrypted = encryptSecret(trimmedKey);
        const fingerprint = fingerprintSecret(trimmedKey);
        const result = await runStatement(
            "INSERT INTO api_keys (provider, key_name, encrypted_key, usage_note, token_budget, max_tokens_per_answer, key_fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [normalizedProvider, trimmedName, encrypted, sanitizedNote, tokenBudget, sanitizedMaxTokens, fingerprint],
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

type ProviderClientType = "openai_responses" | "openai_chat" | "anthropic" | "vertex";

type MaxTokensParam = "max_tokens" | "max_output_tokens" | "max_completion_tokens";

type AuthMode = "bearer" | "apiKey";

interface ProviderConfig {
    url: string;
    type: ProviderClientType;
    defaultModel: string;
    defaultMaxTokens?: number;
    maxTokensParam?: MaxTokensParam;
    defaultTemperature?: number | null;
    dynamicUrl?: (model: string) => string;
    authMode?: AuthMode;
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
        url: "https://api.openai.com/v1/responses",
        type: "openai_responses",
        defaultModel: "gpt-5-mini",
        maxTokensParam: "max_output_tokens",
        defaultMaxTokens: 4000,
        defaultTemperature: 1,
    },
    grok: {
        url: "https://api.x.ai/v1/chat/completions",
        type: "openai_chat",
        defaultModel: "grok-4-fast-reasoning",
        maxTokensParam: "max_output_tokens",
        defaultMaxTokens: 4000,
        defaultTemperature: 0.7,
    },
    claude: {
        url: "https://api.anthropic.com/v1/messages",
        type: "anthropic",
        defaultModel: "claude-4.5-haiku",
        maxTokensParam: "max_output_tokens",
        defaultMaxTokens: 4000,
        defaultTemperature: 0.7,
        extraHeaders: {
            "Anthropic-Version": "2024-06-11",
        },
    },
    google: {
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent",
        type: "vertex",
        defaultModel: "gemini-1.5-pro-latest",
        maxTokensParam: "max_output_tokens",
        defaultMaxTokens: 1024,
        defaultTemperature: 0.7,
        dynamicUrl: (model: string) =>
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        authMode: "apiKey",
    },
};

interface MessageEntry {
    role: "user" | "assistant" | "system";
    content: string;
}

const buildPayload = (
    config: ProviderConfig,
    model: string,
    messages: MessageEntry[],
    maxTokens?: number | null,
) => {
    const normalizedMaxTokens =
        typeof maxTokens === "number" && Number.isFinite(maxTokens)
            ? Math.max(1, Math.min(Math.floor(maxTokens), MAX_TOKEN_LIMIT))
            : undefined;
    const resolvedMaxTokens = normalizedMaxTokens ?? config.defaultMaxTokens;
    const attachTokenParam = <T extends Record<string, unknown>>(payload: T): T =>
        resolvedMaxTokens && config.maxTokensParam
            ? { ...payload, [config.maxTokensParam]: resolvedMaxTokens }
            : payload;

    const temperature = config.defaultTemperature ?? 0.7;

    switch (config.type) {
        case "openai_responses":
            return attachTokenParam({
                model,
                input: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
                ...(temperature != null ? { temperature } : {}),
            });
        case "openai_chat":
            return attachTokenParam({
                model,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
                ...(temperature != null ? { temperature } : {}),
            });
        case "anthropic":
            return attachTokenParam({
                model,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
                ...(temperature != null ? { temperature } : {}),
            });
        case "vertex":
            return attachTokenParam({
                model,
                contents: messages.map((msg) => ({
                    role: msg.role === "assistant" ? "model" : "user",
                    parts: [
                        {
                            text: msg.role === "system" ? `(system) ${msg.content}` : msg.content,
                        },
                    ],
                })),
                ...(temperature != null ? { temperature } : {}),
            });
        default:
            return {
                model,
                messages,
                ...(temperature != null ? { temperature } : {}),
            };
    }
};

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

const collectTextParts = (value: unknown, visited: WeakSet<object> = new WeakSet()): string[] => {
    if (isNonEmptyString(value)) {
        return [value.trim()];
    }
    if (Array.isArray(value)) {
        const aggregated: string[] = [];
        for (const item of value) {
            aggregated.push(...collectTextParts(item, visited));
        }
        return aggregated;
    }
    if (value && typeof value === "object") {
        const objectValue = value as Record<string, unknown>;
        if (visited.has(objectValue)) {
            return [];
        }
        visited.add(objectValue);

        const results: string[] = [];
        const directText = objectValue["text"];
        if (isNonEmptyString(directText)) {
            results.push(directText.trim());
        }
        const directValue = objectValue["value"];
        if (isNonEmptyString(directValue)) {
            results.push(directValue.trim());
        }

        const nestedKeys = ["content", "message", "output", "response", "data"] as const;
        for (const key of nestedKeys) {
            if (key in objectValue) {
                results.push(...collectTextParts(objectValue[key], visited));
            }
        }

        return results;
    }
    return [];
};

const decodeResponseText = (config: ProviderConfig, data: unknown) => {
    const payload = (data && typeof data === "object" ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;
    if (config.type === "vertex") {
        const candidates = payload["candidates"];
        if (Array.isArray(candidates) && candidates.length > 0) {
            const firstCandidate = candidates[0] as Record<string, unknown>;
            const content = firstCandidate["content"] as Record<string, unknown> | undefined;
            const parts = content?.["parts"];
            if (Array.isArray(parts)) {
                const textParts = parts
                    .map((part) => {
                        if (typeof part === "object" && part && "text" in part) {
                            const textValue = (part as Record<string, unknown>)["text"];
                            return typeof textValue === "string" ? textValue : undefined;
                        }
                        return undefined;
                    })
                    .filter((text): text is string => typeof text === "string");
                if (textParts.length > 0) {
                    return textParts.join("\n").trim();
                }
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

    const candidateSources: Array<{ key: string; joinAll?: boolean }> = [
        { key: "output_text", joinAll: true },
        { key: "output" },
        { key: "response" },
        { key: "choices" },
        { key: "message" },
        { key: "content" },
    ];

    for (const source of candidateSources) {
        const parts = collectTextParts(payload[source.key]);
        if (parts.length > 0) {
            return source.joinAll ? parts.join("\n").trim() : parts[0];
        }
    }

    return "No response";
};

const buildHeaders = (config: ProviderConfig, key: string) => ({
    "Content-Type": "application/json",
    ...(config.authMode === "apiKey" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` }),
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
        const row = await getStatement<{ provider: Provider; encrypted_key: string | Buffer; key_fingerprint?: string | null; max_tokens_per_answer?: number | null }>(
            "SELECT provider, encrypted_key, key_fingerprint, max_tokens_per_answer FROM api_keys WHERE id = ?",
            [id],
        );

        if (!row) return res.status(404).json({ error: "Key not found" });

        const decrypted = await decryptStoredKey({
            id,
            encrypted: row.encrypted_key,
            fingerprint: row.key_fingerprint ?? null,
        });

        if (!decrypted) {
            return res.status(400).json({ error: "Failed to decrypt API key" });
        }

        const config = providerConfig[row.provider];
        if (!config) {
            return res.status(400).json({ error: "Invalid provider" });
        }

        const testMaxTokens = sanitizeMaxTokensValue(row.max_tokens_per_answer ?? undefined);
        const modelForRequest = config.defaultModel;
        const payload = buildPayload(
            config,
            modelForRequest,
            [
                { role: "user", content: "Say hello" },
            ],
            testMaxTokens ?? undefined,
        );
        const endpoint = config.dynamicUrl ? config.dynamicUrl(modelForRequest) : config.url;

        let valid = false;
        let message = "Failed";

        try {
            const requestStartedAt = Date.now();
            const response = await fetch(endpoint, {
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
                    const latencyMs = Date.now() - requestStartedAt;
                    incrementTokenUsage(
                        id,
                        row.provider,
                        modelForRequest,
                        extractUsageFromPayload(responseBody),
                        "test",
                        latencyMs,
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
        const { keyId, model, messages, maxTokensPerAnswer } = req.body as {
            keyId?: number;
            model?: string;
            messages?: Array<{ role: string; content: string }>;
            maxTokensPerAnswer?: number | null;
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
        const row = await getStatement<{ provider: Provider; encrypted_key: string | Buffer; is_valid: number; key_fingerprint?: string | null; max_tokens_per_answer?: number | null }>(
            "SELECT provider, encrypted_key, is_valid, key_fingerprint, max_tokens_per_answer FROM api_keys WHERE id = ?",
            [keyId],
        );

        if (!row) {
            return res.status(404).json({ error: "API key not found" });
        }

        if (row.is_valid !== 1) {
            return res.status(400).json({ error: "API key is not validated. Please test it first." });
        }

        // Decrypt API key
        const decrypted = await decryptStoredKey({
            id: keyId,
            encrypted: row.encrypted_key,
            fingerprint: row.key_fingerprint ?? null,
        });

        if (!decrypted) {
            return res.status(400).json({ error: "Failed to decrypt API key" });
        }

        // Get provider configuration
        const config = providerConfig[row.provider];
        if (!config) {
            return res.status(400).json({ error: "Invalid provider" });
        }
        const storedMaxTokens = sanitizeMaxTokensValue(row.max_tokens_per_answer ?? undefined);
        const requestMaxTokens = sanitizeMaxTokensValue(maxTokensPerAnswer);
        const effectiveMaxTokens = requestMaxTokens ?? storedMaxTokens ?? undefined;
        const resolvedModel = model ?? config.defaultModel;
        const endpoint = config.dynamicUrl ? config.dynamicUrl(resolvedModel) : config.url;

        // Make API request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        let requestStartedAt: number | null = null;
        try {
            requestStartedAt = Date.now();
            const payload = buildPayload(
                config,
                resolvedModel,
                sanitizedMessages,
                effectiveMaxTokens ?? undefined,
            );
            const response = await fetch(endpoint, {
                method: "POST",
                headers: buildHeaders(config, decrypted),
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            const rawBody = await response.text();
            const parsedBody = parseJsonSafely(rawBody);

            if (!response.ok) {
                const errorRecord =
                    parsedBody && typeof parsedBody["error"] === "object"
                        ? (parsedBody["error"] as Record<string, unknown>)
                        : undefined;
                const bodyMessage =
                    parsedBody && typeof parsedBody["message"] === "string"
                        ? (parsedBody["message"] as string)
                        : undefined;
                const errorMessage =
                    (errorRecord && typeof errorRecord["message"] === "string" && errorRecord["message"].trim())
                        ? errorRecord["message"]
                        : bodyMessage && bodyMessage.trim()
                            ? bodyMessage
                            : rawBody || response.statusText || "API request failed";

                const latencyMs = requestStartedAt ? Date.now() - requestStartedAt : null;
                logUsageEvent(
                    keyId,
                    row.provider,
                    resolvedModel,
                    { promptTokens: 0, completionTokens: 0 },
                    "chat",
                    latencyMs,
                    "error",
                ).catch((logError) => console.error("Failed to log provider error event:", logError));

                return res.status(response.status).json({
                    error: errorMessage,
                });
            }

            const payloadRecord: Record<string, unknown> =
                parsedBody ?? { content: rawBody || "" };

            const content = decodeResponseText(config, payloadRecord);

            const usageSource = payloadRecord["usage"] ?? payloadRecord;
            const latencyMs = Date.now() - requestStartedAt;
            incrementTokenUsage(
                keyId,
                row.provider,
                resolvedModel,
                extractUsageFromPayload(usageSource),
                "chat",
                requestStartedAt ? Date.now() - requestStartedAt : undefined,
            ).catch((usageError) => {
                console.error("Failed to store token usage:", usageError);
            });

            res.json({ content });
        } catch (error) {
            clearTimeout(timeout);
            if (error instanceof Error && error.name === "AbortError") {
                logUsageEvent(
                    keyId,
                    row.provider,
                    resolvedModel,
                    { promptTokens: 0, completionTokens: 0 },
                    "chat",
                    requestStartedAt ? Date.now() - requestStartedAt : null,
                    "error",
                ).catch((logError) => console.error("Failed to log timeout event:", logError));
                return res.status(408).json({ error: "Request timeout" });
            }
            console.error("Chat API error:", error);
            logUsageEvent(
                keyId,
                row.provider,
                resolvedModel,
                { promptTokens: 0, completionTokens: 0 },
                "chat",
                requestStartedAt ? Date.now() - requestStartedAt : null,
                "error",
            ).catch((logError) => console.error("Failed to log error event:", logError));
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
             WHERE event_type = 'chat'
             GROUP BY provider, model
             ORDER BY SUM(prompt_tokens + completion_tokens) DESC`,
        );

        const totalTokensRow = await allStatements<{
            total_prompt: number;
            total_completion: number;
        }>(
            `SELECT SUM(prompt_tokens) as total_prompt, SUM(completion_tokens) as total_completion FROM usage_events WHERE event_type = 'chat'`,
        );

        const usageByTimeRows = await allStatements<{
            day: string;
            tokens: number;
            prompt_sum: number;
            completion_sum: number;
            request_count: number;
        }>(
            `SELECT DATE(timestamp) as day, SUM(prompt_tokens + completion_tokens) as tokens, SUM(prompt_tokens) as prompt_sum, SUM(completion_tokens) as completion_sum
             , COUNT(*) as request_count
             FROM usage_events
             WHERE event_type = 'chat'
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
             WHERE event_type = 'chat'
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
            requests: row.request_count ?? 0,
        }));

        const usageByKeyRows = await allStatements<{
            key_id: number | null;
            key_name: string;
            provider: Provider;
            prompt_sum: number;
            completion_sum: number;
        }>(
            `SELECT ue.key_id as key_id, COALESCE(k.key_name, 'Unknown') as key_name, COALESCE(k.provider, ue.provider) as provider,
                    SUM(ue.prompt_tokens) as prompt_sum, SUM(ue.completion_tokens) as completion_sum
             FROM usage_events ue
             LEFT JOIN api_keys k ON ue.key_id = k.id
             WHERE ue.event_type = 'chat' AND ue.key_id IS NOT NULL
             GROUP BY ue.key_id
             ORDER BY SUM(ue.prompt_tokens + ue.completion_tokens) DESC
             LIMIT 8`,
        );

        const providerRequestRows = await allStatements<{
            provider: Provider;
            request_count: number;
            success_count: number;
            avg_latency: number | null;
            avg_tokens: number | null;
        }>(
            `SELECT provider,
                    COUNT(*) as request_count,
                    SUM(CASE WHEN status = 'error' THEN 0 ELSE 1 END) as success_count,
                    AVG(latency_ms) as avg_latency,
                    AVG(prompt_tokens + completion_tokens) as avg_tokens
             FROM usage_events
             WHERE event_type = 'chat'
             GROUP BY provider`,
        );

        const budgetUsageRows = await allStatements<{
            key_id: number;
            key_name: string;
            provider: Provider;
            token_budget: number;
            used_tokens: number;
        }>(
            `SELECT k.id as key_id, k.key_name, k.provider, k.token_budget,
                    COALESCE(SUM(ue.prompt_tokens + ue.completion_tokens), 0) as used_tokens
             FROM api_keys k
             LEFT JOIN usage_events ue ON ue.key_id = k.id AND ue.event_type = 'chat'
             WHERE k.token_budget IS NOT NULL
             GROUP BY k.id
             ORDER BY used_tokens DESC
             LIMIT 6`,
        );

        const usageByKey = usageByKeyRows
            .filter(row => row.key_id != null)
            .map(row => ({
                keyId: row.key_id as number,
                keyName: row.key_name,
                provider: row.provider,
                promptTokens: row.prompt_sum,
                completionTokens: row.completion_sum,
                cost: calculateCost(row.provider, row.prompt_sum, row.completion_sum),
            }));

        const providerRequestStats = providerRequestRows.map(row => {
            const requestCount = row.request_count ?? 0;
            const successRate = requestCount > 0 ? (row.success_count / requestCount) * 100 : 0;
            return {
                provider: row.provider,
                requestCount,
                successRate,
                avgLatencyMs: row.avg_latency != null ? Math.round(row.avg_latency) : null,
                tokensPerRequest: row.avg_tokens ?? 0,
            };
        });

        const budgetUsage = budgetUsageRows.map(row => ({
            keyId: row.key_id,
            keyName: row.key_name,
            provider: row.provider,
            tokenBudget: row.token_budget,
            tokensUsed: row.used_tokens ?? 0,
            utilization: row.token_budget > 0 ? (row.used_tokens / row.token_budget) * 100 : 0,
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
            usageByKey,
            providerRequestStats,
            budgetUsage,
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
