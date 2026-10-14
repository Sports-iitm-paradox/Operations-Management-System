import { expect, test, Page } from "@playwright/test";
test.describe.configure({ mode: "serial" });

const PW = "e2e-password-12345", CORE = "core@e2e.invalid", VOL = "vol1@e2e.invalid", EVENT = "E2E Finals", TITLE = "Scoreboard offline";
const local = (min: number) => { const d = new Date(Date.now() + min * 60000), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
async function login(page: Page, email: string) {
  await page.goto("/login"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(PW); await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();

test("Core creates an event with a session", async ({ page }) => {
  await login(page, CORE); await tab(page, "More"); await page.getByRole("link", { name: /Events and sessions/ }).click();
  await page.getByRole("button", { name: /New event/ }).click(); await page.getByLabel("Event code").fill("E2E-1"); await page.getByLabel("Event name").fill(EVENT);
  await page.getByRole("button", { name: "Create event" }).click(); await page.getByText(EVENT).click();
  await page.getByLabel("Stage or round").fill("Final"); await page.getByLabel("Starts").fill(local(15)); await page.getByLabel("Ends").fill(local(75));
  await page.getByRole("button", { name: "Add session" }).click(); await expect(page.getByText("Final").first()).toBeVisible();
});

test("Core adds a volunteer account", async ({ page }) => {
  await login(page, CORE); await tab(page, "More"); await page.getByRole("link", { name: /Team and roles/ }).click();
  await page.getByRole("button", { name: /Add member/ }).click(); await page.getByLabel("Full name").fill("Volunteer One"); await page.getByLabel(/Email/).fill(VOL);
  await page.getByLabel(/Starting password/).fill(PW); await page.getByRole("button", { name: "Create account" }).click(); await expect(page.getByText("Volunteer One")).toBeVisible();
});

test("Core assigns the volunteer on the calendar", async ({ page }) => {
  await login(page, CORE); await tab(page, "Calendar"); await page.getByText(EVENT).first().click();
  await page.getByLabel("Person").selectOption({ label: "Volunteer One" }); await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Volunteer One").first()).toBeVisible();
});

test("Volunteer acknowledges and checks in", async ({ page }) => {
  await login(page, VOL); await tab(page, "Duties"); await expect(page.getByText(EVENT)).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge" }).click(); await page.getByRole("button", { name: "Check in" }).click(); await expect(page.getByText("CHECKED IN").first()).toBeVisible();
});

test("Volunteer reports an issue and is denied admin actions", async ({ page }) => {
  await login(page, VOL); await tab(page, "Issues"); await page.getByRole("button", { name: "Report issue" }).click();
  await page.getByLabel("Event").selectOption({ label: EVENT }); await page.getByRole("button", { name: "HIGH" }).click(); await page.getByLabel("Title").fill(TITLE);
  await page.getByLabel("What happened").fill("Display froze during warmup"); await page.getByRole("button", { name: "Submit" }).click(); await expect(page.getByText(TITLE)).toBeVisible();
  await tab(page, "More"); await expect(page.getByRole("link", { name: /Team and roles/ })).toHaveCount(0);
  const status = await page.evaluate(async () => (await fetch("/api/v1/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionStorage.getItem("fo_token") }, body: "{}" })).status);
  expect(status).toBe(403);
});

test("Core assigns, progresses and resolves the issue; dashboard reflects it", async ({ page }) => {
  await login(page, CORE); await tab(page, "Issues"); await page.getByText(TITLE).click();
  await page.getByLabel("Assign owner").selectOption({ label: "Volunteer One" }); await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("ASSIGNED").first()).toBeVisible(); await page.getByRole("button", { name: "IN PROGRESS" }).click();
  await page.getByLabel(/Note/).fill("Rebooted the display"); await page.getByRole("button", { name: "RESOLUTION SUBMITTED" }).click(); await expect(page.getByText("Rebooted the display").first()).toBeVisible();
  await page.getByRole("button", { name: "VERIFIED" }).click(); await page.getByRole("button", { name: "CLOSED" }).click(); await expect(page.getByText("CLOSED").first()).toBeVisible(); await tab(page, "Home"); await expect(page.getByText("Duties scheduled")).toBeVisible();
});

test("Core downloads an export and sees the audit trail", async ({ page }) => {
  await login(page, CORE); await tab(page, "More"); await page.getByRole("link", { name: /Exports/ }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).first().click()]); expect(dl.suggestedFilename()).toContain("issues");
  await tab(page, "More"); await page.getByRole("link", { name: /Audit log/ }).click(); await expect(page.getByText("duty.assign").first()).toBeVisible();
});
