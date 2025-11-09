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
const PORT = Number.parseInt(process.env.PORT ?? "5000", 10) || 5000;
const allowedOrigins = (process.env.CLIENT_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
const DB_PATH = path.join(__dirname, "..", "db.sqlite");

// --- Middleware ---
app.use(
    cors({
        origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
    }),
);
app.use(express.json());

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
      provider TEXT NOT NULL CHECK (provider IN ('openai','grok')),
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
});

// --- Types ---
type Provider = "openai" | "grok";

interface ApiKeyRow {
    id: number;
    provider: string;
    key_name: string;
    is_valid: number;
    created_at: string;
    total_prompt_tokens: number;
    total_completion_tokens: number;
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

const incrementTokenUsage = async (keyId: number, usage: TokenUsage) => {
    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;

    if (promptTokens === 0 && completionTokens === 0) {
        return;
    }

    await runStatement(
        "UPDATE api_keys SET total_prompt_tokens = total_prompt_tokens + ?, total_completion_tokens = total_completion_tokens + ? WHERE id = ?",
        [promptTokens, completionTokens, keyId],
    );
};

// --- Routes ---
app.get("/api/keys", async (req: Request, res: Response) => {
    try {
        const rows = await allStatements<ApiKeyRow>(
            "SELECT id, provider, key_name, is_valid, created_at, total_prompt_tokens, total_completion_tokens FROM api_keys ORDER BY created_at DESC",
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
        const { provider, key_name, api_key } = req.body as {
            provider?: string;
            key_name?: string;
            api_key?: string;
        };

        const normalizedProvider = provider?.toLowerCase() as Provider | undefined;
        const trimmedName = key_name?.trim();
        const trimmedKey = api_key?.trim();

        if (!normalizedProvider || !["openai", "grok"].includes(normalizedProvider))
            return res.status(400).json({ error: "Invalid provider" });
        if (!trimmedName || !trimmedKey)
            return res.status(400).json({ error: "Name/Key missing" });

        const encrypted = CryptoJS.AES.encrypt(trimmedKey, ENCRYPTION_SECRET).toString();
        const result = await runStatement(
            "INSERT INTO api_keys (provider, key_name, encrypted_key) VALUES (?, ?, ?)",
            [normalizedProvider, trimmedName, encrypted],
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

// server.ts
const providerConfig: Record<Provider, { url: string; model: string }> =
    {
    openai: {
        url: "https://api.openai.com/v1/chat/completions",
        model: "gpt-5-mini", // Verwende das schnelle GPT-5-Modell zum Testen
    },
    grok: {
        url: "https://api.x.ai/v1/chat/completions",
        model: "grok-4-fast-reasoning", // Verwende das schnelle Grok-4-Modell zum Testen
    },
};

app.post("/api/keys/:id/test", async (req: Request, res: Response) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
    }

    try {
        const row = await getStatement<{ provider: Provider; encrypted_key: string }>(
            "SELECT provider, encrypted_key FROM api_keys WHERE id = ?",
            [id],
        );

        if (!row) return res.status(404).json({ error: "Key not found" });

        const decrypted = CryptoJS.AES.decrypt(
            row.encrypted_key,
            ENCRYPTION_SECRET,
        ).toString(CryptoJS.enc.Utf8);

        if (!decrypted) {
            return res.status(400).json({ error: "Failed to decrypt API key" });
        }

        const config = providerConfig[row.provider];
        if (!config) {
            return res.status(400).json({ error: "Invalid provider" });
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${decrypted}`,
        };

        let valid = false;
        let message = "Failed";

        try {
            const response = await fetch(config.url, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    model: config.model,
                    messages: [{ role: "user", content: "Say hello" }],
                    max_tokens: 5,
                }),
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
                message = "Success!";
                if (responseBody) {
                    incrementTokenUsage(id, extractUsageFromPayload(responseBody)).catch((usageError) => {
                        console.error("Failed to store token usage (test):", usageError);
                    });
                }
            }
        } catch (error) {
            console.error("API test failed:", error);
            message = "Network error";
        }

        try {
            await runStatement("UPDATE api_keys SET is_valid = ? WHERE id = ?", [
                valid ? 1 : 0,
                id,
            ]);
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
        const sanitizedMessages = messages.map(msg => ({
            role: msg.role === "user" || msg.role === "assistant" ? msg.role : "user",
            content: String(msg.content || "").slice(0, 10000) // Limit message length
        }));

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
        const decrypted = CryptoJS.AES.decrypt(
            row.encrypted_key,
            ENCRYPTION_SECRET,
        ).toString(CryptoJS.enc.Utf8);

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
            const response = await fetch(config.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${decrypted}`,
                },
                body: JSON.stringify({
                    model,
                    messages: sanitizedMessages,
                    max_tokens: 4000, // Limit response length
                    temperature: 0.7,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
                return res.status(response.status).json({
                    error: errorBody.error?.message || "API request failed"
                });
            }

            const data = await response.json() as {
                choices?: Array<{ message?: { content?: string } }>;
                usage?: Record<string, unknown>;
            };

            const content = data.choices?.[0]?.message?.content || "No response";

            incrementTokenUsage(keyId, extractUsageFromPayload(data.usage ?? data)).catch((usageError) => {
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

// --- Start ---
app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
