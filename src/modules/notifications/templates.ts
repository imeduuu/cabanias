export type NotificationTemplateEvent =
  | "REQUEST_CREATED"
  | "REQUEST_CONFIRMED"
  | "REQUEST_REJECTED"
  | "REQUEST_CANCELLED";

export type NotificationPricingSnapshot = {
  lines: {
    date: string;
    rateClp: number;
    units: number;
    seasonal: boolean;
  }[];
};

export type NotificationTemplatePayload = {
  businessName: string;
  logoUrl: string | null;
  location: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  cabinName: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startsAt: string;
  endsAt: string;
  mode: "NIGHTLY" | "HOURLY" | null;
  guests: number;
  estimatedTotalClp: number;
  currency: string;
  pricingSnapshot: NotificationPricingSnapshot | null;
  contactEmail: string;
  contactPhone: string | null;
  cancellationPolicy: string;
};

const timezone = "America/Santiago";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function safeLogoUrl(value: string) {
  if (/^\/images\/[a-zA-Z0-9/_.%\-]+$/.test(value)) return value;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("La URL del logo en la notificación no es válida.");
  }
  return value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Una fecha de la notificación no es válida.");
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function formatMoney(value: number, currency: string) {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
}

function validateColor(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Un color de identidad de la notificación no es válido.");
  return value;
}

function dateDetails(payload: NotificationTemplatePayload): [string, string][] {
  return [
    ["Inicio (incluido)", formatDate(payload.startsAt)],
    ["Salida (excluida)", formatDate(payload.endsAt)],
  ];
}

function pricingLines(payload: NotificationTemplatePayload) {
  if (!payload.pricingSnapshot?.lines.length) {
    return ["Desglose guardado: no disponible; no se recalculan tarifas."];
  }
  const unit = payload.mode === "NIGHTLY" ? "noche(s)" : payload.mode === "HOURLY" ? "hora(s)" : "unidad(es)";
  return payload.pricingSnapshot.lines.map(line =>
    `${line.date}: ${line.units} ${unit} × ${formatMoney(line.rateClp, payload.currency)} (${line.seasonal ? "temporada guardada" : "tarifa base guardada"})`,
  );
}

export function renderNotificationTemplate(event: NotificationTemplateEvent, payload: NotificationTemplatePayload) {
  const subjectByEvent: Record<NotificationTemplateEvent, string> = {
    REQUEST_CREATED: "Nueva solicitud de reserva",
    REQUEST_CONFIRMED: "Tu solicitud fue confirmada",
    REQUEST_REJECTED: "Actualización de tu solicitud",
    REQUEST_CANCELLED: "Tu solicitud fue cancelada",
  };
  const titleByEvent: Record<NotificationTemplateEvent, string> = {
    REQUEST_CREATED: "Nueva solicitud pendiente",
    REQUEST_CONFIRMED: "Solicitud confirmada",
    REQUEST_REJECTED: "Solicitud rechazada",
    REQUEST_CANCELLED: "Solicitud cancelada",
  };
  const heading = titleByEvent[event];
  const details: [string, string][] = [
    ["Cabaña", payload.cabinName],
    ["Huésped", payload.guestName],
    ["Correo del huésped", payload.guestEmail],
    ["Teléfono del huésped", payload.guestPhone || "No indicado"],
    ...dateDetails(payload),
    ["Personas", String(payload.guests)],
    ["Total guardado", formatMoney(payload.estimatedTotalClp, payload.currency)],
    ["Desglose guardado", pricingLines(payload).join("\n")],
  ];
  const periodExplanation = `Las fechas y horas están en America/Santiago. El intervalo es [inicio, salida): el inicio se incluye y la salida no forma parte del período reservado.${payload.mode === "NIGHTLY" ? " La fecha de salida no suma una noche." : ""}`;
  const notes = [
    periodExplanation,
    ...(event === "REQUEST_CREATED" ? ["Ingresa al panel de administración para revisar la solicitud."] : []),
  ];
  const text = [
    heading,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    ...notes,
    "",
    `Política de cancelación: ${payload.cancellationPolicy}`,
    "",
    ...[payload.businessName, payload.location, payload.contactEmail, payload.contactPhone].filter(Boolean),
  ].join("\n");

  const primaryColor = validateColor(payload.primaryColor);
  const accentColor = validateColor(payload.accentColor);
  const backgroundColor = validateColor(payload.backgroundColor);
  const logo = payload.logoUrl
    ? `<img src="${escapeHtml(safeLogoUrl(payload.logoUrl))}" alt="${escapeHtml(payload.businessName)}" width="120" style="display:block;max-width:120px;height:auto;margin-bottom:16px">`
    : "";
  const htmlDetails = details.map(([label, value]) =>
    `<li style="margin:0 0 8px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value).replace(/\n/g, "<br>")}</li>`,
  ).join("");
  const htmlNotes = notes.map(note => `<p>${escapeHtml(note)}</p>`).join("");
  const html = `<main style="background:${backgroundColor};padding:24px;font-family:Arial,sans-serif;color:#222"><article style="max-width:640px;margin:auto;background:#fff;padding:24px;border-top:6px solid ${primaryColor}">${logo}<h1 style="color:${primaryColor}">${escapeHtml(heading)}</h1><ul style="padding-left:20px">${htmlDetails}</ul>${htmlNotes}<section style="border-left:3px solid ${accentColor};padding:12px 16px;white-space:pre-wrap"><strong>Política de cancelación</strong><br>${escapeHtml(payload.cancellationPolicy)}</section><footer style="margin-top:24px;color:${primaryColor}"><strong>${escapeHtml(payload.businessName)}</strong><br>${escapeHtml(payload.location)}<br>${escapeHtml(payload.contactEmail)}${payload.contactPhone ? `<br>${escapeHtml(payload.contactPhone)}` : ""}</footer></article></main>`;
  return { subject: subjectByEvent[event], text, html };
}
