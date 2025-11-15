# LLM Key Manager

*Ein lokales Cockpit zum Verwalten, Testen und Beobachten von LLM-API-Schlüsseln – ohne Cloud-Abhängigkeit.*

Der Key Manager kombiniert ein Express/SQLite-Backend (Server-seitig verschlüsselte Schlüssel, Nutzungsmetriken, Chat-Proxy) mit einem React-19-Frontend auf Basis von Vite. Ziel ist, unterschiedliche Provider-Keys an einer Stelle zu lagern, sie sicher zu testen, Prompts quer über alle validierten Endpunkte zu broadcasten und Kosten grob im Blick zu behalten.

## Überblick & Projektaufbau

- **Frontend (`src/`)**: React-UI mit Panels für Key-Studio, Chat, Analytics und das LLM-Map-Overlay. Lokale Sessions und Snapshot-Caches werden im Browser gespeichert.
- **Backend (`server.ts`)**: Express-API mit AES-verschlüsselter Ablage in `db.sqlite`, PBKDF2-Key-Derivation, CORS-Schutz und Provider-spezifischem Routing für OpenAI, Grok, Claude und Google (Vertex).
- **Datenhaltung**: SQLite-Tabellen `api_keys` (Kredential-Metadaten + Nutzungszähler) und `usage_events` (jede Chat-Anfrage inkl. Tokens, Latenz, Status). Analytics fasst diese Werte zu Kosten, Leaderboards und Zeitreihen zusammen.

```text
project-root
├── server.ts              # Express + SQLite API, Verschlüsselung, Provider-Bridges
├── db.sqlite              # wird beim ersten Start angelegt
├── src/
│   ├── features/
│   │   ├── keys/          # KeyStudio & AddKeyModal
│   │   ├── chat/          # ChatPanel, Sessions, Modelwahl
│   │   ├── analytics/     # Nutzungs-Dashboard
│   │   └── map/           # Prompt-Broadcast Overlay
│   ├── components/        # Sidebar, visuelle Effekte, Markdown-Renderer
│   ├── hooks/             # UI-State-Helfer
│   ├── utils/             # Formatierer, Helferfunktionen
│   └── types/             # Gemeinsame Datentypen (API-Keys, Sessions, Analytics)
├── dist / dist-server     # Build-Artefakte (Client / Server)
└── public                 # Statische Assets
```

### Funktionen & Datenfluss

- **API-Key Tresor**: Keys werden niemals im Klartext gespeichert. Der Server leitet PBKDF2-Schlüssel aus `LOCAL_VAULT_PASSPHRASE`/`ENCRYPTION_SECRET` ab, AES-verschlüsselt die Secrets und vergleicht Fingerprints, um Altbestände nachzuverschlüsseln.
- **Key CRUD & Tests**: `/api/keys` liefert, speichert, aktualisiert und löscht Einträge; `/api/keys/:id/test` sendet einen freundlichen „Sag Hallo“-Prompt an den jeweiligen Provider und aktualisiert den Validierungsstatus.
- **Chat-Proxy**: `/api/chat` nimmt eine Nachrichtenliste entgegen, wählt das passende Modell (OpenAI, Grok, Claude, Google/Vertex) und reicht Antwort + Tokenzählung zurück. Frontend-sessions liegen in `localStorage`.
- **Usage Tracking**: Jede Anfrage erzeugt einen Datensatz in `usage_events` mit Tokens, Kosten, Status und Latenz. Das Analytics-Panel aggregiert daraus Leaderboards (nach Provider, Modell, Key), Tageskurven sowie Auslastung gegenüber Budgetgrenzen.
- **LLM Map Overlay**: Broadcastet einen Prompt parallel über alle validierten Keys und zeigt sowohl Einzelantworten als auch eine heuristisch gewählte „Unified Answer“ (beste Antwort nach Antwortstatus/Provider-Priorität).

## Features auf einen Blick
- Schlüsselverwaltung mit Tokenbudgets, Notizen und Fingerprint-Anzeige
- Chat-Oberfläche mit Sitzungsverwaltung, System-Prompts, Provider-Switch und Abbruch (AbortController)
- Analytics mit Auto- oder manuellen Kostensätzen, Snapshot-Caching und Budget-Auslastung
- „Map Fetch“ zum gleichzeitigen Abfragen aller validierten Keys für schnelle Vergleichbarkeit
- Vollständige lokale Speicherung: SQLite-Datei plus Browser-Storage – keine externen Dienste notwendig

## Voraussetzungen
- Node.js **20.19+** 
- npm **10+**
- Build-Toolchain für `sqlite3` 

## Installation und lokaler Start

1. **Repository holen & Abhängigkeiten installieren**
   ```bash
   git clone <https://github.com/LeonardFoerster/llmkey-manager.git>
   cd llmkey-manager
   npm install
   ```
2. **.env anlegen (im Projektstamm neben `server.ts`)**
   ```ini
   ENCRYPTION_SECRET=ersetzen-durch-starkes-random
   LOCAL_VAULT_PASSPHRASE=optional-andere-passphrase
   LOCAL_VAULT_SALT=llmkey-manager-salt
   PORT=5000
   CLIENT_ORIGINS=http://localhost:5173
   ```
   | Variable | Zweck | Standard |
   | --- | --- | --- |
   | `ENCRYPTION_SECRET` | Master-Secret für AES-Verschlüsselung. Ohne langes Zufalls-Secret ist der Tresor wertlos. | `default-encryption-secret-change-me` |
   | `LOCAL_VAULT_PASSPHRASE` | Alternative Passphrase für die PBKDF2-Ableitung (fällt sonst auf `ENCRYPTION_SECRET` zurück). | `ENCRYPTION_SECRET` |
   | `LOCAL_VAULT_SALT` | Salt für die Key-Derivation; ändern falls du Secrets rotierst. | `llmkey-manager-salt` |
   | `PORT` | API-Port; Frontend erwartet `5000`. | `5000` |
   | `CLIENT_ORIGINS` | Kommagetrennte Liste erlaubter Browser-Origins (CORS). | `http://localhost:5173` |
3. **Entwicklungsmodus starten**
   ```bash
   npm run dev:server   # Express + SQLite API (tsx watch)
   npm run dev          # Vite-Frontend unter http://localhost:5173
   ```
   API-Endpunkte liegen unter `http://localhost:5000/api`. Beim ersten Start wird `db.sqlite` erzeugt und migriert.

### Produktion
```bash
npm run build   # kompiliert Server (tsc) + Client (Vite)
npm run start   # startet dist-server/server.js und bedient das gebaute UI
# oder npm run preview für einen schnellen Check des Frontend-Builds
```
