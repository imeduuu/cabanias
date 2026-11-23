import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const publicRoutes = [
  "/",
  "/login",
  "/cabanas",
  "/cabanas/bosque",
  "/cabanas/rio",
  "/cabanas/cerro",
];

const cabinIds = [
  "22222222-2222-4222-8222-000000000001",
  "22222222-2222-4222-8222-000000000002",
  "22222222-2222-4222-8222-000000000003",
];

async function expectNoSeriousAxeViolations(page: Page, route: string, width: number) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(violation => violation.impact === "serious" || violation.impact === "critical");
  expect(serious, `${width}px ${route}: ${serious.map(violation => `${violation.id} (${violation.impact})`).join(", ")}`).toEqual([]);
}

test("public and admin routes have no serious or critical axe violations", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "The accessibility sweep controls all three viewport widths in one project.");
  test.setTimeout(180_000);

  const adminEmail = process.env.E2E_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD;
  expect(adminEmail).toBeTruthy();
  expect(adminPassword).toBeTruthy();
  const baseURL = String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3102");

  let requestPath = "";
  let adminStorageState: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;
  for (const width of [360, 768, 1280]) {
    const publicContext = await browser.newContext({ baseURL, viewport: { width, height: 900 } });
    const publicPage = await publicContext.newPage();

    try {
      for (const route of publicRoutes) {
        await publicPage.goto(route);
        await expectNoSeriousAxeViolations(publicPage, route, width);
      }

      if (!requestPath) {
        await publicPage.goto("/cabanas/bosque");
        await publicPage.getByLabel("Llegada").fill("2042-02-20");
        await publicPage.getByLabel("Salida").fill("2042-02-22");
        await publicPage.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
        const quote = publicPage.locator(".quote-result");
        await expect(quote).toBeVisible();
        await quote.getByLabel("Nombre de contacto").fill("Auditoría axe E2E");
        await quote.getByLabel("Correo electrónico").fill("axe-audit@example.test");
        await quote.getByLabel(/Entiendo que enviar esta solicitud/).check();
        await quote.getByRole("button", { name: "Enviar solicitud pendiente" }).click();
        await expect(publicPage.getByRole("heading", { name: "Solicitud recibida" })).toBeVisible();
        await publicPage.goto("/login");
        await publicPage.getByLabel("Correo electrónico").fill(adminEmail!);
        await publicPage.getByLabel("Contraseña").fill(adminPassword!);
        await publicPage.getByRole("button", { name: "Iniciar sesión" }).click();
        await expect(publicPage).toHaveURL(/\/admin$/);
        adminStorageState = await publicContext.storageState();
        await publicPage.goto("/admin/solicitudes");
        const request = publicPage.locator(".request-card a[href^='/admin/solicitudes/']").first();
        await expect(request).toBeVisible();
        requestPath = (await request.getAttribute("href"))!;
      }
    } finally {
      await publicContext.close();
    }

    const adminContext = await browser.newContext({ baseURL, viewport: { width, height: 900 }, storageState: adminStorageState });
    const adminPage = await adminContext.newPage();
    try {
      const adminRoutes = [
        "/admin",
        "/admin/cabanas",
        "/admin/cabanas/nueva",
        ...cabinIds.map(id => `/admin/cabanas/${id}`),
        "/admin/solicitudes",
        requestPath,
        "/admin/calendario?date=2030-02-10",
        "/admin/configuracion",
      ];

      for (const route of adminRoutes) {
        await adminPage.goto(route);
        await expectNoSeriousAxeViolations(adminPage, route, width);
      }
    } finally {
      await adminContext.close();
    }
  }
});
