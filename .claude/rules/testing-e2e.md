---
paths: ["e2e/**", "playwright.config.ts", "playwright/**"]
---

# E2E（Playwright）

## project 構成と実行

- 14 project: setup-customer / setup-admin / chromium-smoke（e2e/smoke）/
  chromium（e2e/public + e2e/a11y）/ chromium-mobile / webkit-mobile /
  chromium-customer / chromium-customer-mobile / webkit-customer-mobile /
  chromium-admin / chromium-admin-viewer（e2e/authenticated/admin-viewer）/
  chromium-admin-mobile / webkit-admin-mobile /
  chromium-visual（e2e/visual）。mobile / webkit 系 6 project は opt-in。
- CI の毎 push required gate は chromium-smoke のみ（APP_SURFACE=public と admin の 2 回）。
  広域 E2E・visual・Lighthouse は opt-in。opt-in 条件は「`codex/full-ci/` prefix の PR
  branch」または workflow_dispatch だが、**prefix 経路の起動実績はゼロ**
  （2026-07-31 時点、PR #673〜#1679 を走査）。実質 manual dispatch 専用と考え、
  `gh workflow run ci.yml --ref <branch> -f run_full_ci=true` で明示的に回す。
  **PR を出すだけでは広域 E2E は走らない**
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
  のように `extraHTTPHeaders: { "x-e2e-admin-identity": "<label>" }` を付けると
  専用ユーザーとして解決される（ラベル→email の SSoT は
  `src/shared/domain/admin-auth/e2e-identity.ts`、upsert は
  `scripts/e2e/ensure-admin-user.ts`、drift gate は
  `__tests__/unit/architecture/e2e-admin-identity-sync.test.ts`）。
  **共有 User 行の `role` を実行時に書き換えてはいけない** — `fullyParallel: true` +
  2 workers では他 spec に漏れ、`settings.spec.ts` の権限カードが消える /
  RBAC spec の拒否が出ない、という双方向の偽陽性になる（CI run 30577092619）
- **`/api` を `request` で直接叩く spec は専用 client IP を割り当てる**。proxy の
  `apiRateLimiter`（100/分/IP）に E2E 免除は無く、既定では全 spec が同一 IP を共有する
  ため、飽和した窓に入った request が 429 を食う（実測: run 30593381788 の
  `guest-receipt-single-use`、run 30607885778 の `calendar-download`）。
  `test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.N" } })` を置く
  （page と `request` の両方に効く）。割当は衝突すると無言で再発するため
  `__tests__/unit/architecture/e2e-client-ip-allocation.test.ts` が機械固定する:

  | 範囲                   | 用途                                                                                                                                                 |
  | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `203.0.113.1`〜`.9`    | **静的**（spec 単位）。`.3` = events、`.4` = mypage-receipt-download、`.5` = guest-receipt-single-use、`.6` = calendar-download、`.7` = calendar-api |
  | `203.0.113.10`〜`.250` | **動的**（browser context 単位）。`e2e/helpers/admin-auth.ts` の `getContextClientIp`                                                                |

  **`request` 経由だけでなくブラウザ経由も対象**。`<a download href="/api/...">` を
  クリックして `waitForEvent("download")` で待つ spec は、本文に `/api/` も `request.*` も
  現れない（href はアプリ側が生成する）ため見落としやすい。gate は download 待ちを
  シグナルとして扱う。

  対象は `apiRateLimiter`（100/分）に当たる `/api` のみ。`/api/live` は完全除外、
  `/api/webhooks` `/api/cron` は別枠の `infraEndpointRateLimiter`（300/分）なので不要。

  XFF が client IP として採用されるのは loopback host のときだけ
  （`rate-limit.ts` の `canUseDevelopmentProxyFallback`）なので本番の信頼境界は不変。

- ブラウザ時刻の凍結は `page.clock.install({ time })` を **page.goto より前**に呼び、
  サーバー側 `E2E_FIXED_NOW_ISO`（既定 2026-07-04T03:00:00.000Z）と同一時刻にする
- fullyParallel のため、Settings 等シングルトン行を mutate する describe は
  `test.describe.serial` で直列化する
- **グローバル状態の復元は `afterEach` で無条件に行う**（`try/finally` は不可）。
  finally は「setup 段階で throw すると入らない」ため復元漏れになる。実測
  (run 30617695076): `feature-module-off-gate` が contact を OFF のまま残し、
  `/contact` 404 → responsive-shell / inquiries / inquiry-reply が巻き添え、
  さらに admin サイドバーが feature-disabled 表示になって `axe-admin-pages` が
  23 テスト × 3 attempt 全滅 = **1 spec の失敗が 30 件超の偽の失敗**を生んだ。
  復元は「触った 1 件」ではなく**対象全件を既定値に揃える**。加えて `afterAll` で
  復元されたことを検証し、壊れたときは**その spec 自身が落ちる**ようにする。
  この規約は `__tests__/unit/architecture/e2e-global-state-restore.test.ts` が
  機械強制する（`test.describe.serial` を持つ spec に `afterEach` / `afterAll` を要求。
  戻す状態を持たない spec は `RESTORE_EXEMPT` に理由付きで登録する）
- **「触った 1 件」では足りない**。1 つの form が複数の設定をまとめて送る画面では、
  1 項目の変更が他項目も書き換える。実例: `/admin/settings/features` は 11 module を
  単一 form で送り、依存元が OFF の module は
  `submittedValue = depsMet ? control.value : ""`（`ModuleSwitchRow`）により
  **OFF として送信される** — `spaces` を OFF にする保存が DB 上の
  `reservation` / `reviews` / `payment` も同時に false にする。復元対象は
  「spec が明示的に触った項目」ではなく **form が送る全項目**で数える
- **復元順は依存元が先**。依存先の UI は依存元が OFF の間 `disabled` になるため
  （features 画面は `disabled={isPending || !depsMet}`）、先に依存先を click すると
  Playwright の actionability 待ち（enabled 待ち）で**復元自体がハングする**。
  `feature-module-off-gate` の `FEATURE_MODULE_BASELINE` は `FEATURE_MODULES_LIST` と
  同順に並べ、`e2e-feature-module-baseline-sync.test.ts` が網羅性・既定値・
  依存順の 3 点を registry SSoT に対して固定する
- **保存完了の判定に toast を使わない**。admin の設定フォームは
  `expectedUpdatedAt` の楽観ロックを持ち、競合すると成功 toast ではなく error toast を
  出すため、成功文言を待つ実装は競合時にタイムアウトする。**リロード後も状態が
  保たれているか**（永続化の実体）を `expect.poll` で確認し、競合したら再読込して
  やり直す。cache invalidation の反映も非同期なので、公開ルートの status 確認も
  単発 `goto` ではなく `expect.poll` で待つ
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
