# コードベース監査 2026-08-20

> 日付入りの記録。書かれた時点の事実であり、現行の仕様書ではない（[docs/README.md](../README.md)）。
> 前回監査（2026-08-12、F-01〜F-133 / R-01〜R-62）の続きではなく、**別監査**。
> ID は新体系（N-01〜）を使い、前回台帳には追記しない（[closeout](2026-08-15-codebase-audit-closeout.md) §8）。
> **消化結果**: [2026-08-20-codebase-audit-closeout.md](2026-08-20-codebase-audit-closeout.md)（N-01〜N-21 はすべてマージ済み）。

## メタ

- 対象: `origin/main` @ `80c822313`（worktree 上で監査。人間の作業中ブランチ `chore/better-auth-1-7-1` とは分離）
- 方法: 領域別 11 レーンの並列静的監査 + オーケストレータが**全 finding を現行コードで再読検証**
- ベースライン: `bun run validate` 緑（exit 0、type-check 162.1s + lint、計 218.0s、2026-08-20 実施）
- 除外: 前回の確定指摘 132 件・棄却 62 件・「採らなかった判断」14 件・範囲外 3 件・既知の限界 F-43 は再掲していない
- 棄却 62 件の傾向（意図的設計 / 到達不能 / gate 方針 / 外部未確定 / 別経路担保）に該当する仮説は今回も採らない

## サマリ

| 重大度 | 件数 |
| ------ | ---: |
| High   |    4 |
| Medium |   11 |
| Low    |    6 |
| 計     |   21 |

全 21 件とも file:line の証拠をオーケストレータが再読確認済み。実行時検証（DB 並行・実ブラウザ・実外部 API）は行っていない（§「監査の限界」）。

---

## High

### N-01 予約削除が status claim を持たず、並行キャンセルとクーポン解放・副作用が二重になる

- **証拠**: `src/shared/domain/reservations/lifecycle-commands.ts:408-418`（tx 外で status 読取）→ `:425-428`（stale な `needsCancellationTracking` 確定）→ `:438-453`（tx 内は `update({ where: { id, deletedAt: null } })` のみ、status 条件なし）→ `:455-457`（stale フラグで `releaseCouponUsage`）。呼び出し側 `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts:444-468` は `wasCancelled` で `applyCancellationSideEffects`（返金・GCal 削除・メール・通知・監査ログ）を発火
- **対比（正規キャンセルは atomic claim）**: `src/shared/domain/reservations/cancel-core.ts:129-158` — `updateMany({ where: { status: { in: CANCELLABLE_STATUSES }, ... } })` で `count === 0` なら失敗返し、claim 成功時のみクーポン解放
- **再現手順**: (1) admin 削除が CONFIRMED を読む → (2) 顧客キャンセルが atomic claim + クーポン解放 + 副作用 → (3) 削除 tx が `deletedAt` 更新に成功し、stale フラグのまま再度 `releaseCouponUsage` + `wasCancelled=true` で副作用再発火。`releaseCouponUsage`（`payloads.ts:301-308`）の `gt: 0` は負数を防ぐが二重解放は防がない。`cancellationReason` も「管理者による削除」で上書きされうる
- **なお**: 削除側の `lockSpaceForTransaction` は cancel 経路が取らないため直列化にならない（`cancel-core.ts` 全文に lock 呼出なし）
- **修正方針**: 削除の書込を `updateMany` の status claim（`status IN (PENDING, CONFIRMED)` のときだけ CANCELLED 化 + クーポン解放）に寄せ、claim 成功時だけ `wasCancelled` を返す。既に CANCELLED なら soft-delete のみ。副作用は claim 結果にのみ紐づける
- **検証状態**: 静的確認済み（並行 integration は未実行）

### N-02 返金 idempotency key が failed/canceled 後の同額再試行で 24 時間衝突する

- **証拠**: `src/shared/domain/reservations/payment-commands.ts:759` — `idempotencyKey: reservation-refund-${reservationId}-${resolved.newCumulative}`（同型: `src/shared/domain/events/payment-commands.ts:961-983`）。集計除外: `src/shared/domain/payment/stripe-refund-orchestration.ts:423-426` — `REFUND_AGGREGATE_EXCLUDED_STATUSES = ["failed", "canceled"]`
- **根拠**: 初回返金が `failed`/`canceled` になると累積から外れ、同じ `newCumulative` で再試行可能。キーが同一のため Stripe は初回レスポンス（= 失敗）を replay し、新規 Refund は作られない。公式: [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)（キーは最低 24 時間保持、同一キーは初回の status/body を返す）。`succeeded`→`failed` 遷移は [Testing async refunds](https://docs.stripe.com/testing?testing-method=tokens)（`tok_refundFail`）で確認
- **修正方針**: 試行ごとに一意な要素をキーへ含める（failed/canceled 件数、または attempt UUID）。二重クリック防止は既存の advisory lock + pending 集計で維持される。再試行前に Stripe 上の現行 Refund.status を retrieve して stale な失敗を信じない
- **検証状態**: コード経路確認済み + Stripe 公式 docs で版つき確認済み。実発生頻度は本番メトリクス未確認

### N-03 SwitchBot 鍵が keyList 遅延で CONFIRMED できず、30 分後に有効鍵を誤 revoke する

- **証拠**:
  - `src/shared/domain/smart-lock/webhook-commands.ts:243-255` — webhook `result=success` でも `findKeyInDeviceList` で key が見つからなければ `false`（CONFIRMED しない）。lookup は 1 回きり
  - `src/app/api/webhooks/switchbot/[token]/route.ts:153-162` — `handled: false` でも 200 を返す（再送なし）
  - `src/shared/domain/smart-lock/issue-passcode.ts:170-199,286-314` — issue 時の keyList poll は上限 45 秒
  - `src/shared/domain/smart-lock/revoke-passcode.ts:477-520` — 30 分超 PENDING に対し `recoverPendingPasscodeViaDeviceList` を呼ぶ
  - `src/shared/domain/smart-lock/revoke-passcode.ts:119-149` — 同関数は名に反して **live key を見つけて deleteKey する**（JSDoc: 「PENDING 行について Device List の name 突合で live key を見つけ deleteKey する」）
  - 実機証跡: [2026-08-16-switchbot-official-compliance-audit.md](2026-08-16-switchbot-official-compliance-audit.md) S-7 — Keypad Touch で keyList 出現が **120 秒超**
- **根拠**: 45 秒 poll（issue 時）と 1 回きりの lookup（webhook 時）の両方が keyList 遅延に負けると、その後 PENDING を CONFIRMED にする経路が**存在しない**。30 分後の stale job は「confirm」ではなく「delete」を選ぶため、物理的に有効な鍵が誤回収される。顧客向け開示は CONFIRMED 前提（`decryptConfirmedPasscode` は CONFIRMED 行のみ、`issue-passcode.ts:415-423`）なので、顧客は鍵を受け取れないまま当日を迎える
- **修正方針**: stale 処理を「CONFIRMED 予約の PENDING + key あり」は **confirm** 側に倒し、「CANCELLED / 期限切れ」のみ revoke にする。または webhook success 後に短周期の物質化ジョブを挟む。issue poll 上限を実測遅延（120 秒超）に合わせる
- **検証状態**: コード経路確定。keyList 120 秒超遅延はリポジトリ内の実機記録で確認済み。SwitchBot が webhook を再送するかは公式に明記なし（未検証）

### N-04 `issueSmartLockPasscodes` が REVOKED 行を PENDING 扱いし silent no-op（F-67 回収が未完）

- **証拠**:
  - `src/shared/domain/smart-lock/assignment-side-effects.ts:129-144` — F-67 対策で「生きたパスコード（CONFIRMED/PENDING）が無い」予約を再 issue 対象に含める。コメントに意図明記（「一度解除したスペースに Pad を付け直しても…顧客が当日ドアを開けられない」）
  - `src/shared/domain/smart-lock/issue-passcode.ts:414-441` — `CONFIRMED` / `REVOKE_PENDING` / `FAILED` 以外（= **REVOKED を含む**）はコメント「PENDING = createKey 進行中」のまま `issuanceFailed: false` で return。削除も createKey も通知もしない
- **根拠**: finder は REVOKED のみの予約を拾うが、発行関数が REVOKED 行を進行中扱いで握りつぶす。Pad 解除→再割当で顧客は鍵未発行のまま、失敗フラグも立たず、誰にも検知されない
- **修正方針**: `REVOKED` は `FAILED` と同様に行削除してから再発行するか、`issuanceFailed: true` + 通知にする。`reissue-passcode.ts` の terminal delete と揃える
- **検証状態**: コード上到達経路確定（assignment → issue）。単体テスト未実行

---

## Medium

### N-05 顧客マージ検証トークンが merge 成功前に消費される

- **証拠**: `src/shared/domain/customers/customer-merge-commands.ts:239-260` — `consumedAt` 更新を別トランザクションで commit した直後に `mergeCustomerCommand` を呼ぶ。source の `userId` / `anonymizedAt` 再検査（`:228-237`）も consume tx の外
- **根拠**: 単回使用の本人確認トークンが権限付き操作（ゲスト履歴移管・source 削除）の完了と原子的でない。merge が throw すると token は消費済み・履歴は未統合のまま残り、再試行は `VERIFICATION_ALREADY_APPLIED` で拒否される
- **修正方針**: consume と merge を同一トランザクションにまとめる（または merge 成功後に初めて `consumedAt` を立てる）かつ、merge 内でも `userId IS NULL` / email 一致を再 assert
- **検証状態**: コードパス確認済み（失敗後の再試行不能は未実行）

### N-06 IntegrationHealth の consecutiveFailures が非原子的 RMW

- **証拠**: `src/shared/domain/settings/connection-health.ts:184-216` — `findUnique` → JS で `nextFailures = (existing?.consecutiveFailures ?? 0) + 1` → `upsert` で絶対値書込。閾値 3 は `:32`
- **根拠**: 並列する失敗記録（例: `reservation-calendar-outbound.ts` の tx 外 `Promise.all` 経由）が同時に `0` を読むと両方 `1` を書き、実失敗 3 回以上でも `ERROR` に届かない。一時障害の検知遅延 = アラート遅延。Prisma 7 の公式は原子加算 `increment`（[Atomic Number Operations](https://www.prisma.io/docs/orm/reference/prisma-client-reference#atomic-number-operations)）
- **修正方針**: 一時失敗は `consecutiveFailures: { increment: 1 }`（または raw `UPDATE … RETURNING`）で原子加算し、RETURNING 値で閾値判定。成功時の 0 クリアは現行 upsert のままで可
- **検証状態**: コード経路確認済み。並列レースの integration 再現は未実施

### N-07 waitlist expire が件数無制限のまま 20 秒 ITX 1 本に載せ、timeout で全件ロールバック

- **証拠**: `src/shared/domain/events/waitlist-queries.ts:410-416`（`findExpiredWaitlistOfferCandidates` に `take` 無し・全 event 横断）→ `src/shared/domain/events/waitlist-offer-commands.ts:277-342`（event ごとに全 candidate を 1 interactive tx、`timeout: 20000`、candidate 単位はネスト tx=savepoint、`:344-346` で lease は finally 解放）
- **根拠**: 外側 ITX が timeout すると savepoint 成功分も含め全体 ROLLBACK（[Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)）。長時間 cron 停止後の初回などで候補が 20 秒に収まらないと、毎回 0 件進捗でバックログが永久に消化されない。lease 解放はあるため永久ロックではないが、運用症状は停止と同型
- **修正方針**: event あたり `take` / チャンク上限を設けて ITX を分割するか、候補処理を外側 ITX から外し claim 単位の短い tx にする
- **検証状態**: 構造確認済み。大量 candidate での実 timeout 再現は未実施

### N-08 予約公開 cron が `/feed.xml` の CDN purge を呼ばない

- **証拠**: `src/app/(public)/feed.xml/route.ts:50-54`（Cache-Tag なし。blanket `s-maxage=3600, stale-while-revalidate=3600` のみ継承 — `next.config.ts:297-304`）/ `src/app/(admin)/admin/(dashboard)/_shared/actions/post/cache-helpers.ts:46-51`（「`/feed.xml` は Cache-Tag を emit しない」と明記し、記事 CRUD は `purgeCloudflareDetailUrls(["/feed.xml"])` で補償）/ `src/app/api/cron/blog-scheduled-publish/route.ts:54-59`（cron は `invalidateSiteWideCacheFromRouteHandler([POSTS, SIDEBAR_DATA, detail…])` のみ、URL purge なし）
- **根拠**: cron の目的は `publishedAt` 到達後の露出を cron 間隔単位で揃えること（同 route 冒頭 JSDoc）。`/feed.xml` はタグを持たないため tag purge が届かず、スケジュール公開後も edge の RSS が最大約 2 時間（s-maxage + swr）stale になりうる。CRUD 経路だけ URL purge している不整合
- **修正方針**: cron 成功時に `purgeCloudflareDetailUrls(["/feed.xml"])` を併発する（`invalidatePostCollectionCaches` と同型）、または `next.config.ts` で `/feed.xml` に Cache-Tag を emit して tag purge に載せる
- **検証状態**: コード経路確認済み（CF 上の実 TTL/HIT は未実測）

### N-09 sanitize-html が `style` 許可時に CSS 値を未制限のまま通す（`allowedStyles` 未設定）

- **証拠**: `src/shared/lib/html/sanitize-content-html-core.ts:75-99` / `:161-205` — `img/div/span/table/tr/th/td/col` に `style` を許可するが `allowedStyles` なし（リポジトリ全域・テスト含め 0 件）。`allowedSchemesAppliedToAttributes: ["href", "src"]` のため CSS `url()` はスキーム検査対象外。本番 CSP は `style-src-attr 'unsafe-inline'`（`src/proxy.ts:178-179`）で style 属性は CSP が防がない
- **根拠**: sanitize-html は `allowedStyles` で CSS プロパティ/値を制限する設計（[公式 README](https://github.com/apostrophecms/sanitize-html)）。未設定だと `style` 全文が残る。実測（worktree 上の bun）で `background-image:url(javascript:…)` / `url(data:…)` / 二重 `url()` 注入がそのまま残ることを確認。現代ブラウザは CSS image 文脈の `javascript:` 実行を抑止するが、CSS 注入自体（追跡用 `url(https://…)`、全面オーバーレイ等の UI redress）は成立する
- **前提となる脅威**: コンテンツ作成者は IAP+RBAC 配下の管理者のみ。管理者アカウントの悪用・侵害、または将来の入力経路拡大が前提の多層防御欠落
- **修正方針**: `sanitizeLexicalContentHtml` / `sanitizeRawEmbedHtml` に `allowedStyles` を追加し、必要プロパティと値正規表現（`https?` / サイト相対のみ）に限定。回帰テストで `javascript:` / `data:` / 二重 `url()` 拒否を固定
- **検証状態**: 実装読取 + sanitize-html 2.17.7 ソース確認 + ローカル実測済み

### N-10 SwitchBot クライアントの `body as T` が optional body を型嘘で通す

- **証拠**: `src/shared/lib/smart-lock/switchbot-client.ts:45-48`（envelope は `body: z.unknown().optional()`）→ `:160`（`parsed.data.body as T`）→ `:392-403`（`getLockDeviceStatus` が `body["lockState"]` 等を無ガード参照）。対比: create/delete（`:365-371` / `:441-447`）は `typeof` + null ガードあり
- **根拠**: envelope 成功時でも `body` は `undefined` / 非オブジェクトを取り得る。`as T` で `Record<string, unknown>` に見せかけるため、body 欠落時に `:401` は実行時 TypeError になる。同一ヘルパー内で呼び出し側の防御が一貫していない
- **修正方針**: `request` は `body` を `unknown` のまま返すか、成功時に `isRecord`（または endpoint 別 zod）で narrow してから返す。`getLockDeviceStatus` は create/delete と同様に非オブジェクトを空 status として扱う
- **検証状態**: 静的確認済み（SwitchBot Status API は通常 body を返すため実発生は低頻度と見込まれるが、型の嘘としては確定）

### N-11 pre-commit の `.env*` 保護が `.env.<env>.local` 複層名を通す

- **証拠**: `scripts/check-protected-files.sh:4`（コメントは「`.env*` 常にブロック」）vs `:14`（実体は `^\.env$|^\.env\.[^.]+$` — ドット 1 段まで）。実測: `.env` / `.env.local` / `.env.production` は BLOCK、`.env.production.local` / `.env.development.local` / `.env.test.local` は PASS
- **根拠**: Next.js は `.env.$(NODE_ENV).local` を最優先で読む（[公式: Environment Variables](https://nextjs.org/docs/app/guides/environment-variables)）。`.gitignore` の `.env.*` は通常の `git add` を止めるが `git add -f` は通り、本 hook が最終防衛線。コメントと実装が不一致で、秘密情報の強制 add を止められない
- **修正方針**: 例: `^\.env([.]|$)` かつ `!\.(example|sample)$` に寄せる。fixture（通すべき / 落とすべきファイル名）をテスト化する
- **検証状態**: 正規表現の合否をローカル実測で確認済み

### N-12 イベント領収書の税額逆算が `tax.ts` の四捨五入 SSoT と不一致

- **証拠**: `src/shared/domain/receipts/issue-core.ts:185-186` — `Math.floor((amount * 100) / (100 + taxRate))`（内税逆算・切り捨て）。対して予約経路は `calculateTaxAmount`（`Math.round`、四捨五入）— `src/shared/lib/pricing/tax.ts:54-58,65-69`、予約領収書は格納済み `taxAmount` をそのまま使用（`issue-core.ts:121`）
- **根拠**: 同一税込額・同一税率でも、予約（四捨五入）とイベント領収書（切り捨て）で税額欄が ±1 円ずれうる。適格請求書の税額が経路間で一貫しない
- **修正方針**: イベント側も `calculateTaxExcludedPrice` / `calculateTaxAmount` に寄せるか、内税切り捨てを製品方針とするなら `tax.ts` に内税逆算 SSoT を切り出して双方で共有する
- **検証状態**: 式の差は確認済み。**切り捨てが意図かどうかはリポジトリ内に明文化なし（要人間確認 §参照）**

### N-13 管理お知らせ一覧が Lexical 本文・SEO 列まで一括 select

- **証拠**: `src/shared/domain/news/admin-queries.ts:120-137`（`getNewsList` が `contentHtml` / `contentJson` / `contentWidth*` / `meta*` / `ogp*` を select）→ `src/app/(admin)/admin/(dashboard)/news/_components/NewsTable.tsx` はこれらを一切参照しない（参照検索 0 件）
- **根拠**: 一覧は本文を表示しないのに、ページ分の Lexical JSON + HTML を毎回 DB→Server→Client props に載せる。同系の投稿一覧は本文を選ばない（`posts/admin-queries.ts:122-151`）のに対し、お知らせだけ `NewsListItem = NewsData`（`news/types.ts`）で詳細形を流用
- **修正方針**: 一覧専用 select / 型を切り、本文・SEO は `getNewsById` のみに
- **検証状態**: コード突合確認済み（実転送量は未計測）

### N-14 admin API が `getRouteErrorStatus` を使わず 401/403 をハードコード（api-conventions drift）

- **証拠**: 規約 `docs/api-conventions.md:25-38`（`ログイン`→401、`権限`/`アクセス権`→403、混ぜない。SSoT は `src/shared/lib/route-responses.ts` の `getRouteErrorStatus`）。違反例: `src/app/(admin)/admin/api/customers/search/route.ts:14`（`jsonError(auth.error.error, 403)` 固定）。同型 403 固定が計 11 route（`post-tags` / `post-categories` / `navigation` / `navigation/social-links` / `notifications/unread-count` / `announcement-bars` / `pages/slug-availability` / `page-sections` / `editor-comments/threads` 等）、逆方向（権限エラーを 401 固定）は `admin/api/ogp/route.ts:164-166`
- **根拠**: 未ログイン時に 403、権限不足時に 401 が返り、クライアントのセッション切れ誘導（401→ログイン）が壊れる。規約文書は「両方 403 で返すと、セッション切れの利用者が手詰まりになる」と明記
- **修正方針**: auth 失敗はすべて `jsonError(msg, getRouteErrorStatus(msg))` に揃える
- **検証状態**: 参照検索で確認済み（HTTP 実レスポンスの実行検証は未実施）

### N-15 `formatCustomerAddress` が未使用のまま、住所 1 行化が 4 箇所に複製

- **証拠（未使用）**: `src/shared/lib/customer-address.ts:80` — SSoT と明記された `formatCustomerAddress` の呼び出しは `src/` 全域で 0 件（参照は `PREFECTURES` / `isPrefecture` のみ）。**証拠（実質同一の 4 複製）**: `src/shared/emails/_shared/footer-data.ts:74-92`（`composeAddress`）、`src/app/(public)/_shared/data/business.ts:43-48`、`src/shared/pdf/receipt-document.tsx:218-225`（`joinAddress`）、`src/shared/lib/terms-templates.ts:1312-1321`（`buildAddress`）
- **根拠**: 宣言された SSoT が死んでおり、結合区切り・建物フィールド有無が経路ごとにずれうる。リポジトリ方針の「抽象化は 3 回目の重複から」を超えている
- **修正方針**: 既存 `formatCustomerAddress`（必要なら building 別名を吸収）へ 4 箇所を寄せ、実配線する
- **検証状態**: 全参照を検索で確認済み

---

## Low

### N-16 投稿一覧も未使用の SEO・メディア・著者・タグを select

- **証拠**: `src/shared/domain/posts/admin-queries.ts:122-151`（`excerpt` / `thumbnailUrl` / `ogp*` / `meta*` / `contentWidth*` / `author` / `postTags`）→ `PostTable.tsx` はこれらを参照しない（参照検索 0 件）
- **修正方針**: 一覧用 select をテーブル列に合わせる（N-13 と同型）
- **検証状態**: コード突合確認済み

### N-17 イベント申込 export の CSV 経路でも ExcelJS を module load

- **証拠**: `src/app/api/admin/export/event-registrations/route.ts:2`（`import ExcelJS from "exceljs"`）→ `:149-160`（`format === "xlsx"` のときだけ使用、CSV は `generateCsv`）
- **根拠**: トップレベル import のため CSV 応答でも route module 評価時に exceljs（`node_modules` 実測約 21MB）が載る。recharts は `charts/index.tsx` で `next/dynamic` 済みなのに対し未分割
- **修正方針**: `xlsx` 分岐内で `await import("exceljs")`
- **検証状態**: import/分岐確認済み（cold start 実測は未実施）

### N-18 `calendar_sync_error IS NOT NULL` 走査にインデックスが無い

- **証拠**: クエリ `src/shared/domain/reservations/calendar-sync.ts:173-184` / `src/shared/domain/events/calendar-sync.ts:128-131`（`calendarSyncError: { not: null }`、cron `/api/cron/calendar-sync-retry` 15 分毎）vs `prisma/schema.prisma:922` / `:2597` に列はあるが `@@index([calendarSyncError], …)` は両モデルとも無し（`:1013-1027` / `:2613-2630`）。対比: waitlist は `@@index([status, expiresAt])` を cron 用に明示（`waitlist-queries.ts:397-398`）
- **根拠**: cron の主述語に対して索引がなく、予約・イベント表の成長に対して Seq Scan 前提。失敗行が sparse なら partial index が定石
- **修正方針**: Reservation / Event に partial `@@index`（例: `where: { calendarSyncError: { not: null }, deletedAt: null }`）を新規 migration で追加し、EXPLAIN で Index Scan を確認
- **検証状態**: クエリ↔schema 突合済み（2 レーンが独立に同一指摘）。実 DB の EXPLAIN は未計測

### N-19 `customer.merge` 監査ログが `transferredSeries` を欠く

- **証拠**: mypage `src/app/(public)/mypage/_shared/actions/customer-merge.ts:217-224` / admin `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts:673-679` — ともに `newValue` に予約・問い合わせ等は載せるがシリーズ移管件数が無い。戻り値には存在（`src/shared/domain/customers/customer-lifecycle-commands.ts:293,432`）
- **根拠**: series 移管は過去欠陥（cascade 削除）対応の中核なのに、フォレンジック用 diff から欠落する
- **修正方針**: 双方の `newValue` に `transferredSeries` を追加し、`customer-merge-audit-log.test.ts` の期待フィールドに含める
- **検証状態**: コード突合済み

### N-20 `lefthook install` 失敗が `|| true` で黙殺される

- **証拠**: `package.json:48`（`"prepare": "lefthook install || true"`）。hook 本体は `lefthook.yml:17-51`
- **根拠**: CLI 未解決・権限失敗などで hook が一切張られない状態をログなしで許容する。その場合 `check-protected-files.sh`（N-11）も pre-push architecture gate も動かない
- **修正方針**: CI/コンテナ向けにだけ skip する明示条件（`CI=true` または `.git` 不在）にし、それ以外は失敗を伝播。または失敗時に目立つ warning を出す
- **検証状態**: コード上確認済み（実際の失敗頻度は未実測）

### N-21 module-reachability 外の未配線 export 群

- **証拠**（定義のみ・`src` / `__tests__` / `scripts` / `e2e` で参照 0）: `confirmRevokeFromWebhookSuccess`（`smart-lock/webhook-commands.ts:363` — JSDoc は Route から呼べると書くが webhook route は未呼出）、`getSyncStatus`（`reservation-calendar-outbound.ts:914`）、`getAllPublishedTags`（`posts/queries.ts:332`）、`ensureSettingsResend|Turnstile|GoogleMaps|Instagram|Switchbot`（`ensure-commands.ts:94-147`）、`isR2Configured`（`r2/client.ts:80`）、`fetchInstagramOembed`、`lookupGoogleWorkspaceGroupResourceName`、`cssVarStyle` / `mergeCssVarStyles`
- **根拠**: `module-reachability.test.ts` はモジュール粒度で、export 粒度の死骸はカバー外（gate 冒頭 JSDoc どおり）。誤結果経路は無いが保守性の負債
- **修正方針**: 削除するか呼び出しを配線。`confirmRevokeFromWebhookSuccess` は意図が残るなら webhook 後に呼ぶか JSDoc を実態に合わせる
- **検証状態**: シンボル単位の参照検索済み（動的 import 文字列経路なし）

---

## 要人間確認

| 項目                                          | 内容                                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-12 の税端数                                 | イベント領収書の内税切り捨てが製品方針か実装漏れか。方針決定後に SSoT 化                                                                                                     |
| N-03 の修正方向                               | stale job を confirm 側に倒すか、物質化ジョブを足すか（SwitchBot の実機遅延の分布次第）                                                                                      |
| Better Auth 版                                | 監査対象 main は `better-auth@1.6.30`（`Account` に issuer 列なし）。issuer 規約は 1.7 向けで、作業中ブランチ `chore/better-auth-1-7-1` の対応範囲。本監査では欠陥扱いしない |
| `branch-protection.json` の `"strict": false` | base 最新必須なしが意図か緩みか                                                                                                                                              |

## 未検証・判断保留（finding 化しなかったもの）

- 各 finding の「検証状態」欄にある実行時未検証事項（DB 並行再現、EXPLAIN、CF 実 TTL、cold start 等）
- `charge.refunded` の `refunds.data[0]` が常に当該イベント起因か（R-57 隣接。本番 payload 未確認）
- `createCalendarEvent` の 409→成功（patch 無し）が補償 delete 失敗と重なったときの GCal 本文不整合（冪等 retry としての 409=success は採用済み設計）
- SwitchBot webhook の再送契約（公式に明記なし）
- 800 行超ファイル（`events/payment-commands.ts` 等）はサイズのみでは欠陥機序を特定できず保留
- events / reservations の `payment-commands` 2 系統並列は「3 回目から抽象化」方針により非 finding
- GSAP + Lenis を全 public layout に載せる設計（Header UX の意図的配線）
- `$queryRaw<T>` の T と pg 実型の一致（`Number(...)` で潰している箇所は実害未確認）
- 実 GCP に対する `terraform plan` / `gcp:audit-production-iap` の実行（F-20〜22 と同型の運用判断）
- docker-compose healthcheck の `start_period` 欠落による初回フレーク有無

## gate 済み確認（finding にしない）

11 レーンが確認した既存強制の抜粋:

- 予約: `event-schedule-db-invariants`（EXCLUDE 制約）、`temporal-order-constraints`、`advisory-lock-namespace-registry`、`prisma-interactive-tx-no-promise-all`、`event-inventory-dynamic`
- 決済: `refund-append-only`、`coupon-usage-release-helper`、`stripe-request-timeout`、`stripe-webhook-async-only`（ESLint）、`claimStripeEventForProcessing` 二重防御
- 外部連携: `reservation-email-idempotency`、`crypto-purpose-registry` / `crypto-clean-break`、GCal webhook 200 ack・retry 分類・deterministic event ID（意図設計）
- 認証認可: `auth-gate-ssot`、`admin-page-auth-before-suspense`、`admin-permission-denial-mechanism`、`permission-keys-exist`、`customer-merge-token-ttl`
- 公開面: `cache-tag-literals`、`public-cache-tag-header-pairing`、`csp-nonce-prelude-gate` / `csp-inline-style-hashes`、`turnstile-token-field-single-owner`
- DB: `schema-migration-drift`（drift に例外は無く、gate は exit code 0 のみを受理する）、`migration-atomicity`、destructive DB ガード、raw SQL 物理名 gate
- 型: `type-safety-cast-and-cache-tag-drift`、`section-config-widening-cast`、`prisma-delegate-arg-types`、ESLint の `no-non-null-assertion` / `no-unsafe-*`（`as any` / `as unknown as` / `!.` は src 実コード 0 件を確認）
- 保守性: `module-reachability`（allowlist 空）、`admin-clean-break-dead-code`
- インフラ: `ci-workflow-contract`（required 9 contexts 対応）、`workflow-shell-pipefail`、`deploy-production-workflow`、`gcp-production-audit` 系
- 既知の意図設計: CI `changes` job で重い step が skip されても required check は緑（`ci.yml` の意図設計、GitHub 公式も skipped job を Success 扱い）

## Follow-up 修正 PR の分割提案（領域別）

| PR  | 対象                                                                     | 含む finding                                             |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | reservations lifecycle                                                   | N-01、N-07                                               |
| 2   | payment / receipts                                                       | N-02、N-12（方針決定後）                                 |
| 3   | smart-lock                                                               | N-03、N-04、N-10                                         |
| 4   | customers merge                                                          | N-05、N-19                                               |
| 5   | integration health + DB index                                            | N-06、N-18（migration 同伴。`new-migration` skill 手順） |
| 6   | public cache                                                             | N-08                                                     |
| 7   | html sanitize                                                            | N-09                                                     |
| 8   | admin API 規約                                                           | N-14                                                     |
| 9   | admin 一覧 select                                                        | N-13、N-16                                               |
| 10  | chore（env guard / lefthook / dynamic import / dead export / 住所 SSoT） | N-11、N-17、N-20、N-21、N-15                             |

## 監査の限界

- 静的読解 + 一部ローカル実測（sanitize 出力・正規表現合否）。DB 並行・実ブラウザ・実外部 API（Stripe / SwitchBot / Google）・実 GCP は未検証
- 前回未読の中心だった `src/app/(admin)` と `__tests__/` は今回レーン D/H/K/G でカバーしたが、全行を読んだわけではない
- 「21 件を挙げた = 欠陥がこれだけ」ではない。gate が緑なのは gate が見ている範囲の証明
