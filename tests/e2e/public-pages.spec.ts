import { expect, test } from "@playwright/test";

test("portada, catálogo y los detalles de las tres cabañas cargan sin errores de consola", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Descubre las cabañas/ })).toBeVisible();

  await page.goto("/cabanas");
  await expect(page.getByRole("heading", { name: "Encuentra tu propio refugio" })).toBeVisible();
  const slugs = ["bosque", "rio", "cerro"];
  for (const slug of slugs) {
    await expect(page.locator(`a[href="/cabanas/${slug}"]`).first()).toBeVisible();
  }
  for (const slug of slugs) {
    await page.goto(`/cabanas/${slug}`);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/cabanas/${slug}$`));
  }

  expect(errors).toEqual([]);
});
