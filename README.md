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

## API Documentation

### `GET /api/v1/health`
Checks operational status of the server, SQLite database, and disk storage accessibility.

### `GET /api/v1/files`
List virtual files with pagination, search, category filtering, and sorting.
- **Query Parameters**:
  - `folderId`: Filter by folder UUID or `null` for root files.
  - `category`: Filter by `image`, `video`, `audio`, `document`, `archive`, `other`, or `all`.
  - `search`: Search file names.
  - `page`: Page number (default: 1).
  - `limit`: Number of files per page (default: 50, max: 100).
  - `sortBy`: `name`, `sizeBytes`, `mtime`, `createdAt`, `updatedAt`.
  - `sortOrder`: `asc` or `desc`.

### `GET /api/v1/files/:id`
Fetch metadata for a single file by ID.

### `PATCH /api/v1/files/:id`
Update file metadata (rename file on disk & database, move folders, or soft-delete).
- **Body**:
  ```json
  {
    "name": "new_name.txt",
    "folderId": "target-folder-uuid",
    "isDeleted": true
  }
  ```

### `GET /api/v1/folders`
List folders. Supports filtering by parent: `?parentId=<folderId>` or `?parentId=null` for root folders.

### `POST /api/v1/folders`
Create a new folder on the laptop disk and register it in the database.
- **Body**:
  ```json
  {
    "name": "Projects",
    "parentId": null
  }
  ```

### `GET /api/v1/storage/usage`
Reports:
- Total physical volume capacity (`totalPhysicalBytes`).
- Available free space on disk (`availableBytes`).
- Space used exclusively by managed files (`appManagedBytes`).
- Managed file count and indexed folder count.

### `POST /api/v1/storage/rescan`
Triggers an on-demand filesystem scan to index new files, update modified files (using fast `mtime` and `sizeBytes` detection), and soft-delete files removed from disk.

---

## File Indexing & Change Detection Strategy

1. **Lightweight Change Detection**: The indexing engine inspects file modification times (`mtime`) and byte sizes instead of re-hashing large files on every pass. Checksums are calculated lazily on demand or for transfer verification.
2. **Safe Boundary Enforcement**: Files and symlinks outside the configured storage root are strictly ignored.
3. **Internal Namespace Isolation**: Private app data, SQLite database files (`dev.db`), and cache directories (`.cloud_internal`, `.tmp`, `.cloud_cache`) are excluded from user file listings.
4. **Soft-Delete Pruning**: When a file is deleted directly on disk by the user outside the app, rescanning marks the record as `isDeleted: true` (`status: "missing"`) rather than purging history, preserving transfer logs and metadata.

---

## All Available Scripts

| Command | Action |
|---|---|
| `npm run dev:server` | Start Express backend with hot reloading via `tsx watch` |
| `npm run dev:mobile` | Start Expo development server |
| `npm run build:server` | Compile TypeScript backend to `apps/server/dist` |
| `npm run test` | Run all backend and mobile tests across workspaces |
| `npm run test:server` | Run backend Supertest & Vitest test suites (19 tests) |
| `npm run test:mobile` | Run mobile client Vitest test suites (6 tests) |
| `npm run typecheck` | Run `tsc --noEmit` across all workspaces |
| `npm run db:migrate` | Run Prisma database migrations |
| `npm run db:generate` | Regenerate Prisma client |

