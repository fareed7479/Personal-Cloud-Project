# Personal Cloud Storage ☁️💻📱

Turn your laptop's hard drive into virtual storage for your mobile device. Browse remote files without downloading originals, preview images, stream video/audio on demand, and cache selectively for offline access.

---

## Architecture & Monorepo Layout

The repository is structured as an npm-workspaces monorepo:

```
Personal Cloud Project/
├── apps/
│   ├── server/             # Laptop Storage Server (Node.js, Express, TypeScript, SQLite, Prisma)
│   │   ├── prisma/         # Database schema & migrations
│   │   ├── src/
│   │   │   ├── config/     # Centralized Zod configuration
│   │   │   ├── controllers/# Express HTTP handlers (Health, etc.)
│   │   │   ├── db/         # Prisma client & database connectivity checks
│   │   │   ├── logger/     # Structured request & system logger
│   │   │   ├── middleware/ # Correlation IDs, logger, 404, centralized error handler
│   │   │   ├── routes/     # Versioned API routes (/api/v1)
│   │   │   ├── storage/    # Safe path resolver & filesystem storage adapter
│   │   │   ├── app.ts      # Express application setup
│   │   │   └── server.ts   # HTTP bootstrap & graceful shutdown
│   │   └── tests/          # Supertest & Vitest integration tests
│   └── mobile/             # Mobile Client (React Native, Expo SDK 52, Expo Router, TypeScript)
│       ├── app/            # Expo Router file-based screens
│       │   ├── (tabs)/     # Bottom tabs: Home, Files, Connect, Settings
│       │   └── _layout.tsx # Root layout with theme provider
│       ├── src/
│       │   ├── components/ # Reusable UI components (StatusBadge, LoadingState, ErrorState)
│       │   ├── services/   # Configurable ApiClient & ServerConfigService
│       │   └── theme/      # Dark-mode design system colors
│       └── __tests__/      # Vitest client unit tests
├── packages/
│   └── shared/             # Shared TypeScript types, API contracts, boundary interfaces
│       └── src/            # Auth, Files, Storage, Repositories, Transfers, Discovery, Events, API
├── .editorconfig           # Consistent editor formatting
├── .env.example            # Environment template without credentials
└── package.json            # Root workspace scripts
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher (verified on `v24.19.0`)
- **NPM**: `v10.0.0` or higher
- **Windows / macOS / Linux**

---

## Quick Start & Verification

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `apps/server/.env`:
```bash
# On Windows PowerShell:
Copy-Item .env.example apps/server/.env
```

### 3. Generate Database & Apply Migrations
```bash
npm run db:generate
npm run db:migrate
```

### 4. Run Automated Tests
```bash
# Runs both backend Supertest suites and mobile unit tests
npm run test
```

### 5. Type-Check All Workspaces
```bash
npm run typecheck
```

### 6. Start the Backend Server
```bash
npm run dev:server
```
The server starts at `http://0.0.0.0:4000`. Test the health endpoint:
```bash
# In PowerShell:
Invoke-RestMethod -Uri http://localhost:4000/api/v1/health | ConvertTo-Json -Depth 5
```

### 7. Start the Mobile Application
```bash
npm run dev:mobile
```
Press `w` to open in web browser, or scan the QR code using the **Expo Go** app on your physical phone.

---

## Windows Development Setup Notes

### 1. PowerShell Execution Policy
If npm scripts fail to run in PowerShell with script execution errors:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 2. Windows Defender Firewall (Local Network Testing)
To allow your phone to connect to your laptop over local Wi-Fi, ensure port 4000 is open in the Windows firewall:
```powershell
# Run in Administrator PowerShell if testing with physical phone on LAN:
New-NetFirewallRule -DisplayName "Personal Cloud Server (Port 4000)" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
```

### 3. Storage Root Configuration
In `apps/server/.env`, `STORAGE_ROOT` defaults to `./storage_root`. You can configure this to point to any directory or drive on your laptop (e.g., `D:/MyStorage` or `C:/PersonalCloud`). The server strictly prevents directory traversal attacks outside this boundary.

---

## Android Testing Instructions

### Option A: Android Emulator
1. Start the Android Emulator from Android Studio.
2. In the mobile app's **Connect** screen, use the quick-preset button for **`http://10.0.2.2:4000`**.
   *(Android emulators map `10.0.2.2` directly to the host laptop's `127.0.0.1`)*.
3. Tap **Test Health**. The app will connect and display live latency, SQLite status, and available disk space.
4. Tap **Save URL** to persist the configuration.

### Option B: Physical Android Device on Local Wi-Fi
1. Ensure both your laptop and phone are connected to the **same Wi-Fi network**.
2. Find your laptop's local IP address:
   ```powershell
   ipconfig
   # Look for IPv4 Address under Wireless LAN adapter Wi-Fi (e.g. 192.168.1.120)
   ```
3. In the mobile app's **Connect** screen, enter `http://<YOUR_LAPTOP_IP>:4000` (e.g., `http://192.168.1.120:4000`).
4. Tap **Test Health** and **Save URL**.

---

## API Documentation: Health Check

### `GET /api/v1/health`
Checks the operational status of the server, SQLite database, and disk storage accessibility.

#### Response Headers:
- `Content-Type: application/json; charset=utf-8`
- `X-Request-Id: <uuid>`

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "serverName": "Personal Cloud Server",
    "version": "0.1.0",
    "uptimeSeconds": 42,
    "environment": "development",
    "database": {
      "connected": true,
      "provider": "sqlite",
      "latencyMs": 4
    },
    "storage": {
      "status": "accessible",
      "rootPath": "D:\\PROJECTS\\Personal Cloud Project\\apps\\server\\storage_root",
      "diskSpace": {
        "totalBytes": 667693346816,
        "freeBytes": 623701012480,
        "usedBytes": 43992334336,
        "storageRootPath": "D:\\PROJECTS\\Personal Cloud Project\\apps\\server\\storage_root"
      }
    },
    "timestamp": "2026-10-14T03:04:11.380Z"
  },
  "requestId": "0de639e0-a903-4d08-81cf-686773a3f9df",
  "timestamp": "2026-10-14T03:04:11.380Z"
}
```

---

## All Available Scripts

| Command | Action |
|---|---|
| `npm run dev:server` | Start Express backend with hot reloading via `tsx watch` |
| `npm run dev:mobile` | Start Expo development server |
| `npm run build:server` | Compile TypeScript backend to `apps/server/dist` |
| `npm run test` | Run backend and mobile tests |
| `npm run test:server` | Run backend Supertest & Vitest test suites |
| `npm run test:mobile` | Run mobile client Vitest test suites |
| `npm run typecheck` | Run `tsc --noEmit` across all workspaces |
| `npm run db:migrate` | Run Prisma database migrations |
| `npm run db:generate` | Regenerate Prisma client |
