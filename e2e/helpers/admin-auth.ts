import { expect, type BrowserContext, type Page } from "@playwright/test";
import { ADMIN_GATE_COOKIE_NAME } from "../../src/shared/lib/admin-login-gate";
import { adminCredentials, urls } from "../fixtures";
import { ensureAdminUser } from "./ensure-admin-user";

const contextIpMap = new WeakMap<BrowserContext, string>();
let nextContextIpOctet = 10;

function getPlaywrightBaseUrl(): string {
  return process.env["PLAYWRIGHT_BASE_URL"] || "http://localhost:3000";
}

function getContextClientIp(context: BrowserContext): string {
  const existing = contextIpMap.get(context);
  if (existing) {
    return existing;
  }

  const ip = `203.0.113.${nextContextIpOctet}`;
  nextContextIpOctet = nextContextIpOctet >= 250 ? 10 : nextContextIpOctet + 1;
  contextIpMap.set(context, ip);
  return ip;
}

export async function primeAdminLoginGate(
  context: BrowserContext,
): Promise<void> {
  const adminUrl = new URL("/admin", getPlaywrightBaseUrl()).toString();

  await context.setExtraHTTPHeaders({
    "x-forwarded-for": getContextClientIp(context),
  });
  await context.addCookies([
    {
      name: ADMIN_GATE_COOKIE_NAME,
      value: "1",
      url: adminUrl,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

export async function gotoAdminLogin(page: Page): Promise<void> {
  await ensureAdminUser();
  await primeAdminLoginGate(page.context());
  await page.goto(urls.login);
  await expect(page.locator("input#email")).toBeVisible();
  await expect(page.locator("input#password")).toBeVisible();
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await gotoAdminLogin(page);
  await page.locator("input#email").fill(adminCredentials.email);
  await page.locator("input#password").fill(adminCredentials.password);
  // `exact: true` 必須 — `NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` 環境 (CI / dev) では
  // `<DevLoginButton>`「SUPER_ADMIN でログイン」も同 page に render され、
  // partial match だと strict mode violation で fail する。
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  // `expect(page).toHaveURL` polling は App Router の soft / hard navigation
  // 両方で動作する canonical pattern（→ `test-quality/e2e.md` §App Router Gotchas）。
  // `page.waitForURL` の default `waitUntil: "load"` は soft navigation で
  // load event 不発火のため timeout する silent UX bug。
  await expect(page).toHaveURL(urls.adminDashboard, { timeout: 15000 });
  await expect(page.getByRole("main")).toBeVisible();
}
