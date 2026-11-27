import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { readQuote } from "../src/modules/bookings/quote-security";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createInitialAdministrator, createRuntimeAuth } from "../src/modules/auth/core";
import { assertLocalUrl } from "../scripts/local-db-safety.mjs";
import { seedDemo } from "../src/modules/management/demo";
import { changeRequestStatus, createManualBlock, createRequest, quoteRequest } from "../src/modules/bookings/service";

function nativeForm(html: string, kind: string, index = 0) {
  // Scan complete form segments linearly; a missing form must not trigger regex backtracking on Flight data.
  const matches: string[] = [];
  for (const segment of html.split("</form>")) {
    const start = segment.lastIndexOf("<form ");
    if (start < 0) continue;
    const headerEnd = segment.indexOf(">", start);
    if (headerEnd >= 0 && segment.slice(start,headerEnd).includes(`data-management="${kind}"`)) matches.push(segment.slice(headerEnd+1));
  }
  assert.ok(matches[index], `Missing form ${kind}`);
  const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const form = new FormData();
  for (const input of matches[index].matchAll(/<input\b[^>]*>/g)) {
    if (!/type="hidden"/.test(input[0])) continue;
    const name = input[0].match(/name="([^"]+)"/)?.[1];
    if (name) form.set(decode(name), decode(input[0].match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  return form;
}

test("admin authentication over HTTP and direct server access", { skip: !process.env.TEST_DATABASE_URL, timeout: 180000 }, async () => {
  assertLocalUrl(process.env.TEST_DATABASE_URL, "test");
  const base = "http://127.0.0.1:3101";
  process.env.BETTER_AUTH_URL = base;
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("hex");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }) });
  const email = "synthetic-auth@example.test", password = randomBytes(32).toString("base64url");
  const clearCabinRequests = async (cabinId: string) => {
    const requests = await db.bookingRequest.findMany({ where: { cabinId }, select: { id: true } });
    const requestIds = requests.map(row => row.id);
    await db.notificationOutbox.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.bookingSubmission.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.bookingRequest.deleteMany({ where: { cabinId } });
  };
  let child: ReturnType<typeof spawn> | undefined;
  let startupLog = "";
  const request = (path: string, init: RequestInit = {}) => fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(30000), ...init });
  const routes = ["/admin", "/admin/cabanas", "/admin/solicitudes", "/admin/configuracion"];
  try {
    process.env.BETTER_AUTH_URL = "https://admin.example.test";
    assert.equal(createRuntimeAuth(db).options.advanced?.useSecureCookies, true);
    process.env.BETTER_AUTH_URL = "http://admin.example.test";
    assert.throws(() => createRuntimeAuth(db));
    process.env.BETTER_AUTH_URL = base;
    await createInitialAdministrator(db, { email, name: "Synthetic Auth Test", password });
    await assert.rejects(createInitialAdministrator(db, { email: "second@example.test", name: "Second", password }));
    const account = await db.account.findFirstOrThrow();
    assert.ok(account.password && account.password !== password && !account.password.includes(password));
    await assert.rejects(db.administrator.create({ data: { email: "second@example.test", name: "Second" } }));
    child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3101"], {
      env: { ...process.env, AUTH_HTTP_TEST: "1", NODE_OPTIONS: "", NODE_ENV: "development", DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", data => { startupLog = (startupLog + data).slice(-4000); });
    child.stderr?.on("data", data => { startupLog = (startupLog + data).slice(-4000); });
    let ready = false;
    for (let i = 0; i < 90; i++) {
      if (child.exitCode !== null) throw new Error(`El servidor HTTP de pruebas terminó prematuramente: ${startupLog.replaceAll(password, "[redacted]").replaceAll(process.env.TEST_DATABASE_URL!, "[redacted]").replaceAll(process.env.BETTER_AUTH_SECRET!, "[redacted]")}`);
      try { if ((await request("/login")).status === 200) { ready = true; break; } } catch { /* server starting */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "El servidor de pruebas debe iniciar.");
    for (const route of routes) {
      const response = await request(route);
      assert.equal(response.status, 307);
      assert.equal(response.headers.get("location"), "/login");
      const forged = await request(route, { headers: { cookie: "better-auth.session_token=forged" } });
      assert.equal(forged.status, 307);
      // Follow Next's canonical _rsc redirect before inspecting its authorization result.
      const rsc = await fetch(base + route, { headers: { RSC: "1" }, redirect: "follow", signal: AbortSignal.timeout(30000) });
      const rscBody = await rsc.text();
      assert.ok([rsc.url, rsc.headers.get("location"), rsc.headers.get("x-nextjs-redirect"), rscBody].some(value => value?.includes("/login")),
        `RSC redirect missing: status ${rsc.status}; headers ${JSON.stringify([...rsc.headers])}; body ${rscBody.slice(-500)}`);
    }
    const post = (path: string, body: object, cookie?: string, origin = base) => request(path, {
      method: "POST", headers: { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await post("/api/auth/sign-up/email", { email, name: "Test", password })).status, 404);
    assert.equal((await post("/api/auth/sign-in/email", { email, password: randomBytes(20).toString("hex") })).status, 401);
    assert.equal((await post("/api/auth/sign-in/email", { email, password }, undefined, "https://untrusted.example.test")).status, 403);
    const login = await post("/api/auth/sign-in/email", { email, password, rememberMe: false });
    assert.equal(login.status, 200);
    const setCookies = login.headers.getSetCookie();
    const sessionCookie = setCookies.find(cookie => cookie.startsWith("better-auth.session_token="));
    assert.ok(sessionCookie);
    assert.match(sessionCookie, /httponly/i);
    assert.match(sessionCookie, /samesite=lax/i);
    const cookie = setCookies.map(value => value.split(";")[0]).join("; ");
    let action = "";
    for (const route of routes) {
      const response = await request(route, { headers: { cookie } });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes("Cerrar sesión"));
      action ||= html.match(/name="\$ACTION_ID_([^"]+)"/)?.[1] ?? "";
    }
    assert.ok(action, "La acción real de logout debe renderizarse.");
    // Real server actions: the native HTML forms contain React's bound action metadata.
    const pageHtml = async (path: string) => (await request(path, { headers: { cookie } })).text();
    let anonymousCookie = "";
    const submit = async (path: string, form: FormData, authenticated = true) => {
      const response = await request(path, { method: "POST", headers: { origin: base,
        ...(authenticated ? { cookie } : anonymousCookie ? { cookie: anonymousCookie } : {}) }, body: form });
      if (!authenticated) for (const value of response.headers.getSetCookie()) if (value.startsWith("cabanias.visitor=")) {
        assert.match(value,/httponly/i); anonymousCookie = value.split(";")[0];
      }
      return response;
    };
    const fields = { name: "Cabaña HTTP ficticia", slug: "http-ficticia", description: "Descripción guardada desde el panel de pruebas.",
      mode: "NIGHTLY", publicationStatus: "DRAFT", capacity: "4", bedrooms: "2", baseRateClp: "42000",
      amenities: "Terraza HTTP\nCocina HTTP", images: "/images/bosque.svg | Portada HTTP\n/images/rio.svg | Galería HTTP" };
    const fill = (form: FormData, values: Record<string, string>) => { for (const [key, value] of Object.entries(values)) form.set(key, value); return form; };
    const newHtml = await pageHtml("/admin/cabanas/nueva");
    const unauthorized = await submit("/admin/cabanas/nueva", fill(nativeForm(newHtml, "cabin"), fields), false);
    assert.equal(unauthorized.status, 303);
    assert.equal(await db.cabin.count({ where: { slug: fields.slug } }), 0);
    const invalid = await submit("/admin/cabanas/nueva", fill(nativeForm(newHtml, "cabin"), { ...fields, mode: "BOTH" }));
    assert.ok((await invalid.text()).includes("Selecciona una modalidad válida"));
    const created = await submit("/admin/cabanas/nueva", fill(nativeForm(newHtml, "cabin"), fields));
    assert.equal(created.status, 303);
    const cabin = await db.cabin.findUniqueOrThrow({ where: { slug: fields.slug } });
    const editPath = `/admin/cabanas/${cabin.id}`;
    assert.equal((await request(`/cabanas/${fields.slug}`)).status, 404);
    assert.equal((await request(editPath)).status, 307);
    const edited = await submit(editPath, fill(nativeForm(await pageHtml(editPath), "cabin"), { ...fields, name: "Cabaña HTTP editada", mode: "HOURLY", publicationStatus: "PUBLISHED" }));
    assert.equal(edited.status, 303);
    const detail = await request(`/cabanas/${fields.slug}`);
    assert.equal(detail.status, 200);
    let detailHtml = (await detail.text()).replace(/<!--[\s\S]*?-->/g, "");
    for (const value of ["Cabaña HTTP editada", "42.000", "Galería HTTP", "Terraza HTTP", "Arriendo por hora"]) assert.ok(detailHtml.includes(value), `Public detail missing ${value}`);
    const settingValues = { name: "Negocio HTTP ficticio", tagline: "Una identidad editable", description: "Descripción de negocio de pruebas", location: "Ubicación ficticia",
      contactEmail: "contacto@example.test", notificationEmail: "avisos@example.test", contactPhone: "+56 000 000 000", whatsappNumber: "+56 9 8765 4321", logoUrl: "/images/logo.svg", primaryColor: "#123456", accentColor: "#654321", backgroundColor: "#fafafa",
      eyebrow: "ANTETÍTULO HTTP", catalogTitle: "Catálogo HTTP", catalogDescription: "Texto de catálogo HTTP", storyTitle: "Historia HTTP", storyBody: "Texto de historia HTTP",
      cancellationPolicy: "Política HTTP editable sin reembolsos automáticos.", checkInHour: "16", checkOutHour: "10" };
    const settings = await submit("/admin/configuracion", fill(nativeForm(await pageHtml("/admin/configuracion"), "settings"), settingValues));
    assert.equal(settings.status, 303);
    const savedSettings = await db.businessSettings.findUniqueOrThrow({ where: { id: 1 } });
    assert.equal(savedSettings.notificationEmail, settingValues.notificationEmail);
    assert.equal(savedSettings.contactEmail, settingValues.contactEmail);
    assert.equal(savedSettings.whatsappNumber, "+56987654321");
    const invalidWhatsapp = await submit("/admin/configuracion", fill(nativeForm(await pageHtml("/admin/configuracion"), "settings"), { ...settingValues, whatsappNumber: "12345" }));
    assert.ok((await invalidWhatsapp.text()).includes("Revisa el número de WhatsApp"));
    assert.equal((await db.businessSettings.findUniqueOrThrow({ where: { id: 1 } })).whatsappNumber, "+56987654321");
    const home = await (await request("/")).text();
    for (const value of [settingValues.name, settingValues.tagline, settingValues.contactEmail, settingValues.primaryColor, settingValues.catalogTitle]) assert.ok(home.includes(value));
    detailHtml = await (await request(`/cabanas/${fields.slug}`)).text();
    assert.ok(detailHtml.includes(settingValues.cancellationPolicy));
    assert.ok(detailHtml.includes("https://wa.me/56987654321?text="));
    const seasonValues = { name: "Temporada HTTP", rateClp: "45000", startDate: "2031-01-01", endDate: "2031-02-01" };
    assert.equal((await submit(editPath, fill(nativeForm(await pageHtml(editPath), "season"), seasonValues))).status, 303);
    const seasonHtml = await pageHtml(editPath);
    const overlap = await submit(editPath, fill(nativeForm(seasonHtml, "season", 1), { ...seasonValues, startDate: "2031-01-15" }));
    assert.ok((await overlap.text()).includes("superponen"));
    assert.equal(await db.seasonalRate.count({ where: { cabinId: cabin.id } }), 1);
    assert.equal((await submit(editPath, fill(nativeForm(await pageHtml(editPath), "season"), { ...seasonValues, rateClp: "46000" }))).status, 303);
    detailHtml = await (await request(`/cabanas/${fields.slug}`)).text();
    assert.ok(detailHtml.includes("46.000"));
    assert.equal((await submit(editPath, nativeForm(await pageHtml(editPath), "delete-season"))).status, 303);
    assert.equal(await db.seasonalRate.count({ where: { cabinId: cabin.id } }), 0);
    // iCal feed: real server action, route handler, one-time URL, rotation and identical 404s.
    const feedPattern = /http:\/\/127\.0\.0\.1:3101\/api\/calendar\/([A-Za-z0-9_-]{43})\.ics/;
    const feedPage = await pageHtml(editPath);
    assert.ok(feedPage.includes('data-management="calendar-feed"'));
    const anonymousFeed = await submit(editPath, nativeForm(feedPage, "calendar-feed"), false);
    assert.equal(anonymousFeed.status, 303);
    assert.equal(await db.cabinCalendarFeed.count({ where: { cabinId: cabin.id } }), 0);
    const firstFeed = await submit(editPath, nativeForm(feedPage, "calendar-feed"));
    assert.equal(firstFeed.status, 200);
    const firstMatch = (await firstFeed.text()).match(feedPattern);
    assert.ok(firstMatch, "La URL del feed debe mostrarse tras generar el enlace.");
    const firstFeedUrl = firstMatch[0], firstToken = firstMatch[1];
    const feedResponse = await request(new URL(firstFeedUrl).pathname);
    assert.equal(feedResponse.status, 200);
    assert.equal(feedResponse.headers.get("content-type"), "text/calendar; charset=utf-8");
    assert.equal(feedResponse.headers.get("cache-control"), "no-store");
    assert.equal(feedResponse.headers.get("referrer-policy"), "no-referrer");
    assert.ok((await feedResponse.text()).startsWith("BEGIN:VCALENDAR"));
    const storedFeed = await db.cabinCalendarFeed.findUniqueOrThrow({ where: { cabinId: cabin.id } });
    const reloaded = await pageHtml(editPath);
    assert.ok(!reloaded.includes(firstToken) && !reloaded.includes(storedFeed.tokenHash));
    const unconfirmed = await submit(editPath, nativeForm(reloaded, "calendar-feed"));
    assert.ok((await unconfirmed.text()).includes("Marca la confirmación"));
    assert.equal((await db.cabinCalendarFeed.findUniqueOrThrow({ where: { cabinId: cabin.id } })).tokenHash, storedFeed.tokenHash);
    const rotateForm = nativeForm(reloaded, "calendar-feed"); rotateForm.set("confirmRotate", "yes");
    const rotatedFeed = await submit(editPath, rotateForm);
    assert.equal(rotatedFeed.status, 200);
    const rotatedMatch = (await rotatedFeed.text()).match(feedPattern);
    assert.ok(rotatedMatch && rotatedMatch[1] !== firstToken);
    assert.equal((await request(new URL(rotatedMatch[0]).pathname)).status, 200);
    const stale = await request(new URL(firstFeedUrl).pathname), unknown = await request("/api/calendar/nope.ics");
    assert.equal(stale.status, 404);
    assert.equal(unknown.status, 404);
    assert.equal(stale.headers.get("content-type"), unknown.headers.get("content-type"));
    assert.equal(await stale.text(), await unknown.text());
    assert.equal((await submit("/admin/cabanas", nativeForm(await pageHtml("/admin/cabanas"), "publication"))).status, 303);
    assert.equal((await request(`/cabanas/${fields.slug}`)).status, 404);
    assert.ok(!(await (await request("/cabanas")).text()).includes("Cabaña HTTP editada"));
    assert.equal((await submit("/admin/cabanas", nativeForm(await pageHtml("/admin/cabanas"), "publication"))).status, 303);
    assert.equal((await request(`/cabanas/${fields.slug}`)).status, 200);
    const deletion = nativeForm(await pageHtml("/admin/cabanas"), "delete-cabin"); deletion.set("confirmDelete", "yes");
    assert.equal((await submit("/admin/cabanas", deletion)).status, 303);
    assert.equal(await db.cabin.findUnique({ where: { id: cabin.id } }), null);
    assert.equal((await request(`/cabanas/${fields.slug}`)).status, 404);
    // Administrative request management uses the real authenticated server actions.
    const managedCabin = await db.cabin.create({ data: { slug: "managed-request-test", name: "Cabaña de solicitudes ficticias", description: "Synthetic fixture",
      mode: "HOURLY", publicationStatus: "PUBLISHED", capacity: 3, bedrooms: 1, baseRateClp: 12000,
      images: { create: { url: "/images/rio.svg", alt: "Synthetic fixture" } } } });
    const managed: Awaited<ReturnType<typeof createRequest>>[] = [];
    for (const [index, day] of [7, 7, 8, 9].entries()) {
      managed.push(await createRequest(db, { cabinId: managedCabin.id, stay: { mode: "HOURLY", startsAt: `2036-01-${String(day).padStart(2, "0")}T13:00:00Z`, endsAt: `2036-01-${String(day).padStart(2, "0")}T15:00:00Z` },
        guests: 2, guestName: `Privado Solicitud ${index}`, guestEmail: `private-admin-${index}@example.test`, guestPhone: "Contacto ficticio" }));
    }
    const originalSnapshot = managed[0].pricingSnapshot;
    await db.cabin.update({ where: { id: managedCabin.id }, data: { baseRateClp: 99999 } });
    const requestPath = (index: number) => `/admin/solicitudes/${managed[index].id}`;
    assert.equal((await request(requestPath(0))).status, 307);
    assert.equal((await request(requestPath(0), { headers: { cookie: "better-auth.session_token=forged" } })).status, 307);
    const initialDetail = await pageHtml(requestPath(0));
    for (const value of [managed[0].guestEmail, "Contacto ficticio", "24.000", "Precio guardado"]) assert.ok(initialDetail.includes(value));
    const confirmation = nativeForm(initialDetail, "request-confirmed");
    assert.equal((await submit(requestPath(0), confirmation, false)).status, 303);
    assert.equal((await db.bookingRequest.findUniqueOrThrow({ where: { id: managed[0].id } })).status, "PENDING");
    const immutable = nativeForm(await pageHtml(requestPath(0)), "request-confirmed");
    immutable.set("estimatedTotalClp", "1"); immutable.set("startsAt", "2040-01-01T00:00Z");
    assert.equal((await submit(requestPath(0), immutable)).status, 303);
    const confirmedRequest = await db.bookingRequest.findUniqueOrThrow({ where: { id: managed[0].id } });
    assert.equal(confirmedRequest.status, "CONFIRMED");
    assert.equal(confirmedRequest.estimatedTotalClp, 24000);
    assert.equal(+confirmedRequest.startsAt, +managed[0].startsAt);
    assert.deepEqual(confirmedRequest.pricingSnapshot, originalSnapshot);
    const conflicting = await submit(requestPath(1), nativeForm(await pageHtml(requestPath(1)), "request-confirmed"));
    assert.ok((await conflicting.text()).includes("fechas dejaron de estar disponibles"));
    assert.equal((await db.bookingRequest.findUniqueOrThrow({ where: { id: managed[1].id } })).status, "PENDING");
    assert.equal((await submit(requestPath(2), nativeForm(await pageHtml(requestPath(2)), "request-rejected"))).status, 303);
    assert.equal((await submit(requestPath(3), nativeForm(await pageHtml(requestPath(3)), "request-confirmed"))).status, 303);
    assert.equal((await submit(requestPath(3), nativeForm(await pageHtml(requestPath(3)), "request-cancelled"))).status, 303);
    assert.equal(await db.occupancy.count({ where: { requestId: managed[3].id } }), 0);
    const rejectedHtml = await pageHtml(requestPath(2));
    assert.ok(!rejectedHtml.includes('data-management="request-confirmed"'));
    const invalidTransition = await submit(requestPath(2), fill(nativeForm(initialDetail, "request-confirmed"), { id: managed[2].id }));
    assert.ok((await invalidTransition.text()).includes("no permite esa acción"));
    const statusNames = ["CONFIRMED", "PENDING", "REJECTED", "CANCELLED"];
    for (const [index, status] of statusNames.entries()) {
      const filtered = await pageHtml(`/admin/solicitudes?status=${status}`);
      assert.ok(filtered.includes(managed[index].guestName));
      assert.ok(!filtered.includes(managed[(index + 1) % 4].guestName));
    }
    const dateFiltered = await pageHtml("/admin/solicitudes?from=2036-01-07&to=2036-01-07");
    assert.ok(dateFiltered.includes(managed[0].guestName) && dateFiltered.includes(managed[1].guestName));
    assert.ok(!dateFiltered.includes(managed[2].guestName));
    assert.ok((await pageHtml("/admin/solicitudes?from=2036-01-09&to=2036-01-07")).includes("Revisa las fechas"));
    const countsHtml = (await pageHtml("/admin")).replace(/<!--[\s\S]*?-->/g, "");
    assert.ok(countsHtml.includes('data-count="pending">1</strong>'));
    assert.ok(countsHtml.includes('data-count="confirmed">1</strong>'));
    const mobileList = await request("/admin/solicitudes", { headers: { cookie, "user-agent": "Mozilla/5.0 (Linux; Android 14) Mobile" } });
    assert.equal(mobileList.status, 200);
    assert.ok((await mobileList.text()).includes("request-card"));
    const publicPrivacy = await (await request("/cabanas/managed-request-test")).text();
    for (const value of [managed[0].guestName, managed[0].guestEmail, managed[0].id]) assert.ok(!publicPrivacy.includes(value));
    const calendarPath = `/admin/calendario?cabinId=${managedCabin.id}&date=2036-01-07`;
    assert.equal((await request(calendarPath)).status, 307);
    const calendar = await pageHtml(calendarPath);
    assert.ok(calendar.includes("Reserva confirmada · ocupado") && calendar.includes("Solicitud pendiente · no ocupa"));
    assert.ok(calendar.includes("day-agenda"));
    assert.ok(!calendar.includes(managed[0].guestEmail));
    const clash = fill(nativeForm(calendar, "block-create"), { startsAt: "2036-01-07T10:00", endsAt: "2036-01-07T12:00", reason: "Synthetic confirmed collision" });
    assert.ok((await (await submit(calendarPath, clash)).text()).includes("choca con una reserva confirmada"));
    assert.equal(await db.manualBlock.count({ where: { cabinId: managedCabin.id } }), 0);
    const pendingOnly = await createRequest(db, { cabinId: managedCabin.id, stay: { mode: "HOURLY", startsAt: "2036-01-10T13:00:00Z", endsAt: "2036-01-10T15:00:00Z" },
      guests: 1, guestName: "Pending calendar test", guestEmail: "calendar@example.test" });
    const pendingCalendarPath = `/admin/calendario?cabinId=${managedCabin.id}&date=2036-01-10`;
    const pendingCalendar = await pageHtml(pendingCalendarPath);
    const blockFields = { startsAt: "2036-01-10T10:00", endsAt: "2036-01-10T12:00", reason: "Mantenimiento ficticio" };
    assert.equal((await submit(pendingCalendarPath, fill(nativeForm(pendingCalendar, "block-create"), blockFields), false)).status, 303);
    assert.equal(await db.manualBlock.count({ where: { cabinId: managedCabin.id } }), 0);
    assert.equal((await submit(pendingCalendarPath, fill(nativeForm(pendingCalendar, "block-create"), blockFields))).status, 303);
    const withBlock = await pageHtml(pendingCalendarPath);
    assert.ok(withBlock.includes("Mantenimiento ficticio") && withBlock.includes("Bloqueo manual · ocupado") && withBlock.includes("Solicitud pendiente · no ocupa"));
    const pendingUnchanged = await db.bookingRequest.findUniqueOrThrow({ where: { id: pendingOnly.id } });
    assert.equal(pendingUnchanged.status, "PENDING");
    assert.deepEqual(pendingUnchanged.pricingSnapshot, pendingOnly.pricingSnapshot);
    await assert.rejects(quoteRequest(db, { cabinId: managedCabin.id, stay: { mode: "HOURLY", startsAt: "2036-01-10T13:00Z", endsAt: "2036-01-10T15:00Z" }, guests: 1 }));
    const secondBlock = await submit(pendingCalendarPath, fill(nativeForm(withBlock, "block-create"), blockFields));
    assert.ok((await secondBlock.text()).includes("otro bloqueo"));
    const removeBlock = fill(nativeForm(withBlock, "block-delete"), { confirmDelete: "yes" });
    assert.equal((await submit(pendingCalendarPath, removeBlock, false)).status, 303);
    assert.equal(await db.manualBlock.count({ where: { cabinId: managedCabin.id } }), 1);
    assert.equal((await submit(pendingCalendarPath, fill(nativeForm(await pageHtml(pendingCalendarPath), "block-delete"), { confirmDelete: "yes" }))).status, 303);
    assert.equal(await db.manualBlock.count({ where: { cabinId: managedCabin.id } }), 0);
    await quoteRequest(db, { cabinId: managedCabin.id, stay: { mode: "HOURLY", startsAt: "2036-01-10T13:00Z", endsAt: "2036-01-10T15:00Z" }, guests: 1 });
    const adjacent = await submit(calendarPath, fill(nativeForm(await pageHtml(calendarPath), "block-create"), { startsAt: "2036-01-07T12:00", endsAt: "2036-01-07T13:00", reason: "Contiguo ficticio" }));
    assert.equal(adjacent.status, 303, "Exclusive checkout permits an adjacent block");
    await db.manualBlock.deleteMany({ where: { cabinId: managedCabin.id } });
    const monthlyCabin = await db.cabin.create({ data: { slug: "calendar-nightly-test", name: "Monthly synthetic cabin", description: "Fictitious", mode: "NIGHTLY", capacity: 2, bedrooms: 1, baseRateClp: 10000, publicationStatus: "PUBLISHED" } });
    await createRequest(db, { cabinId: monthlyCabin.id, stay: { mode: "NIGHTLY", arrivalDate: "2036-02-10", departureDate: "2036-02-12" }, guests: 1, guestName: "Monthly pending", guestEmail: "monthly@example.test" });
    const monthPath = `/admin/calendario?cabinId=${monthlyCabin.id}&date=2036-02-10`;
    const monthHtml = await pageHtml(monthPath);
    assert.ok(monthHtml.includes("month-desktop") && monthHtml.includes("month-mobile") && monthHtml.includes("Solicitud pendiente · no ocupa"));
    const mobileCalendar = await request(monthPath, { headers: { cookie, "user-agent": "Mozilla/5.0 (Linux; Android 14) Mobile" } });
    assert.equal(mobileCalendar.status, 200);
    await clearCabinRequests(monthlyCabin.id);
    await db.cabin.delete({ where: { id: monthlyCabin.id } });
    await clearCabinRequests(managedCabin.id);
    await db.cabin.delete({ where: { id: managedCabin.id } });
    const form = new FormData(); form.set(`$ACTION_ID_${action}`, "");
    const directAction = await request("/admin", { method: "POST", headers: { origin: base }, body: form });
    assert.equal(directAction.status, 303);
    assert.equal(directAction.headers.get("location"), "/login");
    assert.equal(await db.session.count(), 1, "Una acción sin sesión no debe modificar sesiones.");
    await db.administrator.updateMany({ data: { active: false } });
    assert.equal((await request("/admin", { headers: { cookie } })).status, 307);
    await db.administrator.updateMany({ data: { active: true } });
    const logoutForm = new FormData(); logoutForm.set(`$ACTION_ID_${action}`, "");
    const logout = await request("/admin", { method: "POST", headers: { origin: base, cookie }, body: logoutForm });
    assert.equal(logout.status, 303);
    assert.equal(await db.session.count(), 0);
    assert.equal((await request("/admin", { headers: { cookie } })).status, 307, "Replaying a revoked cookie must fail.");
    let limited = false;
    for (let i = 0; i < 6; i++) {
      const attempt = await post("/api/auth/sign-in/email", { email, password: randomBytes(20).toString("hex") });
      if (attempt.status === 429) { limited = true; break; }
    }
    assert.ok(limited, "El limitador persistido debe bloquear intentos excesivos.");
    // A one-time seed must preserve administrator edits and intentional deletions.
    await seedDemo(db);
    const bosque = await db.cabin.findUniqueOrThrow({ where: { slug: "bosque" } });
    await db.cabin.update({ where: { id: bosque.id }, data: { name: "Demo editada", slug: "bosque-renombrado" } });
    await db.cabin.delete({ where: { slug: "rio" } });
    assert.equal((await seedDemo(db)).alreadyLoaded, true);
    assert.equal((await db.cabin.findUniqueOrThrow({ where: { id: bosque.id } })).name, "Demo editada");
    assert.equal(await db.cabin.findUnique({ where: { slug: "rio" } }), null);
    assert.equal((await db.businessSettings.findUniqueOrThrow({ where: { id: 1 } })).name, settingValues.name);
    // Public requests run without any administrative session and never return guest data.
    const nightPath = "/cabanas/bosque-renombrado";
    await db.seasonalRate.create({ data: { cabinId: bosque.id, name: "Night test season", startDate: new Date("2035-02-01T00:00Z"), endDate: new Date("2035-02-02T00:00Z"), rateClp: 90000 } });
    const nightFields = { intent: "quote", arrivalDate: "2035-02-01", departureDate: "2035-02-03", guests: "2" };
    const publicHtml = async (path: string) => (await request(path)).text();
    const nightQuote = await submit(nightPath, fill(nativeForm(await publicHtml(nightPath), "public-booking"), nightFields), false);
    const nightQuoteHtml = await nightQuote.text();
    assert.ok(nightQuoteHtml.includes("175.000"));
    assert.equal(await db.bookingRequest.count({ where: { cabinId: bosque.id } }), 0);
    const guest = { guestName: "Synthetic Guest", guestEmail: "nightguest@example.test", guestPhone: "", acknowledgement: "yes", totalClp: "1" };
    const forged = fill(nativeForm(nightQuoteHtml, "public-booking"), { ...nightFields, ...guest, intent: "request", quoteToken: "forged" });
    assert.ok((await (await submit(nightPath, forged, false)).text()).includes("Consulta nuevamente"));
    const nightSubmission = fill(nativeForm(nightQuoteHtml, "public-booking"), { ...nightFields, ...guest, intent: "request" });
    const nightSuccess = await (await submit(nightPath, nightSubmission, false)).text();
    assert.ok(nightSuccess.includes("Solicitud recibida"));
    assert.ok(!nightSuccess.includes(guest.guestEmail));
    const nightRequest = await db.bookingRequest.findFirstOrThrow({ where: { cabinId: bosque.id } });
    assert.equal(nightRequest.status, "PENDING");
    assert.equal(nightRequest.estimatedTotalClp, 175000);
    assert.equal((nightRequest.pricingSnapshot as {lines: unknown[]}).lines.length, 2);
    assert.equal(await db.occupancy.count({ where: { cabinId: bosque.id } }), 0);
    assert.ok((await (await submit(nightPath, fill(nativeForm(await publicHtml(nightPath), "public-booking"), nightFields), false)).text()).includes("175.000"));
    await changeRequestStatus(db, nightRequest.id, "CONFIRMED");
    const occupiedNight = await submit(nightPath, fill(nativeForm(await publicHtml(nightPath), "public-booking"), nightFields), false);
    assert.ok((await occupiedNight.text()).includes("período ya está ocupado"));
    const hourly = await db.cabin.create({ data: { name: "Hourly public test", slug: "hourly-public-test", description: "Fictitious test", capacity: 2, bedrooms: 1,
      mode: "HOURLY", publicationStatus: "PUBLISHED", baseRateClp: 18000, images: { create: { url: "/images/rio.svg", alt: "Fictitious" } } } });
    const hourlyPath = "/cabanas/hourly-public-test";
    const hourlyFields = { intent: "quote", date: "2035-03-03", hour: "10", duration: "3", guests: "2" };
    const hourQuoteHtml = await (await submit(hourlyPath, fill(nativeForm(await publicHtml(hourlyPath), "public-booking"), hourlyFields), false)).text();
    assert.ok(hourQuoteHtml.includes("54.000"));
    const hourlySuccess = await (await submit(hourlyPath, fill(nativeForm(hourQuoteHtml, "public-booking"), { ...hourlyFields, ...guest, guestEmail: "hourguest@example.test", intent: "request" }), false)).text();
    assert.ok(hourlySuccess.includes("Solicitud recibida"));
    const hourlyRequest = await db.bookingRequest.findFirstOrThrow({ where: { cabinId: hourly.id } });
    assert.equal(hourlyRequest.status, "PENDING");
    assert.equal(hourlyRequest.mode, "HOURLY");
    assert.equal(hourlyRequest.estimatedTotalClp, 54000);
    assert.equal((+hourlyRequest.endsAt - +hourlyRequest.startsAt) / 3600000, 3);
    await db.cabin.update({ where: { id: hourly.id }, data: { baseRateClp: 19000 } });
    const changedPrice = await submit(hourlyPath, fill(nativeForm(hourQuoteHtml, "public-booking"), { ...hourlyFields, ...guest, intent: "request", submissionKey: randomUUID() }), false);
    assert.ok((await changedPrice.text()).includes("precio o los datos cambiaron"));
    const newHourQuote = await (await submit(hourlyPath, fill(nativeForm(await publicHtml(hourlyPath), "public-booking"), hourlyFields), false)).text();
    await createManualBlock(db, { cabinId: hourly.id, startsAt: hourlyRequest.startsAt, endsAt: hourlyRequest.endsAt, reason: "Synthetic public block test" });
    const blocked = await submit(hourlyPath, fill(nativeForm(newHourQuote, "public-booking"), { ...hourlyFields, ...guest, intent: "request" }), false);
    assert.ok((await blocked.text()).includes("período ya está ocupado"));
    const limitedSubmission = await submit(hourlyPath, fill(nativeForm(newHourQuote, "public-booking"), { ...hourlyFields, ...guest, intent: "request" }), false);
    assert.ok((await limitedSubmission.text()).includes("límite de intentos"));
    assert.equal(await db.bookingRequest.count({ where: { cabinId: hourly.id } }), 1);
    await db.cabin.update({ where: { id: hourly.id }, data: { publicationStatus: "DRAFT" } });
    const unpublished = await submit(hourlyPath, fill(nativeForm(newHourQuote, "public-booking"), hourlyFields), false);
    assert.ok((await unpublished.text()).includes("no está disponible para solicitudes"));
    // Visitor A is exhausted. B gets its own signed cookie and can submit normally.
    const nextPeriod = { intent: "quote", arrivalDate: "2037-02-01", departureDate: "2037-02-03", guests: "2" };
    let visitorBCookie = "";
    const sendB = async (data: FormData) => {
      const response = await request(nightPath, { method: "POST", headers: { origin: base, ...(visitorBCookie ? {cookie:visitorBCookie} : {}) }, body:data });
      for (const value of response.headers.getSetCookie()) if(value.startsWith("cabanias.visitor=")) visitorBCookie=value.split(";")[0];
      return response;
    };
    const bQuoteHtml = await (await sendB(fill(nativeForm(await publicHtml(nightPath),"public-booking"),nextPeriod))).text();
    assert.ok(visitorBCookie && visitorBCookie !== anonymousCookie);
    const bFields = {...nextPeriod,...guest,intent:"request"};
    const bForm = fill(nativeForm(bQuoteHtml,"public-booking"),bFields);
    const bKey = String(bForm.get("submissionKey"));
    assert.ok((await (await sendB(bForm)).text()).includes("Solicitud recibida"));
    const beforeRetry = await db.bookingRequest.count();
    const expiredPayload = Buffer.from(JSON.stringify({fingerprint:"a".repeat(64),expires:Date.now()-60000})).toString("base64url");
    const expired = `${expiredPayload}.${createHmac("sha256",process.env.BETTER_AUTH_SECRET!).update(`booking-quote-v1:${expiredPayload}`).digest("base64url")}`;
    assert.throws(()=>readQuote(expired));
    const retry = fill(nativeForm(bQuoteHtml,"public-booking"),{...bFields,submissionKey:bKey,quoteToken:expired});
    assert.ok((await (await sendB(retry)).text()).includes("Solicitud recibida"));
    assert.equal(await db.bookingRequest.count(),beforeRetry);
    const mismatch = fill(nativeForm(bQuoteHtml,"public-booking"),{...bFields,submissionKey:bKey,guestName:"Different guest"});
    const mismatchHtml = await (await sendB(mismatch)).text();
    assert.ok(mismatchHtml.includes("datos distintos") && !mismatchHtml.includes(guest.guestEmail));
    const simultaneousKey = randomUUID();
    const makeConcurrent = ()=>fill(nativeForm(bQuoteHtml,"public-booking"),{...bFields,submissionKey:simultaneousKey});
    const concurrent = await Promise.all([sendB(makeConcurrent()),sendB(makeConcurrent())]);
    for(const response of concurrent) assert.ok((await response.text()).includes("Solicitud recibida"));
    assert.equal(await db.bookingRequest.count(),beforeRetry+1);
    const intentional = fill(nativeForm(bQuoteHtml,"public-booking"),{...bFields,submissionKey:randomUUID()});
    const intentionalHtml = await (await sendB(intentional)).text();
    assert.ok(intentionalHtml.includes("Solicitud recibida") && intentionalHtml.includes("Iniciar otra solicitud intencional"));
    assert.equal(await db.bookingRequest.count(),beforeRetry+2);
    const newPending = await db.bookingRequest.findMany({where:{cabinId:bosque.id,startsAt:{gte:new Date("2037-02-01Z")}}});
    assert.equal(newPending.length,3); assert.ok(newPending.every(row=>row.status === "PENDING"));
    assert.equal(await db.bookingSubmission.count(),5); // two earlier public sends plus three intentional keys
    const keys = await db.rateLimit.findMany({where:{key:{startsWith:"public-booking:v2:"}},select:{key:true}});
    assert.ok(keys.every(row=>/^public-booking:v2:(quote|request):[a-f0-9]{64}$/.test(row.key)));
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === "win32") {
        const { spawnSync } = await import("node:child_process");
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else child.kill("SIGTERM");
    }
    await db.administrator.deleteMany({ where: { email } });
    await db.$disconnect();
  }
});
