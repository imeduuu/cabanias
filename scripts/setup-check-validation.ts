export type SetupCheckEnvironment = Record<string, string | undefined>;

const requiredVariables = ["DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "SITE_URL"] as const;

function isLoopback(hostname: string) {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname.toLowerCase());
}

function parseOrigin(value: string | undefined, allowLocalHttp: boolean) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const protocolAllowed = url.protocol === "https:" || (allowLocalHttp && url.protocol === "http:" && isLoopback(url.hostname));
    if (!protocolAllowed || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function isPostgresUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

export function validateSetupEnvironment(env: SetupCheckEnvironment): string[] {
  const errors: string[] = [];
  for (const name of requiredVariables) if (!env[name]?.trim()) errors.push(`Falta la variable ${name}.`);
  if (env.DATABASE_URL?.trim() && !isPostgresUrl(env.DATABASE_URL)) errors.push("DATABASE_URL debe ser una URL PostgreSQL válida.");
  if (env.BETTER_AUTH_URL?.trim() && !parseOrigin(env.BETTER_AUTH_URL.trim(), true)) {
    errors.push("BETTER_AUTH_URL debe ser un origen HTTPS; HTTP solo se permite en loopback local, sin ruta, credenciales ni parámetros.");
  }
  if (env.BETTER_AUTH_SECRET && env.BETTER_AUTH_SECRET.length < 32) errors.push("BETTER_AUTH_SECRET debe tener al menos 32 caracteres.");
  if (env.SITE_URL?.trim() && !parseOrigin(env.SITE_URL.trim(), true)) {
    errors.push("SITE_URL debe ser un origen HTTPS; HTTP solo se permite en loopback local, sin ruta, credenciales ni parámetros.");
  }

  const smtpNames = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "SMTP_SECURE"] as const;
  const smtpConfigured = smtpNames.some(name => Boolean(env[name]?.trim())) || Boolean(env.SMTP_USER?.trim() || env.SMTP_PASSWORD);
  if (smtpConfigured) {
    for (const name of smtpNames) if (!env[name]?.trim()) errors.push(`Falta la variable ${name} para completar la configuración SMTP.`);
    const port = Number(env.SMTP_PORT);
    if (env.SMTP_PORT?.trim() && (!Number.isInteger(port) || port < 1 || port > 65535)) errors.push("SMTP_PORT debe ser un puerto válido.");
    if (env.SMTP_SECURE?.trim() && !["true", "false"].includes(env.SMTP_SECURE.trim().toLowerCase())) errors.push("SMTP_SECURE debe ser true o false.");
    if (env.SMTP_FROM?.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.SMTP_FROM.trim().match(/<([^<>]+)>/)?.[1] ?? env.SMTP_FROM.trim())) {
      errors.push("SMTP_FROM debe contener una dirección de correo válida.");
    }
    if (Boolean(env.SMTP_USER?.trim()) !== Boolean(env.SMTP_PASSWORD)) errors.push("SMTP_USER y SMTP_PASSWORD deben configurarse juntos.");
  }
  return errors;
}
