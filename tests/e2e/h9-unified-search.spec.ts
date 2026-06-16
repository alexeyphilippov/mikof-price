import { test, expect, BrowserContext } from "@playwright/test";

async function login(ctx: BrowserContext, email: string, password: string) {
  const r = await ctx.request.post("/api/auth/login", { data: { email, password } });
  expect(r.ok()).toBeTruthy();
}

test("H9: поиск услуг и пакетов по коду или названию", async ({ page, context }) => {
  await login(context, "gen@mikofai.ru", "e5aaa0923588c460a3");

  const services = await (await context.request.get("/api/services")).json();
  expect(services.length).toBeGreaterThan(0);
  const svc = services[0];
  const codePart = svc.code.slice(0, Math.min(6, svc.code.length));
  const byCode = await (await context.request.get(`/api/services?search=${encodeURIComponent(codePart)}`)).json();
  expect(byCode.some((s: { id: number }) => s.id === svc.id)).toBeTruthy();
  const namePart = svc.name_ru.slice(0, Math.min(8, svc.name_ru.length));
  const byName = await (await context.request.get(`/api/services?search=${encodeURIComponent(namePart)}`)).json();
  expect(byName.some((s: { id: number }) => s.id === svc.id)).toBeTruthy();

  const packages = await (await context.request.get("/api/packages")).json();
  expect(packages.length).toBeGreaterThan(0);
  const pkg = packages[0];
  const pkgCode = pkg.code.slice(0, Math.min(6, pkg.code.length));
  const pkgByCode = await (await context.request.get(`/api/packages?search=${encodeURIComponent(pkgCode)}`)).json();
  expect(pkgByCode.some((p: { id: number }) => p.id === pkg.id)).toBeTruthy();

  await page.goto("/services");
  await page.getByPlaceholder("Поиск по коду или названию…").fill(codePart);
  await expect(page.getByRole("link", { name: svc.code })).toBeVisible();

  await page.goto("/packages");
  await page.getByPlaceholder("Поиск по коду или названию…").fill(pkgCode);
  await expect(page.getByRole("link", { name: pkg.code })).toBeVisible();
});
