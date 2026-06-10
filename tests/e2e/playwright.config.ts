import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE || "http://localhost:5173",
    headless: true,
  },
});
