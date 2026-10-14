-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StorageVolume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "appVersion" TEXT,
    "fingerprint" TEXT,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "pairedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Device" ("appVersion", "createdAt", "deviceId", "deviceName", "fingerprint", "id", "isRevoked", "lastSeenAt", "pairedAt", "platform", "updatedAt") SELECT "appVersion", "createdAt", "deviceId", "deviceName", "fingerprint", "id", "isRevoked", "lastSeenAt", "pairedAt", "platform", "updatedAt" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE UNIQUE INDEX "Device_deviceId_key" ON "Device"("deviceId");
CREATE INDEX "Device_deviceId_idx" ON "Device"("deviceId");
CREATE INDEX "Device_userId_idx" ON "Device"("userId");
CREATE TABLE "new_File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL DEFAULT '',
    "relativePath" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "category" TEXT NOT NULL DEFAULT 'other',
    "checksum" TEXT,
    "folderId" TEXT,
    "volumeId" TEXT,
    "hasThumbnail" BOOLEAN NOT NULL DEFAULT false,
    "thumbnailPath" TEXT,
    "mtime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "File_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "File_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "StorageVolume" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_File" ("category", "checksum", "createdAt", "folderId", "hasThumbnail", "id", "mimeType", "name", "relativePath", "sizeBytes", "thumbnailPath", "updatedAt") SELECT "category", "checksum", "createdAt", "folderId", "hasThumbnail", "id", "mimeType", "name", "relativePath", "sizeBytes", "thumbnailPath", "updatedAt" FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";
CREATE UNIQUE INDEX "File_relativePath_key" ON "File"("relativePath");
CREATE INDEX "File_folderId_idx" ON "File"("folderId");
CREATE INDEX "File_category_idx" ON "File"("category");
CREATE INDEX "File_isDeleted_idx" ON "File"("isDeleted");
CREATE INDEX "File_status_idx" ON "File"("status");
CREATE INDEX "File_volumeId_idx" ON "File"("volumeId");
CREATE TABLE "new_Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentId" TEXT,
    "volumeId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Folder_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "StorageVolume" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Folder" ("createdAt", "id", "name", "parentId", "path", "updatedAt") SELECT "createdAt", "id", "name", "parentId", "path", "updatedAt" FROM "Folder";
DROP TABLE "Folder";
ALTER TABLE "new_Folder" RENAME TO "Folder";
CREATE UNIQUE INDEX "Folder_path_key" ON "Folder"("path");
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");
CREATE INDEX "Folder_isDeleted_idx" ON "Folder"("isDeleted");
CREATE INDEX "Folder_volumeId_idx" ON "Folder"("volumeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StorageVolume_path_key" ON "StorageVolume"("path");
