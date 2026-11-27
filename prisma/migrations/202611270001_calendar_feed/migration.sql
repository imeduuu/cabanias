-- Calendar feed bearer tokens: only the SHA-256 hash is stored. Additive; does not touch Occupancy triggers or GiST constraints.

-- CreateTable
CREATE TABLE "CabinCalendarFeed" (
    "cabinId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CabinCalendarFeed_pkey" PRIMARY KEY ("cabinId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CabinCalendarFeed_tokenHash_key" ON "CabinCalendarFeed"("tokenHash");

-- AddForeignKey
ALTER TABLE "CabinCalendarFeed" ADD CONSTRAINT "CabinCalendarFeed_cabinId_fkey" FOREIGN KEY ("cabinId") REFERENCES "Cabin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written rule: the stored hash must be a lowercase SHA-256 hex digest.
ALTER TABLE "CabinCalendarFeed" ADD CONSTRAINT "calendar_feed_token_hash"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');
