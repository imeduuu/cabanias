import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderNotificationTemplate, type NotificationTemplatePayload } from "../src/modules/notifications/templates";

const payload: NotificationTemplatePayload = {
  businessName: "Refugio de prueba",
  logoUrl: "/images/logo.svg",
  location: "Valle <del>Claro</del>",
  primaryColor: "#244d40",
  accentColor: "#bb5c37",
  backgroundColor: "#faf8f2",
  cabinName: "Cabaña del bosque",
  guestName: "Ada Lovelace",
  guestEmail: "ada@example.test",
  guestPhone: "+56 9 1234 5678",
  startsAt: "2030-01-02T18:00:00.000Z",
  endsAt: "2030-01-04T14:00:00.000Z",
  mode: "NIGHTLY",
  guests: 2,
  estimatedTotalClp: 12345,
  currency: "CLP",
  pricingSnapshot: {
    lines: [
      { date: "2030-01-02", rateClp: 4000, units: 1, seasonal: false },
      { date: "2030-01-03", rateClp: 5000, units: 1, seasonal: true },
    ],
  },
  contactEmail: "contacto@example.test",
  contactPhone: "+56 2 1234 5678",
  cancellationPolicy: "Cancelaciones por correo.\nNo se realizan reembolsos automáticos.",
};

const events = [
  ["REQUEST_CREATED", "Nueva solicitud pendiente", "Nueva solicitud de reserva"],
  ["REQUEST_CONFIRMED", "Solicitud confirmada", "Tu solicitud fue confirmada"],
  ["REQUEST_REJECTED", "Solicitud rechazada", "Actualización de tu solicitud"],
  ["REQUEST_CANCELLED", "Solicitud cancelada", "Tu solicitud fue cancelada"],
] as const;

for (const [event, title, subject] of events) {
  test(`notification template ${event} includes saved request, snapshot price and cancellation policy`, () => {
    const message = renderNotificationTemplate(event, payload);
    assert.equal(message.subject, subject);
    assert.match(message.text, new RegExp(title));
    assert.match(message.text, /Total guardado: 12\.345 CLP/);
    assert.match(message.text, /Huésped: Ada Lovelace/);
    assert.match(message.text, /Correo del huésped: ada@example\.test/);
    assert.match(message.text, /Teléfono del huésped: \+56 9 1234 5678/);
    assert.match(message.text, /Inicio \(incluido\): .*3:00/);
    assert.match(message.text, /Salida \(excluida\): .*11:00/);
    assert.match(message.text, /2030-01-02: 1 noche\(s\) × 4\.000 CLP \(tarifa base guardada\)/);
    assert.match(message.text, /2030-01-03: 1 noche\(s\) × 5\.000 CLP \(temporada guardada\)/);
    assert.match(message.text, /America\/Santiago/);
    assert.match(message.text, /salida no forma parte del período reservado/);
    assert.match(message.text, /fecha de salida no suma una noche/);
    assert.match(message.text, /Política de cancelación: Cancelaciones por correo\./);
    assert.match(message.html, /Refugio de prueba/);
    assert.match(message.html, /src="\/images\/logo\.svg"/);
    assert.match(message.html, /#244d40/);
    assert.match(message.html, /contacto@example\.test/);
    assert.match(message.html, /Total guardado/);
    assert.match(message.html, /Solicitud|Nueva solicitud/);
    assert.match(message.html, /America\/Santiago/);
  });
}

test("HTML escape encodes every HTML-significant character", () => {
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("guest and business-supplied values are escaped in HTML output", () => {
  const hostile = {
    ...payload,
    guestName: `<img src=x onerror="alert('x')">&`,
    guestEmail: `guest"><script>alert(1)</script>@example.test`,
    guestPhone: `'+<svg onload=alert(1)>`,
    cabinName: `<script>alert("cabin")</script>`,
    cancellationPolicy: `<b>Política</b><script>alert('policy')</script>`,
  };
  const html = renderNotificationTemplate("REQUEST_CREATED", hostile).html;
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;"));
  assert.ok(html.includes("guest&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;@example.test"));
  assert.ok(html.includes("&#39;+&lt;svg onload=alert(1)&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;cabin&quot;)&lt;/script&gt;"));
  assert.ok(html.includes("&lt;b&gt;Política&lt;/b&gt;&lt;script&gt;alert(&#39;policy&#39;)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<svg "));
});
