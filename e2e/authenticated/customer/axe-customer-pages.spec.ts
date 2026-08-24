import { test, expect, type Page } from "../../fixtures/e2e-test";
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";
import { urls } from "../../fixtures";

const CUSTOMER_AXE_ROUTES = [
  { path: urls.mypageReservations, label: "マイページ予約一覧" },
  { path: urls.mypageEvents, label: "マイページイベント一覧" },
  { path: urls.mypageInquiries, label: "マイページお問い合わせ一覧" },
  { path: urls.mypageProfile, label: "マイページアカウント設定" },
] as const;

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

function isBlocking(violation: Result): boolean {
  return violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false;
}

function buildCustomerAxeScanner(page: Page): AxeBuilder {
  // Turnstile の iframe を除外する必要は無い。E2E は api.js をローカル実装へ
  // 差し替えるので（`e2e/fixtures/turnstile-stub.ts`）、この origin の iframe は
  // 1 つも生成されない。
  return new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
  ]);
}

function formatAxeViolations(violations: readonly Result[]): string {
  return violations
    .map(
      (violation) =>
        `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))\n  ${violation.helpUrl}\n  ${violation.nodes.map((node) => node.target.join(" > ")).join(", ")}`,
    )
    .join("\n\n");
}

test.describe("a11y scan - 認証済みマイページ主要ルート", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const route of CUSTOMER_AXE_ROUTES) {
    test(`${route.label}に critical/serious 違反がない`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("main")).toBeVisible();

      const results = await buildCustomerAxeScanner(page).analyze();
      const blocking = results.violations.filter(isBlocking);

      expect(
        blocking,
        `${route.label} a11y violations:\n${formatAxeViolations(results.violations)}`,
      ).toEqual([]);
    });
  }
});
