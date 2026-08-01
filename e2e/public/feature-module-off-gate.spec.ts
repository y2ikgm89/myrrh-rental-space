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
 * **判定は必ず本文で行う。head は使わない。**
 *
 * `<title>` が not-found になるのは CMS ページだけ。`generatePageMetadata` が
 * feature OFF を見て `FEATURE_DISABLED_PAGE_METADATA` を返す経路に乗るためで、
 * `/mypage/inquiries` のような非 CMS route は layout の `title: "マイページ"` が
 * そのまま解決される（layout metadata は page 本体の `notFound()` と独立）。
 * 実測 (run 30643518533): `/contact` は title で通ったのに `/mypage/inquiries` は
 * "マイページ | …" のままで、gate は正しく効いていた。head は一部 route で
 * **構造的に必ず偽陰性**になる。
 *
 * 本文 h1 は RSC payload (`self.__next_f.push([1,"…\"h1\"…"])`) として届き client 側で
 * 差し替えられるため、**遷移直後の一発勝負では掴めない**（run 30638590811 の trace で
 * 確認）。リトライする web-first assertion で待つ。
 *
 * ## 「1 回の run で全件の可否を出す」= route 単位も test 単位も止めない
 *
 * ルート単位の判定は **soft assertion**。hard だと最初の 1 本で止まり、残りの
 * ルートの可否が分からないまま次の CI に持ち越しになる。実際この spec は
 * 「1 本直す → 次の 1 本が初めて到達して落ちる」を繰り返した
 * （`/contact` → `/mypage/inquiries`）。
 *
 * 同じことが **test 単位**では `test.describe.serial` によって起きていた。serial は
 * 1 本落ちると後続を全て skip するため、contact が落ちている間 posts / reservation /
 * events / spaces は 2 run 連続で一度も実行されていない（describe 直上の表を参照）。
 * `mode: "default"` に変えて、9 ルート全部が 1 回の run で出揃うようにした。
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
 *   admin UI 経由。保存の dispatch を待ってから遷移するので、公開ルートは
 *   **最初の 1 回の goto で**新しい状態を返す（`clickSaveAndAwaitDispatch` 参照）。
 * - シングルトン行 mutation のため `test.describe.configure({ mode: "default" })`
 *   で順序を固定する（`test.describe.serial` は使わない — 理由は describe 直上）。
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

/**
 * 公開ルート探索 1 回の `goto` に許す上限。
 *
 * Playwright の navigation timeout は既定で **無制限**（`navigationTimeout` は
 * config 未設定）なので、遅い遷移 1 本が test 予算を丸ごと食い潰す。実測
 * (run 30672479398 attempt 0): 1 回の `goto` が **15.5 秒**かかり、続く待機と
 * 合わせて 30 秒の既定予算を超過して test が timeout した。予算を定数から
 * 導出する（`TEST_TIMEOUT_MS`）ために、遷移も明示的に有界にする。
 *
 * ここを短く取れるのは `probeNotFoundBoundary` が **遷移ごとリトライする**から。
 * 遅い 1 回は失敗ではなく 1 attempt の消費で済む。
 */
const PROBE_NAVIGATION_TIMEOUT_MS = 10_000;

/**
 * 管理画面 (features 設定ページ) の `goto` に許す上限。**探索より大幅に緩い。**
 *
 * ここでの遷移失敗は「そのルートが 1 回見えなかった」では済まず、
 * `restoreFeatureModuleBaseline` を丸ごと諦めさせて **共有 DB を OFF のまま残す**。
 * 探索と同じ 10 秒にすると、上のコメントが記録している 15.5 秒級の遅延で
 * 復元そのものが落ちる。観測された裾（15.5 秒）の 2 倍を取る。
 *
 * 有界のままにするのは、無制限だと本体 timeout → page 破棄 → 復元不能という
 * より悪い経路に戻るため。加えて呼び出し側の retry ループの **内側**に置き、
 * 遅延が復元の中止ではなく attempt の消費になるようにしてある。
 */
const SETTINGS_NAVIGATION_TIMEOUT_MS = 30_000;

/** 1 回の遷移につき not-found 境界を待つ時間。 */
const NOT_FOUND_ATTEMPT_TIMEOUT_MS = 7_000;

/** 遷移をやり直す回数（cache invalidation の反映待ち）。 */
const NOT_FOUND_ATTEMPTS = 3;

/** 本文の not-found 境界。`(public)/not-found.tsx` の h1。 */
function notFoundHeading(page: Page) {
  return page.getByRole("heading", {
    level: 1,
    name: "ページが見つかりません",
  });
}

/**
 * feature OFF のルートが **本文に** not-found 境界を描画するかを返す（throw しない）。
 *
 * 判定に head (`<title>`) は使えない。CMS ページは `generatePageMetadata` が
 * feature OFF を見て `FEATURE_DISABLED_PAGE_METADATA` を返すので not-found の
 * title になるが、`/mypage/inquiries` のような非 CMS route は layout の
 * `title: "マイページ"` がそのまま解決される（layout metadata は page 本体の
 * `notFound()` とは独立に決まる）。実測 (run 30643518533): `/contact` は title で
 * 通ったのに `/mypage/inquiries` は "マイページ | …" のままで、gate は正しく効いていた。
 *
 * 遷移をやり直すのは cache invalidation との競合に備えるため。
 * `clickSaveAndAwaitDispatch` は Server Action の **dispatch** までしか見届けず、
 * `afterSuccess` の `updateTag` がこの公開リクエストより前に完了する保証はない。
 * 古い `'use cache'` の document を掴むと、web-first assertion は同じ document を
 * リトライし続けるだけで回復できないので、遷移そのものをやり直す必要がある。
 *
 * ただし **1 attempt には必ずリトライする待ちを与える**。`expect.poll` の中で
 * `goto` をやり直しつつ `isVisible()` のような一発勝負を撃つと、解決途中の DOM を
 * 毎回捨てて timeout 予算を使えない（`e2e-poll-predicate-retries.test.ts` の規約）。
 */
async function probeNotFoundBoundary(
  page: Page,
  route: string,
): Promise<boolean> {
  for (let attempt = 1; attempt <= NOT_FOUND_ATTEMPTS; attempt++) {
    try {
      // goto も try の中に置く。無制限だと遅い遷移 1 本で test ごと timeout し、
      // afterEach の復元まで巻き込んで共有 DB を汚す（`TEST_TIMEOUT_MS` 参照）。
      // 有界にしたうえで「遷移が遅れた」も 1 attempt として消費させる。
      await page.goto(route, { timeout: PROBE_NAVIGATION_TIMEOUT_MS });
      await expect(notFoundHeading(page)).toBeVisible({
        timeout: NOT_FOUND_ATTEMPT_TIMEOUT_MS,
      });
      return true;
    } catch {
      // 1 回目が古いキャッシュを掴んだ可能性がある。遷移からやり直す。
    }
  }

  return false;
}

/** 保存がリロード後も残っているかの確認待ち。 */
const PERSIST_TIMEOUT_MS = 15_000;

/** 「送信が始まった」= SubmitButton が disabled になるまでの待ち。 */
const SAVE_DISPATCH_TIMEOUT_MS = 15_000;

/**
 * 保存・復元をやり直す回数。楽観ロック競合で 1 回目が弾かれることがあるため
 * 最大 2 回試す（2 回目は再読込した新しい `expectedUpdatedAt` で送るので競合は解消する）。
 * 遷移や click の transient な失敗もこの attempt で吸収する。
 */
const SAVE_ATTEMPTS = 2;

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
    // `/mypage/inquiries` はここでは検証できない（削除理由）。
    //
    // `(public)/mypage/layout.tsx` が `requireMypageSession()` を呼び、**layout は
    // page より先に走る**。この spec の `chromium` project は storageState を持たない
    // ＝ 未認証の訪問者なので、layout の認証で `/login` へ送られ、
    // `mypage/inquiries/page.tsx` の `requireFeatureEnabled("contact")` に**到達しない**。
    // ストリーミング下の `redirect()` は client-side redirect に劣化するため、
    // 初期 HTML は mypage layout のもの（`<title>マイページ | …`）のまま残る。
    //
    // 実測 (run 30670082842): #1760 の soft assertion 化で全 9 ルートが判定され、
    // 落ちたのは `/mypage/inquiries` **のみ**。`/contact` `/blog` `/reservation`
    // `/reservation/complete` `/claim/*` `/events` `/spaces` は全て通過した。
    // 認証が要る唯一のルートだけが落ちている＝アプリのバグではなく分類ミス。
    // 未認証訪問者をログインへ送るのは fail-closed として正しい。
    //
    // gate 呼び出しの存在自体は `public-route-gates.test.ts` が静的に守っている。
    // 認証付き route のランタイム検証が要るなら storageState を持つ
    // `chromium-customer` project 側に置くこと。
    routes: [urls.contact],
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

/** 1 module あたりの最大ルート数。予算計算のためだけに使う。 */
const MAX_ROUTES_PER_CASE = Math.max(
  ...MODULE_CASES.map((c) => c.routes.length),
);

/**
 * 本体の管理画面操作 (`setFeatureModule`) の最悪値。
 *
 * 1 attempt = 遷移 + 永続化 poll。`SAVE_ATTEMPTS` 回まで繰り返す。
 * 予算に手書きの数値を置かず、実際に使う定数から導出する。
 */
const SETTINGS_BUDGET_MS =
  SAVE_ATTEMPTS * (SETTINGS_NAVIGATION_TIMEOUT_MS + PERSIST_TIMEOUT_MS);

/**
 * test 1 本の予算。**定数から導出する**（手書きの数値は route 追加で静かに破綻する）。
 *
 * ## なぜ既定 30 秒では駄目だったか
 *
 * Playwright 公式の timeout 仕様は「test timeout は test 本体・fixture setup・
 * `beforeEach` を覆い、`afterEach` と fixture teardown には**同じ値の別予算**が
 * 与えられる」。つまり `afterEach` は本体に予算を食われない。にもかかわらず
 * 実測 (run 30672479398 attempt 0) では復元が失敗していた:
 *
 * ```
 * Test timeout of 30000ms exceeded.
 * Error: page.goto: net::ERR_ABORTED at http://localhost:3000/admin/settings/features
 * Error: locator.evaluateAll: Target page, context or browser has been closed
 * Error: feature module が基準状態に戻っていない。…
 * ```
 *
 * **本体が timeout すると test scope の page / context ごと閉じられる**ため、別予算を
 * 持つ `afterEach` もその page を使えなかった。結果 contact が OFF のまま残り、
 * `responsive-shell` の `/contact` が mobile / desktop の両 viewport で落ちた。
 *
 * ただし**予算計算だけでこの汚染を防ごうとしない**。それは「探索の最悪値 ×
 * 管理画面の最悪値」を同時に覆う数字を追い続けることになり、そこまで膨らませると
 * timeout が本物のハングを検出しなくなる。汚染は構造で断ってある —
 * `afterEach` は worker scope の `browser` から**新しい page を開いて**復元するので、
 * 本体が timeout して test scope の page が死んでも復元は走る（同 run の `afterAll` が
 * `browser.newPage()` で実際に検査できていたことが、browser が生き残る実証）。
 * この予算は「timeout させない」ためではなく **soft assertion が全ルートを報告し
 * きれるようにする**ためにある。
 *
 * ## 内訳
 *
 * - ルート探索: `MAX_ROUTES_PER_CASE × NOT_FOUND_ATTEMPTS × (遷移 + not-found 待ち)`。
 *   失敗ルートは必ず全 attempt を使い切るので、これは**全ルート報告のために意図的に
 *   払う決定論的コスト**
 * - 管理画面操作: `SETTINGS_BUDGET_MS`（保存 1 サイクルの最悪値）
 */
const TEST_TIMEOUT_MS =
  MAX_ROUTES_PER_CASE *
    NOT_FOUND_ATTEMPTS *
    (PROBE_NAVIGATION_TIMEOUT_MS + NOT_FOUND_ATTEMPT_TIMEOUT_MS) +
  SETTINGS_BUDGET_MS;

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
 * `fullyParallel` 下で衝突する。Playwright の実行モード（`serial` / `default`）が
 * 順序を保証するのは **同一 describe 内だけ**で、別ファイル・別 project には効かない。
 * よって衝突は「所有 module を spec 間で重複させない」ことで防ぐ。
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
 * かといって **実状態をスナップショットして基準にするのも駄目**。前の test / attempt が
 * 復元しきれずに残した OFF をそのまま「基準」として捕まえてしまい、以降のリトライも
 * `afterAll` も汚染を追認する（検出も修復もされない）。
 *
 * よって seed と同じ env を同じ規則で読む。run 中に変化しないので、どの test から
 * 数えても基準はぶれない。`beforeEach` は逆にこの不変の基準へ**復元してから**始める
 * ので、前の test が残した汚染は追認ではなく修復される。
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

/**
 * features 設定ページを開く。
 *
 * **必ず呼び出し側の retry ループの内側で呼ぶこと。** 遷移は有界なので、CI が
 * 詰まっているときは throw しうる。ループの外で呼ぶと 1 回の遅延で
 * `restoreFeatureModuleBaseline` が中止され、共有 DB が OFF のまま残る。
 */
async function openFeatureSettings(page: Page): Promise<void> {
  await page.goto(FEATURES_SETTINGS_PATH, {
    timeout: SETTINGS_NAVIGATION_TIMEOUT_MS,
  });
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
 * 判定は toast ではなくリロード後の `aria-checked`（`SAVE_ATTEMPTS` 参照）。
 *
 * **1 attempt は全体を `try` で覆う。** 遷移・click・保存のどれが transient に
 * 落ちても attempt の消費として扱い、次の attempt でやり直す。ページを開く処理を
 * ループの外に置くと、そこでの 1 回の遅延がリトライされずに関数ごと落ちる。
 */
async function setFeatureModule(
  page: Page,
  moduleLabel: string,
  enabled: boolean,
): Promise<void> {
  const desired = enabled ? "true" : "false";

  for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt++) {
    try {
      await openFeatureSettings(page);
      if ((await readModuleState(page, moduleLabel)) === desired) return;

      const switchButton = moduleSwitch(page, moduleLabel);
      await switchButton.click();
      await expect(switchButton).toHaveAttribute("aria-checked", desired);
      await clickSaveAndAwaitDispatch(moduleSaveButton(page, moduleLabel));

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
      // 1 回目は競合・遅延しうる。再読込すれば expectedUpdatedAt も更新されるので
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
 * **所有 module だけ**を seed 由来の基準状態（`EXPECTED_BASELINE_STATE`）へ
 * 1 回の保存で戻す。差分が無ければ features ページを 1 回開くだけで返る。
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
    try {
      // `openFeatureSettings` は必ずこの try の内側で呼ぶ。外に出すと、CI が
      // 詰まって遷移が 1 回遅れただけで復元が中止され、共有 DB が OFF のまま残る
      // （まさにそれが他 spec を巻き添えにする経路）。
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

      await clickSaveAndAwaitDispatch(
        moduleSaveButton(page, SAVE_ANCHOR_LABEL),
      );

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
      // 1 回目は競合・遅延しうる。再読込すれば expectedUpdatedAt も更新されるので
      // やり直せば通る。最終試行で駄目なら Playwright のメッセージごと投げる。
      if (attempt === SAVE_ATTEMPTS) throw error;
    }
  }
}

test.describe("feature-module OFF hides all critical public routes (E2E-04)", () => {
  // シングルトン Settings.featureModules を mutate するため順序を固定する。
  // `mode: "default"` は公式仕様で「順番に実行し、失敗した test は**個別に**
  // リトライする」— `fullyParallel: true` を describe 単位で打ち消す
  // (`test.describe.configure` / test-parallel の "Opt out of fully parallel mode")。
  //
  // `test.describe.serial` は使わない。serial は**1 本落ちると後続を全て skip する**
  // ため、この spec のように「1 回の run で全 module の可否を出す」ことが目的の
  // gate とは相容れない。実測でも 2 run 連続でそれが起きていた:
  //
  // | run        | contact          | posts / reservation / events / spaces |
  // | ---------- | ---------------- | ------------------------------------- |
  // | 30670082842 | failed × 3      | **skipped × 3**                       |
  // | 30672479398 | timedOut/failed  | **skipped × 3**                       |
  //
  // 9 ルート中 7 本が一度も実行されていない。#1760 が route 単位で soft assertion に
  // 変えて解いたのと同じ問題が、test 単位では serial のせいで残っていた
  // （公式も "Running tests serially is generally not recommended" としている）。
  test.describe.configure({ mode: "default", timeout: TEST_TIMEOUT_MS });

  test.skip(
    IS_PUBLIC_SURFACE,
    "APP_SURFACE=public では /admin にアクセスできないため skip",
  );

  test.beforeAll(async () => {
    await ensureAdminUser();
  });

  // 基準状態への復元は **beforeEach でも**行う。`mode: "default"` では前の test が
  // 落ちても後続が skip されずに走るため、汚れた基準を引き継がせない。差分が無ければ
  // features ページを 1 回開くだけで返る（実測 0.6–1.1 秒）ので常時払っても安い。
  test.beforeEach(async ({ page, context }) => {
    await primeAdminRequestContext(context);
    await restoreFeatureModuleBaseline(page);
  });

  // setup 段階で失敗しても必ず走る（try/finally では復元されなかった）。
  // 並走する spec に対して OFF の窓を最小化するため、test ごとに戻す。
  //
  // **test scope の `page` fixture は使わない。** 本体が timeout すると page /
  // context ごと閉じられ、別予算を持つこの hook でも `goto` が
  // `net::ERR_ABORTED` になって復元できない（run 30672479398 attempt 0 の実測）。
  // worker scope の `browser` は生き残るので、そこから新しい page を開く —
  // 同じ run で `afterAll` が `browser.newPage()` で状態を読めていたことが実証。
  // これで復元は「本体が予算内に収まったか」に依存しなくなる。
  test.afterEach(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await primeAdminRequestContext(page.context());
      await restoreFeatureModuleBaseline(page);
    } finally {
      await page.close();
    }
  });

  // 復元が壊れていたら、巻き添えで他 spec を落とす前に**この spec が**落ちる。
  // MODULE_CASES ではなく所有 module 全件を検証する — `spaces` OFF の保存は
  // `reviews` / `payment` も道連れに OFF にするため (OWNED_FEATURE_MODULES 参照)。
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

      // ルートごとの判定は **soft assertion**（理由はファイル冒頭
      // 「1 回の run で全件の可否を出す」）。1 本落ちても残りを最後まで判定し、
      // テスト自体は最後にまとめて落ちる。
      for (const route of c.routes) {
        const rendersNotFound = await probeNotFoundBoundary(page, route);

        expect
          .soft(
            rendersNotFound,
            `[${c.module}] ${route} は feature OFF 時に not-found 境界を描画すべき`,
          )
          .toBe(true);

        // ストリーミング下では 404 ステータスを返せないぶん、Next.js が noindex を
        // 注入する契約に依存する。これが無いと soft-404 が索引される。
        const robots = await page
          .locator('meta[name="robots"]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("content") ?? ""),
          );
        expect
          .soft(
            robots.some((content) => content.includes("noindex")),
            `[${c.module}] ${route} の not-found 応答に noindex が無い（実際の robots meta: ${JSON.stringify(robots)}）`,
          )
          .toBe(true);
      }
    });
  }
});
