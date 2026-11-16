-- CreateTable
CREATE TABLE "BookingSubmission" (
    "keyHash" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingSubmission_pkey" PRIMARY KEY ("keyHash")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingSubmission_requestId_key" ON "BookingSubmission"("requestId");

-- AddForeignKey
ALTER TABLE "BookingSubmission" ADD CONSTRAINT "BookingSubmission_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BookingRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
