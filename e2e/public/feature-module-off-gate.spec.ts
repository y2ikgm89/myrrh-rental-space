import { test, expect, type Locator, type Page } from "@playwright/test";
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
 * ## この spec は共有 DB のグローバル状態を触る — 復元は絶対契約
 *
 * `Settings.featureModules` は singleton row。OFF のまま残すと **1 spec の失敗が
 * run 全体を汚染する**。実測 (run 30617695076): contact が OFF のまま残り、
 * `/contact` 404 → public/customer の responsive-shell・inquiries・inquiry-reply が
 * 巻き添え、さらに admin サイドバーの「お問い合わせ」が feature-disabled 表示
 * (`text-sidebar-text-muted/80`, contrast 3.54:1) になって
 * `axe-admin-pages` が 23 テスト × 3 attempt 全滅した。**計 30 件超の偽の失敗**。
 *
 * そのため:
 *
 * 1. 復元は `afterEach` で**無条件**に行う。旧実装は `try/finally` だったが、
 *    setup 段階 (OFF への切替) で throw すると finally に入らず復元されなかった
 * 2. 復元は「この test が触った module」ではなく**全 module を ON に揃える**
 * 3. `afterAll` で全 module が ON であることを検証し、復元が壊れたら
 *    **この spec 自身が落ちる**ようにする（巻き添えで他 spec を落とさない）
 *
 * ## 保存の完了判定に toast を使わない
 *
 * `FeatureModulesForm` は `expectedUpdatedAt` による楽観ロックを持ち、競合すると
 * 成功 toast ではなく **conflict の error toast** を出す。旧実装は
 * `getByText("機能モジュールを保存しました")` を待っていたため、競合時に 15s
 * タイムアウトして復元ごと落ちていた。判定は **リロード後も状態が保たれているか**
 * （＝永続化の実体）で行い、競合したら再読込して 1 度だけやり直す。
 *
 * ## 実装メモ
 *
 * - cache invalidation は admin form の `updateFeatureModulesSettings` server action が
 *   `invalidateSiteWideCache([FEATURE_MODULES, ...])` を呼ぶ規約に依存する。DB を
 *   直接書き換えるとキャッシュが古いまま公開ルートが 200 を返し得るため admin UI 経由。
 *   反映は非同期なので 404 の確認は `expect.poll` で待つ（旧実装は単発 goto で
 *   200 を掴んで落ちていた）。
 * - シングルトン行 mutation のため `test.describe.serial` で直列化。
 * - 管理面へのアクセスは storageState ではなく webServer env
 *   `ADMIN_TEST_IAP_EMAIL` による IAP 模擬 (rules の testing-e2e.md 参照)。
 *   `chromium` project は setup-admin dependency を持たないため、spec 側で
 *   `ensureAdminUser()` + `primeAdminRequestContext(context)` を明示する。
 * - `spaces` は `reservation` / `reviews` の依存元。spaces OFF テストの間だけ
 *   reservation 側の switch が視覚上 disabled になるが、DB 側の explicit true 値
 *   は保存されている (registry.buildInitialFeatureModules の contract)。
 * - APP_SURFACE=public で webServer が起動している場合、proxy が /admin を 404 に
 *   するため spec 全体を skip する (rules の app-structure.md 参照)。ローカル
 *   既定と CI の chromium project は APP_SURFACE=admin で動作する。
 */

const IS_PUBLIC_SURFACE = process.env["APP_SURFACE"] === "public";

const CLAIM_TOKEN_STUB = "e2e-stub-token";

const FEATURES_SETTINGS_PATH = "/admin/settings/features";

/** cache invalidation の伝播待ち。単発 goto だと 200 を掴む（run 30617695076）。 */
const ROUTE_STATUS_TIMEOUT_MS = 20_000;

/** 保存がリロード後も残っているかの確認待ち。 */
const PERSIST_TIMEOUT_MS = 15_000;

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

interface ModuleBaseline {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
}

/**
 * afterEach で戻す基準状態 — `buildInitialFeatureModules()` (registry SSoT) と同値。
 * E2E の webServer は `bun prisma/seed.ts --dev` を毎回実行し、`seedDev` が
 * `seedSettings({ resetFeatureModules: true })` でこの値に揃えるため、これが run の
 * 既定状態になる (`data-retention` だけ fail-closed で常に OFF)。
 *
 * ## MODULE_CASES ではなく全 11 module を列挙する理由
 *
 * `FeatureModulesForm` は 11 module 全部を **1 つの form** で送る。依存元が OFF の
 * module は `submittedValue = depsMet ? control.value : ""` (ModuleSwitchRow) により
 * **OFF として送信される**。つまり `spaces` を OFF にする保存は、DB 上の
 * `reservation` / `reviews` / `payment` も同時に false にする。`reviews` と `payment`
 * は MODULE_CASES に無いため、MODULE_CASES だけを復元すると OFF のまま取り残される。
 *
 * ## 依存元を先に並べる理由
 *
 * 依存元が OFF の間、依存先の Switch は `checked={depsMet && isOn}` /
 * `disabled={isPending || !depsMet}` により **`aria-checked="false"` かつ `disabled`**
 * になる。先に依存先を click すると Playwright の actionability 待ち (enabled 待ち)
 * でハングし、復元そのものが失敗する。`FEATURE_MODULES_LIST` と同順
 * (spaces → reservation → … → reviews → payment) に並べることで、click する時点では
 * 常に依存元が ON になっている。
 *
 * registry SSoT との一致・順序の妥当性は
 * `__tests__/unit/architecture/e2e-feature-module-baseline-sync.test.ts` が機械強制する。
 */
const FEATURE_MODULE_BASELINE: readonly ModuleBaseline[] = [
  { id: "spaces", label: "スペース管理", enabled: true },
  { id: "reservation", label: "予約フォーム", enabled: true },
  { id: "events", label: "イベント", enabled: true },
  { id: "posts", label: "ブログ", enabled: true },
  { id: "news", label: "お知らせ", enabled: true },
  { id: "faq", label: "FAQ", enabled: true },
  { id: "access", label: "アクセス", enabled: true },
  { id: "contact", label: "お問い合わせ", enabled: true },
  { id: "reviews", label: "レビュー", enabled: true },
  { id: "payment", label: "オンライン決済", enabled: true },
  {
    id: "data-retention",
    label: "データ保持ポリシーの自動適用",
    enabled: false,
  },
];

/** 保存ボタンは 11 module 共通 (1 form / 1 ボタン)。行特定用の安定した label。 */
const SAVE_ANCHOR_LABEL = "スペース管理";

/** 期待する基準状態のシリアライズ。差分が 1 行で読めるよう文字列比較する。 */
const EXPECTED_BASELINE_STATE = FEATURE_MODULE_BASELINE.map(
  (mod) => `${mod.id}=${mod.enabled ? "true" : "false"}`,
).join(", ");

/**
 * Switch 行の locator。各 row は `<div class="rounded-lg border p-4">` + 内側に
 * `<label>{mod.label}</label>` + Radix `<button role="switch">` を持つ
 * (FeatureModulesForm.ModuleSwitchRow)。label htmlFor は Switch の button に
 * 付かない (Radix 実装) ため、行 div 全体を text で filter して switch を取得する。
 */
function moduleSwitch(page: Page, moduleLabel: string): Locator {
  return page
    .locator("div.rounded-lg")
    .filter({ has: page.getByText(moduleLabel, { exact: true }) })
    .getByRole("switch");
}

/**
 * features ページには機能モジュール用とデータ保持設定用の 2 つの保存ボタンがある。
 * switch を含む form に絞らないと strict mode violation になる（run 30595374008）。
 */
function moduleSaveButton(page: Page, moduleLabel: string): Locator {
  return page
    .locator("div.rounded-lg")
    .filter({ has: page.getByText(moduleLabel, { exact: true }) })
    .locator("xpath=ancestor::form[1]")
    .getByRole("button", { name: /^保存/u });
}

async function openFeatureSettings(page: Page): Promise<void> {
  await page.goto(FEATURES_SETTINGS_PATH);
  await expect(
    page.getByRole("heading", { name: "機能モジュール", level: 1 }),
  ).toBeVisible();
}

async function readModuleState(
  page: Page,
  moduleLabel: string,
): Promise<string | null> {
  const switchButton = moduleSwitch(page, moduleLabel);
  await expect(switchButton).toBeVisible();
  return switchButton.getAttribute("aria-checked");
}

/**
 * module を指定状態にして**永続化まで**見届ける。
 *
 * 判定は toast ではなくリロード後の `aria-checked`。楽観ロック競合で 1 回目の
 * 保存が弾かれることがあるため、最大 2 回試す（2 回目は再読込した新しい
 * `expectedUpdatedAt` で送るので競合は解消する）。
 */
const SAVE_ATTEMPTS = 2;

async function setFeatureModule(
  page: Page,
  moduleLabel: string,
  enabled: boolean,
): Promise<void> {
  const desired = enabled ? "true" : "false";

  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    await openFeatureSettings(page);
    if ((await readModuleState(page, moduleLabel)) === desired) return;

    const switchButton = moduleSwitch(page, moduleLabel);
    await switchButton.click();
    await expect(switchButton).toHaveAttribute("aria-checked", desired);
    await moduleSaveButton(page, moduleLabel).click();

    try {
      await expect
        .poll(
          async () => {
            await openFeatureSettings(page);
            return readModuleState(page, moduleLabel);
          },
          {
            timeout: PERSIST_TIMEOUT_MS,
            message: `feature module "${moduleLabel}" を ${desired} にする保存が永続化されなかった（楽観ロック競合の可能性）`,
          },
        )
        .toBe(desired);
      return;
    } catch (error) {
      // 1 回目は競合しうる。再読込すれば expectedUpdatedAt が更新されるので
      // やり直せば通る。最終試行で駄目なら Playwright のメッセージごと投げる。
      if (attempt === SAVE_ATTEMPTS) throw error;
    }
  }
}

/** 現在の全 module 状態を `EXPECTED_BASELINE_STATE` と同形式で読む。 */
async function readBaselineState(page: Page): Promise<string> {
  const states: string[] = [];
  for (const mod of FEATURE_MODULE_BASELINE) {
    states.push(`${mod.id}=${await readModuleState(page, mod.label)}`);
  }
  return states.join(", ");
}

/**
 * 全 module を基準状態へ **1 回の保存で** 戻す。
 *
 * 11 module は 1 つの form / 1 つの保存ボタンを共有するため、差分のある Switch を
 * すべて flip してから 1 度だけ保存する。`depsMet` は client 側の form state
 * (`fields[req]?.value === "on"`) から計算されるので、依存元を flip した時点で
 * 依存先の Switch は同じ render で enabled になり、reload なしで続けて操作できる。
 *
 * module ごとに保存する実装 (旧 `restoreAllFeatureModules`) は、依存先を依存元より
 * 先に処理すると disabled な Switch を click しようとしてハングしていた。
 */
async function restoreFeatureModuleBaseline(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    await openFeatureSettings(page);

    let changed = false;
    for (const mod of FEATURE_MODULE_BASELINE) {
      const desired = mod.enabled ? "true" : "false";
      const switchButton = moduleSwitch(page, mod.label);
      await expect(switchButton).toBeVisible();
      if ((await switchButton.getAttribute("aria-checked")) === desired) {
        continue;
      }

      await switchButton.click();
      await expect(switchButton).toHaveAttribute("aria-checked", desired);
      changed = true;
    }

    if (!changed) return;

    await moduleSaveButton(page, SAVE_ANCHOR_LABEL).click();

    try {
      await expect
        .poll(
          async () => {
            await openFeatureSettings(page);
            return readBaselineState(page);
          },
          {
            timeout: PERSIST_TIMEOUT_MS,
            message:
              "feature module の基準状態への復元が永続化されなかった（楽観ロック競合の可能性）",
          },
        )
        .toBe(EXPECTED_BASELINE_STATE);
      return;
    } catch (error) {
      // 1 回目は競合しうる。再読込すれば expectedUpdatedAt が更新されるので
      // やり直せば通る。最終試行で駄目なら Playwright のメッセージごと投げる。
      if (attempt === SAVE_ATTEMPTS) throw error;
    }
  }
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

  test.beforeEach(async ({ context }) => {
    await primeAdminRequestContext(context);
  });

  // setup 段階で失敗しても必ず走る（try/finally では復元されなかった）。
  test.afterEach(async ({ page }) => {
    await restoreFeatureModuleBaseline(page);
  });

  // 復元が壊れていたら、巻き添えで他 spec を落とす前に**この spec が**落ちる。
  // MODULE_CASES ではなく全 module を検証する — `spaces` OFF の保存は
  // `reviews` / `payment` も道連れに OFF にするため (FEATURE_MODULE_BASELINE 参照)。
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await primeAdminRequestContext(page.context());
      await openFeatureSettings(page);
      expect(
        await readBaselineState(page),
        "feature module が基準状態に戻っていない。共有 DB を汚染し他 spec を巻き添えで落とすため、必ず復元すること",
      ).toBe(EXPECTED_BASELINE_STATE);
    } finally {
      await page.close();
    }
  });

  for (const c of MODULE_CASES) {
    test(`${c.module} OFF → 対象ルートが 404 を返す`, async ({ page }) => {
      await setFeatureModule(page, c.label, false);

      for (const route of c.routes) {
        // cache invalidation は非同期。単発 goto では反映前の 200 を掴む。
        await expect
          .poll(async () => (await page.goto(route))?.status(), {
            timeout: ROUTE_STATUS_TIMEOUT_MS,
            message: `[${c.module}] ${route} は feature OFF 時に 404 を返すべき`,
          })
          .toBe(404);
      }
    });
  }
});
