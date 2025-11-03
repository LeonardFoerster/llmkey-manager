// server.ts
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import CryptoJS from "crypto-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret) {
  throw new Error("JWT_SECRET muss gesetzt sein");
}

const JWT_SECRET = rawJwtSecret;
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? JWT_SECRET;

const PORT = Number.parseInt(process.env.PORT ?? "5000", 10) || 5000;
const allowedOrigins = (process.env.CLIENT_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const DB_PATH = path.join(__dirname, "db.sqlite");

// --- Middleware ---
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : undefined,
  }),
);
app.use(express.json());

// --- DB ---
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("DB Fehler:", err.message);
  else console.log("DB verbunden:", DB_PATH);
});

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      provider TEXT NOT NULL CHECK (provider IN ('openai','grok')),
      key_name TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      is_valid INTEGER DEFAULT 0 CHECK (is_valid IN (0,1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});

// --- Types ---
type Provider = "openai" | "grok";

interface User {
  id: number;
  email: string;
}

interface AuthRequest extends Request {
  user?: User;
}

interface ApiKeyRow {
  id: number;
  provider: string;
  key_name: string;
  is_valid: number;
  created_at: string;
}

type StatementParams = readonly unknown[];

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

const createToken = (payload: User) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

// --- Middleware: Auth ---
const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Kein Token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as { id?: unknown }).id === "undefined" ||
      typeof (payload as { email?: unknown }).email === "undefined"
    ) {
      return res.status(401).json({ error: "Ungültiges Token" });
    }

    const idValue = (payload as { id: unknown }).id;
    const emailValue = (payload as { email: unknown }).email;
    const id =
      typeof idValue === "number"
        ? idValue
        : typeof idValue === "string"
        ? Number.parseInt(idValue, 10)
        : NaN;

    if (!Number.isInteger(id) || typeof emailValue !== "string") {
      return res.status(401).json({ error: "Ungültiges Token" });
    }

    req.user = { id, email: emailValue };
    next();
  } catch (error) {
    console.error("Token konnte nicht verifiziert werden:", error);
    res.status(401).json({ error: "Ungültiges Token" });
  }
};

// --- Routes ---
app.post("/api/register", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password)
      return res.status(400).json({ error: "Email/Passwort fehlt" });

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return res.status(400).json({ error: "Ungültige Email" });

    if (password.length < 8)
      return res.status(400).json({ error: "Passwort zu kurz" });

    const existingUser = await getStatement<{ id: number }>(
      "SELECT id FROM users WHERE LOWER(email) = ?",
      [normalizedEmail],
    );
    if (existingUser)
      return res.status(400).json({ error: "User existiert bereits" });

    const hash = await bcrypt.hash(password, 10);
    const result = await runStatement(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [normalizedEmail, hash],
    );

    const token = createToken({ id: result.lastID, email: normalizedEmail });
    res.status(201).json({ token });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "User existiert bereits" });
    }
    console.error("Registrierung fehlgeschlagen:", error);
    res.status(500).json({ error: "Registrierung fehlgeschlagen" });
  }
});

app.post("/api/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password)
      return res.status(400).json({ error: "Email/Passwort fehlt" });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await getStatement<User & { password: string }>(
      "SELECT id, email, password FROM users WHERE LOWER(email) = ?",
      [normalizedEmail],
    );

    if (!user) return res.status(401).json({ error: "Falsche Daten" });

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches)
      return res.status(401).json({ error: "Falsche Daten" });

    const token = createToken({ id: user.id, email: user.email });
    res.json({ token });
  } catch (error) {
    console.error("Login fehlgeschlagen:", error);
    res.status(500).json({ error: "Login fehlgeschlagen" });
  }
});

app.get("/api/keys", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await allStatements<ApiKeyRow>(
      "SELECT id, provider, key_name, is_valid, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
      [req.user!.id],
    );
    res.json(rows);
  } catch (error) {
    console.error("API-Keys konnten nicht geladen werden:", error);
    res.status(500).json({ error: "DB Fehler" });
  }
});

app.post("/api/keys", authenticate, async (req: AuthRequest, res: Response) => {
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
      return res.status(400).json({ error: "Ungültiger Provider" });
    if (!trimmedName || !trimmedKey)
      return res.status(400).json({ error: "Name/Key fehlt" });

    const encrypted = CryptoJS.AES.encrypt(trimmedKey, ENCRYPTION_SECRET).toString();
    const result = await runStatement(
      "INSERT INTO api_keys (user_id, provider, key_name, encrypted_key) VALUES (?, ?, ?, ?)",
      [req.user!.id, normalizedProvider, trimmedName, encrypted],
    );
    res.status(201).json({ id: result.lastID });
  } catch (error) {
    console.error("API-Key konnte nicht gespeichert werden:", error);
    res.status(500).json({ error: "DB Fehler" });
  }
});

app.delete("/api/keys/:id", authenticate, async (req: AuthRequest, res: Response) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Ungültige ID" });
  }

  try {
    const result = await runStatement(
      "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
      [id, req.user!.id],
    );
    if (result.changes === 0)
      return res.status(404).json({ error: "Nicht gefunden" });
    res.json({ success: true });
  } catch (error) {
    console.error("API-Key konnte nicht gelöscht werden:", error);
    res.status(500).json({ error: "DB Fehler" });
  }
});

const providerConfig: Record<Provider, { url: string; model: string }> = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-3.5-turbo",
  },
  grok: {
    url: "https://api.x.ai/v1/chat/completions",
    model: "grok-beta",
  },
};

app.post(
  "/api/keys/:id/test",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Ungültige ID" });
    }

    try {
      const row = await getStatement<{ provider: Provider; encrypted_key: string }>(
        "SELECT provider, encrypted_key FROM api_keys WHERE id = ? AND user_id = ?",
        [id, req.user!.id],
      );

      if (!row) return res.status(404).json({ error: "Key nicht gefunden" });

      const decrypted = CryptoJS.AES.decrypt(
        row.encrypted_key,
        ENCRYPTION_SECRET,
      ).toString(CryptoJS.enc.Utf8);

      if (!decrypted) {
        return res
          .status(400)
          .json({ error: "API-Key konnte nicht entschlüsselt werden" });
      }

      const config = providerConfig[row.provider];
      if (!config) {
        return res.status(400).json({ error: "Ungültiger Provider" });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${decrypted}`,
      };

      let valid = false;
      let message = "Fehlgeschlagen";

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

        valid = response.ok;
        if (!valid) {
          try {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            message = body.error?.message ?? message;
          } catch {
            message = response.statusText || message;
          }
        } else {
          message = "Erfolg!";
        }
      } catch (error) {
        console.error("API-Test fehlgeschlagen:", error);
        message = "Netzwerkfehler";
      }

      try {
        await runStatement("UPDATE api_keys SET is_valid = ? WHERE id = ?", [
          valid ? 1 : 0,
          id,
        ]);
      } catch (error) {
        console.error("Status konnte nicht aktualisiert werden:", error);
      }

      res.json({ valid, message });
    } catch (error) {
      console.error("API-Key Test fehlgeschlagen:", error);
      res.status(500).json({ error: "DB Fehler" });
    }
  },
);

// --- Start ---
app.listen(PORT, () => {
  console.log(`Backend läuft auf http://localhost:${PORT}`);
});
