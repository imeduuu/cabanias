ALTER TABLE "BusinessSettings"
ADD COLUMN "bookingPersonalDataRetentionMonths" INTEGER NOT NULL DEFAULT 24;

ALTER TABLE "BusinessSettings"
ADD CONSTRAINT "business_booking_personal_data_retention_months"
CHECK ("bookingPersonalDataRetentionMonths" BETWEEN 1 AND 1200);
