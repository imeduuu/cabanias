-- CreateTable
CREATE TABLE "DevelopmentSeed" (
    "id" TEXT NOT NULL,
    "appliedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevelopmentSeed_pkey" PRIMARY KEY ("id")
);
