import "server-only";
import { createTransport } from "nodemailer";
import type { BookingRequest, NotificationEvent, Prisma, PrismaClient } from "../../generated/prisma/client";

type SettingsForEmail = {
  name: string;
  contactEmail: string;
  contactPhone: string | null;
  timezone: string;
};

type NotificationPayload = {
  businessName: string;
  cabinName: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startsAt: string;
  endsAt: string;
  guests: number;
  estimatedTotalClp: number;
  currency: string;
  contactEmail: string;
  contactPhone: string | null;
  timezone: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

type ClaimedNotification = {
  id: string;
  event: NotificationEvent;
  recipient: string;
  payload: Prisma.JsonValue;
  attempts: number;
};

export async function enqueueRequestCreated(
  tx: Prisma.TransactionClient,
  request: BookingRequest,
  cabinName: string,
  settings: SettingsForEmail,
) {
  await enqueue(tx, request, "REQUEST_CREATED", settings.contactEmail, cabinName, settings);
}

export async function enqueueRequestStatus(
  tx: Prisma.TransactionClient,
  request: BookingRequest,
  cabinName: string,
  settings: SettingsForEmail | null,
) {
  let event: NotificationEvent;
  switch (request.status) {
    case "CONFIRMED":
      event = "REQUEST_CONFIRMED";
      break;
    case "REJECTED":
      event = "REQUEST_REJECTED";
      break;
    case "CANCELLED":
      event = "REQUEST_CANCELLED";
      break;
    default:
      throw new Error("No se puede notificar una solicitud que no tiene un estado final.");
  }
  await enqueue(tx, request, event, request.guestEmail, cabinName, settings);
}

async function enqueue(
  tx: Prisma.TransactionClient,
  request: BookingRequest,
  event: NotificationEvent,
  recipient: string,
  cabinName: string,
  settings: SettingsForEmail | null,
) {
  const payload: Prisma.InputJsonObject = {
    businessName: settings?.name ?? "",
    cabinName,
    guestName: request.guestName,
    guestEmail: event === "REQUEST_CREATED" ? request.guestEmail : "",
    guestPhone: event === "REQUEST_CREATED" ? request.guestPhone : null,
    startsAt: request.startsAt.toISOString(),
    endsAt: request.endsAt.toISOString(),
    guests: request.guests,
    estimatedTotalClp: event === "REQUEST_CREATED" || event === "REQUEST_CONFIRMED" ? request.estimatedTotalClp : 0,
    currency: request.currency,
    contactEmail: settings?.contactEmail ?? "",
    contactPhone: settings?.contactPhone ?? null,
    timezone: settings?.timezone ?? "America/Santiago",
  };
  await tx.notificationOutbox.create({ data: { requestId: request.id, event, recipient, payload } });
}

function isEmail(value: string) {
  return value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
}

function emailAddress(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("La dirección SMTP_FROM no es válida.");
  const address = value.match(/<([^<>]+)>/)?.[1] ?? value;
  if (!isEmail(address)) throw new Error("La dirección SMTP_FROM no es válida.");
  return address;
}

function readSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig {
  const host = env.SMTP_HOST?.trim();
  const portValue = env.SMTP_PORT?.trim();
  const from = env.SMTP_FROM?.trim();
  const secureValue = env.SMTP_SECURE?.trim().toLowerCase();
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD;
  const missing = [
    !host && "SMTP_HOST",
    !portValue && "SMTP_PORT",
    !from && "SMTP_FROM",
    !secureValue && "SMTP_SECURE",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Falta configurar: ${missing.join(", ")}.`);
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("SMTP_PORT debe ser un puerto válido.");
  if (secureValue !== "true" && secureValue !== "false") throw new Error("SMTP_SECURE debe ser true o false.");
  emailAddress(from!);
  if (Boolean(user) !== Boolean(password)) throw new Error("SMTP_USER y SMTP_PASSWORD deben configurarse juntos.");
  return { host: host!, port, secure: secureValue === "true", from: from!, ...(user ? { user, password } : {}) };
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadFromJson(value: Prisma.JsonValue): NotificationPayload {
  if (!isJsonObject(value)) throw new Error("El contenido de la notificación no es válido.");
  const requiredString = (key: string) => {
    const item = value[key];
    if (typeof item !== "string") throw new Error("El contenido de la notificación no es válido.");
    return item;
  };
  const optionalString = (key: string) => {
    const item = value[key];
    if (item !== null && typeof item !== "string") throw new Error("El contenido de la notificación no es válido.");
    return item;
  };
  const guests = value.guests;
  const estimatedTotalClp = value.estimatedTotalClp;
  if (typeof guests !== "number" || !Number.isInteger(guests) ||
      typeof estimatedTotalClp !== "number" || !Number.isInteger(estimatedTotalClp)) {
    throw new Error("El contenido de la notificación no es válido.");
  }
  return {
    businessName: requiredString("businessName"),
    cabinName: requiredString("cabinName"),
    guestName: requiredString("guestName"),
    guestEmail: requiredString("guestEmail"),
    guestPhone: optionalString("guestPhone"),
    startsAt: requiredString("startsAt"),
    endsAt: requiredString("endsAt"),
    guests,
    estimatedTotalClp,
    currency: requiredString("currency"),
    contactEmail: requiredString("contactEmail"),
    contactPhone: optionalString("contactPhone"),
    timezone: requiredString("timezone"),
  };
}

function validateRecipient(value: string) {
  if (!isEmail(value)) throw new Error("El destinatario de una notificación pendiente no es válido.");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function renderMessage(event: NotificationEvent, payload: NotificationPayload) {
  const subjectByEvent: Record<NotificationEvent, string> = {
    REQUEST_CREATED: "Nueva solicitud de reserva",
    REQUEST_CONFIRMED: "Tu solicitud fue confirmada",
    REQUEST_REJECTED: "Actualización de tu solicitud",
    REQUEST_CANCELLED: "Tu solicitud fue cancelada",
  };
  const titleByEvent: Record<NotificationEvent, string> = {
    REQUEST_CREATED: "Nueva solicitud pendiente",
    REQUEST_CONFIRMED: "Solicitud confirmada",
    REQUEST_REJECTED: "Solicitud rechazada",
    REQUEST_CANCELLED: "Solicitud cancelada",
  };
  const start = formatDate(payload.startsAt, payload.timezone);
  const end = formatDate(payload.endsAt, payload.timezone);
  const total = `${payload.estimatedTotalClp.toLocaleString("es-CL")} ${payload.currency}`;
  const details = [
    `Cabaña: ${payload.cabinName}`,
    `Huésped: ${payload.guestName}`,
    `Fechas: ${start} - ${end}`,
    `Personas: ${payload.guests}`,
  ];
  if (event === "REQUEST_CREATED") {
    details.splice(2, 0, `Correo: ${payload.guestEmail}`);
    if (payload.guestPhone) details.splice(3, 0, `Teléfono: ${payload.guestPhone}`);
    details.push("Ingresa al panel de administración para revisar la solicitud.");
  }
  if (event === "REQUEST_CREATED" || event === "REQUEST_CONFIRMED") details.push(`Total estimado: ${total}`);
  const signature = [payload.businessName, payload.contactEmail, payload.contactPhone].filter(Boolean).join(" · ");
  const text = [
    titleByEvent[event],
    "",
    ...details,
    ...(signature ? ["", signature] : []),
  ].join("\n");
  const htmlDetails = details.map(line => `<li>${escapeHtml(line)}</li>`).join("");
  const htmlSignature = signature ? `<p>${escapeHtml(signature)}</p>` : "";
  const html = `<main><h1>${escapeHtml(titleByEvent[event])}</h1><ul>${htmlDetails}</ul>${htmlSignature}</main>`;
  return { subject: subjectByEvent[event], text, html };
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error SMTP desconocido.";
  return message.replace(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/g, "[correo]").slice(0, 500);
}

async function claimNext(db: PrismaClient): Promise<ClaimedNotification | null> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`
      UPDATE "NotificationOutbox"
      SET "status" = 'ERROR', "lockedAt" = NULL,
          "lastError" = 'El proceso se interrumpió durante el último intento SMTP.'
      WHERE "status" = 'PROCESSING' AND "attempts" >= 3
        AND "lockedAt" <= NOW() - INTERVAL '5 minutes'
    `;
    const rows = await tx.$queryRaw<ClaimedNotification[]>`
      SELECT "id", "event", "recipient", "payload", "attempts"
      FROM "NotificationOutbox"
      WHERE (
        ("status" = 'PENDING' AND "nextAttemptAt" <= NOW())
        OR ("status" = 'PROCESSING' AND "attempts" < 3
            AND "lockedAt" <= NOW() - INTERVAL '5 minutes')
      )
      ORDER BY "nextAttemptAt", "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    const row = rows[0];
    if (!row) return null;
    validateRecipient(row.recipient);
    const payload = payloadFromJson(row.payload);
    await tx.notificationOutbox.update({
      where: { id: row.id },
      data: { status: "PROCESSING", attempts: row.attempts + 1, lockedAt: new Date(), lastError: null },
    });
    return { ...row, payload, attempts: row.attempts + 1 };
  }, { timeout: 15000 });
}

export async function sendPendingNotifications(db: PrismaClient) {
  const config = readSmtpConfig(process.env);
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 15000,
    ...(config.user ? { auth: { user: config.user, pass: config.password! } } : {}),
  });
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  try {
    const retentionDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.notificationOutbox.deleteMany({
      where: {
        OR: [
          { status: "SENT", sentAt: { lte: retentionDate } },
          { status: "ERROR", createdAt: { lte: retentionDate } },
        ],
      },
    });
    for (;;) {
      const notification = await claimNext(db);
      if (!notification) break;
      let sendError: unknown;
      let sendFailed = false;
      try {
        const payload = payloadFromJson(notification.payload);
        const message = renderMessage(notification.event, payload);
        await transporter.sendMail({
          from: config.from,
          to: notification.recipient,
          subject: message.subject,
          text: message.text,
          html: message.html,
          messageId: `<${notification.id}@notifications.cabanias.local>`,
        });
      } catch (error) {
        sendFailed = true;
        sendError = error;
      }
      if (sendFailed) {
        const terminal = notification.attempts >= 3;
        const delayMs = notification.attempts === 1 ? 60_000 : 300_000;
        const errorMessage = safeError(sendError);
        await db.notificationOutbox.update({
          where: { id: notification.id },
          data: {
            status: terminal ? "ERROR" : "PENDING",
            nextAttemptAt: terminal ? undefined : new Date(Date.now() + delayMs),
            lastError: errorMessage,
            lockedAt: null,
          },
        });
        errors.push(errorMessage);
        failed++;
        continue;
      }
      await db.notificationOutbox.update({
        where: { id: notification.id },
        data: { status: "SENT", sentAt: new Date(), recipient: "", payload: {}, lockedAt: null, lastError: null },
      });
      sent++;
    }
  } finally {
    transporter.close();
  }
  return { sent, failed, errors };
}
