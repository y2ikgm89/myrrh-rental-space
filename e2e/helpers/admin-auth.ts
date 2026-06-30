import { expect, type BrowserContext, type Page } from "@playwright/test";
import { urls } from "../fixtures";
import { ensureAdminUser } from "./ensure-admin-user";

const contextIpMap = new WeakMap<BrowserContext, string>();
let nextContextIpOctet = 10;

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

export async function primeAdminRequestContext(
  context: BrowserContext,
): Promise<void> {
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": getContextClientIp(context),
  });
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await ensureAdminUser();
  await primeAdminRequestContext(page.context());
  await page.goto(urls.adminDashboard);
  await expect(page).toHaveURL(urls.adminDashboard, { timeout: 15000 });
  await expect(page.getByRole("main")).toBeVisible();
}
