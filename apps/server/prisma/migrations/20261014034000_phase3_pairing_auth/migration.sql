-- AlterTable
ALTER TABLE "Device" ADD COLUMN "authTokenHash" TEXT;
ALTER TABLE "Device" ADD COLUMN "revokedAt" DATETIME;

-- CreateTable
CREATE TABLE "PairingChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pin" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "clientDeviceId" TEXT,
    "clientDeviceName" TEXT,
    "clientPlatform" TEXT,
    "issuedToken" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PairingChallenge_status_idx" ON "PairingChallenge"("status");

-- CreateIndex
CREATE INDEX "PairingChallenge_expiresAt_idx" ON "PairingChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_authTokenHash_key" ON "Device"("authTokenHash");

-- CreateIndex
CREATE INDEX "Device_authTokenHash_idx" ON "Device"("authTokenHash");
