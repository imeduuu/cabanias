import { expect, test as base, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const guest = { name: "Alex Ejemplo", email: "alex@example.test" };

if (!adminEmail || !adminPassword) throw new Error("Faltan las credenciales efímeras del administrador E2E.");

type AdminStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const test = base.extend<Record<never, never>, { adminStorageState: AdminStorageState }>({
  adminStorageState: [async ({ browser }, completeFixture) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Correo electrónico").fill(adminEmail!);
    await page.getByLabel("Contraseña").fill(adminPassword!);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await completeFixture(await context.storageState());
    await context.close();
  }, { scope: "worker" }],
  context: async ({ browser, adminStorageState }, completeFixture) => {
    const context = await browser.newContext({ storageState: adminStorageState });
    await completeFixture(context);
    await context.close();
  },
});

function monthFor(testInfo: TestInfo) {
  const months: Record<string, string> = {
    "chromium-desktop": "04",
    "chromium-mobile": "05",
    "firefox-desktop": "06",
    "firefox-mobile": "07",
    "webkit-desktop": "08",
    "webkit-mobile": "09",
  };
  const month = months[testInfo.project.name];
  if (!month) throw new Error(`No hay un mes de prueba definido para ${testInfo.project.name}.`);
  return month;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(adminEmail!);
  await page.getByLabel("Contraseña").fill(adminPassword!);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function createRequest(page: Page, arrival: string, departure: string, guestName = guest.name) {
  await page.goto("/cabanas/bosque");
  await page.getByLabel("Llegada").fill(arrival);
  await page.getByLabel("Salida").fill(departure);
  await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
  const quote = page.locator(".quote-result");
  await expect(quote).toBeVisible();
  await quote.getByLabel("Nombre de contacto").fill(guestName);
  await quote.getByLabel("Correo electrónico").fill(guest.email);
  await quote.getByLabel(/Entiendo que enviar esta solicitud/).check();
  await quote.getByRole("button", { name: "Enviar solicitud pendiente" }).click();
  await expect(page.getByRole("heading", { name: "Solicitud recibida" })).toBeVisible();
}

async function requestLink(page: Page, guestName: string) {
  await page.goto("/admin/solicitudes");
  const card = page.locator(".request-card").filter({ hasText: guestName });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Abrir detalle" }).click();
}

test.describe("panel administrativo", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Los flujos administrativos completos se ejecutan en escritorio.");
  });

  test("sin sesión, protege el panel y todas sus secciones", async ({ page }) => {
    await page.context().clearCookies();
    for (const path of ["/admin", "/admin/cabanas", "/admin/cabanas/nueva", "/admin/solicitudes", "/admin/calendario", "/admin/configuracion"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Bienvenido de nuevo." })).toBeVisible();
    }
  });

  test("inicia sesión, conserva el acceso tras recargar y cierra sesión", async ({ page }) => {
    await page.context().clearCookies();
    await login(page);
    await expect(page.getByRole("heading", { name: "Bienvenido a tu refugio." })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Bienvenido a tu refugio." })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("confirma A, impide confirmar B para el mismo período y permite rechazar B", async ({ page }, testInfo) => {
    const month = monthFor(testInfo);
    const arrival = `2030-${month}-14`;
    const departure = `2030-${month}-16`;
    await createRequest(page, arrival, departure, "Solicitud A E2E");
    await createRequest(page, arrival, departure, "Solicitud B E2E");
    await requestLink(page, "Solicitud A E2E");
    await expect(page.locator(".request-facts dd").first()).toHaveText("Pendiente");
    await page.getByRole("button", { name: "Confirmar solicitud" }).click();
    await expect(page.getByRole("status")).toContainText("Confirmada");

    await page.goto("/admin/solicitudes");
    const pending = page.locator(".request-card").filter({ hasText: "Solicitud B E2E" }).filter({ hasText: "Pendiente" });
    await expect(pending).toBeVisible();
    await pending.getByRole("link", { name: "Abrir detalle" }).click();
    await page.getByRole("button", { name: "Confirmar solicitud" }).click();
    await expect(page.locator("p.form-error")).toContainText("las fechas dejaron de estar disponibles");
    await page.getByRole("button", { name: "Rechazar solicitud" }).click();
    await expect(page.getByRole("status")).toContainText("Rechazada");
  });

  test("cancelar una solicitud confirmada libera el período para la consulta pública", async ({ page }, testInfo) => {
    const month = monthFor(testInfo);
    const arrival = `2030-${month}-20`;
    const departure = `2030-${month}-22`;
    await createRequest(page, arrival, departure, "Solicitud C E2E");
    await requestLink(page, "Solicitud C E2E");
    await page.getByRole("button", { name: "Confirmar solicitud" }).click();
    await expect(page.getByRole("status")).toContainText("Confirmada");
    await page.getByRole("button", { name: "Cancelar reserva confirmada" }).click();
    await expect(page.getByRole("status")).toContainText("Cancelada");

    await page.goto("/cabanas/bosque");
    await page.getByLabel("Llegada").fill(arrival);
    await page.getByLabel("Salida").fill(departure);
    await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
    await expect(page.locator(".quote-result")).toBeVisible();
  });

  test("crea y elimina un bloqueo y comprueba el efecto en la consulta pública", async ({ page }, testInfo) => {
    const month = monthFor(testInfo);
    await page.goto(`/admin/calendario?date=2030-${month}-08`);
    const blockForm = page.locator('[data-management="block-create"]');
    await blockForm.getByLabel("Inicio incluido").fill(`2030-${month}-08T15:00`);
    await blockForm.getByLabel("Salida excluida").fill(`2030-${month}-10T11:00`);
    await blockForm.getByLabel("Motivo").fill("Mantención E2E");
    await blockForm.getByRole("button", { name: "Crear bloqueo" }).click();
    await expect(page.getByRole("status")).toContainText("Cambio guardado");
    await expect(page.locator(".block-management .preserve-lines")).toContainText("Mantención E2E");

    await page.goto("/cabanas/bosque");
    await page.getByLabel("Llegada").fill(`2030-${month}-08`);
    await page.getByLabel("Salida").fill(`2030-${month}-10`);
    await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
    await expect(page.locator(".form-error")).toContainText("período ya está ocupado");

    await page.goto(`/admin/calendario?date=2030-${month}-08`);
    const deleteForm = page.locator('[data-management="block-delete"]').first();
    await deleteForm.getByLabel(/Confirmo eliminar este bloqueo/).check();
    await deleteForm.getByRole("button", { name: "Eliminar bloqueo" }).click();
    await expect(page.getByText("No hay bloqueos manuales en el período seleccionado.")).toBeVisible();
    await page.goto("/cabanas/bosque");
    await page.getByLabel("Llegada").fill(`2030-${month}-08`);
    await page.getByLabel("Salida").fill(`2030-${month}-10`);
    await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
    await expect(page.locator(".quote-result")).toBeVisible();
  });

  test("actualiza el nombre del negocio y lo muestra en el inicio público", async ({ page }, testInfo) => {
    const name = `Refugio E2E ${testInfo.project.name}`;
    await page.goto("/admin/configuracion");
    await page.getByLabel("Nombre del negocio").fill(name);
    await page.getByRole("button", { name: "Guardar configuración" }).click();
    await expect(page.getByRole("status")).toContainText("Cambios guardados");
    await page.goto("/");
    await expect(page.locator("header")).toContainText(name);
  });

  test("crea una cabaña en borrador, la publica con imagen y la muestra en el catálogo", async ({ page }, testInfo) => {
    const slug = `cabaña-e2e-${testInfo.project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${Date.now()}`.replace(/[^a-z0-9-]/g, "");
    const name = `Cabaña E2E ${testInfo.project.name}`;
    await page.goto("/admin/cabanas/nueva");
    await page.getByLabel("Nombre", { exact: true }).fill(name);
    await page.getByLabel(/Ruta/).fill(slug);
    await page.getByLabel("Capacidad de personas").fill("2");
    await page.getByLabel("Dormitorios").fill("1");
    await page.getByLabel("Tarifa base CLP por noche u hora").fill("85000");
    await page.getByLabel("Descripción").fill("Cabaña ficticia creada durante la prueba E2E.");
    await page.getByRole("button", { name: "Guardar cabaña" }).click();
    await expect(page).toHaveURL(/\/admin\/cabanas\/[^?]+\?saved=1$/);
    await expect(page.getByLabel("Publicación")).toHaveValue("DRAFT");

    await page.getByLabel("Imágenes (una por línea: URL | texto alternativo)").fill("/images/logo.svg | Ilustración de la cabaña E2E");
    await page.getByRole("button", { name: "Guardar cabaña" }).click();
    await expect(page).toHaveURL(/\/admin\/cabanas\/[^?]+\?saved=1$/);
    await page.goto("/admin/cabanas");
    const cabin = page.locator(".admin-cabins article").filter({ hasText: name });
    await cabin.getByRole("button", { name: "Publicar" }).click();
    await expect(page).toHaveURL(/\/admin\/cabanas\?saved=1$/);
    await expect(page.locator(".admin-cabins article").filter({ hasText: name }).getByText("Publicada")).toBeVisible();
    await page.goto("/cabanas");
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  });
});
