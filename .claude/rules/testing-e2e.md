---
paths: ["e2e/**", "playwright.config.ts", "playwright/**"]
---

# E2E（Playwright）

## project 構成と実行

- 15 project: setup-customer / setup-admin / chromium-smoke（e2e/smoke）/
  **chromium-feature-modules**（`Settings.featureModules` を mutate する spec 専用。
  全 reader project の `dependencies` に入れて**単独で先に走らせる** — 詳細は下記）/
  chromium（e2e/public + e2e/a11y）/ chromium-mobile / webkit-mobile /
  chromium-customer / chromium-customer-mobile / webkit-customer-mobile /
  chromium-admin / chromium-admin-viewer（e2e/authenticated/admin-viewer）/
  chromium-admin-mobile / webkit-admin-mobile /
  chromium-visual（e2e/visual）。mobile / webkit 系 6 project は opt-in。
- CI の毎 push required gate は chromium-smoke のみ（APP_SURFACE=public と admin の 2 回）。
  **広域 E2E は main の nightly（`schedule`、18:00 UTC = 03:00 JST）で自動実行される。**
  加えて `gh workflow run ci.yml --ref <branch> -f run_full_ci=true` で任意に回せる。
  visual・Lighthouse は nightly に含まれず手動 dispatch 専用。
  **PR を出すだけでは広域 E2E は走らない** — マージ前に確認したいときは明示的に
  dispatch する。
  かつて `codex/full-ci/` prefix の PR branch で起動する条件があったが起動実績ゼロ
  （PR #673〜#1679 を走査）のため撤去した。opt-in を手動だけに頼った結果、main の
  失敗が誰にも見られず滞留する事故が起きた（2026-07-31、hard failure 3 件）ことが
  nightly を入れた理由
- webServer は migrate → seed →（ローカルのみ production build）→ next start を毎回実行し
  `reuseExistingServer: false`。ポート 3000 の dev サーバーとは共存不可・初回起動は長い
- playwright.config.ts は `__tests__/unit/architecture/playwright-e2e-webserver-env.test.ts`
  に文字列レベルで pin されている。config 変更時はこの unit テストも更新・実行する
  （SKIP_ENV_VALIDATION の追加はテストが禁止）
- **`e2e/**` は CommonJS として実行される**。Playwright は ESM/CJS を Node のセマンティクス
  （拡張子 + 最寄り package.json の `type`）で決め、tsconfig の `module` は無視する
  （解釈されるのは allowJs / baseUrl / paths / references / extends のみ）。
  本 repo の package.json に `"type"` は無いため、`e2e/**` に `import.meta` を持ち込むと
  `SyntaxError: Cannot use 'import.meta' outside a module` で **テストが 1 件も起動しない**。
  Prisma 生成 client はこのため `moduleFormat = "cjs"` で生成する
  （gate: `__tests__/unit/architecture/prisma-client-module-format.test.ts`）

## 書き方の規約（ESLint が機械強制）

- 禁止: `page.waitForTimeout` / `waitForLoadState("networkidle")` / `page.waitForURL` /
  `if ((await x.count()) > 0)` 条件アサーション / CSS の id セレクタ
  （`locator("#id")` も修飾付きの `locator("form#id")` も禁止）
- 待機は web-first assertion で行う: `expect(locator).toBeVisible()`、
  ナビゲーション確定は `expect(page).toHaveURL()`（soft/hard 両対応）
- ロケーターは `getByRole` 優先（heading/tab/textbox/button/gridcell 等）

### id セレクタ禁止（React streaming の二重 DOM）

React のストリーミング SSR は、完了した `<Suspense>` boundary の HTML を **hidden な
staging container** に流し込み、インラインスクリプトで in-place の fallback と差し替える。
差し替えは `precedence` 付き stylesheet の読み込み待ち（`completeBoundaryWithStyles` →
`Promise.all(deps).then($RC)`）と reveal のバッチ化（`$RB`）で遅延しうるため、その間は
**同じ DOM が in-place と hidden staging の 2 箇所に同時に存在する**。

Next.js では `loading.tsx` のセグメント境界に加え、`generateViewport` が runtime data を
読むための公式 opt-in（`<html>` を `<Suspense>` で包む）があるため、**ページ本体は必ず
どこかの boundary の内側**にある。つまりページ内の任意の DOM は一時的に 2 重になりうる。

- CSS セレクタ（`locator("#id")` / `locator("form#id")`）は hidden 側も一致 →
  `strict mode violation`。
  実測: CI run 30602667260 の `locator('#event-register') resolved to 2 elements`
  （片方は解決済みフォーム、もう片方は fallback を抱えた staging copy）
- **role locator は安全**。Playwright の role エンジンは既定 `includeHidden: false` で
  a11y ツリー非公開の要素を除外する → `getByRole("main")` /
  `getByRole("region", { name: "お申し込み" })` 等に置換する
- role / アクセシブルネームを持たない要素（アンカー用の素の `<section id>`、conform が
  振る form id 等）だけ `e2e/helpers/streaming-safe-locators.ts` の
  `visibleById(page, "id")`（= `.filter({ visible: true })`）を使う
- **`page.getByText(...)` を直に書かない**。text エンジンは CSS セレクタと同様に
  staging copy を掴む（実測 run 30631098725: `guest-reservation-status-hub` で同一
  class の `<h2>` が 2 件 → strict mode violation）。**role locator でスコープしてから**
  テキストを見る（`page.getByRole("main").getByText(...)`）。staging copy は
  a11y ツリー非公開なので、role でスコープした時点で除外される。
  banner / contentinfo など `<main>` 外のテキストは、その landmark の role で
  スコープする（`getByRole("banner").getByText(...)`）
- この二重化は React/Next.js の仕様であってアプリ側のバグではない。
  「Suspense の外に外殻を出す」だけでは解消しない（上位 layout の boundary が残るため）
- 命名: `e2e/**/*.spec.ts`（smoke は `*.smoke.spec.ts`）。`*.test.ts` を e2e 配下に
  作らない（どのランナーにも拾われない/誤収集の原因）

## 認証・時刻・並列

- 認証は setup project + storageState（`playwright/.auth/*.json`）。
  admin は cookie ではなく IAP 模擬（ADMIN_TEST_IAP_EMAIL）で成立している
- **admin の role を切り替えたいときは専用 project を足す**。`chromium-admin-viewer`
  のように `use: { adminIdentity: "<label>" }` を付けると `x-e2e-admin-identity`
  ヘッダーが載り、専用ユーザーとして解決される（ラベル→email の SSoT は
  `src/shared/domain/admin-auth/e2e-identity.ts`、upsert は
  `scripts/e2e/ensure-admin-user.ts`、drift gate は
  `__tests__/unit/architecture/e2e-admin-identity-sync.test.ts`）。
  **共有 User 行の `role` を実行時に書き換えてはいけない** — `fullyParallel: true` +
  2 workers では他 spec に漏れ、`settings.spec.ts` の権限カードが消える /
  RBAC spec の拒否が出ない、という双方向の偽陽性になる（CI run 30577092619）
- **`test` は `e2e/fixtures/e2e-test.ts` から import する。`@playwright/test` を
  直接 import してよいのはそのファイルだけ。** 共有 test は `extraHTTPHeaders`
  option を override し、**テストごとに一意な client IP**（`x-forwarded-for`）を
  page と `request` fixture の両方に載せる。spec 側に書くことは何も無い。

  rate limiter は IP をトークンにするため、既定のままだと `fullyParallel` ×
  2 workers の全 spec が同じバケットを共有し、窓の狭い limiter から順に飽和する:

  | limiter                    | 予算        | 経路                           |
  | -------------------------- | ----------- | ------------------------------ |
  | `formSubmitRateLimiter` 等 | 5 / 分 / IP | 公開フォームの Server Action   |
  | `authMutationRateLimiter`  | 20 / 15 分  | Better Auth の sign-in/sign-up |
  | `apiRateLimiter`           | 100 / 分    | proxy が `/api/*` に適用       |

  実測: run 30593381788 `guest-receipt-single-use`、run 30607885778
  `calendar-download`、run 30681869018 `inquiry-reply`（返信フォームが
  `リクエストが多すぎます` のまま 3 attempt 全滅。**リトライも同じ 1 分窓に入るので
  retry では救えない**）。

  **やってはいけないこと**: `test.use({ extraHTTPHeaders: ... })` /
  project `use.extraHTTPHeaders` / `x-forwarded-for` の直書き。option を上書きすると
  fixture ごと消え、その spec だけ無言で IP 共有に戻る。ヘッダーを足したいときは
  共有 test に option を生やして合成する（`adminIdentity` がその実例）。

  **手動生成した context は fixture の対象外**。`browser.newContext()` /
  `browser.newPage()` で作った context には `primeRequestContext(context)`
  （同じく `e2e/fixtures/e2e-test.ts`）を明示的に呼ぶ。

  割当は RFC 5737 TEST-NET-3（`203.0.113.1`〜`.254`）を `parallelIndex` で
  レーン分割して配る（採番カウンタは worker プロセスごとのモジュール状態なので、
  レーンを分けないと worker 間で同じ値が出る）。ロジックの SSoT は
  `e2e/helpers/client-ip.ts`、gate は
  `__tests__/unit/architecture/e2e-client-ip-allocation.test.ts`。

  **旧方式（spec ごとの静的割当）は廃止した。** 「専用 IP が要る spec」を本文から
  推定する gate は、シグナルを `request.*` → `waitForEvent("download")` →
  Server Action と足すたびに新しい漏れが CI で見つかった。推定をやめて全テストに
  配る構造にしたので、gate も「共有 test を迂回していないか」だけを見る。

  XFF が client IP として採用されるのは loopback host のときだけ
  （`rate-limit.ts` の `canUseDevelopmentProxyFallback`）なので本番の信頼境界は不変。

- ブラウザ時刻の凍結は `page.clock.install({ time })` を **page.goto より前**に呼び、
  サーバー側 `E2E_FIXED_NOW_ISO`（既定 2026-07-04T03:00:00.000Z）と同一時刻にする
- fullyParallel のため、Settings 等シングルトン行を mutate する describe は
  順序を固定する。既定は **`test.describe.configure({ mode: "default" })`**
  （順番に実行し、失敗した test は個別にリトライする公式モード）。
  **`test.describe.serial` は「1 本落ちたら後続を全部 skip してよい」場合だけ**に
  使う — serial は後続を skip するため、「1 回の run で全ケースの可否を出す」
  目的の gate では実行されないケースが静かに増える。実測: `feature-module-off-gate`
  は contact が落ちている間、残り 4 module（7 ルート）が 2 run 連続
  （30670082842 / 30672479398）で `skipped` になり、一度も検証されていなかった。
  公式も "Running tests serially is generally not recommended" としている
- **グローバル状態の復元は `afterEach` で無条件に行う**（`try/finally` は不可）。
  finally は「setup 段階で throw すると入らない」ため復元漏れになる。実測
  (run 30617695076): `feature-module-off-gate` が contact を OFF のまま残し、
  `/contact` 404 → responsive-shell / inquiries / inquiry-reply が巻き添え、
  さらに admin サイドバーが feature-disabled 表示になって `axe-admin-pages` が
  23 テスト × 3 attempt 全滅 = **1 spec の失敗が 30 件超の偽の失敗**を生んだ。
  復元は「触った 1 件」ではなく**対象全件を既定値に揃える**。加えて `afterAll` で
  復元されたことを検証し、壊れたときは**その spec 自身が落ちる**ようにする。
  この規約は `__tests__/unit/architecture/e2e-global-state-restore.test.ts` が
  機械強制する。順序固定マーカーは 3 形（`test.describe.serial` /
  `configure({ mode: "default" })` / `configure({ mode: "serial" })`）で、
  該当 spec に `afterEach` / `afterAll` を要求する。戻す状態を持たない spec は
  `RESTORE_EXEMPT` に**検証済みの**理由付きで登録する（一括 exempt は gate を空洞化
  させるので不可）。マーカーは**行頭**でのみ照合されるため、JSDoc や `//` 内で
  `test.describe.configure({ mode: "serial" })` に言及しても誤検出されない
- **復元は UI ではなく DB で行ってよい**（むしろ推奨）。test 本体が timeout すると
  page ごと閉じられて hook から画面を操作できないため、`e2e/helpers/e2e-prisma.ts` の
  `getE2EPrismaClient()`（Playwright process 側の PrismaClient。webServer の Prisma
  facade は `server-only` で import できない）を使って直接戻す。既存の復元 helper:
  `event-registration-fixture.ts` / `inquiry-fixture.ts` / `customer-merge-fixture.ts`
- **test 本体を timeout させない**。timeout すると page / context ごと閉じられ、
  別予算を持つ `afterEach` も生きた page を使えず**復元できない**（公式の timeout 仕様は
  「test timeout は本体・fixture setup・`beforeEach` を覆い、`afterEach` と fixture
  teardown には同じ値の別予算」だが、page が死ぬので別予算は救いにならない）。実測
  (run 30672479398): 本体 timeout → `afterEach` の `goto` が `net::ERR_ABORTED` →
  contact が OFF のまま残り `responsive-shell` が 2 viewport 巻き添え。対策は
  ①`goto` に明示 timeout を渡す（既定は**無制限**で、実測 15.5 秒の遷移が予算を
  食い潰した）②`test.describe.configure({ timeout })` を**定数から導出**して
  最悪ケースを覆う（手書きの数値は route 追加で静かに破綻する）。
  ただし **有界にした `goto` は必ずリトライループの内側に置く** — 復元処理の
  ページ遷移をループの外で呼ぶと、遅延 1 回が「リトライされない throw」になり、
  timeout を防ぐつもりが逆に復元を中止させる。復元経路の遷移上限は探索用より
  緩く取る（観測された裾の 2 倍）
- **同じグローバル状態を触る spec が複数あるなら「所有」を排他分割する**。
  実行モード（`serial` / `default`）が順序を保証するのは**同一 describe 内だけ**で、
  別ファイル・別 project には効かない（`feature-module-off-gate` は `chromium`、
  `axe-admin-feature-disabled` は `chromium-admin` で**並走する**）。
  排他の他の手段は本 repo では使えない:

  | 手段                                              | 可否 | 理由                                                                                                                                         |
  | ------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | Playwright named lock（`test(…, { lock })`）      | ❌   | **stable 未リリース**。1.61.1 / 1.62.1 の `TestDetails` は `annotation` / `tag` のみ。alpha は pin しない                                    |
  | per-request の E2E ヘッダー上書き（#1693 と同型） | ❌   | feature 解決は `'use cache'` の内側で走る（`getPublicNavigation` は `"use cache"` 後に `getFeatureFilterContext()`）。`headers()` を呼べない |
  | 所有の排他分割                                    | ✅   | 交わらなければ並走しても互いの検証対象を書き換えない                                                                                         |

  各 spec は `OWNED_FEATURE_MODULES`（key = registry の module id、value = label）で
  所有を宣言し、**復元も検証も所有分だけ**に限定する。全件を書き戻すと、相手が
  意図的に OFF にしている module を ON に戻して落とす（双方向の偽陽性）。

- **所有分割が守るのは mutator 同士だけ。read-only な spec は守られない。**
  同じ singleton を**読むだけ**の spec は所有を宣言しようがないので、mutator が
  OFF にしている最中に読むと落ちる。実測 (run 30677872134): `feature-module-off-gate`
  が spaces を OFF にしている間に `responsive-shell` が `/spaces` を読み、
  「ページが見つかりません」を掴んだ。`/faq` も `axe-admin-feature-disabled` の
  所有なので同型。

  対策は **mutator を専用 project に隔離し、全 reader project の `dependencies` に
  置く**こと（`chromium-feature-modules`）。dependency project は依存側が始まる前に
  完走するので、mutator が走る間は他に何も走らない。named lock が stable に来るまでは
  これが唯一の公式手段。**`chromium-smoke` と `chromium-visual` は依存させない** —
  どちらも CI 上別 job（別 webServer / 別 DB）で競合しようがないうえ、両者とも
  `APP_SURFACE=public` で回る。public surface では proxy が `/admin/*` を 404 に
  するので、依存を張ると `setup-admin` が `/admin` に到達できず job ごと落ちる。
  **surface が異なる job に admin 依存を足さない**

- **所有集合は依存カスケードで閉じている必要がある**。1 つの form が複数項目を
  まとめて送る画面では 1 項目の変更が他項目も書き換える。`/admin/settings/features` は
  全 module を単一 form で送り、依存元が OFF の module は
  `submittedValue = depsMet ? control.value : ""`（`ModuleSwitchRow`）により
  **OFF として送信される** — `spaces` を OFF にする保存が DB 上の
  `reservation` / `reviews` / `payment` も同時に false にする。よって `spaces` を
  所有するなら 3 つとも所有する（＝自分が壊すものは自分で直す）
- **復元順は依存元が先**。依存先の UI は依存元が OFF の間 `disabled` になるため
  （features 画面は `disabled={isPending || !depsMet}`）、先に依存先を click すると
  Playwright の actionability 待ち（enabled 待ち）で**復元自体がハングする**

  上記 3 点（宣言の有無・交わりの無さ・カスケード閉包・label 一致・依存順）は
  `__tests__/unit/architecture/e2e-feature-module-ownership.test.ts` が機械強制する。
  判定 marker は「features 設定ページへの `goto`」— URL 文字列の出現だけだと
  リンクの有無を assert するだけの read-only spec を誤検出する

- **保存クリック後は Server Action の POST 応答を待ってから遷移する**。
  これを待たずに `page.goto` / `reload` すると **in-flight の Server Action が
  中断される**。Prisma の書込は先にコミットされる一方 `afterSuccess` の
  `invalidateSiteWideCache`（`updateTag`）まで到達しないため、**DB は変わったのに
  `'use cache'` のタグが expire されない**。結果、公開ルートは `cacheLife`（feature
  modules は `"days"`）の間ずっと古い値を描画し続ける。
  実測: run 30631140902 で `feature-module-off-gate` の `/contact` が、contact を
  OFF に永続化した後も 20 秒間 not-found 境界を出さなかった。

  ```ts
  await Promise.all([
    // Server Action は現在のページ URL へ POST される
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === SETTINGS_PATH,
      { timeout: SAVE_DISPATCH_TIMEOUT_MS },
    ),
    saveButton.click(),
  ]);
  ```

  **`await expect(save).toBeDisabled()` で待ってはいけない**（2026-08-01 に
  この規約自体を差し替えた）。`SubmitButton` が `isPending` の間 disabled になるのを
  「送信が始まった」の代理指標にしていたが、**disabled は一瞬しか存在しない状態**
  なので、保存が速く終わると窓を取り逃して偽の失敗になる。実測 run 30688324782:
  `axe-admin-feature-disabled` が 15 秒間 34 回ポーリングして一度も観測できず、
  機能モジュールの復元に失敗して cleanup 検証まで連鎖で落ちた。同 spec は
  `chromium-feature-modules`（全 reader project の `dependencies`）なので、
  **依存側の project が丸ごと未実行になる**という広い被害を出す。

  POST 応答は**必ず発生する事象**なので取り逃しがなく、返った時点でサーバー側は
  `afterSuccess` まで完了しているため、上記の危険を代理指標なしに直接排除できる

- **保存の成否は toast でも pending 解除でも判定しない**。成功時は `useEffect` の
  `router.refresh()` が終わるまで `isPending` が戻らず、`expectedUpdatedAt` の楽観
  ロック競合時は成功 toast ではなく error toast（フォームエラーによっては無言）に
  なる。判定は**リロード後も状態が保たれているか**（永続化の実体）を `expect.poll`
  で確認し、競合したら再読込してやり直す
- **リトライは「ナビゲーションの内側」で行う。`expect.poll` の predicate に
  `goto` → `isVisible()` を並べない**。`isVisible()` は**リトライしない瞬間値**で、
  `goto` は `load` で解決する。ページ本体は Suspense fallback が差し替わる
  100〜600ms 後に現れるため、probe はほぼ必ず skeleton を見て false を返し、
  次の反復の `goto` が解決済み DOM を捨ててレースをやり直す。**timeout の予算は
  原理的に使えず poll は永遠に勝てない**（実測 run 30631140902 /
  30632351655: `feature-module-off-gate` の not-found 境界は 4 回描画されていたのに
  5 反復すべて false）。正しい形は単発 `goto` + リトライする web-first assertion:

  ```ts
  await page.goto(route);
  await expect(notFoundHeading(page)).toBeVisible({
    timeout: ROUTE_TIMEOUT_MS,
  });
  ```

  `expect.poll` を使ってよいのは **DB / API を直接読む**ような「リトライ機構を
  自前で持たない値」の観測だけ（例: `isReservationSeriesCancelled(seriesId)`）。
  locator の状態観測には使わない

  **禁じているのは「再遷移 × 一発勝負」の組み合わせであって、再遷移そのものでは
  ない。** サーバー側の状態反映（cache invalidation 等）を待つ必要がある場合は、
  遷移をやり直しつつ **1 attempt ごとにリトライする待ちを与える**のが正しい:

  ```ts
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    await page.goto(route);
    try {
      await expect(target).toBeVisible({ timeout: PER_ATTEMPT_MS });
      return true;
    } catch {
      // 古い応答を掴んだ可能性がある。遷移からやり直す
    }
  }
  ```

  単発 `goto` だけでは、最初の応答が古いキャッシュだったときに web-first assertion が
  **同じ document をリトライし続けるだけで回復できない**（`feature-module-off-gate`
  で一度これを踏んで #1759 で戻した）

- **1 テストで複数ルート/複数ケースを回すループは `expect.soft` を使う**。
  hard assertion だと最初の 1 件で止まり、残りの可否が分からないまま次の CI に
  持ち越しになる。`feature-module-off-gate` は実際に「1 本直す → 次の 1 本が初めて
  到達して落ちる」を繰り返し、9 ルートの確認に CI を何往復も要した。soft なら
  1 回の run で全件の結果が出揃い、テスト自体は最後にまとめて落ちる

- APP_SURFACE はローカル既定 admin。public surface 限定テストは `APP_SURFACE=public` を明示

## visual regression

- 実行に `PLAYWRIGHT_VISUAL=1` が必須（無しだと全テスト skip のまま緑になる）
- 外部由来の描画ゆらぎは spec 側で断つ。現状 abort しているのは
  **Cloudflare Turnstile のみ**（外部 iframe の読込タイミングで contact の高さが変動する）
- **画像を route で差し替えない**。seed の画像は全て `/images/seed/*.svg` のローカル SVG で、
  `dangerouslyAllowSVG` 未設定のため Next は SVG を optimizer に通さず素で配信する
  （`next/dist/shared/lib/get-img-props.js` の `unoptimized = true` 分岐）。
  対象ページは `/_next/image` を一度も叩かないので差し替えても効果ゼロ、
  実画像の回帰検出力を落とすだけになる
- full-page は hydration と lazy 画像の描画で収束が遅い。既定の expect timeout（5s）は
  短すぎて「ページは正常なのに fail」を生むため、`toHaveScreenshot` に
  `timeout` を明示する（現行 20s）
- **baseline は CI Ubuntu runner の `*-linux.png` のみ**を commit する。Windows /
  macOS ローカルで `--update-snapshots` した結果を commit しない（CI が必ず落ちる）
- 再生成は `workflow_dispatch` の `update_visual_baseline=true`。CI が
  `ci/visual-baseline-<run_id>` branch と auto-PR を作る
- **auto-PR には required checks が付かない**。`GITHUB_TOKEN` で作られた PR は
  GitHub の再帰防止により `pull_request` workflow を起動しないため、CodeQL 以外の
  checks が永久に未実行のまま BLOCKED になる。PR を close → reopen するか、
  同 branch の内容で人間名義の PR を作り直して checks を通すこと
  （恒久解は PAT / GitHub App token の導入だが secret 追加が必要）
- ローカルで CI と同じ描画を得たいときは Playwright 公式 Docker イメージ
  （`mcr.microsoft.com/playwright:v1.61.1-noble`）を使う

## seed 契約

spec は `prisma/seed.ts` の fixture（slug・予約ステータス等）と
`e2e/fixtures/test-data.ts` で二重定義結合している。seed 変更は fixture/spec の同時更新必須。
