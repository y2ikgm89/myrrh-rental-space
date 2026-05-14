import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { urls } from "../fixtures";

/**
 * Smoke: WCAG critical violation ゲート
 *
 * 目的: ホーム + 公開サインインの critical / serious 違反のみを毎 push で検出。
 * minor / moderate 違反は `e2e/a11y/axe-public-pages.spec.ts`（label opt-in）で網羅。
 *
 * 業界標準: Stripe / Vercel / GitHub の "critical-only smoke" pattern。
 * 全 page を毎 push で axe するのは過剰、smoke は public root + login のみ。
 */

async function expectNoCriticalAxeViolations(
  page: import("@playwright/test").Page,
  pathname: string,
) {
  await page.goto(pathname);
  await page.waitForLoadState("domcontentloaded");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const blockingViolations = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );

  expect(
    blockingViolations,
    `critical/serious axe violations on ${pathname}: ${JSON.stringify(
      blockingViolations.map((v) => ({ id: v.id, impact: v.impact })),
      null,
      2,
    )}`,
  ).toEqual([]);
}

test.describe("smoke: a11y critical gate", () => {
  test("ホームページに critical/serious WCAG 違反がない", async ({ page }) => {
    await expectNoCriticalAxeViolations(page, urls.home);
  });

  test("公開サインインに critical/serious WCAG 違反がない", async ({
    page,
  }) => {
    await expectNoCriticalAxeViolations(page, urls.customerLogin);
  });
});
