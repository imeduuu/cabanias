import "server-only";
import { createTransport } from "nodemailer";
import type { BookingRequest, NotificationEvent, Prisma, PrismaClient } from "../../generated/prisma/client";
import {
  renderNotificationTemplate,
  type NotificationPricingSnapshot,
  type NotificationTemplatePayload,
} from "./templates";

type SettingsForEmail = {
  name: string;
  logoUrl: string | null;
  location: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  contactEmail: string;
  notificationEmail: string;
  contactPhone: string | null;
  cancellationPolicy: string;
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
  await enqueue(tx, request, "REQUEST_CREATED", settings.notificationEmail, cabinName, settings);
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
  if (!settings) throw new Error("No se puede encolar el correo: falta BusinessSettings.");
  const payload: Prisma.InputJsonObject = {
    businessName: settings.name,
    logoUrl: settings.logoUrl,
    location: settings.location,
    primaryColor: settings.primaryColor,
    accentColor: settings.accentColor,
    backgroundColor: settings.backgroundColor,
    cabinName,
    guestName: request.guestName,
    guestEmail: request.guestEmail,
    guestPhone: request.guestPhone,
    startsAt: request.startsAt.toISOString(),
    endsAt: request.endsAt.toISOString(),
    mode: request.mode,
    guests: request.guests,
    estimatedTotalClp: request.estimatedTotalClp,
    currency: request.currency,
    pricingSnapshot: request.pricingSnapshot as Prisma.InputJsonValue,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    cancellationPolicy: settings.cancellationPolicy,
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

function payloadFromJson(value: Prisma.JsonValue): NotificationTemplatePayload {
  if (!isJsonObject(value)) throw new Error("El contenido de la notificación no es válido.");
  const requiredString = (key: string) => {
    const item = value[key];
    if (typeof item !== "string") throw new Error("El contenido de la notificación no es válido.");
    return item;
  };
  const optionalString = (key: string) => {
    const item = value[key];
    if (item === undefined || item === null) return null;
    if (typeof item !== "string") throw new Error("El contenido de la notificación no es válido.");
    return item;
  };
  const optionalText = (key: string, fallback = "") => optionalString(key) ?? fallback;
  const guests = value.guests;
  const estimatedTotalClp = value.estimatedTotalClp;
  if (typeof guests !== "number" || !Number.isInteger(guests) ||
      guests < 1 || typeof estimatedTotalClp !== "number" || !Number.isInteger(estimatedTotalClp) ||
      estimatedTotalClp < 0) {
    throw new Error("El contenido de la notificación no es válido.");
  }
  const mode = value.mode;
  if (mode !== undefined && mode !== "NIGHTLY" && mode !== "HOURLY") {
    throw new Error("El contenido de la notificación no es válido.");
  }
  const pricingValue = value.pricingSnapshot;
  let pricingSnapshot: NotificationPricingSnapshot | null = null;
  if (pricingValue !== undefined && pricingValue !== null) {
    if (!isJsonObject(pricingValue)) throw new Error("El contenido de la notificación no es válido.");
    if (Array.isArray(pricingValue.lines)) {
      pricingSnapshot = {
        lines: pricingValue.lines.map(line => {
          if (!isJsonObject(line) || typeof line.date !== "string" ||
              !/^\d{4}-\d{2}-\d{2}$/.test(line.date) ||
              typeof line.rateClp !== "number" || !Number.isInteger(line.rateClp) || line.rateClp < 0 ||
              typeof line.units !== "number" || !Number.isInteger(line.units) || line.units < 1 ||
              (line.seasonId !== null && line.seasonId !== undefined && typeof line.seasonId !== "string")) {
            throw new Error("El contenido de la notificación no es válido.");
          }
          return { date: line.date, rateClp: line.rateClp, units: line.units, seasonal: typeof line.seasonId === "string" };
        }),
      };
    } else if ("lines" in pricingValue) {
      throw new Error("El contenido de la notificación no es válido.");
    }
  }
  return {
    businessName: requiredString("businessName"),
    logoUrl: optionalString("logoUrl"),
    location: optionalText("location"),
    primaryColor: optionalText("primaryColor", "#244d40"),
    accentColor: optionalText("accentColor", "#bb5c37"),
    backgroundColor: optionalText("backgroundColor", "#faf8f2"),
    cabinName: requiredString("cabinName"),
    guestName: requiredString("guestName"),
    guestEmail: requiredString("guestEmail"),
    guestPhone: optionalString("guestPhone"),
    startsAt: requiredString("startsAt"),
    endsAt: requiredString("endsAt"),
    mode: mode === "NIGHTLY" || mode === "HOURLY" ? mode : null,
    guests,
    estimatedTotalClp,
    currency: requiredString("currency"),
    contactEmail: requiredString("contactEmail"),
    contactPhone: optionalString("contactPhone"),
    cancellationPolicy: optionalText("cancellationPolicy", "No disponible."),
    pricingSnapshot,
  };
}

function validateRecipient(value: string) {
  if (!isEmail(value)) throw new Error("El destinatario de una notificación pendiente no es válido.");
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
        const message = renderNotificationTemplate(notification.event, payload);
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
