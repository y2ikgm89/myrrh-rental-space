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
 * ルートが not-found になる」実行時契約を、代表 5 module × 主要ルートで検証する。
 *
 * unit test の `public-route-gates.test.ts` が「grep で gate 呼び出しが存在するか」
 * を drift gate で守るのに対し、本 spec は「実際に OFF にしたとき本来のページが
 * 出ない」ランタイム挙動を守る（source と gate 実装、cache invalidation、
 * not-found rendering までを end-to-end で確認）。
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
 * 2. 復元対象は**所有 module 全件**（= MODULE_CASES の依存カスケード閉包）。
 *    「触った 1 件」では足りず、かつ**全 11 module でもいけない** — 詳細は
 *    `OWNED_FEATURE_MODULES` のコメント
 * 3. `afterAll` で所有 module が基準状態に戻ったことを検証し、復元が壊れたら
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
 *   直接書き換えるとキャッシュが古いまま公開ルートが本来のページを返し得るため
 *   admin UI 経由。反映は非同期なので not-found の確認は `expect.poll` で待つ。
 * - シングルトン行 mutation のため `test.describe.serial` で直列化。
 * - 管理面へのアクセスは storageState ではなく webServer env
 *   `ADMIN_TEST_IAP_EMAIL` による IAP 模擬 (rules の testing-e2e.md 参照)。
 *   `chromium` project は setup-admin dependency を持たないため、spec 側で
 *   `ensureAdminUser()` + `primeAdminRequestContext(context)` を明示する。
 * - `spaces` は `reservation` / `reviews` の依存元。spaces を OFF にすると
 *   依存先の switch は disabled + OFF 表示になり、**DB 上も false に畳まれる**
 *   (`updateFeatureModulesCommand` が persist 前に `normalizeFeatureModules` を
 *   適用する write-side SSoT)。所有範囲を依存カスケード閉包で取るのはこのため。
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

/** 「送信が始まった」= SubmitButton が disabled になるまでの待ち。 */
const SAVE_DISPATCH_TIMEOUT_MS = 15_000;

/**
 * 保存ボタンを押し、**送信が始まったことだけ**を待つ。
 *
 * `SubmitButton` は `isPending` の間 disabled + 「保存中...」になるので、disabled に
 * なれば Server Action は dispatch 済みで、この後 reload しても送信は取り消されない。
 *
 * これを待たずに `page.goto` すると in-flight の Server Action が中断される。
 * Prisma の書込は先にコミットされる一方、`afterSuccess` の
 * `invalidateSiteWideCache`（`updateTag`）まで到達しないため、**DB は OFF なのに
 * `'use cache'` のタグが expire されず**、公開ルートが `cacheLife: "days"` の間
 * 本来のページを描画し続ける（実測: run 30631140902 で `/contact` の not-found
 * 境界が 20 秒間出ない）。
 *
 * 成否は toast でも pending 解除でも判定しない。成功時は `useEffect` の
 * `router.refresh()` が終わるまで `isPending` が戻らず、楽観ロック競合時は
 * 成功 toast すら出ないため、どちらも信頼できない。判定は呼び出し側が
 * 「リロード後の永続化状態」で行う。
 */
async function clickSaveAndAwaitDispatch(saveButton: Locator): Promise<void> {
  await saveButton.click();
  await expect(saveButton).toBeDisabled({
    timeout: SAVE_DISPATCH_TIMEOUT_MS,
  });
}

interface ModuleCase {
  readonly module: string;
  readonly label: string;
  readonly routes: readonly string[];
}

/**
 * 各 module OFF 時に not-found になるべき代表ルート。gate 実体は全 22 経路
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
 * この spec が所有する feature module（id → admin form の label）。
 *
 * 復元先の**値**はここに書かない。E2E の webServer は `bun prisma/seed.ts --dev` を
 * 毎回実行し `seedSettings({ resetFeatureModules: true })` が
 * `buildInitialFeatureModules(SEED_FEATURE_MODULES_DISABLED)` を書き込むため、
 * 所有 module が初期 OFF の環境もありうる（`SEED_FEATURE_MODULES_DISABLED=payment`
 * は公式にサポートされた運用）。基準値は seed と同じ env から導出する —
 * 詳細は `SEED_DISABLED_MODULES` のコメント。
 *
 * ## 「所有 module」= MODULE_CASES の依存カスケード閉包
 *
 * `Settings.featureModules` は単一行なので、これを触る spec が複数あると
 * `fullyParallel` 下で衝突する。Playwright の `test.describe.serial` は
 * **同一ファイル内しか直列化しない**（別 project なら尚更並走する）ため、
 * 衝突は「所有 module を spec 間で重複させない」ことで防ぐ。
 * 本 spec は MODULE_CASES の 5 module、`axe-admin-feature-disabled.spec.ts` は
 * `faq` / `access` を所有し、両者は交わらない。
 *
 * 所有範囲は MODULE_CASES そのものではなく**依存カスケード閉包**で決まる。
 * `FeatureModulesForm` は 11 module 全部を **1 つの form** で送り、依存元が OFF の
 * module は `submittedValue = depsMet ? control.value : ""` (ModuleSwitchRow) により
 * **OFF として送信される**。つまり `spaces` を OFF にする保存は、DB 上の
 * `reservation` / `reviews` / `payment` も巻き込んで false にする。
 * よって復元対象は 5 module ではなく閉包の 7 module。
 *
 * 逆に、**所有していない module を復元してはいけない**。全 11 module を戻すと、
 * 並行する `axe-admin-feature-disabled.spec.ts` が意図的に OFF にしている
 * `faq` / `access` を勝手に ON に戻して相手を落とし、こちらの afterAll も
 * 相手の OFF を検出して落ちる（双方向の偽陽性）。
 *
 * 交わりの無さと閉包性は
 * `__tests__/unit/architecture/e2e-feature-module-ownership.test.ts` が機械強制する。
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
 * `__tests__/unit/architecture/e2e-feature-module-ownership.test.ts` が機械強制する。
 */
const OWNED_FEATURE_MODULES = {
  spaces: "スペース管理",
  reservation: "予約フォーム",
  events: "イベント",
  posts: "ブログ",
  contact: "お問い合わせ",
  reviews: "レビュー",
  payment: "オンライン決済",
} as const;

const OWNED_MODULE_ENTRIES = Object.entries(OWNED_FEATURE_MODULES);

/** 保存ボタンは全 module 共通 (1 form / 1 ボタン)。行特定用の安定した label。 */
const SAVE_ANCHOR_LABEL = OWNED_FEATURE_MODULES.spaces;

/**
 * 所有 module の基準状態。**seed の構成から導出する**（実状態のスナップショットに
 * しない・ON 決め打ちにもしない）。
 *
 * seed が書き込むのは `buildInitialFeatureModules(SEED_FEATURE_MODULES_DISABLED)` で
 * あって「所有分は全て ON」ではない。`SEED_FEATURE_MODULES_DISABLED=payment` の
 * ように所有 module を初期 OFF にする運用は公式にサポートされている
 * (`add-feature-module` skill)。ON を決め打ちすると、その環境では afterEach の
 * たびに seed 基準から離れた状態へ書き換えてしまう。
 *
 * かといって **`beforeAll` で実状態を読むのも駄目**。`test.describe.serial` の
 * リトライは新しい worker で `beforeAll` から再実行されるため、前の attempt が
 * 復元しきれずに残した OFF をそのまま「基準」として捕まえてしまい、リトライも
 * `afterAll` も汚染を追認する（検出も修復もされない）。
 *
 * よって seed と同じ env を同じ規則で読む。run 中に変化しないので、リトライしても
 * 基準はぶれない。`beforeAll` は逆にこの不変の基準へ**復元してから**始めるので、
 * 前 worker が残した汚染は追認ではなく修復される。
 */
const SEED_DISABLED_MODULES = new Set(
  (process.env["SEED_FEATURE_MODULES_DISABLED"] ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0),
);

/**
 * 所有 module の依存元。registry の `requires` を所有範囲に絞った写しで、
 * 一致は `e2e-feature-module-ownership.test.ts` が強制する
 * （所有 module の requires が全て所有内にあることも同 gate が保証する）。
 */
const OWNED_MODULE_REQUIRES: Readonly<Record<string, readonly string[]>> = {
  reservation: ["spaces"],
  reviews: ["spaces"],
  payment: ["reservation"],
};

/**
 * seed 由来の基準値に**アプリと同じ依存正規化を適用**する。
 *
 * `SEED_FEATURE_MODULES_DISABLED=spaces` のように依存元だけを無効化した構成では、
 * `reservation` / `reviews` / `payment` は env に列挙されていなくても OFF になる。
 * UI は `checked={depsMet && isOn}` で false を表示し、書込側も
 * `normalizeFeatureModules`（`updateFeatureModulesCommand` が persist 前に適用する
 * write-side SSoT）が false に畳む。集合の直接参照だけで「true」と期待すると、
 * 復元が到達不能な状態を待ち続け afterAll も落ちる。
 */
function baselineEnabled(id: string): boolean {
  if (SEED_DISABLED_MODULES.has(id)) return false;
  return (OWNED_MODULE_REQUIRES[id] ?? []).every((req) => baselineEnabled(req));
}

/** seed 由来の desired 値。`aria-checked` と同じ文字列で返す。 */
function baselineDesiredFor(id: string): string {
  return baselineEnabled(id) ? "true" : "false";
}

const EXPECTED_BASELINE_STATE = OWNED_MODULE_ENTRIES.map(
  ([id]) => `${id}=${baselineDesiredFor(id)}`,
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
    await clickSaveAndAwaitDispatch(moduleSaveButton(page, moduleLabel));

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

/** 所有 module の現在状態を id=aria-checked の並びで読む。 */
async function readBaselineState(page: Page): Promise<string> {
  const states: string[] = [];
  for (const [id, label] of OWNED_MODULE_ENTRIES) {
    states.push(`${id}=${await readModuleState(page, label)}`);
  }
  return states.join(", ");
}

/**
 * **所有 module だけ**を `beforeAll` で捕捉した基準状態へ 1 回の保存で戻す。
 *
 * 全 module は 1 つの form / 1 つの保存ボタンを共有するため、差分のある Switch を
 * すべて flip してから 1 度だけ保存する。`depsMet` は client 側の form state
 * (`fields[req]?.value === "on"`) から計算されるので、依存元を flip した時点で
 * 依存先の Switch は同じ render で enabled になり、reload なしで続けて操作できる。
 *
 * module ごとに保存する実装 (旧 `restoreAllFeatureModules`) は、依存先を依存元より
 * 先に処理すると disabled な Switch を click しようとしてハングしていた。
 *
 * 所有外の module (`faq` / `access` 等) には触れない。並行する
 * `axe-admin-feature-disabled.spec.ts` が意図的に OFF にしている最中に
 * ON へ戻すと相手を落とすため (OWNED_FEATURE_MODULES のコメント参照)。
 */
async function restoreFeatureModuleBaseline(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    await openFeatureSettings(page);

    let changed = false;
    for (const [id, label] of OWNED_MODULE_ENTRIES) {
      const desired = baselineDesiredFor(id);
      const switchButton = moduleSwitch(page, label);
      await expect(switchButton).toBeVisible();
      if ((await switchButton.getAttribute("aria-checked")) === desired) {
        continue;
      }

      // 依存元が seed で OFF の構成では、依存先の Switch は disabled + OFF 表示に
      // なる（`checked={depsMet && isOn}`）。永続値が true でも UI 上は操作できず、
      // click すると actionability 待ちでハングする。触らずに次へ進む。
      // なお、その永続値はアプリ側がどの保存でも `submittedValue` で false に
      // 正規化するため、spec 側で保てるものではない（app の仕様）。
      if (await switchButton.isDisabled()) {
        continue;
      }

      await switchButton.click();
      await expect(switchButton).toHaveAttribute("aria-checked", desired);
      changed = true;
    }

    if (!changed) return;

    await clickSaveAndAwaitDispatch(moduleSaveButton(page, SAVE_ANCHOR_LABEL));

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
  .serial("feature-module OFF hides all critical public routes (E2E-04)", () => {
  test.skip(
    IS_PUBLIC_SURFACE,
    "APP_SURFACE=public では /admin にアクセスできないため skip",
  );

  test.beforeAll(async ({ browser }) => {
    await ensureAdminUser();

    // 開始前に基準状態へ**復元**する。リトライは新 worker で beforeAll から
    // やり直されるため、前の attempt が afterEach で戻しきれずに残した OFF は
    // ここで修復される（実状態を基準として捕まえると汚染を追認してしまう）。
    const page = await browser.newPage();
    try {
      await primeAdminRequestContext(page.context());
      await restoreFeatureModuleBaseline(page);
    } finally {
      await page.close();
    }
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
    test(`${c.module} OFF → 対象ルートが not-found になる`, async ({
      page,
    }) => {
      await setFeatureModule(page, c.label, false);

      for (const route of c.routes) {
        // 待つのは **ナビゲーションの内側**で行う。
        //
        // 以前は `expect.poll` の predicate に `goto` → `isVisible()` を並べていたが、
        // `isVisible()` は**リトライしない瞬間値**で、`goto` は `load` で解決する。
        // not-found 境界の本体は `loading.tsx` の Suspense fallback が差し替わる
        // 110〜600ms 後に現れるため、probe はほぼ必ず skeleton を見て false を返し、
        // 次の反復が新しい `goto` を撃って解決済み DOM を捨てる。**20 秒の予算は
        // 原理的に使えず poll は永遠に勝てない**（run 30631140902 / 30632351655 の
        // trace で、境界は 4 回描画されていたのに 5 反復すべて false だった）。
        //
        // `setFeatureModule` が保存 dispatch の完了を待つようになった（#1741）ので、
        // probe 時点で cache invalidation は済んでいる。単発 `goto` +
        // リトライする web-first assertion で足りる（`error-pages.spec.ts` と同型）。
        await page.goto(route);
        await expect(
          notFoundHeading(page),
          `[${c.module}] ${route} は feature OFF 時に not-found 境界を描画すべき`,
        ).toBeVisible({ timeout: ROUTE_STATUS_TIMEOUT_MS });

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
