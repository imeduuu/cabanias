import { getDb } from "@/lib/db";
import { calendarFeedResponse } from "@/modules/calendar-feed/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The segment is "<token>.ics": Next only treats a whole [name] segment as dynamic, so the suffix is validated in code.
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  return calendarFeedResponse(getDb(), (await context.params).file);
}
