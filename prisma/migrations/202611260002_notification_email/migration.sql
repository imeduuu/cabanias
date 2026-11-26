ALTER TABLE "BusinessSettings"
    ADD COLUMN "notificationEmail" TEXT;

UPDATE "BusinessSettings"
SET "notificationEmail" = "contactEmail"
WHERE "notificationEmail" IS NULL;

ALTER TABLE "BusinessSettings"
    ALTER COLUMN "notificationEmail" SET NOT NULL;
