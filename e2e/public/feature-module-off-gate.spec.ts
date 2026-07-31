import { test, expect, type Locator, type Page } from "@playwright/test";
import { urls } from "../fixtures";
import { primeAdminRequestContext } from "../helpers/admin-auth";
import { ensureAdminUser } from "../helpers/ensure-admin-user";

/**
 * E2E-04: Feature Module OFF → 公開ルート not-found (fail-closed regression gate)
 *
 * ## なぜ HTTP 404 を assert しないか（Next.js の公式仕様）
 *
 * このアプリの公開ページは**必ずストリーミングの内側**にある（root layout が
 * CSP nonce のために `<html>` を `<Suspense>` で包む公式 opt-in + 各 route の
 * `loading.tsx`）。Next.js 公式ドキュメント逐語:
 *
 * > Once streaming begins, HTTP response headers and status codes cannot be changed.
 * > If a `notFound()` function triggers mid-stream, Next.js cannot alter the HTTP
 * > status code to 404 and instead injects a `noindex` meta tag so search engines
 * > do not index the page.
 *
 * つまり `requireFeatureEnabled` → `notFound()` は **200 + noindex** になるのが
 * 仕様どおりの挙動で、404 を要求する assert は原理的に満たせない
 * （実測: run 30617695076 / 30622036713 で `/contact` が 20 秒間 200 のまま）。
 * 実 404 を返すには proxy 層で判定する必要があるが、`proxy.ts` は DB-backed module の
 * import を規約で禁止しているため採れない。
 *
 * よって守るべき契約を「HTTP status」から
 * **「本来のページが描画されず not-found 境界が出る」+「noindex が付く」**に置き換える。
 * fail-closed の実体（コンテンツを出さない）と SEO 保護の両方をカバーする。
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

/** cache invalidation の伝播待ち。単発 goto では反映前の応答を掴む（run 30617695076）。 */
const ROUTE_STATUS_TIMEOUT_MS = 20_000;

/** `(public)/not-found.tsx` の h1。feature gate が効いた証拠として使う。 */
function notFoundHeading(page: Page) {
  return page.getByRole("heading", {
    level: 1,
    name: "ページが見つかりません",
  });
}

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

/** 全 module を ON に揃える。既に ON のものは触らない。 */
async function restoreAllFeatureModules(page: Page): Promise<void> {
  for (const moduleCase of MODULE_CASES) {
    await setFeatureModule(page, moduleCase.label, true);
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
    await restoreAllFeatureModules(page);
  });

  // 復元が壊れていたら、巻き添えで他 spec を落とす前に**この spec が**落ちる。
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await primeAdminRequestContext(page.context());
      await openFeatureSettings(page);
      for (const moduleCase of MODULE_CASES) {
        expect(
          await readModuleState(page, moduleCase.label),
          `feature module "${moduleCase.label}" が OFF のまま残っている。共有 DB を汚染するため必ず ON に戻すこと`,
        ).toBe("true");
      }
    } finally {
      await page.close();
    }
  });

  for (const c of MODULE_CASES) {
    test(`${c.module} OFF → 対象ルートが not-found になる`, async ({
      page,
    }) => {
      await setFeatureModule(page, c.label, false);

      for (const route of c.routes) {
        // cache invalidation は非同期なので、not-found 境界が出るまで待つ。
        await expect
          .poll(
            async () => {
              await page.goto(route);
              return notFoundHeading(page).isVisible();
            },
            {
              timeout: ROUTE_STATUS_TIMEOUT_MS,
              message: `[${c.module}] ${route} は feature OFF 時に not-found 境界を描画すべき`,
            },
          )
          .toBe(true);

        // ストリーミング下では 404 ステータスを返せないぶん、Next.js が noindex を
        // 注入する契約に依存する。これが無いと soft-404 が索引される。
        const robots = await page
          .locator('meta[name="robots"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("content") ?? ""),
          );
        expect(
          robots.some((content) => content.includes("noindex")),
          `[${c.module}] ${route} の not-found 応答に noindex が無い（実際の robots meta: ${JSON.stringify(robots)}）`,
        ).toBe(true);
      }
    });
  }
});
