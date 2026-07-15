---
paths: ["src/shared/db/**", "src/shared/domain/**"]
---

# DB・ドメイン層

## Prisma gateway（src/shared/db/prisma.ts）

- `new PrismaClient()` の実行はこのファイルのみ（テストで機械強制）
- export は 2 つ: `basePrisma`（`$extends` 前・**Better Auth adapter 専用**）と
  `prisma`（Decimal→number の result 拡張済み・アプリ標準）。逆に使うと
  認証干渉 / 型不一致が起きる
- `@/shared/db/prisma` を import する全ファイルは `import "server-only"` 必須
  （allowlist ではなく動的走査で検査される）
- facade の import は `src/shared/` 配下限定。`prisma.<model>.<method>` 呼出は
  原則 `shared/domain` / `shared/db` 配下限定（例外は architecture-boundaries テストの
  placement gate ALLOWLIST に列挙された shared/lib の 4 ファイルのみ）
- 金額・税率の Decimal 列は number に変換済みで届く。ドメインの金額計算は素の number

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
- interactive tx は単一コネクション。**tx 内の複数クエリ並行発行は禁止**（逐次 await）
- `pg_advisory_xact_lock` は void を返すため `$executeRaw` で呼ぶ（`$queryRaw` は失敗）
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
  audit-log chain=int8 `6029451381908262157n`

## 'use cache' クエリの標準形

公開 read クエリは `"use cache"` → `cacheLife(CACHE_LIFE.X)` → `cacheTag(CACHE_TAGS.X)` →
Prisma query の順で書く（詳細は caching ルール）。

## 不変レコード・シングルトン

- `TermsAgreement` は append-only（update/updateMany/delete/deleteMany/upsert は
  src 全域で grep 禁止）。再有効化は `TermsDocument` 側の操作で行う
- `AuditLog` は HMAC-SHA256 の hash chain で改ざん検知される（`src/shared/domain/audit-log/`）。
  書込は既存の commands 経由のみ。chain 契約（sequence 直列化・canonical JSON）を壊さない
- `Settings` は `id: "singleton"` の単一行モデル
