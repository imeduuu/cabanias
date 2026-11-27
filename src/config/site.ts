export function getSiteUrl() {
  const value = process.env.SITE_URL?.trim() || "http://localhost:3000";
  return new URL(value.endsWith("/") ? value : `${value}/`);
}
