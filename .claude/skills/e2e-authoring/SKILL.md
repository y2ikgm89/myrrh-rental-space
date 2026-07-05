---
name: e2e-authoring
description: 新しい Playwright E2E spec を追加・修正するときに使う手順書。配置先ディレクトリと project (smoke / public / a11y / authenticated / visual) の判断基準、prisma/seed.ts と e2e/fixtures の seed 契約、storageState と IAP 模擬による認証、page.clock.install と E2E_FIXED_NOW_ISO による時刻凍結、axe / keyboard navigation の a11y パターン、visual regression の baseline 更新、focused project から広域への実行手順をカバーする。E2E テスト・スモークテスト・アクセシビリティ検証の新規作成時はまずこれを読む。
---

# E2E spec 執筆手順

常設規約（project 構成・ESLint 禁止 API・命名・webServer 挙動・並列化・visual 方針）は
rules の `testing-e2e.md` を参照。`*.test.ts` との命名分離は rules の `testing-unit.md` を参照。
本 skill は「新しい spec を 1 本書いて緑にする」までの手順と判断基準に絞る。

## Step 1: 配置先を決める

認証要否 → 目的の順で判断する。ディレクトリが project を決める（`playwright.config.ts` の testMatch）。

| ディレクトリ                           | project           | 用途・判断基準                                                                                                                |
| -------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `e2e/smoke/*.smoke.spec.ts`            | chromium-smoke    | critical path のみ。毎 push の CI required gate（< 3 分）。未認証・setup 非依存が前提。**追加は慎重に**（全 push が遅くなる） |
| `e2e/public/*.spec.ts`                 | chromium          | 未認証の公開ページ・API・管理 IAP 境界（未認証側から見た /admin の挙動含む）                                                  |
| `e2e/a11y/*.spec.ts`                   | chromium          | axe スキャン・キーボード操作（→ Step 6）                                                                                      |
| `e2e/authenticated/customer/*.spec.ts` | chromium-customer | 顧客ログイン済みが前提の画面（マイページ・予約・レビュー等）                                                                  |
| `e2e/authenticated/admin/*.spec.ts`    | chromium-admin    | 管理画面（IAP 模擬。→ Step 3）                                                                                                |
| `e2e/visual/*.spec.ts`                 | chromium-visual   | visual regression（opt-in。→ Step 7）                                                                                         |

- 命名は `*.spec.ts`（smoke のみ `*.smoke.spec.ts`）。それ以外の suffix は testMatch に一致せず**実行されない**。
- 複数 spec で共有するヘルパーは `e2e/helpers/`（例: `admin-auth.ts`）、単一フロー内の共有は
  spec 隣接ファイル（例: `e2e/authenticated/customer/reservation-test-helpers.ts`。`.spec.ts` を付けない）。

## Step 2: テストデータを決める（seed 契約）

webServer が毎回 `bun prisma/seed.ts --dev` を実行するため、spec は seed 済みデータを前提にできる。

1. **静的データは `e2e/fixtures` barrel から import する**（`e2e/fixtures/index.ts` が
   `test-data.ts` と `factories.ts` を re-export）。URL をハードコードせず `urls` 定数を使う。
   - `urls` — 公開/マイページ/管理の全ルート定数
   - `testUsers.admin` — IAP 模擬用管理者（`superadmin@example.com` / SUPER_ADMIN）
   - `spaceFixtures.publicReservableSpaceSlug` = `coworking-space`
   - `eventFixtures` — `yoga-mindfulness-workshop`（単発）/ `photography-workshop`（時間指定入場）
   - `reviewFixtures.publicReviewSpaceSlug`
2. **並列実行で衝突し得る値（email / phone）は factory で動的生成する**:
   `e2e/fixtures/factories.ts` の `uniqueEmail()` / `uniquePhone()` /
   `inquiryFactory.build(overrides)`。新 factory を足すときも `build(overrides?)` パターンに従う。
3. **seed 側を変更するときは二重定義の同時更新が必須**: fixture の slug 等は
   `prisma/seed.ts` と `e2e/fixtures/test-data.ts` の 2 箇所で結合している。
   片方だけ変えると spec が silent に対象を見失う。
4. 顧客テストの主体は seed の dev customer（`dev-customer@example.com`、予約履歴付き）。

## Step 3: 認証を決める

- **未認証**（smoke / public / a11y / visual）: 何もしない。
- **顧客**: `e2e/authenticated/customer/` に置くだけで storageState
  （`playwright/.auth/customer.json`）が適用される。setup は `e2e/auth/customer.setup.ts` が
  `/login` の「テスト顧客でログイン」ボタン（`src/app/(public)/login/_components/dev-login-button.tsx`）を
  1 度クリックして保存する。spec 側に追加コードは不要。
- **管理者**: `e2e/authenticated/admin/` に置く。**storage state に app session cookie は
  入っていない** — 認証の実体は webServer env `ADMIN_TEST_IAP_EMAIL` による IAP 模擬。
  cookie の存在を前提にした設計・アサーションを書かない。
  - spec 内で管理ユーザーの存在/状態を保証するには `e2e/helpers/ensure-admin-user.ts` の
    `ensureAdminUser()`（`scripts/e2e/ensure-admin-user.ts` を spawn して
    `testUsers.admin.email` を SUPER_ADMIN で upsert + loginAttempt 掃除）。
  - rate limit の worker 間衝突を避ける client IP 割当が必要なら
    `e2e/helpers/admin-auth.ts` の `primeAdminRequestContext(context)`
    （context 単位で一意な `x-forwarded-for` 203.0.113.x を付与）。
    setup 相当を自前でやるなら同ファイルの `signInAsAdmin(page)`。
- 顧客ログインバイパスは `src/shared/lib/e2e-runtime.ts` の
  `isCustomerE2ELoginEnabled()`（`NEXT_PUBLIC_ENABLE_E2E_LOGIN=1` AND localhost 限定
  `isLocalProductionE2ERuntime()`）で成立している。この env を staging / production に
  伝播させない（rules の `security-auth.md` 参照）。

## Step 4: 時刻を凍結する（時刻依存 UI のみ）

- サーバー側: webServer env `E2E_FIXED_NOW_ISO`（既定 `2026-07-04T03:00:00.000Z`、
  `playwright.config.ts`）。ただし自動で全サーバー時刻が固定されるわけではなく、
  時刻依存のサーバーコンポーネントが `serverEnv.E2E_RUNTIME === "1"` のときに読む
  **opt-in 配線**（実例: `src/app/(public)/_components/EventCalendarSection.tsx` の
  `initialNowIso`）。新しい時刻依存 UI をテストするなら、コンポーネント側に同種の配線が
  あるか先に確認する。
- ブラウザ側: `page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") })` を
  **`page.goto` より前に**呼び、サーバーと同一時刻にする。
  実例: `e2e/public/events-calendar.spec.ts`。
- 時刻を独自にずらす場合は `E2E_FIXED_NOW_ISO` を env で上書きし、clock.install も
  同じ値にする（片方だけ変えると server/client の日付表示が乖離する）。

## Step 5: spec 本体を書く

ロケーター・待機の規約と禁止 API（`page.waitForTimeout` / `networkidle` / `page.waitForURL` /
count 条件アサーション）は rules の `testing-e2e.md` を参照。ESLint の
`e2e-playwright-discouraged` ブロック（`eslint.config.mjs`）が error で機械検出する。

- **お手本にする実例**:
  - ナビゲーション確定: `expect(page).toHaveURL(...)` polling — `e2e/auth/customer.setup.ts`
  - `getByRole`（tab / grid / gridcell / heading）+ キーボード操作 — `e2e/public/events-calendar.spec.ts`
  - factory + フォーム送信 — `e2e/public/contact.spec.ts`（`inquiryFactory.build()`）
  - seed-driven の認証済み一覧検証 — `e2e/authenticated/customer/inquiries.spec.ts`
- **シングルトン mutation は直列化する**: `fullyParallel: true` のため、Setting 等の
  シングルトン行を書き換える describe は `test.describe.serial` で囲む。
  手本: `e2e/authenticated/admin/settings.spec.ts` の「サイト名 mutation - 並列化禁止」。
  読み取り専用テストまで serial に巻き込まない（describe を分ける）。
- **APP_SURFACE 分岐**: ローカル既定は admin（`playwright.config.ts` 冒頭 `??= "admin"`）。
  public surface でしか成立しない検証（公開トップ `/` の描画、public での /admin 404 等）は
  `process.env["APP_SURFACE"]` を読んで `test.skip` または分岐する。
  実例: `e2e/a11y/axe-public-pages.spec.ts`（homepage を public 以外 skip）、
  `e2e/smoke/auth.smoke.spec.ts`（public なら /admin が 404 を expect）。

## Step 6（該当時）: a11y spec パターン

- **axe スキャン**: `@axe-core/playwright` の `AxeBuilder` を
  `withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])` で使い、サードパーティ iframe
  （Google Maps / YouTube / Instagram）を `.exclude()` した上で、impact が
  serious / critical の違反のみを fail にする。`e2e/a11y/axe-public-pages.spec.ts` の
  `buildAxeScanner` / `isBlocking` / `formatAxeViolations` を踏襲する
  （assertion message に整形済み違反一覧を渡すのが規約）。
- **キーボード操作**: Tab 到達は `e2e/a11y/keyboard-navigation.spec.ts` の
  `tabUntilFocused` パターン（上限付き Tab ループ + `expect(target).toBeFocused()`）。
- animation 起因の flake 回避に `beforeEach` で
  `page.emulateMedia({ reducedMotion: "reduce" })` を入れる。

## Step 7（該当時）: visual spec

`PLAYWRIGHT_VISUAL=1` opt-in・baseline の linux/win32 併存は rules の `testing-e2e.md` を参照。

1. `e2e/visual/` に追加し、describe 冒頭に opt-in ガードを置く
   （`test.skip(!VISUAL_ENABLED, ...)` — `e2e/visual/public-pages.spec.ts` 参照）。
2. スクリーンショット前に main + heading の可視化と `document.fonts.ready` を待つ
   （同 spec の `preparePageForVisualSnapshot`）。
3. `toHaveScreenshot` は `fullPage: true` / `animations: "disabled"` /
   動的要素（announcement / `time, [datetime]` / instagram）の `mask` /
   `maxDiffPixelRatio: 0.01` を指定する。
4. baseline 生成・意図した視覚変更時の更新:
   `PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual --update-snapshots`
   （CI canonical の `*-linux.png` は full CI dispatch の update_visual_baseline で更新）。

## Step 8: 実行して検証する

前提: Docker が動いていること（test DB は `bun run test:db:migrate` が
`docker compose up --wait test-db` で localhost:5433 を自動起動）。ポート 3000 は空ける
（`reuseExistingServer: false`。dev サーバーと共存不可、初回はビルド込みで長い）。

1. **focused project から**（webServer 起動は共通なので 1 spec でも数分かかる）:
   ```sh
   bunx playwright test --project=chromium-customer e2e/authenticated/customer/my-new.spec.ts
   ```
2. **surface 依存があれば両 surface で**:
   ```sh
   APP_SURFACE=public bunx playwright test --project=chromium-smoke
   APP_SURFACE=admin bunx playwright test --project=chromium-smoke e2e/smoke/auth.smoke.spec.ts --grep "管理入口"
   ```
   （CI required gate と同一コマンド）
3. **広域**: `bun run e2e`（全 project）。デバッグは `bun run e2e:ui`。
4. **CI での扱い**: chromium-smoke のみ毎 push required。広域 E2E / visual / Lighthouse は
   PR head branch を `codex/full-ci/` で始めるか workflow_dispatch `run_full_ci=true` の opt-in
   （`.github/workflows/ci.yml`）。smoke 以外に足した spec は毎 push では走らない —
   マージ前に full CI か手元の広域実行で緑を確認する。

## チェックリスト

- [ ] 配置ディレクトリと project の対応が正しい（Step 1 の表）。命名は `*.spec.ts`
- [ ] URL / テストデータは `e2e/fixtures` 経由。一意性が要る値は factory
- [ ] seed を変えた場合、`prisma/seed.ts` と `e2e/fixtures/test-data.ts` を同時更新した
- [ ] `bun run lint` が緑（禁止 API は ESLint が検出）
- [ ] 時刻依存なら `page.clock.install` が `page.goto` より**前**、値はサーバーと同一
- [ ] シングルトンを mutate する describe は `test.describe.serial`
- [ ] admin spec で session cookie を前提にしていない
- [ ] public surface 限定の検証に `APP_SURFACE` ガードがある
- [ ] `playwright.config.ts` を触った場合:
      `bun scripts/run-tests.ts __tests__/unit/architecture/playwright-e2e-webserver-env.test.ts`
      が緑（config は文字列レベルで pin されている）
- [ ] focused project で実行ログを確認した（skip のまま緑を「通った」と言わない。
      特に visual は `PLAYWRIGHT_VISUAL=1` なしだと全 skip で緑になる）
