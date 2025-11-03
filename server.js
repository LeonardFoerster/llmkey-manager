// server.js
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const CryptoJS = require("crypto-js");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;
const JWT_SECRET = "mein_geheimes_jwt_123";

// --- Daten in Datei speichern ---
const DATA_FILE = path.join(__dirname, "data.json");
let data = { users: [], keys: [] };
if (fs.existsSync(DATA_FILE)) {
  data = JSON.parse(fs.readFileSync(DATA_FILE));
}

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Kein Token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Ungültiges Token" });
  }
};

// --- Routes ---
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (data.users.find((u) => u.email === email))
    return res.status(400).json({ error: "User existiert" });
  const hash = await bcrypt.hash(password, 10);
  const user = { id: Date.now(), email, password: hash };
  data.users.push(user);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  const token = jwt.sign({ id: user.id }, JWT_SECRET);
  res.json({ token });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = data.users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Falsche Daten" });
  }
  const token = jwt.sign({ id: user.id }, JWT_SECRET);
  res.json({ token });
});

app.get("/api/keys", auth, (req, res) => {
  const userKeys = data.keys.filter((k) => k.userId === req.user.id);
  res.json(
    userKeys.map((k) => ({
      id: k.id,
      provider: k.provider,
      name: k.name,
      valid: k.valid,
    })),
  );
});

app.post("/api/keys", auth, (req, res) => {
  const { provider, name, key } = req.body;
  const encrypted = CryptoJS.AES.encrypt(key, JWT_SECRET).toString();
  const newKey = {
    id: Date.now(),
    userId: req.user.id,
    provider,
    name,
    encrypted,
    valid: false,
  };
  data.keys.push(newKey);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  res.json({ id: newKey.id });
});

app.delete("/api/keys/:id", auth, (req, res) => {
  data.keys = data.keys.filter(
    (k) => !(k.id === parseInt(req.params.id) && k.userId === req.user.id),
  );
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  res.json({ success: true });
});

app.post("/api/keys/:id/test", auth, async (req, res) => {
  const keyObj = data.keys.find(
    (k) => k.id === parseInt(req.params.id) && k.userId === req.user.id,
  );
  if (!keyObj) return res.status(404).json({ error: "Nicht gefunden" });

  const decrypted = CryptoJS.AES.decrypt(keyObj.encrypted, JWT_SECRET).toString(
    CryptoJS.enc.Utf8,
  );
  let url = "";
  let headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${decrypted}`,
  };

  if (keyObj.provider === "openai")
    url = "https://api.openai.com/v1/chat/completions";
  else if (keyObj.provider === "grok")
    url = "https://api.x.ai/v1/chat/completions";
  else return res.status(400).json({ error: "Unbekannter Provider" });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: keyObj.provider === "grok" ? "grok-beta" : "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Say hello" }],
        max_tokens: 5,
      }),
    });
    const valid = response.ok;
    keyObj.valid = valid;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
    res.json({ valid, message: valid ? "Erfolg!" : "Fehlgeschlagen" });
  } catch (err) {
    keyObj.valid = false;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
    res.json({ valid: false, message: "Netzwerkfehler" });
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  console.log(`Öffne: http://localhost:${PORT}`);
});
