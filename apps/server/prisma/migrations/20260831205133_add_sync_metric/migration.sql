-- CreateTable
CREATE TABLE "SyncMetric" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "release" TEXT,
    "playerFound" INTEGER NOT NULL DEFAULT 0,
    "playerMissing" INTEGER NOT NULL DEFAULT 0,
    "commandsSent" INTEGER NOT NULL DEFAULT 0,
    "commandsApplied" INTEGER NOT NULL DEFAULT 0,
    "commandsFailed" INTEGER NOT NULL DEFAULT 0,
    "joinAttempts" INTEGER NOT NULL DEFAULT 0,
    "joinSuccess" INTEGER NOT NULL DEFAULT 0,
    "reconnects" INTEGER NOT NULL DEFAULT 0,
    "hardSeeks" INTEGER NOT NULL DEFAULT 0,
    "catchupExhausted" INTEGER NOT NULL DEFAULT 0,
    "autoplayBlocked" INTEGER NOT NULL DEFAULT 0,
    "contentMismatch" INTEGER NOT NULL DEFAULT 0,
    "driftLt1" INTEGER NOT NULL DEFAULT 0,
    "driftLt3" INTEGER NOT NULL DEFAULT 0,
    "driftLt5" INTEGER NOT NULL DEFAULT 0,
    "driftLt10" INTEGER NOT NULL DEFAULT 0,
    "driftGte10" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncMetric_expiresAt_idx" ON "SyncMetric"("expiresAt");

-- CreateIndex
CREATE INDEX "SyncMetric_platform_createdAt_idx" ON "SyncMetric"("platform", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncMetric_sessionId_source_key" ON "SyncMetric"("sessionId", "source");
