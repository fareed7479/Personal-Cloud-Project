# Personal Cloud Storage: Security Architecture, Threat Model & Hardening Guide

This document specifies the security architecture, threat model, hardening implementations, and operational procedures for the Personal Cloud Storage platform.

---

## 1. Threat Model & Risk Analysis

The Personal Cloud Storage system operates primarily in local area network (LAN) environments, where laptops act as primary storage servers and mobile devices interact as virtual cloud clients. The following matrix details the realistic threats, potential impact, implemented mitigations, and residual risks:

| Threat Vector | Threat Description & Attack Vector | Impact | Implemented Mitigation | Residual Risk & Guidance |
| :--- | :--- | :--- | :--- | :--- |
| **1. Unauthorized LAN Devices** | Malicious devices or rogue guests on the same Wi-Fi subnet scanning open ports to access or delete files. | Unauthorized data access, data exfiltration, arbitrary file deletion. | All file, folder, device, and upload routes require cryptographic `Bearer` tokens. Tokens are 64-character entropy strings stored as SHA-256 hashes in SQLite. Pairing requires explicit laptop console confirmation and one-time 6-digit PIN. | Compromised Wi-Fi networks allow packet sniffing if running over plain HTTP. Use WPA3 / Wi-Fi isolation or enable TLS. |
| **2. Stolen or Revoked Device Credentials** | Lost/stolen phone or rogue client reusing previously issued auth tokens. | Continued unauthorized access after device loss. | Real-time token revocation (`/api/v1/devices/:deviceId/revoke`). Device records maintain `isRevoked: true`. `authMiddleware` queries DB and immediately rejects revoked tokens with HTTP 403 `DEVICE_REVOKED`. | Local cache on stolen device may still contain downloaded offline files until user wipes the mobile client. |
| **3. Path Traversal & Malicious Filenames** | Attacker submitting `../../Windows/System32`, sibling directory collisions (`Storage_evil`), symlink escapes, or Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`). | Arbitrary host filesystem read/write, host command execution, OS blue-screen / denial of service. | Strict boundary validation in `LocalStorageProvider.resolveSafePath` enforcing `canonicalRoot + path.sep`. Symlink resolution and target verification. Comprehensive `validateSafeFileName` rejecting Windows reserved names, null-bytes (`\0`), control characters, trailing dots/spaces, and NTFS invalid characters (`<>:"/\\|?*`). | Files created outside the application root via external tools must be re-indexed safely via `/api/v1/storage/rescan`. |
| **4. Malicious or Oversized Uploads** | Attacker pushing multi-gigabyte payloads in a single HTTP request to exhaust server RAM. | Heap exhaustion, Node.js process out-of-memory crash. | Request body bounds enforced via `express.json({ limit: '2mb' })`. Large files must use chunked upload sessions (`PUT /api/v1/uploads/:id/chunks/:chunkNumber`) with bounded 50MB chunks. | Attackers could flood upload sessions; addressed by storage capacity pre-checks and rate limits. |
| **5. Disk & Resource Exhaustion** | Uploading massive files until the host laptop disk runs out of free space, crashing the OS. | Laptop system instability, database corruption. | `UploadService.initiateUploadSession` queries laptop `getDiskSpace()` and requires `sizeBytes + 50MB` safety buffer before accepting any upload. Rejects with HTTP 507 `INSUFFICIENT_STORAGE`. | Concurrent disk writes from external applications on the laptop may reduce available storage during long transfers. |
| **6. Interrupted Writes & Corrupted Transfers** | Network drops, battery death, or power cut during a multi-gigabyte upload or folder move. | Corrupted half-written files, phantom database records. | Chunks are strictly written to isolated internal directory (`.cloud_internal/uploads/<id>/`). Final assembly computes SHA-256 hash and verifies against client checksum before publishing into user storage. Incomplete sessions are never published to file listings. | Power loss mid-chunk leaves temporary chunks in `.cloud_internal`. Cleaned automatically by `cleanupAbandonedSessions()`. |
| **7. Accidental Internet Exposure** | Laptop server inadvertently bound to public IP or port-forwarded without encryption. | Global Internet vulnerability to brute-force attacks and eavesdropping. | Discovery is strictly mDNS LAN-scoped (`_personalcloud._tcp`). By default, pairing endpoints are heavily rate-limited (20 requests / 15 min), and general routes have rate limiting. Public remote exposure is strictly disabled unless explicitly routed through a secure VPN/WireGuard or reverse proxy. | User should never place the server behind a DMZ or forward port 4000 directly to the public Internet without VPN/TLS. |
| **8. Leaked Tokens & Sensitive Logs** | Sensitive auth tokens, pairing PINs, or file contents leaking to disk logs or telemetry. | Credential compromise via log file inspection. | `sanitizeUrlForLog` redacts `token`, `pin`, `password`, `key` query parameters. `sanitizeHeadersForLog` redacts `authorization` and `x-pairing-pin`. `Logger.sanitizeMeta` recursively scrubs secrets before writing to console/file. | Developer console in local development outputs pairing PIN to stdout for initial onboarding convenience. |

---

## 2. Backend Hardening Details

### 2.1 Filesystem Canonicalization & Boundary Enforcement
The file storage engine relies on `LocalStorageProvider`:
1. **Canonical Path Resolution**: Storage root is resolved to its realpath (`fs.realpath`) on startup, resolving symlinks, junctions, and Windows drive casing differences.
2. **Prefix Protection**: Checks `normCandidate.startsWith(rootWithSep)` ensuring a root like `C:\Storage` cannot match sibling paths like `C:\Storage_backup`.
3. **Symlink Escape Prevention**: If a path exists on disk, its `realpath` is checked against the root. If a symlink points outside the storage root, it is blocked with HTTP 403 `PATH_TRAVERSAL_DETECTED`.
4. **Storage Disconnect Safety**: Every operation verifies root existence; if an external drive is unmounted, it fails safely with HTTP 503 `STORAGE_INACCESSIBLE` rather than creating phantom directories on the system drive.
5. **Root Deletion Protection**: Attempting to delete `""` or `.` or the root directory throws `OPERATION_NOT_ALLOWED`.

### 2.2 Windows Reserved Device Names & Filename Rules
Windows NTFS and DOS compatibility subsystems reserve specific device names that cause driver hangs or errors if created. `validateSafeFileName` enforces:
- Rejection of `CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, `LPT1` through `LPT9` (including extensions such as `aux.txt` or `nul.json`).
- Rejection of null-byte characters (`\0`).
- Rejection of trailing dots (`.`) and trailing spaces (` `) which NTFS silently truncates.
- Rejection of characters `< > : " / \ | ? *` and control characters (0x00–0x1F).
- Max filename length: 255 characters.

### 2.3 Rate Limiting & Abuse Prevention
- **Pairing Rate Limiter**: Mounted on `/api/v1/pairing/*`. Allows a maximum of 20 requests per 15 minutes per IP address. Exceeding returns HTTP 429 `RATE_LIMIT_EXCEEDED`.
- **General Rate Limiter**: Mounted on `/api/v1/*`. Enforces 1,000 requests per minute per IP address to safeguard the laptop server against flooding attacks.
- **Challenge Attempt Limiter**: Each pairing challenge PIN allows a maximum of 5 failed attempts before immediately expiring.

### 2.4 Token Storage & Revocation
- **Mobile Client**: Auth tokens are stored in hardware-backed storage via `expo-secure-store` (iOS Keychain / Android EncryptedSharedPreferences).
- **Server Database**: The server never stores cleartext auth tokens. Only the cryptographically hashed SHA-256 digest (`authTokenHash`) is persisted in SQLite.
- **Revocation**: The server provides instant revocation via `POST /api/v1/devices/:deviceId/revoke`. Once revoked, all requests using that credential return HTTP 403 `DEVICE_REVOKED`.

---

## 3. Transport Security (LAN HTTP vs TLS)

### 3.1 Security Properties & Limitations of LAN HTTP
- **Default LAN Operation**: By default, the server operates on plain HTTP (`http://<LAN_IP>:4000`) for zero-configuration local Wi-Fi connectivity.
- **Limitations of Plain HTTP**:
  - Anyone on the same untrusted Wi-Fi network with packet capturing capabilities (e.g. Wireshark, ARP spoofing) could inspect plaintext traffic, file contents, and auth headers.
  - Recommended only on trusted home or private office Wi-Fi networks with WPA2/WPA3 encryption and Client Isolation.

### 3.2 Enabling TLS / HTTPS
For environments crossing untrusted networks, public Wi-Fi, or corporate networks, HTTPS/TLS must be enabled:

1. Generate or acquire a valid SSL certificate (e.g. using `mkcert` for local LAN or a trusted CA):
   ```bash
   # Example: generate self-signed or local CA certificates
   mkcert -install
   mkcert 192.168.1.100 laptop.local 127.0.0.1
   ```
2. Configure `.env` on the laptop server:
   ```env
   HTTPS_ENABLED=true
   SSL_KEY_PATH=./certs/key.pem
   SSL_CERT_PATH=./certs/cert.pem
   # Optional CA path if using internal root CA
   SSL_CA_PATH=./certs/ca.pem
   ```
3. Restart the server. The server automatically launches with Node.js `https.createServer` and binds both REST endpoints and Socket.IO over TLS.
4. **Certificate Verification**: In production, mobile clients verify TLS certificates using the device's system trust store. Certificate verification is **never disabled** (`rejectUnauthorized: false` is strictly prohibited).

---

## 4. Data Integrity, Crash Recovery & Database Concurrency

### 4.1 Resumable Upload Isolation & Crash Recovery
1. **Isolated Ingestion**: Upload sessions write incoming binary chunks to `.cloud_internal/uploads/<uploadId>/chunk_<n>.part`.
2. **Integrity Validation**: When `POST /api/v1/uploads/:id/complete` is called:
   - All expected chunks are sequentially assembled into `.cloud_internal/uploads/<uploadId>/assembled.tmp`.
   - The SHA-256 hash is computed in a single stream pass and verified against the client-supplied checksum.
   - If the checksum matches and the file size is verified, the file is moved atomically to the user storage root.
   - The temporary chunk folder is removed.
3. **Crash Recovery**: If the laptop is shut down or crashes during an upload:
   - Abandoned chunks remain trapped in `.cloud_internal/uploads/` and are never listed in the active database or file explorer.
   - `uploadService.cleanupAbandonedSessions()` executes on server bootstrap and deletes temporary files from expired sessions older than 24 hours.

### 4.2 SQLite Concurrency & Reliability
To prevent database locking (`SQLITE_BUSY`) during concurrent file operations:
1. **WAL Mode**: `PRAGMA journal_mode = WAL;` (Write-Ahead Logging) is executed on startup. This allows concurrent readers while a write is underway.
2. **Busy Timeout**: `PRAGMA busy_timeout = 5000;` instructs SQLite to wait up to 5,000 milliseconds when lock contention occurs instead of throwing an immediate error.
3. **Foreign Keys**: `PRAGMA foreign_keys = ON;` enforces referential integrity across users, devices, folders, and files.
4. **Synchronous Normal**: `PRAGMA synchronous = NORMAL;` delivers optimal disk I/O performance while ensuring complete database integrity across power failures with WAL.

### 4.3 Database Backup & Restore Procedure

> [!IMPORTANT]
> The database (`dev.db`) contains file and folder **metadata** (names, virtual paths, file sizes, MIME types, checksums, paired devices, and tokens). **Backing up the database does NOT back up actual physical file contents stored on the laptop's hard drive.** File contents must be backed up using standard filesystem backups.

#### Metadata Backup Command
To create an online, lock-free SQLite backup without stopping the server:
```powershell
# Using the sqlite3 CLI online backup API
sqlite3 "apps/server/prisma/dev.db" ".backup 'backups/metadata_backup.db'"
```
Alternatively, in Node.js / script:
```powershell
Copy-Item "apps\server\prisma\dev.db" "backups\metadata_backup.db"
```
*(When in WAL mode, ensure `dev.db-wal` and `dev.db-shm` are copied if copying raw files while active).*

#### Metadata Restore Procedure
1. Stop the Personal Cloud server process.
2. Replace `apps/server/prisma/dev.db` with the backup file.
3. Delete any lingering `dev.db-wal` or `dev.db-shm` files.
4. Start the server. The server will run `indexingService.scan()` on startup to reconcile any differences between restored metadata and actual files on disk.

---

## 5. Windows Deployment & Service Management

### 5.1 Windows Firewall Requirements
For the mobile device to communicate with the laptop server on the local Wi-Fi, the following inbound firewall rules must be permitted:

```powershell
# Run PowerShell as Administrator:

# 1. Allow TCP port 4000 (HTTP/HTTPS REST API and Socket.IO)
New-NetFirewallRule -DisplayName "Personal Cloud Storage (HTTP/REST)" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -Profile Private

# 2. Allow UDP port 5353 (mDNS LAN Discovery / Bonjour)
New-NetFirewallRule -DisplayName "Personal Cloud Storage (mDNS Discovery)" -Direction Inbound -LocalPort 5353 -Protocol UDP -Action Allow -Profile Private
```

> [!NOTE]
> Ensure the Wi-Fi network profile in Windows is set to **Private** (not Public), as Windows Firewall restricts LAN communication on Public networks.

### 5.2 Auto-Start on User Login (Task Scheduler)
To ensure the server starts automatically when you log into Windows:

1. Open PowerShell and register a scheduled task:
   ```powershell
   $Action = New-ScheduledTaskAction -Execute "node.exe" -Argument "apps/server/dist/server.js" -WorkingDirectory "$PWD"
   $Trigger = New-ScheduledTaskTrigger -AtLogOn
   $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0
   Register-ScheduledTask -TaskName "PersonalCloudServer" -Action $Action -Trigger $Trigger -Settings $Settings
   ```

### 5.3 Managed Service via NSSM (Non-Sucking Service Manager)
For background execution independent of user login:
```powershell
# 1. Download nssm from https://nssm.cc
# 2. Install service:
nssm install PersonalCloud "C:\Program Files\nodejs\node.exe" "D:\PROJECTS\Personal Cloud Project\apps\server\dist\server.js"
nssm set PersonalCloud AppDirectory "D:\PROJECTS\Personal Cloud Project"
nssm set PersonalCloud Start SERVICE_AUTO_START
nssm start PersonalCloud
```

### 5.4 Graceful Shutdown & Restart Guidance
The server listens for `SIGINT` and `SIGTERM`:
1. Shuts down mDNS advertisement to inform LAN clients.
2. Disconnects Socket.IO clients with graceful closure.
3. Stops accepting new HTTP connections and allows active transfers up to 10 seconds to finish.
4. Safely flushes SQLite WAL buffers and disconnects Prisma.
5. Exits cleanly with code 0.

### 5.5 Uninstallation & Data Preservation
If you wish to uninstall or remove the Personal Cloud server:
1. **Stop and unregister the service**:
   ```powershell
   Unregister-ScheduledTask -TaskName "PersonalCloudServer" -Confirm:$false
   # Or if using NSSM:
   nssm stop PersonalCloud
   nssm remove PersonalCloud confirm
   ```
2. **Data Preservation**:
   - Your actual files stored in `STORAGE_ROOT` (e.g. `D:\MyCloud` or `./storage_root`) **are never automatically deleted**.
   - If you wish to discard the metadata database, remove `apps/server/prisma/dev.db`.
   - Remove internal cache directories `.cloud_internal/` and `.cloud_cache/` if desired.

---

## 6. Dependency Vulnerability Review

Dependency vulnerability scanning was conducted using `npm audit`.
- **Finding**: Direct dependencies (`express`, `socket.io`, `prisma`, `helmet`, `express-rate-limit`, `zod`) have zero known vulnerabilities.
- **Transitive Dev Dependencies**: Transitive development tools in Expo Metro/React-Native canary packages (`postcss`, `sprintf-js`, `tar` via dev bundling tools) were reviewed. These build tools run exclusively during local bundling and are not exposed at runtime on the server or in production.

---

## 7. Remaining Security Risks & Recommended Practices

1. **Self-Signed Certificates on Mobile**: When using HTTPS on local IP addresses, mobile platforms require either installing a local Root CA on the phone (e.g. via `mkcert`) or using a dynamic DNS domain with Let's Encrypt.
2. **Untrusted Public Wi-Fi**: If connecting over a public coffee shop or airport Wi-Fi, run a private WireGuard or Tailscale tunnel between your phone and laptop rather than opening raw ports on the public LAN.
3. **External File Modifications**: Files added or deleted directly on the laptop disk bypass the HTTP API until the periodic background sync or manual rescan (`POST /api/v1/storage/rescan`) is triggered.
