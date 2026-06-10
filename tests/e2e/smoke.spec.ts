import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "filippov.ao@phystech.edu";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
}

test.skip(!ADMIN_PASSWORD, "Set ADMIN_PASSWORD env var to run E2E tests");

test("R1 видит все разделы и кнопку выхода (зам.14)", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  for (const nav of ["Услуги", "Пакеты", "Заявки", "Справочники", "Клиники", "Пользователи", "Аудит"]) {
    await expect(page.getByRole("link", { name: nav })).toBeVisible();
  }
});

test("Аудит: ФИО вместо ID, дефолтная сортировка по времени (зам.12,13)", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/audit");
  await expect(page.getByRole("columnheader", { name: /Время ▼/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Генеральный директор" }).first()).toBeVisible();
  await expect(page.getByPlaceholder("фильтр").first()).toBeVisible();
});
