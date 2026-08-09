---
paths:
  - "e2e/**"
  - "playwright.config.ts"
  - "scripts/e2e/**"
---

# E2E（Playwright）

storage state + setup project + `fullyParallel` の公式パターン。
project は `setup-customer` / `setup-admin` で認証状態を保存し、
`chromium-smoke`（毎 push の必須ゲート、3 分未満）・`chromium`（未認証）・
`chromium-customer` / `chromium-admin`（認証済）・`chromium-*-mobile`
（Android Chrome）・`webkit-*-mobile`（iOS Safari）・`chromium-visual` に分かれる。

```sh
bunx playwright test --project=chromium-smoke     # CI 必須ゲートと同じ
bunx playwright test --project=chromium-customer
bun run e2e                                       # 全部（webServer 自動起動）
```

webServer chain は Stripe fixture → build → start。ローカルでは build も走る。

## 使ってはいけない API（ESLint が機械ブロック）

| 禁止                                    | 代わりに                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `page.waitForTimeout()`                 | `expect(locator).toBeVisible()` 等の web-first assertion                                               |
| `waitForLoadState("networkidle")`       | 同上（公式が DISCOURAGED と明記）                                                                      |
| `page.waitForURL()`                     | `expect(page).toHaveURL()`（App Router の soft navigation では load event が出ず silent timeout する） |
| `locator("#id")` / `locator("form#id")` | `getByRole(...)`。role が無い要素だけ `visibleById()`（`e2e/helpers/streaming-safe-locators.ts`）      |
| `if ((await x.count()) > 0) { … }`      | seed 保証なら無条件 assert、optional UI ならテストごと削除                                             |

id セレクタが禁止なのは、React streaming が完了した Suspense boundary の HTML を
hidden な staging container へ流し込んでから in-place に差し替えるため、
CSS セレクタが **hidden 側も掴んで strict-mode violation になる**から。
role locator は a11y ツリー非公開の要素を除外するので構造的に安全。

## 待ち方・書き方

- `fill()` した文字列を `getByText()` で待たない。入力欄自身にマッチして
  通ってしまい、送信失敗とエラー表示を隠す。
- toast で保存完了を判定しない（楽観ロック競合で出ないことがある）。判定は
  リロード後の永続化状態で行う。
- グローバル状態を変えるテストは **`afterEach` で復元する**。`try` / `finally`
  は setup 側で落ちたときに入らない。
- レート制限に当たらないよう、テストごとに一意の client IP を
  `e2e/helpers/client-ip.ts` の fixture から割り当てる。
- 共有シングルトン（サイト設定など）を触るテストは「所有分割」で排他する
  （named lock は stable に無く、ヘッダー上書きは `'use cache'` 下で使えない）。
- Turnstile は render 済みなのに challenge が来ず空トークンのまま止まることが
  ある。timeout を延ばしても解決しない。回復手段はページの作り直しだけ
  （`e2e/helpers/turnstile.ts`）。

## 落ちたときの調べ方

推測でログを読まない。CI の artifact（trace / 実際のレスポンス）を先に取る。

```sh
gh run view <run-id> --log-failed
gh run download <run-id>
bunx playwright show-trace <trace.zip>
```

ローカルで広域 E2E を再現するときの要点: 専用 DB に隔離する /
`TEST_DATABASE_URL` を明示する / MSYS のパス変換を抑止する /
事前に build して `CI=1` を付ける。CI 側ではサーバー例外そのものは取れない。

多段フォームの障害は直列に出る（CI は 1 回に 1 つしか見せない）。着手時に
dev サーバーを止めてよいか確認し、ローカルで最後まで通し切るほうが速い。
