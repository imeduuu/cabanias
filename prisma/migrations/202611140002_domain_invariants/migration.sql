-- Hand-written invariants: preserve when creating future migrations (not represented by Prisma).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "BusinessSettings" ADD CONSTRAINT "business_singleton" CHECK (id = 1),
 ADD CONSTRAINT "business_locale" CHECK (timezone = 'America/Santiago' AND currency = 'CLP'),
 ADD CONSTRAINT "business_hours" CHECK ("checkInHour" BETWEEN 0 AND 23 AND "checkOutHour" BETWEEN 0 AND 23);
ALTER TABLE "Cabin" ADD CONSTRAINT "cabin_numbers" CHECK (capacity > 0 AND bedrooms >= 0 AND "baseRateClp" >= 0);
ALTER TABLE "CabinImage" ADD CONSTRAINT "image_position" CHECK (position >= 0);
ALTER TABLE "Administrator" ADD CONSTRAINT "admin_email_normalized" CHECK (email = lower(trim(email)) AND length(trim("passwordHash")) > 0);
ALTER TABLE "SeasonalRate" ADD CONSTRAINT "season_valid" CHECK ("startDate" < "endDate" AND "rateClp" >= 0),
 ADD CONSTRAINT "season_no_overlap" EXCLUDE USING gist ("cabinId" WITH =, daterange("startDate", "endDate", '[)') WITH &&);
ALTER TABLE "BookingRequest" ADD CONSTRAINT "request_valid" CHECK (
 "startsAt" < "endsAt" AND guests > 0 AND "estimatedTotalClp" >= 0 AND currency = 'CLP'
 AND length(trim("guestName")) > 0 AND length(trim("guestEmail")) > 0);
ALTER TABLE "ManualBlock" ADD CONSTRAINT "block_valid" CHECK ("startsAt" < "endsAt" AND length(trim(reason)) > 0);
ALTER TABLE "Occupancy" ADD CONSTRAINT "occupancy_valid" CHECK (
 "startsAt" < "endsAt" AND (("requestId" IS NOT NULL)::int + ("blockId" IS NOT NULL)::int) = 1),
 ADD CONSTRAINT "occupancy_no_overlap" EXCLUDE USING gist (
 "cabinId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&);

CREATE FUNCTION validate_request() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c "Cabin";
BEGIN
 SELECT * INTO STRICT c FROM "Cabin" WHERE id = NEW."cabinId" FOR UPDATE;
 IF NEW.mode <> c.mode OR NEW.guests > c.capacity THEN
  RAISE EXCEPTION 'Invalid cabin mode or capacity' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'PENDING' OR c."publicationStatus" <> 'PUBLISHED' THEN
   RAISE EXCEPTION 'Requests must start pending on a published cabin' USING ERRCODE = '23514';
  END IF;
 ELSE
  IF (NEW."cabinId", NEW.mode, NEW."startsAt", NEW."endsAt", NEW.guests, NEW."estimatedTotalClp", NEW."pricingSnapshot", NEW.currency)
   IS DISTINCT FROM
   (OLD."cabinId", OLD.mode, OLD."startsAt", OLD."endsAt", OLD.guests, OLD."estimatedTotalClp", OLD."pricingSnapshot", OLD.currency) THEN
   RAISE EXCEPTION 'Request terms are immutable; create a new request' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
   (OLD.status = 'PENDING' AND NEW.status IN ('CONFIRMED','REJECTED','CANCELLED')) OR
   (OLD.status = 'CONFIRMED' AND NEW.status = 'CANCELLED')) THEN
   RAISE EXCEPTION 'Invalid request status transition' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'CONFIRMED' AND OLD.status <> 'CONFIRMED' AND c."publicationStatus" <> 'PUBLISHED' THEN
   RAISE EXCEPTION 'Cabin is not published' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER request_validation BEFORE INSERT OR UPDATE ON "BookingRequest" FOR EACH ROW EXECUTE FUNCTION validate_request();

CREATE FUNCTION protect_cabin_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.mode <> OLD.mode AND EXISTS (SELECT 1 FROM "BookingRequest" WHERE "cabinId" = OLD.id) THEN
  RAISE EXCEPTION 'Cannot change mode with request history' USING ERRCODE = '23514';
 END IF;
 IF EXISTS (SELECT 1 FROM "BookingRequest" WHERE "cabinId" = OLD.id AND status IN ('PENDING','CONFIRMED') AND guests > NEW.capacity) THEN
  RAISE EXCEPTION 'Capacity below an active request' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cabin_terms BEFORE UPDATE ON "Cabin" FOR EACH ROW EXECUTE FUNCTION protect_cabin_terms();

CREATE FUNCTION sync_request_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status = 'CONFIRMED' THEN
  INSERT INTO "Occupancy" (id, "cabinId", "startsAt", "endsAt", "requestId")
  VALUES (gen_random_uuid(), NEW."cabinId", NEW."startsAt", NEW."endsAt", NEW.id)
  ON CONFLICT ("requestId") DO UPDATE SET "startsAt" = EXCLUDED."startsAt", "endsAt" = EXCLUDED."endsAt";
 ELSE
  DELETE FROM "Occupancy" WHERE "requestId" = NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER request_occupancy AFTER INSERT OR UPDATE ON "BookingRequest" FOR EACH ROW EXECUTE FUNCTION sync_request_occupancy();

CREATE FUNCTION lock_block_cabin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW."cabinId" <> OLD."cabinId" THEN
  RAISE EXCEPTION 'Cannot move a block to another cabin' USING ERRCODE = '23514';
 END IF;
 PERFORM 1 FROM "Cabin" WHERE id = NEW."cabinId" FOR UPDATE;
 RETURN NEW;
END $$;
CREATE TRIGGER block_lock BEFORE INSERT OR UPDATE ON "ManualBlock" FOR EACH ROW EXECUTE FUNCTION lock_block_cabin();
CREATE FUNCTION sync_block_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "Occupancy" (id, "cabinId", "startsAt", "endsAt", "blockId")
 VALUES (gen_random_uuid(), NEW."cabinId", NEW."startsAt", NEW."endsAt", NEW.id)
 ON CONFLICT ("blockId") DO UPDATE SET "startsAt" = EXCLUDED."startsAt", "endsAt" = EXCLUDED."endsAt";
 RETURN NEW;
END $$;
CREATE TRIGGER block_occupancy AFTER INSERT OR UPDATE ON "ManualBlock" FOR EACH ROW EXECUTE FUNCTION sync_block_occupancy();

-- FK cascades remove occupation when its source is deleted. Reject manual projection writes.
CREATE FUNCTION protect_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() < 2 THEN
  RAISE EXCEPTION 'Occupancy is an internal projection' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER occupancy_internal BEFORE INSERT OR UPDATE OR DELETE ON "Occupancy" FOR EACH ROW EXECUTE FUNCTION protect_occupancy();
