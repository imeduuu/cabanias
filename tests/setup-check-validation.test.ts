import test from "node:test";
import assert from "node:assert/strict";
import { validateSetupEnvironment } from "../scripts/setup-check-validation";

const validEnvironment = {
  DATABASE_URL: "postgresql://app:secret@db.example.cl:5432/business?sslmode=require",
  BETTER_AUTH_URL: "https://reservas.example.cl",
  BETTER_AUTH_SECRET: "a".repeat(48),
  SITE_URL: "https://reservas.example.cl",
};

test("setup environment accepts production origins and a long secret", () => {
  assert.deepEqual(validateSetupEnvironment(validEnvironment), []);
});

test("setup environment accepts HTTP only for local loopback origins", () => {
  assert.deepEqual(validateSetupEnvironment({ ...validEnvironment, BETTER_AUTH_URL: "http://localhost:3000", SITE_URL: "http://127.0.0.1:3000" }), []);
  assert.ok(validateSetupEnvironment({ ...validEnvironment, BETTER_AUTH_URL: "http://example.cl" }).some(error => error.includes("BETTER_AUTH_URL")));
});

test("setup environment rejects missing variables, malformed URLs and short secrets", () => {
  const errors = validateSetupEnvironment({ ...validEnvironment, DATABASE_URL: "postgres://bad", BETTER_AUTH_URL: "https://user:pass@example.cl/path", BETTER_AUTH_SECRET: "short", SITE_URL: "" });
  assert.ok(errors.some(error => error.includes("DATABASE_URL")));
  assert.ok(errors.some(error => error.includes("BETTER_AUTH_URL")));
  assert.ok(errors.some(error => error.includes("32 caracteres")));
  assert.ok(errors.some(error => error.includes("SITE_URL")));
});

test("SMTP may be omitted but partial or invalid SMTP settings are rejected", () => {
  assert.deepEqual(validateSetupEnvironment(validEnvironment), []);
  const errors = validateSetupEnvironment({ ...validEnvironment, SMTP_HOST: "smtp.example.cl", SMTP_PORT: "70000", SMTP_FROM: "bad", SMTP_SECURE: "yes", SMTP_USER: "user" });
  assert.ok(errors.some(error => error.includes("SMTP_PORT")));
  assert.ok(errors.some(error => error.includes("SMTP_SECURE")));
  assert.ok(errors.some(error => error.includes("SMTP_FROM")));
  assert.ok(errors.some(error => error.includes("SMTP_USER")));
});
