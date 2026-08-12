import {
  expect,
  test,
  primeRequestContext,
  type Locator,
  type Page,
} from "../../fixtures/e2e-test";
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
 * 「機能モジュール OFF」表示 (`AdminNavFeatureDisabledIndicator` + 減光) は
 * その経路では一度もレンダリングされないため、コントラスト違反が長期間検出
 * されなかった。実測 (いずれも `color-contrast` / impact serious):
 *
 * - サイドバー nav ラベル: #646c79 on #0a121f = 3.54:1（run 30617695076）
 * - スペース管理タブ: 3.46:1（本 PR で計算により発見。axe 未検出）
 *
 * サイドバー側が表面化したのも `feature-module-off-gate` spec が状態を戻し
 * 損ねた**副作用**としてであり、状態汚染が直れば再び見えなくなる穴だった。
 *
 * そこで「OFF 状態を意図的に作ってからスキャンする」経路をここに固定する。
 * 機能モジュールの ON/OFF は管理者が実際に使う正規の運用状態なので、
 * この見た目は本番でも起こりうる。
 *
 * トークン値そのもの (OKLCH → sRGB → WCAG コントラスト比) は
 * `__tests__/unit/architecture/admin-feature-disabled-contrast.test.ts` が
 * required status check 側で検算する。本 spec は「実際に描画された DOM が axe を
 * 通る」ことを end-to-end で担保する役割分担。
 *
 * ## 実装メモ
 *
 * - Settings.featureModules はシングルトン行なので `test.describe.serial`。
 * - 復元は `try/finally` ではなく **`afterEach`** で行う。finally は setup 段階
 *   (module を OFF にする過程) で throw すると入らず、OFF のまま次 spec に漏れる。
 *   run 30617695076 ではこの漏れが 30 件超の偽の失敗を生んだ。
 * - ただし復元範囲は **本 spec が所有する module のみ**。全件を書き戻すと、
 *   別 project で並行実行される `feature-module-off-gate.spec.ts` が意図的に
 *   OFF にしている最中の module を横から ON へ戻してしまう（下の
 *   `OWNED_MODULE_LABELS` のコメント参照）。
 * - 保存の成否を **クライアント状態で判定しない**（toast も pending 解除も
 *   信頼できない。実測の根拠は `applyFeatureModules` のコメント）。
 *   **リロード後も状態が保たれているか**という永続化の実体だけを確認し、
 *   競合したら読み直してやり直す（`expect.poll` は使わない。理由は
 *   `applyFeatureModules` の JSDoc）。
 * - 対象 module は `faq`（sidebar）と `access`（スペース管理タブ）。
 *   `e2e/public/feature-module-off-gate.spec.ts` が触る 5 module
 *   (contact / posts / reservation / events / spaces) と重ならないものを選び、
 *   別 project 並列実行時の相互干渉を減らしている。
 */

const FEATURES_SETTINGS_PATH = "/admin/settings/features";

/** `FEATURE_MODULES.faq.label` (registry SSoT)。sidebar 検証用。 */
const SIDEBAR_MODULE_LABEL = "FAQ";
/** `sidebar-items.tsx` の FAQ 項目の label */
const SIDEBAR_NAV_LABEL = "FAQ";
/** `FEATURE_MODULES.access.label` (registry SSoT)。スペース管理タブ検証用。 */
const TAB_MODULE_LABEL = "アクセス";
/** `SpaceManagementTabs.TAB_BASE` の `access` タブの label */
const TAB_NAV_LABEL = "場所";
/** `ADMIN_NAV_DISABLED_BADGE_LABEL` (admin-nav.ts SSoT) と一致させる */
const DISABLED_BADGE_LABEL = "非公開";

/**
 * 復元対象は **この spec が所有する module だけ** に限定する。
 *
 * 一般則は「復元は触った 1 件ではなく対象全件を既定値に揃える」だが、あれは `feature-module-off-gate.spec.ts` —— 対象 5 module の
 * **唯一の所有者** —— に向けた規約。本 spec が同じことをすると害になる:
 *
 * `feature-module-off-gate.spec.ts` は `chromium` project、本 spec は
 * `chromium-admin` project にあり、`fullyParallel: true` + 2 workers で
 * **同時に走りうる**。`test.describe.serial` が直列化するのは同一 describe 内
 * だけなので、こちらが全 module を ON に書き戻すと、あちらが「OFF にして
 * 公開ルートが 404 になること」を検証している最中に横から ON へ戻してしまい、
 * 200 を観測させて落とす（PR #1725 Codex review P2 の指摘）。
 *
 * 規約の本質は「**無条件に**復元すること」であって「全件を書き戻すこと」では
 * ないので、無条件 afterEach は維持したまま所有範囲だけに絞る。
 */
/**
 * 所有範囲の SSoT。key は registry の module id、value は admin form 上の label。
 *
 * `__tests__/unit/architecture/e2e-feature-module-ownership.test.ts` が
 * 「spec 間で所有が交わらない」「所有集合が依存カスケードで閉じている」
 * 「feature module を触る spec は必ず所有を宣言する」「label が registry と一致する」
 * を id 単位で強制する。
 */
const OWNED_FEATURE_MODULES = {
  faq: SIDEBAR_MODULE_LABEL,
  access: TAB_MODULE_LABEL,
} as const;

const OWNED_MODULE_LABELS = Object.values(OWNED_FEATURE_MODULES);

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
 * 落とすため（「id セレクタ禁止」と同じ理由。CSS
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
  return moduleSwitch(page, SIDEBAR_MODULE_LABEL)
    .locator("xpath=ancestor::form[1]")
    .getByRole("button", { name: /^保存/u });
}

async function openFeatureSettings(page: Page): Promise<void> {
  await page.goto(FEATURES_SETTINGS_PATH);
  await expect(
    page.getByRole("heading", { name: "機能モジュール", level: 1 }),
  ).toBeVisible();
}

/** 1 回の保存が遅いローカル production build でも 2 回はやり直せる幅。 */
const APPLY_FEATURE_MODULES_TIMEOUT_MS = 120_000;

/**
 * 指定した module 群を目的の ON/OFF に揃え、**リロード後も保たれている**ことまで
 * 確認する。楽観ロック競合で保存が弾かれた場合は読み直して再試行する。
 *
 * **`expect.poll` は使わない。** poll は予算が尽きた瞬間に進行中の predicate を
 * 見捨てるので、この predicate が持つ 2 回の `openFeatureSettings`（= `page.goto`）
 * が in-flight のまま残り、次の遷移と衝突して
 * `Navigation to X is interrupted by another navigation to X` になる。
 * 同型の欠陥が `feature-module-off-gate.spec.ts` で実際に CI を落としている
 * （run 31566511073）。自前ループなら 1 反復を必ず最後まで await するので
 * 孤児が残らない。強制:
 * `__tests__/unit/architecture/e2e-poll-predicate-retries.test.ts`
 */
async function applyFeatureModules(
  page: Page,
  desired: ReadonlyMap<string, boolean>,
): Promise<void> {
  const deadline = Date.now() + APPLY_FEATURE_MODULES_TIMEOUT_MS;

  const attempt = async (): Promise<boolean> => {
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
      const save = saveButton(page);

      // **Server Action がサーバー側で完走した**ことを待つ。これを待たずに
      // reload すると in-flight の Server Action が中断され、Prisma の書込は
      // コミット済みなのに `afterSuccess` の `updateTag` まで到達しない。
      //
      // 「完了」をクライアント状態で待ってはいけない:
      //  - 成功 toast を待つ → 楽観ロック競合時は error toast になりタイムアウト。
      //    競合以外の form エラーでは `FeatureModulesForm` の useEffect が
      //    どちらの toast も出さず、無言で終わる
      //  - pending 解除 (`toBeEnabled`) を待つ → 成功時 useEffect が
      //    `router.refresh()` を呼ぶため、その transition が終わるまで
      //    isPending が解除されないことがある
      //  - **pending 開始 (`toBeDisabled`) を待つのも不可** → disabled は
      //    isPending の間しか存在しない一過性の状態なので、保存が速く終わると
      //    窓を取り逃して偽の失敗になる（実測 run 30688324782: 15 秒間 34 回
      //    ポーリングして一度も観測できず、復元に失敗して連鎖的に落ちた）
      //
      // POST 応答は**必ず発生する事象**なので取り逃しがなく、返った時点で
      // サーバー側は `afterSuccess` まで完了している。
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === FEATURES_SETTINGS_PATH,
          { timeout: 15000 },
        ),
        save.click(),
      ]);
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
  };

  for (;;) {
    if (await attempt()) return;
    if (Date.now() >= deadline) break;
  }

  throw new Error(
    "feature module の指定状態がリロード後も保たれなかった（楽観ロック競合の可能性）",
  );
}

/** 本 spec が OFF にした module だけを既定値 (ON) に戻す */
async function restoreOwnedFeatureModules(page: Page): Promise<void> {
  await applyFeatureModules(
    page,
    new Map(OWNED_MODULE_LABELS.map((label) => [label, true])),
  );
}

test.describe.serial("a11y scan - 機能モジュール OFF 状態の管理画面", () => {
  // 復元は必ず走らせる。setup 段階で失敗しても OFF のまま次 spec に漏らさない。
  test.afterEach(async ({ page }) => {
    await restoreOwnedFeatureModules(page);
  });

  // 復元されたことを独立に検証し、壊れていれば本 spec 自身を落とす。
  // 管理面の認証は cookie ではなく webServer env の IAP 模擬なので、
  // storageState なしの新規 context でもそのまま管理者として解決される。
  // 所有 module だけを見る — 他 module は並行 spec が意図的に OFF にしている
  // 可能性があり、そこまで検証すると本 spec が偽陽性で落ちる。
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    // 手動生成した context には `extraHTTPHeaders` fixture が効かない。
    // 明示的に client IP を割り当てないと rate limit バケットを共有する。
    await primeRequestContext(context);
    const page = await context.newPage();
    try {
      await openFeatureSettings(page);
      for (const label of OWNED_MODULE_LABELS) {
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
    test.setTimeout(360000);

    await applyFeatureModules(page, new Map([[SIDEBAR_MODULE_LABEL, false]]));

    await page.goto(urls.adminDashboard);
    await expect(page.getByRole("main")).toBeVisible();

    // スキャン対象の状態が本当に描画されていることを先に確定させる。
    // これが無いと、OFF 化に失敗しても「違反ゼロ」で緑になってしまう。
    // <aside id="admin-sidebar"> は role を持たないため visibleById を使う
    // (responsive-shell.spec.ts と同じ、実証済みのロケーター)。
    const sidebar = visibleById(page, "admin-sidebar");
    const disabledNavLink = sidebar.getByRole("link", {
      name: new RegExp(SIDEBAR_NAV_LABEL, "u"),
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

  test("機能モジュール OFF のスペース管理タブに critical/serious 違反がない", async ({
    page,
  }) => {
    test.setTimeout(360000);

    // `access` は sidebar には現れず、スペース管理タブ (`SpaceManagementTabs`) の
    // 「場所」タブにだけ「非公開」表示を出す。sidebar と同じ意匠だが明色テーマで、
    // `opacity-80` を掛けると 3.46:1 まで落ちていた経路。
    await applyFeatureModules(page, new Map([[TAB_MODULE_LABEL, false]]));

    await page.goto(urls.adminSpaces);
    await expect(page.getByRole("main")).toBeVisible();

    const tabs = page.getByRole("navigation", {
      name: "スペース管理ナビゲーション",
    });
    const disabledTab = tabs.getByRole("button", {
      name: new RegExp(TAB_NAV_LABEL, "u"),
    });
    await expect(disabledTab).toBeVisible();
    await expect(disabledTab).toContainText(DISABLED_BADGE_LABEL);

    const results = await buildAdminAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlockingAdminViolation);

    expect(
      blocking,
      `Admin spaces tabs (feature module OFF) a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });
});
