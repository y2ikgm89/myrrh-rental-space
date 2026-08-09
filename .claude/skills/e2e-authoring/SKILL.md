---
name: e2e-authoring
description: Playwright の E2E テストを新しく書く / 既存の spec を直す手順。どの project に置くか、fixture の使い方、認証状態、テストデータの作り方、落ちたときの調べ方を扱う。
---

# E2E を書く

禁止 API とロケーターの方針は `.claude/rules/testing-e2e.md`（ESLint が機械
ブロックする）。ここは**新しい spec を足すときの手順**。

## 1. 置き場と project を決める

| ディレクトリ                  | project                                    | 認証                                   |
| ----------------------------- | ------------------------------------------ | -------------------------------------- |
| `e2e/smoke/*.smoke.spec.ts`   | `chromium-smoke`                           | なし（毎 push の必須ゲート、3 分未満） |
| `e2e/public/`                 | `chromium`                                 | なし                                   |
| `e2e/authenticated/customer/` | `chromium-customer`                        | 顧客                                   |
| `e2e/authenticated/admin/`    | `chromium-admin` / `chromium-admin-viewer` | 管理者                                 |
| `e2e/mobile/`                 | `chromium-*-mobile` / `webkit-*-mobile`    | project 依存                           |
| `e2e/a11y/`                   | `chromium`                                 | なし                                   |
| `e2e/visual/`                 | `chromium-visual`                          | —                                      |

**smoke に足すのは慎重に。** 毎 push の必須ゲートで、3 分の予算を共有している。

## 2. import は fixture から

```ts
import { test, expect } from "../fixtures/e2e-test";
```

`e2e/**` から `@playwright/test` を直接 import してよいのは
`e2e/fixtures/e2e-test.ts` だけ（`__tests__/unit/architecture/e2e-client-ip-allocation.test.ts`
が強制）。この fixture がテストごとに一意な client IP を全リクエストに載せる
ので、レート制限を人が気にする必要は無い。

**`test.use({ extraHTTPHeaders })` を書かない。** option ごと置き換わって
client IP が消える。ヘッダーを足したいときは fixture 側に option を追加する
（`adminIdentity` がその例）。

## 3. ロケーターは role で書く

```ts
await expect(page.getByRole("heading", { name: "予約" })).toBeVisible();
await expect(page).toHaveURL(/\/reservation/);
```

`locator("#id")` は React streaming の hidden staging copy も掴んで strict-mode
violation になる。role が無い要素だけ `visibleById()`
（`e2e/helpers/streaming-safe-locators.ts`）。

待ちは web-first assertion のみ。`waitForTimeout` / `networkidle` /
`waitForURL` は lint エラー。

## 4. テストデータ

- 固定データは seed 由来のものを `e2e/fixtures/test-data.ts` から使う。
- 都度作るものは `e2e/fixtures/factories.ts` と `e2e/helpers/*-fixture.ts`。
- 直接 DB を触るときは `e2e/helpers/e2e-prisma.ts`。
- **グローバル状態（サイト設定・機能 ON/OFF など）を変えたら `afterEach` で
  戻す。** `try` / `finally` は setup 側で落ちると入らない。
- 共有シングルトンは「どの spec がその設定を所有するか」を分割して排他する。

## 5. 条件つき assertion を書かない

```ts
// NG — 要素が無いと assertion が走らず silent pass する
if ((await locator.count()) > 0) {
  await expect(locator).toBeVisible();
}
```

seed で保証されているなら無条件に assert する。保証されていない optional UI
なら、そのテストごと消す。ESLint が上記の形をブロックする。

`fill()` した文字列を `getByText()` で待たない（入力欄自身にマッチして通り、
送信失敗を隠す）。保存完了を toast で判定しない（楽観ロック競合で出ない）。

## 6. 網羅ゲートに登録する

公開・顧客・管理それぞれに「主要 URL がレスポンシブ / a11y の spec に
現れていること」を見るゲートがある（例:
`__tests__/unit/architecture/e2e-public-responsive-a11y-coverage.test.ts`）。
公開ページを足したら、その URL キーも spec 側に足す。

## 7. 走らせる

```sh
bunx playwright test --project=chromium-smoke
bunx playwright test e2e/public/my-new.spec.ts --project=chromium
bun scripts/run-tests.ts __tests__/unit/architecture   # E2E 契約ゲート
```

webServer chain は Stripe fixture → build → start。ローカル初回は build の
ぶん時間がかかる。

## 8. 落ちたら

推測でログを読む前に artifact を取る。

```sh
gh run view <run-id> --log-failed
gh run download <run-id>
bunx playwright show-trace <trace.zip>
```

多段フォームの障害は直列に出るので、CI は 1 回に 1 つしか見せない。
ローカルで通し切るほうが速い（専用 DB に隔離・`TEST_DATABASE_URL` 明示・
MSYS のパス変換抑止・事前 build して `CI=1`）。
