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
To allow your phone to discover and connect to your laptop over local Wi-Fi, ensure TCP port 4000 (API server) and UDP port 5353 (mDNS / Bonjour service discovery) are open in the Windows firewall:
```powershell
# Run in Administrator PowerShell to allow LAN connectivity:
New-NetFirewallRule -DisplayName "Personal Cloud Server (HTTP 4000)" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Personal Cloud Discovery (mDNS UDP 5353)" -Direction Inbound -LocalPort 5353 -Protocol UDP -Action Allow
```

### 3. Wi-Fi Client Isolation & Hotspot Considerations
- **Home Wi-Fi Routers**: Ensure "AP Isolation" / "Client Isolation" is disabled in router settings if devices cannot ping each other.
- **Mobile Hotspot**: If your laptop connects to your phone's Wi-Fi hotspot (or vice versa), mDNS and direct IP connectivity work immediately.
- **Manual Fallback**: If multicast traffic is blocked by router isolation, the mobile app provides direct IP and hostname entry with immediate health checks.

### 4. Storage Root Configuration
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

### Public Endpoints (No Authentication Required)

#### `GET /api/v1/health`
Checks operational status of the server, SQLite database, and disk storage accessibility.

#### `GET /api/v1/discovery/info`
Returns server LAN metadata, service name, active IP addresses, port, application version, and supported capabilities (`browsing`, `streaming`, `pairing`, `management`). Does not leak sensitive file paths or credentials.

#### `GET /api/v1/pairing/challenge`
Retrieves the currently active or newly generated pairing challenge. Returns a 6-digit PIN, 5-minute expiry timestamp, QR code payload, and current status (`pending`, `approved`, `consumed`, `expired`).

#### `POST /api/v1/pairing/challenge`
Generates a fresh cryptographically secure pairing challenge, expiring any previous unconsumed challenges.

#### `POST /api/v1/pairing/request`
Mobile client submits the 6-digit PIN together with device identity (`deviceId`, `deviceName`, `platform`, `appVersion`). Rate-limited to 5 incorrect attempts before challenge invalidation. Sets challenge to `pending` waiting for laptop owner confirmation.

#### `POST /api/v1/pairing/approve`
Laptop interface confirms or rejects a pending pairing request. Upon approval, generates a 64-character cryptographically secure token, stores its SHA-256 hash in SQLite, and registers the device.

#### `GET /api/v1/pairing/status/:challengeId`
Mobile client polls status. Once approved, returns the device's authorization token and immediately marks the challenge as `consumed` to prevent replay attacks.

---

### Protected Endpoints (Requires `Authorization: Bearer <token>`)

#### `GET /api/v1/devices`
Lists all authorized paired mobile devices, platform, last seen timestamp, and revocation state.

#### `POST /api/v1/devices/:deviceId/revoke` or `DELETE /api/v1/devices/:deviceId`
Immediately revokes a paired device. Subsequent protected requests with that device's token are instantly rejected with `403 Forbidden` (`DEVICE_REVOKED`).

#### `GET /api/v1/files`
List virtual files with pagination, search, category filtering, and sorting.
- **Query Parameters**:
  - `folderId`: Filter by folder UUID or `null` for root files.
  - `category`: Filter by `image`, `video`, `audio`, `document`, `archive`, `other`, or `all`.
  - `search`: Search file names.
  - `page`: Page number (default: 1).
  - `limit`: Number of files per page (default: 50, max: 100).
  - `sortBy`: `name`, `sizeBytes`, `mtime`, `createdAt`, `updatedAt`.
  - `sortOrder`: `asc` or `desc`.

#### `GET /api/v1/files/:id`
Fetch metadata for a single file by ID.

#### `PATCH /api/v1/files/:id`
Update file metadata (rename file on disk & database, move folders, or soft-delete).
- **Body**:
  ```json
  {
    "name": "new_name.txt",
    "folderId": "target-folder-uuid",
    "isDeleted": true
  }
  ```

#### `GET /api/v1/files/:id/view` (or `/api/v1/files/:id/content`)
Streams file content with HTTP Byte-Range support (`Range: bytes=start-end`).
- Returns `206 Partial Content`, `Content-Range: bytes start-end/total`, `Accept-Ranges: bytes`, and `Content-Length`.
- Returns `416 Range Not Satisfiable` for out-of-bounds or invalid ranges.
- Returns `200 OK` when no `Range` header is present.
- Supports both `Authorization: Bearer <token>` and `?token=<token>` query authentication for native media player components.

#### `GET /api/v1/files/:id/download`
Downloads the file as an attachment (`Content-Disposition: attachment; filename="..."`).

#### `GET /api/v1/files/:id/thumbnail`
Lazily generates and caches a scaled WebP thumbnail for images (`?width=256&height=256`).
- Thumbnails are cached on disk under `.cloud_internal/thumbnails/` and invalidated when source file `mtime` changes.
- Large images are processed via Sharp streams without buffering whole files into server RAM.
- Subsequent requests are served directly from the disk cache with `Cache-Control: public, max-age=86400`.

#### `GET /api/v1/folders`
List folders. Supports filtering by parent: `?parentId=<folderId>` or `?parentId=null` for root folders.

#### `GET /api/v1/folders/:id/breadcrumbs`
Returns ordered breadcrumb ancestor path from root to the specified folder (`[{ id, name, path }]`).

#### `POST /api/v1/folders`
Create a new folder on the laptop disk and register it in the database.
- **Body**:
  ```json
  {
    "name": "Projects",
    "parentId": null
  }
  ```

#### `GET /api/v1/storage/usage`
Reports:
- Total physical volume capacity (`totalPhysicalBytes`).
- Available free space on disk (`availableBytes`).
- Space used exclusively by managed files (`appManagedBytes`).
- Managed file count and indexed folder count.

#### `POST /api/v1/storage/rescan`
Triggers an on-demand filesystem scan to index new files, update modified files (using fast `mtime` and `sizeBytes` detection), and soft-delete files removed from disk.

---

## Virtual Storage Semantics & Mobile Previews

1. **Remote Virtual Storage**: Browsing directories loads metadata only (file names, sizes, categories, modification timestamps). File contents remain on the laptop disk and are not silently downloaded when opening a folder.
2. **On-Demand Streaming**: Audio and video stream directly over Wi-Fi using standard HTTP byte ranges (`206 Partial Content`), allowing immediate scrubbing and playback without pre-downloading the entire video.
3. **Lazy Thumbnail Generation**: Scaled WebP thumbnails are generated on the laptop on demand and cached separately in `.cloud_internal/thumbnails`. Listing a directory with thousands of photos never triggers synchronous bulk resizing.
4. **Explicit Downloads**: Users can explicitly tap "Download to Phone" to save a file into an app-managed location (`expo-file-system`). Downloaded files are tracked locally with a green "Local" badge for offline viewing and can be removed to free device storage without deleting the remote laptop file.
5. **Clear Bandwidth & Availability Indicators**: The app clearly identifies whether files are stored remotely on the laptop or saved locally, and warns that streaming requires the laptop to remain online on the same local network.

---

## Secure Pairing & Authentication Flow

```
Mobile App (Phone)                                 Laptop Server
      |                                                  |
      | 1. Discovers server via mDNS / enters manual IP  |
      |------------------------------------------------->|
      |                                                  |
      |                                2. Displays PIN / QR code on laptop
      |                                   (GET /api/v1/pairing/challenge)
      | 3. User inputs 6-digit PIN                       |
      |    POST /api/v1/pairing/request                  |
      |------------------------------------------------->|
      |                                                  |
      |                                4. Laptop owner clicks "Confirm Pairing"
      |                                   POST /api/v1/pairing/approve
      |                                                  |
      | 5. Polls GET /api/v1/pairing/status/:id          |
      |------------------------------------------------->|
      |    Returns 64-char Bearer Token & Consumes PIN   |
      |<-------------------------------------------------|
      |                                                  |
      | 6. Token saved in Expo SecureStore (Encrypted)   |
      |    Subsequent requests: Authorization: Bearer    |
      |------------------------------------------------->|
```

### Security Model & Local Trust Assumptions
1. **Zero Silent File Exposure**: Files, folders, and storage metrics are protected by `authMiddleware`. Unpaired devices on the same Wi-Fi receive `401 AUTHENTICATION_REQUIRED`.
2. **Encrypted Mobile Storage**: Credentials and device UUIDs are stored using `expo-secure-store` (backed by Android KeyStore and iOS Keychain). They are never stored in unencrypted `AsyncStorage`.
3. **Database Token Hashing**: Auth tokens are 64-character cryptographic random hex strings. The server only stores the SHA-256 hash in SQLite, preventing token extraction from database dumps.
4. **Immediate Revocation**: Calling `revokeDevice` sets `isRevoked: true` on the device record immediately. All subsequent requests are rejected with `403 DEVICE_REVOKED` without waiting for token expiration.
5. **Short-Lived Challenges & Replay Prevention**: Pairing PINs expire after 5 minutes and are rate-limited to 5 invalid attempts. Once a token is issued and polled, the challenge is consumed.
6. **Local Network Scope & Future TLS**: Local LAN traffic over Wi-Fi is protected within the trusted local network. Before exposing this server beyond the local LAN (e.g., remote internet access in future phases), TLS termination or mutual TLS will be required.

---

## File Indexing & Change Detection Strategy

1. **Lightweight Change Detection**: The indexing engine inspects file modification times (`mtime`) and byte sizes instead of re-hashing large files on every pass. Checksums are calculated lazily on demand or for transfer verification.
2. **Safe Boundary Enforcement**: Files and symlinks outside the configured storage root are strictly ignored.
3. **Internal Namespace Isolation**: Private app data, SQLite database files (`dev.db`), and cache directories (`.cloud_internal`, `.tmp`, `.cloud_cache`) are excluded from user file listings.
4. **Soft-Delete Pruning**: When a file is deleted directly on disk by the user outside the app, rescanning marks the record as `isDeleted: true` (`status: "missing"`) rather than purging history, preserving transfer logs and metadata.

---

---

## Phase 5: File Operations, Reliable Resumable Transfers & Transfer Manager

Phase 5 introduces complete bidirectional file management, resumable chunked uploads for large media, byte-range resumable downloads, and a bounded concurrency Mobile Transfer Manager.

### 1. Resumable Chunked Upload Protocol
Large media uploads from mobile devices can be interrupted by network drops, app backgrounding, or Wi-Fi changes. Phase 5 implements a stateful chunked upload protocol isolated from user-visible files:

```
Mobile Client                                            Laptop Storage Server
     |                                                             |
     | 1. POST /api/v1/uploads                                     |
     |    { fileName, sizeBytes, chunkSize, checksum? }            |
     |------------------------------------------------------------>|
     |    201 Created: { sessionId, totalChunks, chunkSize }       |
     |<------------------------------------------------------------|
     |                                                             |
     | 2. PUT /api/v1/uploads/:id/chunks/:chunkNumber              |
     |    [Binary chunk slice in request body]                     |
     |------------------------------------------------------------>|
     |    200 OK: { chunkNumber, receivedChunksCount, percentage } |
     |<------------------------------------------------------------|
     |                                                             |
     | 3. (Network drops / App restarts)                           |
     |    GET /api/v1/uploads/:id/status                           |
     |------------------------------------------------------------>|
     |    200 OK: { receivedChunks: [1, 2, ...] }                  |
     |<------------------------------------------------------------|
     |                                                             |
     | 4. Client sends only missing chunks                         |
     |------------------------------------------------------------>|
     |                                                             |
     | 5. POST /api/v1/uploads/:id/complete                        |
     |------------------------------------------------------------>|
     |    - Sequential stream assembly into single file            |
     |    - Verifies assembled byte size matches declared size     |
     |    - Verifies SHA-256 checksum match                        |
     |    - Atomic rename into storage directory                   |
     |    - Prisma transaction creates metadata record             |
     |    200 OK: VirtualFileMetadata                              |
     |<------------------------------------------------------------|
```

- **Temporary Storage Isolation**: Active uploads write chunks to `.cloud_internal/uploads/:sessionId/chunk_N.part`. Incomplete uploads are NEVER exposed in virtual file listings until completed.
- **24-Hour Session Retention**: Expired or aborted upload sessions are automatically pruned from disk and database by `UploadService.cleanupAbandonedSessions()`.
- **Integrity Verification**: `POST /complete` verifies total byte length and computes SHA-256 hash. If client checksum is supplied, any mismatch rejects with `400 CHECKSUM_MISMATCH` and scrubs the temporary assembly file.
- **Disk Safety Reserve**: Upload sessions verify laptop storage has available space plus a 50 MB safety margin, rejecting with `507 INSUFFICIENT_STORAGE` before accepting chunks.

### 2. File & Directory Management Operations
- **Folder Creation**: `POST /api/v1/folders` creates virtual folder and syncs directory to laptop disk.
- **Folder Rename / Move**: `PATCH /api/v1/folders/:id` renames or moves folders. Includes **cycle detection** (`isDescendantOf`), rejecting attempts to move a folder into itself (`400 CANNOT_MOVE_INTO_SELF`) or into any of its subfolders (`400 CANNOT_MOVE_INTO_CHILD`). Automatically rewrites descendant paths in disk and database within a Prisma transaction.
- **Folder Deletion**: `DELETE /api/v1/folders/:id` protects against accidental loss by rejecting non-empty folders (`400 FOLDER_NOT_EMPTY`). Passing `?recursive=true` recursively deletes all child folders and child files on disk and in database.
- **File Rename / Move**: `PATCH /api/v1/files/:id` updates name or target folder, moving files safely on disk without leaving stale paths.
- **File Deletion**: `DELETE /api/v1/files/:id` supports soft-delete or permanent unlinking (`?permanent=true`).
- **Duplicate Prevention**: Rejects creating or renaming files/folders to an existing name at the same directory level (`409 FILE_ALREADY_EXISTS`, `409 FOLDER_ALREADY_EXISTS`).

### 3. Mobile Transfer Manager & UI
- **Bounded Concurrency**: Limits simultaneous uploads and downloads to `MAX_CONCURRENT_TRANSFERS = 2` to prevent memory exhaustion and connection starvation on mobile devices.
- **State Machine**: Tracks transfers across `pending`, `uploading`, `downloading`, `paused`, `completed`, `failed`, and `cancelled` states.
- **Resumable Downloads**: Uses byte ranges via `expo-file-system` (`createDownloadResumable`).
- **Transfer Modal (`TransferManagerModal.tsx`)**: Displays real-time progress percentages, transfer speed (e.g. `1.2 MB/s`), transfer direction badges, error messages, and control buttons (Pause, Resume, Retry, Cancel).
- **Document Picker**: Integrated with `expo-document-picker` to select files from device storage and queue them into the Transfer Manager.

### 4. Real-Time Updates & Fallback Semantics
- Socket.IO engine broadcasts `file:created`, `file:updated`, `file:deleted`, `folder:created`, `folder:updated`, `folder:deleted`, and `transfer:progress`.
- **Graceful Fallback**: The core REST API upload, download, and file operations function 100% reliably even if Socket.IO is disconnected or blocked by network firewalls.

### 5. Platform Background Transfer Considerations
- **Android**: Long-running transfers when the screen is locked or app is sent to the background require foreground service notifications or WorkManager. The Mobile Transfer Manager saves active chunk indices and transfer progress in `AsyncStorage` (`@personal_cloud_transfer_queue`). If the OS suspends the app process, the transfers transition to `paused` state on restart, allowing one-tap resumption without re-uploading completed chunks.
- **iOS**: iOS background URLSession limits granular chunk inspection. By using isolated chunk uploads of 512 KB – 1 MB, each chunk finishes quickly within standard background execution windows.

---

## Phase 6: Security & Reliability Hardening 🛡️🔒

Phase 6 implements end-to-end security protections, threat mitigations, and reliability safeguards across the laptop server and mobile application.

### 1. Hardening Highlights
- **Threat Model**: Comprehensive risk assessment documented in [`docs/SECURITY_AND_THREAT_MODEL.md`](./docs/SECURITY_AND_THREAT_MODEL.md) covering 8 realistic threat vectors (unauthorized LAN devices, stolen credentials, path traversal, malicious filenames, disk exhaustion, interrupted transfers, accidental internet exposure, and token leakage).
- **Filesystem Boundary Protection**: Fixed prefix collision attacks in `LocalStorageProvider` (`isPathInsideRoot`). Enforces canonical path resolution, symlink escape detection, and protects root directory against accidental deletion (`OPERATION_NOT_ALLOWED`).
- **Malicious Filename Defense**: `validateSafeFileName` rejects Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`), null-bytes (`\0`), control characters, trailing dots/spaces, and NTFS illegal characters (`<>:"/\\|?*`).
- **Storage Disconnect Safety**: File operations fail safely with HTTP 503 `STORAGE_INACCESSIBLE` if the storage directory becomes unmounted or disconnected.
- **Rate Limiting**: `express-rate-limit` enforces strict limits on pairing routes (`20 req / 15 min`) to thwart brute-force PIN attacks, and general LAN rate limits (`1000 req / min`).
- **HTTP Security Headers**: `helmet` headers protect against clickjacking, MIME sniffing, and cross-origin resource leaks.
- **Privacy-Conscious Logging**: `sanitizeUrlForLog` and `Logger.sanitizeMeta` automatically scrub tokens, PINs, passwords, and authorization headers from stdout and log files.
- **Transport Security (TLS / HTTPS)**: Configurable HTTPS support via `HTTPS_ENABLED=true` and custom SSL certs/keys. Remote internet exposure is disabled by default. Strict certificate verification is maintained in production.
- **Database Concurrency & Crash Resilience**: SQLite initialized on bootstrap with `PRAGMA journal_mode = WAL;`, `PRAGMA busy_timeout = 5000;`, and `PRAGMA foreign_keys = ON;`.
- **System Diagnostics**: `GET /api/v1/health` provides real-time database connectivity, storage status, and memory usage metrics (`rssMb`, `heapUsedMb`).

See [`docs/SECURITY_AND_THREAT_MODEL.md`](./docs/SECURITY_AND_THREAT_MODEL.md) for full deployment instructions, Windows Firewall rules, Task Scheduler auto-start, and metadata backup/restore procedures.

---

## All Available Scripts

| Command | Action |
|---|---|
| `npm run dev:server` | Start Express backend with hot reloading via `tsx watch` |
| `npm run dev:mobile` | Start Expo development server |
| `npm run build:server` | Compile TypeScript backend to `apps/server/dist` |
| `npm run test` | Run all backend and mobile tests across workspaces (**121 tests passing**) |
| `npm run test:server` | Run backend Supertest & Vitest test suites (**107 tests passing**) |
| `npm run test:mobile` | Run mobile client Vitest test suites (**14 tests passing**) |
| `npm run typecheck` | Run `tsc --noEmit` across all workspaces |
| `npm run db:migrate` | Run Prisma database migrations |
| `npm run db:generate` | Regenerate Prisma client |

