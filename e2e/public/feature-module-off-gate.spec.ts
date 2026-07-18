import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";
import { primeAdminRequestContext } from "../helpers/admin-auth";
import { ensureAdminUser } from "../helpers/ensure-admin-user";

/**
 * E2E-04: Feature Module OFF → 公開ルート 404 (fail-closed regression gate)
 *
 * FEAT-3PLANE-04 (PR #1205) で `mypage/inquiries` × 2、`reservation/complete`、
 * `claim/reservation`、`claim/event-registration` に `requireFeatureEnabled` gate
 * が追加された。本 spec は「feature module を OFF にすると gate 対象の公開
 * ルートが 404 を返す」実行時契約を、代表 5 module × 主要ルートで検証する。
 *
 * unit test の `public-route-gates.test.ts` が「grep で gate 呼び出しが存在するか」
 * を drift gate で守るのに対し、本 spec は「実際に OFF にしたときブラウザ HTTP
 * response が 404 になる」ランタイム挙動を守る（source と gate 実装、cache
 * invalidation、not-found rendering までを end-to-end で確認）。
 *
 * ## 実装メモ
 *
 * - Settings.featureModules は Settings singleton row の JSON column で
 *   `'use cache'` + `cacheTag(FEATURE_MODULES)` されている。admin form の
 *   `updateFeatureModulesSettings` server action が
 *   `invalidateSiteWideCache([FEATURE_MODULES, ...])` を呼ぶ規約 (SSoT: production
 *   flow) を利用して cache invalidation を成立させる。DB を直接書き換えると
 *   キャッシュが古いまま公開ルートが 200 を返し得るため、必ず admin UI 経由。
 * - シングルトン行 mutation のため `test.describe.serial` で直列化。
 * - 管理面へのアクセスは storageState ではなく webServer env
 *   `ADMIN_TEST_IAP_EMAIL` による IAP 模擬 (rules の testing-e2e.md 参照)。
 *   `chromium` project は setup-admin dependency を持たないため、spec 側で
 *   `ensureAdminUser()` + `primeAdminRequestContext(context)` を明示する。
 * - `spaces` は `reservation` / `reviews` の依存元。spaces OFF テストの間だけ
 *   reservation 側の switch が視覚上 disabled になるが、DB 側の explicit true 値
 *   は保存されている (registry.buildInitialFeatureModules の contract)。restore
 *   ロジックで元の ON 状態に戻すため他テストに影響しない。
 * - APP_SURFACE=public で webServer が起動している場合、proxy が /admin を 404 に
 *   するため spec 全体を skip する (rules の app-structure.md 参照)。ローカル
 *   既定と CI の chromium project は APP_SURFACE=admin で動作する。
 */

const IS_PUBLIC_SURFACE = process.env["APP_SURFACE"] === "public";

const CLAIM_TOKEN_STUB = "e2e-stub-token";

interface ModuleCase {
  readonly module: string;
  readonly label: string;
  readonly routes: readonly string[];
}

/**
 * 各 module OFF 時に 404 を返すべき代表ルート。gate 実体は全 22 経路
 * (`public-route-gates.test.ts` EXPECTED_GATES) にあるが、本 spec は 5 module ×
 * 主要ルートに絞ってランタイム挙動を守る (unit drift gate と役割分担)。
 *
 * `label` は `FEATURE_MODULES[id].label` (registry SSoT) と一致させる — admin
 * form の Switch 行の見出しテキストとして使う。
 */
const MODULE_CASES: readonly ModuleCase[] = [
  {
    module: "contact",
    label: "お問い合わせ",
    routes: [urls.contact, urls.mypageInquiries],
  },
  {
    module: "posts",
    label: "ブログ",
    routes: [urls.blog],
  },
  {
    module: "reservation",
    label: "予約フォーム",
    routes: [
      urls.reservation,
      `/reservation/complete?token=${CLAIM_TOKEN_STUB}`,
      `/claim/reservation?token=${CLAIM_TOKEN_STUB}`,
    ],
  },
  {
    module: "events",
    label: "イベント",
    routes: [
      urls.events,
      `/claim/event-registration?token=${CLAIM_TOKEN_STUB}`,
    ],
  },
  {
    module: "spaces",
    label: "スペース管理",
    routes: [urls.spaces],
  },
];

/**
 * `/admin/settings/features` の Switch 行を module label で特定して指定状態に
 * 遷移させる。既に希望状態なら no-op で戻り、変化があった場合のみ「保存」まで
 * 実行して toast 表示を待つ。
 */
async function setFeatureModule(
  page: Page,
  moduleLabel: string,
  enabled: boolean,
): Promise<void> {
  await page.goto("/admin/settings/features");
  await expect(
    page.getByRole("heading", { name: "機能モジュール", level: 1 }),
  ).toBeVisible();

  // 各 row は `<div class="rounded-lg border p-4">` + 内側に `<label>{mod.label}</label>`
  // + Radix `<button role="switch">` を持つ (FeatureModulesForm.ModuleSwitchRow)。
  // label htmlFor は Switch の button に付かない (Radix 実装) ため、行 div 全体を
  // text で filter して switch を取得する。
  const row = page.locator("div.rounded-lg").filter({
    has: page.getByText(moduleLabel, { exact: true }),
  });
  const switchButton = row.getByRole("switch");
  await expect(switchButton).toBeVisible();

  const currentState = await switchButton.getAttribute("aria-checked");
  const desiredState = enabled ? "true" : "false";

  if (currentState === desiredState) {
    return;
  }

  await switchButton.click();
  await expect(switchButton).toHaveAttribute("aria-checked", desiredState);

  await page.getByRole("button", { name: /^保存/u }).click();
  await expect(page.getByText("機能モジュールを保存しました")).toBeVisible({
    timeout: 15000,
  });
}

// シングルトン Settings.featureModules を mutate するため、他の並列テストと
// 衝突しないよう serial 化する (rules の testing-e2e.md 参照)。
test.describe
  .serial("feature-module OFF returns 404 across all critical routes (E2E-04)", () => {
  test.skip(
    IS_PUBLIC_SURFACE,
    "APP_SURFACE=public では /admin にアクセスできないため skip",
  );

  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  for (const c of MODULE_CASES) {
    test(`${c.module} OFF → 対象ルートが 404 を返す`, async ({
      page,
      context,
    }) => {
      await primeAdminRequestContext(context);

      // Setup: module を OFF に切り替え (invalidate FEATURE_MODULES tag)
      await setFeatureModule(page, c.label, false);

      try {
        // Act + Assert: gate 対象ルートが 404 を返す
        for (const route of c.routes) {
          const response = await page.goto(route);
          expect(
            response?.status(),
            `[${c.module}] ${route} は feature OFF 時に 404 を返すべき`,
          ).toBe(404);
        }
      } finally {
        // Cleanup: 他テストに影響しないよう ON に復元 (fail 経路でも実行)
        await setFeatureModule(page, c.label, true);
      }
    });
  }
});
