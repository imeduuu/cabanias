-- Optional public WhatsApp number in E.164 (e.g. +56912345678). Additive; existing rows stay NULL.
ALTER TABLE "BusinessSettings"
    ADD COLUMN "whatsappNumber" TEXT;

ALTER TABLE "BusinessSettings"
    ADD CONSTRAINT "business_whatsapp_e164"
    CHECK ("whatsappNumber" IS NULL OR "whatsappNumber" ~ '^\+[1-9][0-9]{6,14}$');
