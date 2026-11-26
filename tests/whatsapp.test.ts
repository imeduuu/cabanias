import assert from "node:assert/strict";
import test from "node:test";
import { isWhatsappNumber, normalizeWhatsappNumber, stayFromSelection, whatsappLink } from "../src/modules/contact/whatsapp";

const cabin = "Refugio Bosque";
const generic = `Hola, me interesa la cabaña «${cabin}». ¿Me pueden dar más información?`;
const textOf = (href: string | null) => new URL(href!).searchParams.get("text");

test("normalizes accepted WhatsApp numbers to E.164", () => {
  for (const raw of ["+56 9 1234 5678", "+56-9-1234-5678", "+56 (9) 1234.5678", "0056912345678"]) {
    assert.equal(normalizeWhatsappNumber(raw), "+56912345678", raw);
  }
  assert.equal(normalizeWhatsappNumber("+1 415 555 2671"), "+14155552671");
});
test("rejects invalid WhatsApp numbers", () => {
  for (const raw of ["", "   ", "56912345678", "+0123456789", "++56912345678", "+56 9 1234 567a", "+123456",
    "+1234567890123456", "+56 9 1234 5678 ext 2", "+５６９１２３４５６７８"]) {
    assert.equal(normalizeWhatsappNumber(raw), null, raw);
  }
  assert.equal(isWhatsappNumber("+56912345678"), true);
  assert.equal(isWhatsappNumber("56912345678"), false);
});
test("builds a generic link without a stay", () => {
  const href = whatsappLink("+56912345678", cabin);
  assert.ok(href!.startsWith("https://wa.me/56912345678?text="));
  assert.equal(textOf(href), generic);
});
test("includes nightly stay details", () => {
  const stay = stayFromSelection("night", { arrivalDate: "2030-02-14", departureDate: "2030-02-16", guests: "2" });
  const text = textOf(whatsappLink("+56912345678", cabin, stay))!;
  for (const value of ["14/02/2030", "16/02/2030", "2 huéspedes"]) assert.ok(text.includes(value), value);
});
test("includes hourly stay details with singular and plural", () => {
  const base = { date: "2030-02-20", hour: "9", guests: "1" };
  const one = textOf(whatsappLink("+56912345678", cabin, stayFromSelection("hour", { ...base, duration: "1" })))!;
  for (const value of ["20/02/2030", "09:00", "1 hora", "1 huésped"]) assert.ok(one.includes(value), value);
  assert.ok(textOf(whatsappLink("+56912345678", cabin, stayFromSelection("hour", { ...base, duration: "2" })))!.includes("2 horas"));
});
test("never includes guest personal data", () => {
  const stay = stayFromSelection("night", { arrivalDate: "2030-02-14", departureDate: "2030-02-16", guests: "2",
    guestName: "Ada", guestEmail: "ada@example.test", guestPhone: "+56 9 0000 0000" });
  const text = textOf(whatsappLink("+56912345678", cabin, stay))!;
  assert.ok(!text.includes("Ada") && !text.includes("@") && !text.includes("0000"));
});
test("invalid selections fall back to the generic message", () => {
  const night = { arrivalDate: "2030-02-14", departureDate: "2030-02-16", guests: "2" };
  const hour = { date: "2030-02-20", hour: "9", duration: "1", guests: "1" };
  assert.equal(stayFromSelection("night", { ...night, arrivalDate: "2030-2-14" }), undefined);
  assert.equal(stayFromSelection("night", { ...night, guests: "0" }), undefined);
  assert.equal(stayFromSelection("hour", { ...hour, hour: "24" }), undefined);
  assert.equal(stayFromSelection("hour", { ...hour, duration: "0" }), undefined);
  assert.equal(stayFromSelection("night", undefined), undefined);
  assert.equal(textOf(whatsappLink("+56912345678", cabin, stayFromSelection("night", undefined))), generic);
});
test("encodes cabin names safely in the text parameter", () => {
  const name = "Río & Sol #1 ?x=1";
  const url = new URL(whatsappLink("+56912345678", name)!);
  assert.equal(url.searchParams.get("text"), `Hola, me interesa la cabaña «${name}». ¿Me pueden dar más información?`);
  assert.deepEqual([...url.searchParams.keys()], ["text"]);
  assert.equal(url.hash, "");
});
test("returns null for missing or invalid numbers", () => {
  assert.equal(whatsappLink("56912345678", cabin), null);
  assert.equal(whatsappLink(null, cabin), null);
  assert.equal(whatsappLink("", cabin), null);
});
