CREATE TYPE "NotificationEvent" AS ENUM (
    'REQUEST_CREATED',
    'REQUEST_CONFIRMED',
    'REQUEST_REJECTED',
    'REQUEST_CANCELLED'
);

CREATE TYPE "NotificationStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'SENT',
    'ERROR'
);

CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotificationOutbox_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 3),
    CONSTRAINT "NotificationOutbox_requestId_fkey" FOREIGN KEY ("requestId")
        REFERENCES "BookingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NotificationOutbox_requestId_event_key"
    ON "NotificationOutbox"("requestId", "event");
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_createdAt_idx"
    ON "NotificationOutbox"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "NotificationOutbox_status_lockedAt_idx"
    ON "NotificationOutbox"("status", "lockedAt");
