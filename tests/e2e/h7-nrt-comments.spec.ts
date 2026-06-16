import { test, expect, request as pwRequest } from "@playwright/test";

async function apiLogin(email: string, password: string) {
  const api = await pwRequest.newContext({ baseURL: "https://mikofai.ru" });
  const r = await api.post("/api/auth/login", { data: { email, password } });
  expect(r.ok()).toBeTruthy();
  const xsrf = (await api.storageState()).cookies.find((c) => c.name === "XSRF-TOKEN")?.value ?? "";
  return { api, xsrf };
}

test("H7: оптимистичный комментарий и NRT-подгрузка", async ({ page, context }) => {
  await context.request.post("/api/auth/login", {
    data: { email: "gen@mikofai.ru", password: "e5aaa0923588c460a3" },
  });

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
  const { api, xsrf } = await apiLogin("cfo@mikofai.ru", "d738c3f18a5914b1df");
  const post = await api.post(`/api/requests/${req.id}/comments`, {
    data: { text: nrt },
    headers: { "X-XSRF-TOKEN": xsrf },
  });
  expect(post.ok()).toBeTruthy();
  await api.dispose();

  await expect(page.locator(".comment").filter({ hasText: nrt })).toBeVisible({ timeout: 8000 });
});
