import { test, expect, BrowserContext } from "@playwright/test";

async function login(ctx: BrowserContext, email: string, password: string) {
  const r = await ctx.request.post("/api/auth/login", { data: { email, password } });
  expect(r.ok()).toBeTruthy();
}

test("H10: UTC в API, локальное время в UI", async ({ page, context }) => {
  await login(context, "gen@mikofai.ru", "e5aaa0923588c460a3");

  const audit = await (await context.request.get("/api/audit")).json();
  expect(audit.length).toBeGreaterThan(0);
  expect(audit[0].created_at).toMatch(/Z$/);

  const requests = await (await context.request.get("/api/requests")).json();
  expect(requests[0].updated_at).toMatch(/Z$/);

  await page.goto("/audit");
  const apiTime = new Date(audit[0].created_at);
  const expected = apiTime.toLocaleString();
  await expect(page.getByRole("cell", { name: expected }).first()).toBeVisible();
});
