import { test, expect } from "@playwright/test";

test("H7: оптимистичный комментарий и NRT-подгрузка", async ({ page, context, browser }) => {
  const login = await context.request.post("/api/auth/login", {
    data: { email: "gen@mikofai.ru", password: "e5aaa0923588c460a3" },
  });
  expect(login.ok()).toBeTruthy();

  const list = await (await context.request.get("/api/requests")).json();
  const req = list[0];
  expect(req?.id).toBeTruthy();

  await page.goto(`/requests/${req.id}`);
  await page.waitForSelector("h3:text('Комментарии')");

  const marker = `H7-opt-${Date.now()}`;
  await page.fill('input[placeholder="Написать комментарий…"]', marker);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.locator(".comment").filter({ hasText: marker })).toBeVisible({ timeout: 2000 });

  const nrt = `H7-nrt-${Date.now()}`;
  const ctx2 = await browser.newContext({ baseURL: "https://mikofai.ru" });
  await ctx2.request.post("/api/auth/login", {
    data: { email: "med@mikofai.ru", password: "d738c3f18a5914b1df" },
  });
  const post = await ctx2.request.post(`/api/requests/${req.id}/comments`, { data: { text: nrt } });
  expect(post.ok()).toBeTruthy();
  await ctx2.close();

  await expect(page.locator(".comment").filter({ hasText: nrt })).toBeVisible({ timeout: 8000 });
});
