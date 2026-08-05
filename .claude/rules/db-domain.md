---
paths: ["src/shared/db/**", "src/shared/domain/**"]
---

# DB・ドメイン層

## Prisma gateway（src/shared/db/prisma.ts）

- `new PrismaClient()` の実行はこのファイルのみ（テストで機械強制）
- export は `prisma`（アプリ標準 singleton）と `AppPrismaClient` 型 alias
- `@/shared/db/prisma` を import する全ファイルは `import "server-only"` 必須
  （allowlist ではなく動的走査で検査される）
- facade の import は `src/shared/` 配下限定。`prisma.<model>.<method>` 呼出は
  `shared/domain` / `shared/db` 配下限定（`prisma-import-boundary.test.ts` の
  placement gate ALLOWLIST は現在空集合。shared/lib からの直接呼出は例外なく禁止）
- 金額・税率は schema 上 Int（円 / whole-% / area は ㎡×100）。ドメイン計算は素の number

## JSON・エラー・ログ

- Prisma JSON 書込は `src/shared/db/prisma-input-json.ts` の
  `parsePrismaInputJson` / `asPrismaInputJsonValue` 等で runtime narrow する
  （直 cast は grep gate で禁止）。同ファイルは seed から使うため server-only を
  import しない。server-only 境界が必要なら `src/shared/db/json.ts` barrel を使う
- ドメインエラーは `DomainError(message, code)` を throw。code は
  NOT_FOUND / CONFLICT / DUPLICATE / VALIDATION / UNAUTHORIZED / FORBIDDEN / UNEXPECTED
- サーバーサイドのエラーログは `src/shared/lib/errors` の `logError` +
  ErrorCategory / ErrorSeverity を使う（`console.error` の場当たり実装をしない）
- 外部 URL への fetch は `src/shared/lib/ssrf-guard.ts` の `fetchPublicHttpResource`
  （SSRF ガード付き）を使う。DB/内部データ取得のエラーハンドリングは
  `safeFetch`（fallback 返却）/ `criticalFetch`（logError + rethrow）で包む

## トランザクション

- `prisma.$transaction([...])` の配列形式・`.map()` 動的配列形式は ESLint error。
  原子性不要なら `Promise.all`、必要なら interactive `$transaction(async (tx) => ...)`
- interactive tx は単一コネクション。**tx 内の複数クエリ並行発行は禁止**（逐次 await）。
  callback 内の `Promise.all` / `Promise.allSettled` は
  `__tests__/unit/architecture/prisma-interactive-tx-no-promise-all.test.ts`
  が `src/shared/domain/**` と `src/shared/db/**` を静的走査で拒否する
- `pg_advisory_xact_lock` は void を返すため `$executeRaw` で呼ぶ（`$queryRaw` は失敗）
- **advisory lock で直列化する tx に `isolationLevel` を足さない**（既定の READ COMMITTED
  のまま使う）。SERIALIZABLE / REPEATABLE READ はスナップショットを
  「トランザクション内の最初のクエリの _開始時_」に凍結するため、最初の文が
  `SELECT pg_advisory_xact_lock(...)` だと **ロック取得を待つ前に**スナップショットが
  確定し、待機中に先行 writer がコミットしても見えない。結果、ロックを取れた側が
  古い値を読んで衝突し P2034 で abort する（リトライしても新 tx が再び
  ロック待ちより前に凍結するので繰り返す）。PostgreSQL 公式も
  「明示ロックで並行変更を防ぐなら Read Committed を使うか、それ以上ではクエリより
  前にロックを取れ」と警告している（13.4.2）。公式が挙げる逃げ道は `LOCK TABLE`
  （クエリではないので凍結しない）だが、**関数呼び出しである advisory lock は
  その逃げ道を取れない**。実測・回帰防止は
  `__tests__/integration/domain/audit-log/chain-concurrency.test.ts`
  （監査ログ chain で 6 並行のうち 3 件が失格していた）
- advisory lock 採番レジストリ（衝突禁止）: 728349=calendar-sync（session lock）、
  728350=イベント申込、728351=Space スケジュール空間（Reservation + EventTimeSlot 書込 + order-scope）、
  728352=スペースのlocationId/smartLockDeviceId整合性（`spaces/commands.ts`の
  `updateSpaceCommand`と`smart-lock/commands.ts`の`setSpaceSmartLockDeviceCommand`で共有）、
  728353=領収書連番採番（ReceiptSequence 単一行 + 予約単位 lock）、
  728354=イベントキャンセル待ち promote session lock（`events/waitlist-locks.ts` の
  `tryAcquireWaitlistPromoteSessionLock` / cron `waitlist-expire` で全 slot 走査を event 単位に直列化）、
  728355=予約単位 refund 直列化（`reservations/payment-commands.ts` の
  `refundReservationPaymentCommand` で Refund 累積計算 + Stripe API call + Refund 書込 +
  paymentStatus 遷移を interactive tx で serialize、over-refund/idempotency 破壊を防ぐ）、
  728356=イベント申込単位 refund 直列化（`events/payment-commands.ts` の
  `refundEventRegistrationPaymentCommand` で 728355 と同型の serialize、event registration 側 refund flow）、
  728357=ReservationSeries 単位（`src/shared/domain/reservations/series-advisory-lock.ts` の
  `lockReservationSeriesForTransaction`。`createReservationSeriesCommand` や一括キャンセルなど
  series 全体にまたがる書込を tx 単位で serialize。Space namespace 728351 と併用する場合は
  必ず 728357 → 728351 の順で取得する（deadlock 予防）)、
  728358=Customer.flagReasons reconcile 単位（`src/shared/domain/customers/risk-detection.ts` の
  `reconcileFlagReasonsCommand`。customer-risk-scan / duplicate-detection 等、複数の独立した
  cron が同一 Customer の `flagReasons` を read-then-write する際の lost update を防ぐ）、
  audit-log chain=int8 `6029451381908262157n`

## 'use cache' クエリの標準形

公開 read クエリは `"use cache"` → `cacheLife(CACHE_LIFE.X)` → `cacheTag(CACHE_TAGS.X)` →
Prisma query の順で書く（詳細は caching ルール）。

## 不変レコード・シングルトン

- `TermsAgreement` は append-only（update/updateMany/delete/deleteMany/upsert は
  src 全域で grep 禁止）。再有効化は `TermsDocument` 側の操作で行う
- `AuditLog` は HMAC-SHA256 の hash chain で改ざん検知される（`src/shared/domain/audit-log/`）。
  書込は既存の commands 経由のみ。chain 契約（sequence 直列化・canonical JSON）を壊さない
- 設定は `Settings*` の複数の単一行モデルに分割されている（全表 `id = "singleton"`。
  `invariants.sql` の `*_singleton_check` が SSoT。`prisma.settings` という delegate は
  存在せず、`settings-phase5-split.test.ts` が src からの参照を 0 件強制する）
- **append-only は 4 テーブルが DB trigger で強制されている**。src / `e2e/**` /
  `scripts/**` のどこから触っても UPDATE・DELETE は `RAISE EXCEPTION` で落ちる:

  | テーブル                 | trigger 関数                              | bypass GUC（許可値）                                               |
  | ------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
  | `audit_logs`             | `prevent_audit_logs_mutation`             | `myrrh.audit_log_mutation_bypass`（`seed`）                        |
  | `terms_agreements`       | `prevent_terms_agreements_mutation`       | `myrrh.terms_agreement_mutation_bypass`（`seed`）                  |
  | `refunds`                | `prevent_refunds_mutation`                | `myrrh.refund_mutation_bypass`（`seed`）                           |
  | `inquiry_status_history` | `prevent_inquiry_status_history_mutation` | `myrrh.inquiry_status_history_mutation_bypass`（`seed` / `purge`） |

  bypass GUC は seed と data-retention purge の専用口で、テストや fixture から使わない。
  **「E2E が作った行だから消してよい」は成立しない** — E2E の復元 hook が
  `inquiryStatusHistory.deleteMany` を呼んで広域 run を落とした実例がある
  （#1772 → #1781。gate: `__tests__/unit/architecture/inquiry-status-history-append-only.test.ts`）。
  また **該当行 0 件の DELETE は行レベル trigger を発火させない**ため、
  ローカルで「クエリが通った」ことは trigger を通過した証明にならない
