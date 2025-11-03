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
const PORT = 5000;
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_123456789";
const DB_PATH = path.join(__dirname, "db.sqlite");

// --- Middleware ---
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// --- DB ---
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("DB Fehler:", err.message);
  else console.log("DB verbunden:", DB_PATH);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      provider TEXT NOT NULL,
      key_name TEXT NOT NULL,
      encrypted_key TEXT NOT NULL,
      is_valid INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
});

// --- Types ---
interface User {
  id: number;
  email: string;
}

interface AuthRequest extends Request {
  user?: User;
}

// --- Middleware: Auth ---
const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Kein Token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as User;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Ungültiges Token" });
  }
};

// --- Routes ---
app.post("/api/register", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email/Passwort fehlt" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Ungültige Email" });

  const hash = await bcrypt.hash(password, 10);
  db.run(
    "INSERT INTO users (email, password) VALUES (?, ?)",
    [email, hash],
    function (err) {
      if (err) return res.status(400).json({ error: "User existiert bereits" });
      const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, {
        expiresIn: "7d",
      });
      res.json({ token });
    },
  );
});

app.post("/api/login", (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email/Passwort fehlt" });

  db.get(
    "SELECT id, email, password FROM users WHERE email = ?",
    [email],
    async (err, user: (User & { password: string }) | undefined) => {
      if (err || !user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Falsche Daten" });
      }
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: "7d",
      });
      res.json({ token });
    },
  );
});

app.get("/api/keys", authenticate, (req: AuthRequest, res: Response) => {
  db.all(
    "SELECT id, provider, key_name, is_valid, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC",
    [req.user!.id],
    (err, rows: any[]) => {
      if (err) return res.status(500).json({ error: "DB Fehler" });
      res.json(rows);
    },
  );
});

app.post("/api/keys", authenticate, (req: AuthRequest, res: Response) => {
  const { provider, key_name, api_key } = req.body;
  if (!["openai", "grok"].includes(provider))
    return res.status(400).json({ error: "Ungültiger Provider" });
  if (!key_name || !api_key)
    return res.status(400).json({ error: "Name/Key fehlt" });

  const encrypted = CryptoJS.AES.encrypt(api_key, JWT_SECRET).toString();
  db.run(
    "INSERT INTO api_keys (user_id, provider, key_name, encrypted_key) VALUES (?, ?, ?, ?)",
    [req.user!.id, provider, key_name, encrypted],
    function (err) {
      if (err) return res.status(500).json({ error: "DB Fehler" });
      res.json({ id: this.lastID });
    },
  );
});

app.delete("/api/keys/:id", authenticate, (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  db.run(
    "DELETE FROM api_keys WHERE id = ? AND user_id = ?",
    [id, req.user!.id],
    function (err) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _ = err; // Ignoriere unused err
      if (this.changes === 0)
        return res.status(404).json({ error: "Nicht gefunden" });
      res.json({ success: true });
    },
  );
});

app.post(
  "/api/keys/:id/test",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id);
    db.get(
      "SELECT provider, encrypted_key FROM api_keys WHERE id = ? AND user_id = ?",
      [id, req.user!.id],
      async (
        err,
        row: { provider: string; encrypted_key: string } | undefined,
      ) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = err;
        if (!row) return res.status(404).json({ error: "Key nicht gefunden" });

        const decrypted = CryptoJS.AES.decrypt(
          row.encrypted_key,
          JWT_SECRET,
        ).toString(CryptoJS.enc.Utf8);
        const url =
          row.provider === "grok"
            ? "https://api.x.ai/v1/chat/completions"
            : "https://api.openai.com/v1/chat/completions";
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${decrypted}`,
        };

        try {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: row.provider === "grok" ? "grok-beta" : "gpt-3.5-turbo",
              messages: [{ role: "user", content: "Say hello" }],
              max_tokens: 5,
            }),
          });
          const valid = response.ok;
          db.run("UPDATE api_keys SET is_valid = ? WHERE id = ?", [
            valid ? 1 : 0,
            id,
          ]);
          res.json({ valid, message: valid ? "Erfolg!" : "Fehlgeschlagen" });
        } catch {
          db.run("UPDATE api_keys SET is_valid = ? WHERE id = ?", [0, id]);
          res.json({ valid: false, message: "Netzwerkfehler" });
        }
      },
    );
  },
);

// --- Start ---
app.listen(PORT, () => {
  console.log(`Backend läuft auf http://localhost:${PORT}`);
});
