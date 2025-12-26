-- CreateTable
CREATE TABLE "RoomActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT,
    "timestamp" REAL,
    "videoUrl" TEXT,
    "senderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "RoomActivity_roomId_createdAt_idx" ON "RoomActivity"("roomId", "createdAt");
