import { defineConfig } from "@playwright/test";
const env = { DATABASE_URL: "sqlite:///./e2e.db", JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-1234", BOOTSTRAP_PASSWORD: "e2e-password-12345", ENV: "development" };
export default defineConfig({
  testDir: "./e2e", timeout: 60000, workers: 1, retries: process.env.CI ? 1 : 0, reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure", viewport: { width: 390, height: 844 } },
  webServer: [
    { command: "rm -f e2e.db; python -m festops.cli bootstrap-core --email core@e2e.invalid --name 'E2E Core'; python -m uvicorn festops.main:app --port 8000", cwd: "..", env, url: "http://localhost:8000/api/v1/health", reuseExistingServer: false, timeout: 60000 },
    { command: "npm run dev -- --port 5173", url: "http://localhost:5173", reuseExistingServer: !process.env.CI },
  ],
});
