import { test, expect } from "@playwright/test";

test("H6: pull-to-refresh на мобильном", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const login = await context.request.post("/api/auth/login", {
    data: { email: "gen@mikofai.ru", password: "e5aaa0923588c460a3" },
  });
  expect(login.ok()).toBeTruthy();

  await page.goto("/services");
  await page.waitForSelector('[data-testid="pull-refresh"]');
  const ptr = page.locator('[data-testid="pull-refresh"]');

  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const el = document.documentElement;
    const mk = (y: number) =>
      new Touch({ identifier: 1, target: el, clientX: 120, clientY: y, pageX: 120, pageY: y });
    el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [mk(60)] }));
    el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [mk(220)] }));
  });
  await expect(ptr).toHaveClass(/visible/);
  await expect(ptr).toContainText(/Отпустите|Потяните/);

  await page.evaluate(() => {
    document.documentElement.dispatchEvent(
      new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [] }),
    );
  });
  await expect(ptr).toHaveClass(/refreshing/);
  await expect(ptr).toContainText("Обновление");
});

test("H6: нет индикатора на desktop", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.request.post("/api/auth/login", {
    data: { email: "gen@mikofai.ru", password: "e5aaa0923588c460a3" },
  });
  await page.goto("/services");
  await expect(page.locator('[data-testid="pull-refresh"]')).toHaveCount(0);
});
