import { expect, test, type Locator, type Page } from "@playwright/test";
import { urls } from "../../fixtures";
import {
  buildAdminAxeScanner,
  formatAxeViolations,
  isBlockingAdminViolation,
} from "../../helpers/admin-axe";
import { visibleById } from "../../helpers/streaming-safe-locators";

/**
 * 管理画面 - 機能モジュール OFF 状態の axe スキャン
 *
 * ## なぜ専用 spec が要るのか
 *
 * `axe-admin-pages.spec.ts` は「全機能 ON」の seed 既定状態しか踏まない。
 * サイドバーの「機能モジュール OFF」表示 (`AdminNavFeatureDisabledIndicator` +
 * 減光ラベル) はその経路では一度もレンダリングされないため、
 * 前景 #646c79 / 背景 #0a121f = 3.54:1 の `color-contrast` 違反 (impact serious)
 * が長期間検出されなかった。実際に表面化したのは run 30617695076 で
 * `feature-module-off-gate` spec が状態を戻し損ねた**副作用**としてであり、
 * 状態汚染が直れば再び見えなくなる性質の穴だった。
 *
 * そこで「OFF 状態を意図的に作ってからスキャンする」経路をここに固定する。
 * 機能モジュールの ON/OFF は管理者が実際に使う正規の運用状態なので、
 * この見た目は本番でも起こりうる。
 *
 * トークン値そのもの (OKLCH → sRGB → WCAG コントラスト比) は
 * `__tests__/unit/architecture/admin-sidebar-contrast.test.ts` が required
 * status check 側で検算する。本 spec は「実際に描画された DOM が axe を通る」
 * ことを end-to-end で担保する役割分担。
 *
 * ## 実装メモ
 *
 * - Settings.featureModules はシングルトン行なので `test.describe.serial`。
 * - 復元は `try/finally` ではなく **`afterEach`** で行う。finally は setup 段階
 *   (module を OFF にする過程) で throw すると入らず、OFF のまま次 spec に漏れる。
 *   run 30617695076 ではこの漏れが 30 件超の偽の失敗を生んだ。
 * - 復元は「触った 1 件」ではなく **既定値の全件**に揃える。
 * - 保存完了の判定に toast を使わない。このフォームは `expectedUpdatedAt` の
 *   楽観ロックを持ち、並行セッションと競合すると成功ではなく error toast を出す。
 *   **リロード後も状態が保たれているか**という永続化の実体を `expect.poll` で
 *   確認し、競合したら読み直してやり直す。
 * - 対象 module は `faq`。`e2e/public/feature-module-off-gate.spec.ts` が触る
 *   5 module (contact / posts / reservation / events / spaces) と重ならないものを
 *   選び、別 project 並列実行時の相互干渉を減らしている。
 */

const FEATURES_SETTINGS_PATH = "/admin/settings/features";

/** `FEATURE_MODULES.faq.label` (registry SSoT) と一致させる */
const TARGET_MODULE_LABEL = "FAQ";
/** `sidebar-items.tsx` の FAQ 項目の label */
const TARGET_NAV_LABEL = "FAQ";
/** `ADMIN_NAV_DISABLED_BADGE_LABEL` (admin-nav.ts SSoT) と一致させる */
const DISABLED_BADGE_LABEL = "非公開";
/** `FeatureModulesForm.OPTIMISTIC_CONFLICT_HINT` と一致させる */
const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";
/** 成功 toast の文言（保存の**決着**検出にのみ使い、成功判定には使わない） */
const SAVE_SUCCESS_TOAST = "機能モジュールを保存しました";

/**
 * 既定状態 = `buildInitialFeatureModules()` / `prisma/seed.ts` の契約。
 *
 * `data-retention` は「seed 時に必ず false」が registry の不変条件なので
 * **意図的に含めない** — ON にすると PII を削除する日次 cron が有効化される。
 * 値は `FEATURE_MODULES[*].label` と一致させること。
 */
const DEFAULT_ENABLED_MODULE_LABELS = [
  // 依存元 (`requires`) が先に来る順序。spaces を先に ON にしないと
  // reservation / reviews の Switch が disabled のままクリックできない。
  "スペース管理",
  "予約フォーム",
  "オンライン決済",
  "レビュー",
  "イベント",
  "ブログ",
  "お知らせ",
  "FAQ",
  "アクセス",
  "お問い合わせ",
] as const;

/**
 * 機能モジュール 1 行の Switch。
 *
 * 行は `<div class="flex items-start justify-between rounded-lg border p-4">` +
 * 内側に `<label>{mod.label}</label>` と Radix `<button role="switch">`
 * (`FeatureModulesForm.ModuleSwitchRow`)。Radix の実装上 `label htmlFor` が
 * Switch のアクセシブルネームにならないため、行を label テキストで絞り込む。
 * Card は `rounded-md` なので `div.rounded-lg` は行だけに一致する。
 *
 * `.filter({ visible: true })` は React streaming の hidden staging copy を
 * 落とすため (rules の testing-e2e.md「id セレクタ禁止」と同じ理由。CSS
 * セレクタは a11y ツリー非公開の複製にも一致する)。
 */
function moduleSwitch(page: Page, moduleLabel: string): Locator {
  return page
    .locator("div.rounded-lg")
    .filter({ visible: true })
    .filter({ has: page.getByText(moduleLabel, { exact: true }) })
    .getByRole("switch");
}

/**
 * 機能モジュールフォームの「保存」ボタン。
 * このページにはデータ保持設定用のフォームもあり保存ボタンが 2 つあるため、
 * module 行から祖先 form を辿って絞り込む (run 30595374008 の strict violation)。
 */
function saveButton(page: Page): Locator {
  return moduleSwitch(page, TARGET_MODULE_LABEL)
    .locator("xpath=ancestor::form[1]")
    .getByRole("button", { name: /^保存/u });
}

async function openFeatureSettings(page: Page): Promise<void> {
  await page.goto(FEATURES_SETTINGS_PATH);
  await expect(
    page.getByRole("heading", { name: "機能モジュール", level: 1 }),
  ).toBeVisible();
}

/**
 * 指定した module 群を目的の ON/OFF に揃え、**リロード後も保たれている**ことまで
 * 確認する。楽観ロック競合で保存が弾かれた場合は読み直して再試行する。
 */
async function applyFeatureModules(
  page: Page,
  desired: ReadonlyMap<string, boolean>,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await openFeatureSettings(page);

        let changed = false;
        for (const [label, enabled] of desired) {
          const toggle = moduleSwitch(page, label);
          await expect(toggle).toBeVisible();
          const target = enabled ? "true" : "false";
          if ((await toggle.getAttribute("aria-checked")) !== target) {
            await toggle.click();
            await expect(toggle).toHaveAttribute("aria-checked", target);
            changed = true;
          }
        }

        if (changed) {
          await saveButton(page).click();
          // Server Action が「決着した」ことだけを待つ。成功と楽観ロック競合の
          // どちらでも toast が出るので両方を受ける — 成功文言だけを待つと
          // 競合時にタイムアウトし、待たずに reload すると送信を中断してしまう。
          await expect(
            page
              .getByText(SAVE_SUCCESS_TOAST)
              .or(page.getByText(OPTIMISTIC_CONFLICT_HINT)),
          ).toBeVisible({ timeout: 20000 });
        }

        // 永続化の実体をリロード後の DOM で確認する
        await openFeatureSettings(page);
        for (const [label, enabled] of desired) {
          const actual = await moduleSwitch(page, label).getAttribute(
            "aria-checked",
          );
          if (actual !== (enabled ? "true" : "false")) return false;
        }
        return true;
      },
      {
        timeout: 60000,
        intervals: [1000, 2000, 3000, 5000],
      },
    )
    .toBe(true);
}

/** 全モジュールを seed 既定値に戻す（data-retention は触らない） */
async function restoreFeatureModuleDefaults(page: Page): Promise<void> {
  await applyFeatureModules(
    page,
    new Map(DEFAULT_ENABLED_MODULE_LABELS.map((label) => [label, true])),
  );
}

test.describe.serial("a11y scan - 機能モジュール OFF 状態の管理画面", () => {
  // 復元は必ず走らせる。setup 段階で失敗しても OFF のまま次 spec に漏らさない。
  test.afterEach(async ({ page }) => {
    await restoreFeatureModuleDefaults(page);
  });

  // 復元されたことを独立に検証し、壊れていれば本 spec 自身を落とす。
  // 管理面の認証は cookie ではなく webServer env の IAP 模擬なので、
  // storageState なしの新規 context でもそのまま管理者として解決される。
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await openFeatureSettings(page);
      for (const label of DEFAULT_ENABLED_MODULE_LABELS) {
        await expect(
          moduleSwitch(page, label),
          `[cleanup] 機能モジュール「${label}」が ON に復元されていない`,
        ).toHaveAttribute("aria-checked", "true");
      }
    } finally {
      await context.close();
    }
  });

  test("機能モジュール OFF のサイドバー項目に critical/serious 違反がない", async ({
    page,
  }) => {
    // Playwright の test timeout は afterEach hook と共有される。設定保存 →
    // リロード検証を「OFF 化」と「復元」で 2 度まわすため既定 30s では足りない。
    test.setTimeout(240000);

    await applyFeatureModules(page, new Map([[TARGET_MODULE_LABEL, false]]));

    await page.goto(urls.adminDashboard);
    await expect(page.getByRole("main")).toBeVisible();

    // スキャン対象の状態が本当に描画されていることを先に確定させる。
    // これが無いと、OFF 化に失敗しても「違反ゼロ」で緑になってしまう。
    // <aside id="admin-sidebar"> は role を持たないため visibleById を使う
    // (responsive-shell.spec.ts と同じ、実証済みのロケーター)。
    const sidebar = visibleById(page, "admin-sidebar");
    const disabledNavLink = sidebar.getByRole("link", {
      name: new RegExp(TARGET_NAV_LABEL, "u"),
    });
    await expect(disabledNavLink).toBeVisible();
    await expect(disabledNavLink).toContainText(DISABLED_BADGE_LABEL);

    const results = await buildAdminAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlockingAdminViolation);

    expect(
      blocking,
      `Admin dashboard (feature module OFF) a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });
});
