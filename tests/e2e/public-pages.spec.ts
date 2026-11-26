import { expect, test } from "@playwright/test";

const guest = { name: "Alex Ejemplo", email: "alex@example.test" };

async function quoteNight(page: import("@playwright/test").Page, arrival = "2030-02-14", departure = "2030-02-16") {
  await page.getByLabel("Llegada").fill(arrival);
  await page.getByLabel("Salida").fill(departure);
  await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
}

test("páginas públicas cargan sin errores de consola", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Descubre las cabañas/ })).toBeVisible();
  await page.goto("/cabanas");
  await expect(page.getByRole("heading", { name: "Encuentra tu propio refugio" })).toBeVisible();
  for (const slug of ["bosque", "rio", "cerro"]) {
    await page.goto(`/cabanas/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/cabanas/${slug}$`));
    await expect(page.locator("main h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("cabaña NIGHTLY cotiza noches en CLP y recibe una solicitud pendiente", async ({ page }) => {
  await page.goto("/cabanas/bosque");
  await quoteNight(page);

  const quote = page.locator(".quote-result");
  await expect(quote).toBeVisible();
  await expect(quote.locator(".price")).toContainText(/\$\s*190\.000/);
  await expect(quote.locator(".price")).toContainText("CLP estimados");
  await quote.getByText("Ver desglose estimado").click();
  const nightlyLines = quote.locator(".season-prices li");
  await expect(nightlyLines).toHaveCount(2);
  for (const line of await nightlyLines.all()) {
    await expect(line).toContainText("noche(s) ×");
    await expect(line).toContainText("$");
  }
  await quote.getByLabel("Nombre de contacto").fill(guest.name);
  await quote.getByLabel("Correo electrónico").fill(guest.email);
  await quote.getByLabel(/Entiendo que enviar esta solicitud/).check();
  await quote.getByRole("button", { name: "Enviar solicitud pendiente" }).click();
  await expect(page.getByRole("heading", { name: "Solicitud recibida" })).toBeVisible();
});

test("cabaña HOURLY consulta fecha, hora en punto y duración", async ({ page }) => {
  await page.goto("/cabanas/rio");
  await page.getByLabel("Fecha").fill("2030-02-20");
  await page.getByLabel("Hora de inicio (0–23, en punto)").fill("15");
  await page.getByLabel("Duración en horas completas").fill("2");
  await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
  await expect(page.locator(".quote-result")).toBeVisible();
  await expect(page.locator(".quote-result .price")).toContainText("CLP estimados");
});

test("rechaza más huéspedes que la capacidad con un error claro", async ({ page }) => {
  await page.goto("/cabanas/rio");
  await page.getByLabel("Fecha").fill("2030-02-20");
  await page.getByLabel("Hora de inicio (0–23, en punto)").fill("15");
  await page.getByLabel("Duración en horas completas").fill("1");
  await page.getByLabel(/Hués.*máximo 2/).fill("3");
  await page.getByRole("button", { name: "Consultar disponibilidad y precio" }).click();
  await expect(page.locator(".form-error")).toContainText("supera la capacidad");
});

test("rechaza la consulta cuando el período tiene un bloqueo manual", async ({ page }) => {
  await page.goto("/cabanas/bosque");
  await quoteNight(page, "2030-02-10", "2030-02-12");
  await expect(page.locator(".form-error")).toContainText("período ya está ocupado");
  await expect(page.locator(".quote-result")).toHaveCount(0);
});

test("el detalle ofrece WhatsApp con la cabaña y la consulta, sin datos del huésped", async ({ page }) => {
  await page.goto("/cabanas/bosque");
  const link = page.getByRole("link", { name: /^Consultar por WhatsApp sobre Refugio Bosque/ });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const textOf = async () => {
    const url = new URL((await link.getAttribute("href"))!);
    expect(url.origin + url.pathname).toBe("https://wa.me/56912345678");
    return url.searchParams.get("text") ?? "";
  };
  expect(await textOf()).toContain("«Refugio Bosque»");
  await quoteNight(page);
  await expect(page.locator(".quote-result")).toBeVisible();
  await page.locator(".quote-result").getByLabel("Nombre de contacto").fill(guest.name);
  await page.locator(".quote-result").getByLabel("Correo electrónico").fill(guest.email);
  const text = await textOf();
  for (const value of ["14/02/2030", "16/02/2030", "1 huésped"]) expect(text).toContain(value);
  expect(text).not.toContain(guest.name);
  expect(text).not.toContain(guest.email);
});

test("cambiar la selección invalida el estimado visible", async ({ page }) => {
  await page.goto("/cabanas/bosque");
  await quoteNight(page);
  await expect(page.locator(".quote-result")).toBeVisible();
  await page.getByLabel("Llegada").fill("2030-02-15");
  await expect(page.locator(".quote-result")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Cambiaste la selección");
});

test("iniciar otra solicitud intencional reinicia el formulario", async ({ page }) => {
  await page.goto("/cabanas/bosque");
  await quoteNight(page);
  const quote = page.locator(".quote-result");
  await quote.getByLabel("Nombre de contacto").fill(guest.name);
  await quote.getByLabel("Correo electrónico").fill(guest.email);
  await quote.getByLabel(/Entiendo que enviar esta solicitud/).check();
  await quote.getByRole("button", { name: "Enviar solicitud pendiente" }).click();
  await expect(page.getByRole("heading", { name: "Solicitud recibida" })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar otra solicitud intencional" }).click();
  await expect(page.getByRole("heading", { name: "Consulta y solicita tu estadía" })).toBeVisible();
  await expect(page.getByLabel("Llegada")).toHaveValue("");
  await expect(page.getByLabel("Salida")).toHaveValue("");
  await expect(page.getByLabel("Nombre de contacto")).toHaveCount(0);
});
