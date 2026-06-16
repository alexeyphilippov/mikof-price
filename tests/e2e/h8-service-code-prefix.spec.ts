import { test, expect, BrowserContext } from "@playwright/test";

async function login(ctx: BrowserContext, email: string, password: string) {
  const r = await ctx.request.post("/api/auth/login", { data: { email, password } });
  expect(r.ok()).toBeTruthy();
}

test("H8: группа → подгруппа → префикс кода", async ({ page, context }) => {
  await login(context, "gen@mikofai.ru", "e5aaa0923588c460a3");
  await page.goto("/services");
  await page.getByRole("button", { name: "Создать услугу" }).click();

  const createBtn = page.getByRole("button", { name: "Создать" });
  await expect(createBtn).toBeDisabled();

  await page.locator("select").nth(0).selectOption({ index: 1 });
  await page.locator("select").nth(1).selectOption({ index: 1 });

  const codeInput = page.locator('input[value*="G-"]');
  await expect(codeInput).not.toHaveValue("");
  const prefix = await codeInput.inputValue();
  expect(prefix).toMatch(/^G-\d{3}-[A-Z]+-$/);

  await codeInput.fill(prefix + "999");
  await page.locator('input:not([type="number"])').nth(2).fill("Тест H8");
  await expect(createBtn).toBeEnabled();

  await codeInput.fill("WRONG-CODE-999");
  await expect(createBtn).toBeDisabled();
  await expect(page.getByText(`Код должен начинаться с ${prefix}`)).toBeVisible();
});
