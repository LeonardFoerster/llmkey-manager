# LLM Key Manager

Centralized vault for storing, auditing, and experimenting with LLM API keys. The project pairs a Vite/React dashboard with an Express + SQLite backend that encrypts keys at rest, tracks usage, and exposes a lightweight chat/analytics workspace.

## Features
- Encrypted API key vault with per-provider metadata, usage notes, and token budgets.
- Interactive dashboard for adding/removing keys, switching providers, and reviewing usage analytics.
- Built-in chat playground with presets for OpenAI, Grok, Claude, and Google models.
- Local SQLite database automatically migrated on startup—no manual schema management.

## Prerequisites
- Node.js 18+ (needed for React 19 and the ESM server build).
- npm 10+ (bundled with recent Node distributions).
- Build tools required by `sqlite3` (`python3`, `make`, `g++`) if you are on Linux/Windows and do not already have them.

## Installation & Setup

### 1. Clone and install dependencies
```bash
git clone <repo-url>
cd llmkey-manager
npm install
```

### 2. Configure environment variables
Create a `.env` file in the project root (next to `server.ts`). The server reads these values via `dotenv`.

```ini
# .env
ENCRYPTION_SECRET=replace-with-a-strong-random-string
LOCAL_VAULT_PASSPHRASE=passphrase-used-to-derive-the-vault-key
LOCAL_VAULT_SALT=llmkey-manager-salt
PORT=5000
CLIENT_ORIGINS=http://localhost:5173
```

| Variable | Purpose | Default |
| --- | --- | --- |
| `ENCRYPTION_SECRET` | Master secret for encrypting stored API keys. Always set this to a long random string. | `default-encryption-secret-change-me` |
| `LOCAL_VAULT_PASSPHRASE` | Optional override for the phrase used to derive the vault key. Falls back to `ENCRYPTION_SECRET`. | `ENCRYPTION_SECRET` |
| `LOCAL_VAULT_SALT` | Salt used when deriving the AES key. Change it if you rotate secrets. | `llmkey-manager-salt` |
| `PORT` | Express server port. The frontend expects `5000` during development. | `5000` |
| `CLIENT_ORIGINS` | Comma-separated list of allowed browser origins for CORS. | `http://localhost:5173` |

### 3. Database
An SQLite file (`db.sqlite`) is created automatically in the project root the first time the server runs. Existing data is preserved between restarts. Remove the file if you want a clean slate.

### 4. Start the development environment
Run the backend and frontend in two terminals:

```bash
# Terminal 1 – API + encryption layer
npm run dev:server

# Terminal 2 – React UI with Vite
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:5000/api

### 5. Production build
```bash
npm run build      # Compiles server (TypeScript) and client (Vite)
npm run start      # Runs the compiled Express server from dist-server/
```

The frontend assets are served from `dist/`. If you only need to preview the static build locally, run `npm run preview`.

### 6. Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the Vite dev server with hot reload. |
| `npm run dev:server` | Runs the Express API with tsx in watch mode. |
| `npm run build` | Builds both the backend (tsc) and frontend (Vite). |
| `npm run start` | Launches the compiled Express server (serves API & built UI). |
| `npm run preview` | Serves the production frontend bundle for QA. |
| `npm run lint` | Runs ESLint across the repo. |
| `npm run typecheck` | Validates TypeScript types for server and client configs. |

## Troubleshooting
- `npm install` fails on `sqlite3`: ensure you have a build toolchain installed (Xcode CLT on macOS, `build-essential` on Debian/Ubuntu, or the Windows Build Tools).
- Browser blocked by CORS: add your UI origin to `CLIENT_ORIGINS` and restart the server.
- Rotating vault secrets: delete `db.sqlite` or re-import keys after changing the encryption inputs; old encrypted data cannot be decrypted with new secrets.
