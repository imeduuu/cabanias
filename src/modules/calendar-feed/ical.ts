// Pure RFC 5545 writer. It only accepts opaque ids and instants so guest data cannot reach the feed.
export type FeedEvent = { uid: string; startsAt: Date; endsAt: Date };

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
export function escapeText(value: string) {
  return value.replace(CONTROL_CHARS, "").replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
export function formatUtc(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}
// Fold to at most 75 octets per physical line without splitting a UTF-8 character.
export function foldLine(line: string) {
  const parts: string[] = [];
  let current = "", size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    // Continuation lines start with one space that counts toward the 75 octets.
    if (size + bytes > 75) { parts.push(current); current = ""; size = 1; }
    current += char; size += bytes;
  }
  parts.push(current);
  return parts.map((part, index) => (index ? " " : "") + part).join("\r\n");
}
export function buildCalendar(calendarName: string, events: FeedEvent[], now: Date) {
  const stamp = formatUtc(now);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cabanias//Feed de ocupacion 1.0//ES", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(calendarName)}`, "X-WR-TIMEZONE:America/Santiago",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${escapeText(event.uid)}@cabanias-ocupacion`, `DTSTAMP:${stamp}`,
      `DTSTART:${formatUtc(event.startsAt)}`, `DTEND:${formatUtc(event.endsAt)}`, "SUMMARY:Ocupado", "TRANSP:OPAQUE",
      "STATUS:CONFIRMED", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
