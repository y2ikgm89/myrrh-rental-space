# 繰返し予約 (Phase B.2 RRULE Reservation) 設計

- 日付: 2026-07-17
- ステータス: 承認待ち (brainstorming 完了、writing-plans 前)
- 対象 Phase: **B.2 = Reservation-side RRULE 繰返し予約** (Event 側は既存 slots array で複数開催表現可、範囲外)

## 背景

現状の `Reservation` model は単発予約前提で、繰返し予約 (毎週火曜 19:00-21:00、10 回等) を表現する field / model / library / UI が皆無 (grep 0 件、Phase B.2 fresh explore 確認済)。`rrule` / `rrule-js` / `node-ical` などの RFC 5545 準拠 library も未 install。既存 iCal `buildReservationCalendar` は 1 UID = 1 REQUEST/CANCEL の対応で `.repeating(rrule)` 未使用、Google Calendar sync も `event.recurrence[]` 未指定。

Phase B.1 spec (`docs/superpowers/specs/2026-07-16-online-events-phase-b1-design.md`) §「Phase B.2 (RRULE 繰返し予約) との関係」節で本 Phase の 6 項目 (schema / template model / iCal/GCal recurrence / 3 択キャンセル / EXCLUDE + advisory lock / SwitchBot per-instance) が予告予約済。本設計はこれを業界標準 (Google Calendar / Cal.com / Calendly / Nextcloud) と本 project の relational FK + EXCLUDE 制約 + CROSS-TABLE TRIGGER + refund/passcode/receipt per-row 契約に整合させる形で確定する。

ユーザーは「業界水準・公式推奨で後方互換性なしのクリーン実装」を明言。本設計は破壊的変更を最小限 (全て加算的 add-only、既存契約温存) で 業界標準を最大化する。

## 調査で確定した事実 (前提)

### 現状 Reservation schema (`prisma/schema.prisma:605-719`)

- `Reservation` 全 43 field 中、series/rrule 系列は**完全欠落** (grep 0 件で確認)
- `startTime` / `endTime` は `timestamp WITHOUT TIME ZONE` (`@db.Timestamp` 相当、`@db.Timestamptz` ではない)。**`EventTimeSlot.startAt/endAt` (`@db.Timestamptz(6)`) と型不整合の既存 latent risk あるが本 phase では顕在化しない** (Reservation-only ドメインで完結、CROSS-TABLE trigger は明示 cast で安全)
- `icsSequence Int @default(0)` — RFC 5545 SEQUENCE、cancel/update 経路で `{ increment: 1 }` (既存 pattern、series 導入後もそのまま流用可)

### 現状 iCal / GCal (Phase B.1 landed 後)

- `src/shared/lib/ical/index.ts`: `buildReservationCalendar` / `buildReservationCancelCalendar` / `buildEventCalendar` / `buildEventCancelCalendar` の 4 export。Phase B.1 で Event 側は `URL` + `format` 対応済だが Reservation 側は変更なし。RRULE 系 import は無し。
- `src/shared/lib/google-calendar/events.ts`: `CalendarEventParams = { summary, description, location, startTime, endTime, attendeeEmail }` (types.ts:10-17)、`recurrence` field は無し。GCal API 側では未指定 = 単発 event 解釈。
- `outbound.ts` / `event-outbound.ts` の `createCalendarEvent(params, options?)` 呼出時に `recurrence` は投げていない。

### 既存 DB 制約 (RRULE 導入に耐える)

- `reservations_no_active_time_overlap_excl` EXCLUDE USING gist (`spaceId WITH =, tsrange(startTime, endTime, '[)') WITH &&`) — **半開区間 + spaceId + active status (PENDING/CONFIRMED) のみ + soft-delete 除外**、instance 単位書込方式なら追加変更なしで重複防止
- `check_reservation_no_event_slot_overlap()` / `check_event_slot_no_reservation_overlap()` / `check_event_no_reservation_overlap()` の CONSTRAINT TRIGGER 3 本 — `AFTER INSERT/UPDATE OF ...` の列リスト無変更のまま series の instance 書込に自動追従
- `reservations_time_order_check` CHECK: `startTime < endTime` — 各 instance で自動チェック

### 既存 side-effects 経路 (series 対応で拡張が必要)

- `applyCancellationSideEffects` (`cancellation-side-effects.ts:196-405`): 7 fire-and-forget (Stripe refund / GCal delete / customer mail / admin mail / in-app notif / AuditLog / SwitchBot passcode revoke) を 1 予約単位で発火
- `applyCancellation` (`cancel-core.ts:60-114`): `CANCELLABLE_STATUSES = [PENDING, CONFIRMED]` を updateMany で claim、`icsSequence { increment: 1 }`
- `applyReservationEditSideEffects` (`edit-side-effects.ts`): spaceId / startTime / endTime 変更で SwitchBot passcode 再発行

### SwitchBot smart lock (per-instance 不可避)

- `issueForDevice` (`issue-passcode.ts:167-208`): SwitchBot `createPasscode({ type: "timeLimit", startTime: unix, endTime: unix })` は **単一 window 前提**。series 全体で 1 passcode の API 経路は存在せず、per-instance 発行が API level で不可避
- `@@unique([reservationId, deviceId])` (`SmartLockPasscode` model schema.prisma:2249) — 1 予約 + 1 device = 1 passcode。instance を別 reservationId として書けば自動的に個別 passcode

### Stripe (per-instance)

- `Reservation.stripeCheckoutSessionId` / `stripePaymentIntentId` は N=1 前提。Checkout Session は `mode: "payment"` (1 session = 1 payment)、subscription mode は API が別で本 phase では**採用しない**
- `ReceiptSequence` (`prisma/schema.prisma:2150-2157`): 年ごとの atomic serial、`Receipt @unique(reservationId)` の 1 予約 = 1 領収書契約。series の 10 instance = 10 領収書

### advisory lock registry (空き番号)

- 現状使用済: 728349-728356 (`.claude/rules/db-domain.md` line 41-52)
- **`728357` は Phase B.1 spec (line 661) で B.2 用予約済**、series 単位 lock として使用
- `728358` 以降は未使用、必要時に追加予約

## 外部検証 (業界標準・公式仕様)

### RFC 5545 iCalendar (IETF 標準)

- **RRULE** (§3.3.10): `FREQ` (SECONDLY..YEARLY) + `INTERVAL` + `COUNT` / `UNTIL` + `BYDAY` / `BYMONTHDAY` / `BYMONTH` / `BYSETPOS` 等。JST 固定運用 (UTC+9 DST 無し) では UNTIL の TZ 変換は `toISOString()` の UTC 表現で RFC 5545 準拠 (`19970610T172345Z` 形式)
- **RECURRENCE-ID** (§3.8.4.4): master event の RRULE から派生した instance を override するときに使用。特定 instance のみ変更 (time change / cancel) を表現
- **EXDATE** (§3.8.5.1): master RRULE からの除外日付リスト
- **SEQUENCE** (§3.8.7.4): update/cancel で increment (既存 `icsSequence` と一致)
- **METHOD:REQUEST / CANCEL** (§3.7.2): 招待 / 取消 (既存 iCal export と一致)

### Google Calendar API v3

- `event.recurrence: string[]`: RRULE / EXDATE / RDATE を配列で渡す (`["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260901T000000Z"]`)
- `events.instances(masterEventId)`: master event から期間内の展開済 instance を取得
- `events.patch(eventId, { recurrence: [...] })`: master event の RRULE 更新 (全 instance に伝播)
- **Instance ID 形式**: `{masterId}_{yyyymmddTHHMMSSZ}` (e.g. `abcd1234_20260901T100000Z`)。RECURRENCE-ID override 時も同 ID
- **`sendUpdates: "all"|"externalOnly"|"none"`**: series 全体変更時の招待者への通知 (本 project では GCal service account 経由で attendee なし、`sendUpdates: "none"` 継続)

### 業界標準実装比較 (scheduling apps recurring bookings)

| 実装                   | Storage                                                         | RRULE 表現                                                          | Cancel semantics                       |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| **Cal.com** (OSS)      | Materialized `Booking` rows + `recurringEventId` FK             | 独自構造 `RecurringEvent {freq, count, interval}` (RFC 5545 subset) | this-only / all (2 択)                 |
| **Calendly**           | Materialized                                                    | RFC 5545 準拠                                                       | this-only / all                        |
| **Google Calendar**    | Master + on-demand instance expansion + RECURRENCE-ID overrides | RFC 5545 raw string in `recurrence: string[]`                       | this / this-and-following / all (3 択) |
| **Outlook Calendar**   | Google 同型 (master + expansion)                                | RFC 5545                                                            | this / this-and-following / all        |
| **Nextcloud Calendar** | Materialized + `rrule` npm expansion                            | RFC 5545 raw string                                                 | 3 択                                   |

本 project は既存 `Reservation` の EXCLUDE 制約 + CONSTRAINT TRIGGER + refund/passcode/receipt per-row 契約と最も整合する **materialized instances + seriesId FK + RFC 5545 raw RRULE 文字列** を採用する (Nextcloud パターン)。GCal 3 択キャンセル semantics を採用して業界最高水準。

### `rrule` npm package (RFC 5545 準拠、de-facto standard)

- `rrule@2.8+` (`https://www.npmjs.com/package/rrule`): RFC 5545 完全準拠 parser / stringifier / expander
- `RRule.fromString("FREQ=WEEKLY;BYDAY=TU;UNTIL=20260901T000000Z")` / `rule.between(after, before, inc)` / `rule.count()` / `rule.toString()`
- Node.js + browser 両対応 (admin form の client-side preview で流用可)
- TypeScript declarations 同梱、React 19 / Next.js 16 と互換 (peer dependency issue なし、Phase B.2 前提で verify 済)

## ゴール

1. 管理者が「毎週火/木、19:00-21:00、10 回」等の繰返し予約を admin form から作成でき、N 個の Reservation instance が単一 tx で materialize される
2. 各 instance は既存 Reservation と同等の payment / refund / passcode / receipt 経路を通り、per-instance で独立管理される (Stripe subscription mode は使わない、既存 per-payment 契約温存)
3. Series 単位のキャンセル UI で「今回のみ / 今回以降 / 全て」の 3 択を提供 (Google Calendar 業界標準)
4. iCal 出力は RFC 5545 準拠で master UID + RRULE (`.repeating(rrule)`) を使い、単一 event 招待で N instance を表現
5. Google Calendar sync は `event.recurrence: string[]` に RRULE を投げて master event 1 個生成、Google が展開する child instance ID (`{masterId}_{yyyymmddTHHMMSSZ}`) を各 `Reservation.googleCalendarEventId` に write-back
6. SwitchBot passcode は per-instance 発行 (SwitchBot API 制約で不可避)、既存 issuance flow を series の各 instance が独立して trigger
7. TermsAgreement は series 作成時に 1 同意証跡 (`TermsScope` に `RESERVATION_SERIES` enum 値追加)
8. Admin form に client-side RRULE preview (「毎週火/木、10 回、次回 2026-07-22」) を rrule.js で表示
9. Public reservation ページには**繰返し予約作成 UI を含めない** (admin-only feature、将来 phase で customer 開放判断)。ただし顧客側の instance 表示 + キャンセル 3 択 UI は含む
10. Advisory lock `728357` = series 単位で新設 (series 全体書込直列化)、既存 `728351` (Space) は各 instance 書込で継続共有

## 非ゴール (スコープ外)

- **Event-side recurring**: EventTimeSlot は既に手動で複数 slot 定義可能 (`syncEventTimeSlotsCommand`)。RRULE 化不要
- **Customer self-service で繰返し予約作成**: Phase B.2 は admin-only。顧客が任意 RRULE で予約できる UI は将来 phase で
- **Google Calendar 3 択の "this-and-following" の UI 実装**: cancel semantics は 3 択で backend 実装するが、admin/customer UI では初期に**this-only / all の 2 択のみ露出**し、`this-and-following` は backend API 経由 (admin manual invoke) で提供。UI 全面公開は Phase B.2.1 で
- **Custom RRULE 上限 (yearly, minutely 等)**: `FREQ=DAILY/WEEKLY/MONTHLY` の 3 値のみ支持 (`YEARLY` は業界的にレアで scope 外、`SECONDLY/MINUTELY/HOURLY` は誤操作リスク高)。Zod validation で 3 値限定
- **RRULE の Update / RECURRENCE-ID override 経路**: 「毎週火曜のうち、9/10 だけ 20:00 開始に変更」等の individual instance modification は Phase B.2.1 で。B.2 は series 全体の作成 / キャンセルのみ
- **Series の split / merge**: series を途中で 2 つに分ける / 2 series を 1 に合併する UI は不要 (this-and-following キャンセルで実質分割は表現可)
- **繰返し予約の割引 rule**: 10 回まとめて 10% off 等の series-level 割引は既存 `couponId` を series で共有する形で表現。新規 discount rule engine は不要
- **時刻の per-instance duration variation**: 各 instance の duration は series 全体で固定 (毎回 2 時間)。「1 回目は 3 時間、2 回目は 2 時間」等の可変長は Phase B.2.1 で
- **`Reservation.startTime` の型変更 (`timestamp` → `timestamptz`)**: 既存 latent risk (EventTimeSlot との型不整合) は本 phase の scope 外、別 phase で対応

## アーキテクチャ設計

### 1. Data model (Prisma DSL)

```prisma
// prisma/schema.prisma に追加
enum ReservationSeriesFreq {
  DAILY
  WEEKLY
  MONTHLY
}

enum TermsScope {
  // 既存: RESERVATION / INQUIRY / EVENT_REGISTRATION / LOGIN_SIGNUP
  RESERVATION_SERIES  // 新規追加
}

model ReservationSeries {
  id                    String   @id @default(uuid()) @db.Uuid
  spaceId               String   @db.Uuid
  customerId            String   @db.Uuid
  couponId              String?  @db.Uuid  // series 全体で 1 クーポン (usageCount +1)
  rrule                 String   @db.VarChar(500)  // RFC 5545 raw RRULE string
  dtstart               DateTime @db.Timestamp(6)  // 最初の instance の startTime (Reservation.startTime と型統一)
  duration              Int      // 各 instance の duration (分単位、series 全体で固定)
  instanceCount         Int      // series 内の instance 数 (materialize 時の実測値、cap validation SSoT)
  templateData          Json     // 作成時 snapshot: notes / guest info / rate breakdown ref etc.
  agreementSnapshot     Json     // TermsAgreement fingerprint snapshot (series 作成時)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  cancelledAt           DateTime?
  cancelledByType       String?  @db.VarChar(20)
  cancellationReason    String?  @db.Text
  deletedAt             DateTime?
  deletedById           String?  @db.Uuid

  space                 Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  customer              Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  coupon                Coupon?  @relation(fields: [couponId], references: [id], onDelete: SetNull)
  deletedBy             User?    @relation(fields: [deletedById], references: [id], onDelete: SetNull)
  instances             Reservation[]

  // **注意 (Codex P2 #3599414660 fix)**: soft-delete 済 series は空き扱いにする必要があるため、
  // Prisma `@@unique` (無条件) は使わず migration.sql で partial unique index を直接定義する:
  //   CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"
  //     ON "reservation_series" ("spaceId", "dtstart") WHERE "deletedAt" IS NULL;
  // series-all キャンセル (soft-delete) 後、admin が同 (spaceId, dtstart) で再作成する経路を保証。
  // reservation の EXCLUDE 制約 (deletedAt filter) と一貫。schema には index のみ宣言し unique は raw SQL:
  @@index([spaceId, dtstart])
  @@index([customerId])
  @@index([spaceId])
  @@index([createdAt])
  @@index([deletedAt])
  @@map("reservation_series")
}

model Reservation {
  // ... existing fields ...
  seriesId                 String?              @db.Uuid
  recurrenceInstanceIndex  Int?                 // 0-based within series (ordering / display)

  series                   ReservationSeries?   @relation(fields: [seriesId], references: [id], onDelete: SetNull)

  @@index([seriesId, recurrenceInstanceIndex])
}

// **重要 (Codex P2 #3599414656 fix)**: series の instance では `Reservation.couponId = null` を強制。
// Coupon は `ReservationSeries.couponId` に集約保持し、既存 `applyCancellation` (cancel-core.ts:106-110)
// の `coupon.usageCount { decrement: 1 }` が instance-couponId 判定なので、instance-side null で自動 skip。
// this-only キャンセルが残り instance の割引を破壊しない安全設計。series-all キャンセル時のみ
// `cancelReservationSeriesCommand` が明示的に `series.couponId` を basis に 1 usage decrement。
// 単発予約 (`seriesId = null`) は既存通り `Reservation.couponId` を持つ (無関係、契約温存)。

model Settings {
  // ... existing fields ...
  maxRecurrenceInstances  Int  @default(26)  // admin 設定可、series の最大 instance 数 upper bound
}
```

### 2. Migration 戦略

**single migration file** `prisma/migrations/YYYYMMDDHHMMSS_add_reservation_series/migration.sql`:

```sql
-- add enums
CREATE TYPE "ReservationSeriesFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
ALTER TYPE "TermsScope" ADD VALUE 'RESERVATION_SERIES';

-- new table
CREATE TABLE "reservation_series" (
  "id" UUID NOT NULL,
  "spaceId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "couponId" UUID,
  "rrule" VARCHAR(500) NOT NULL,
  "dtstart" TIMESTAMP(6) NOT NULL,
  "duration" INTEGER NOT NULL,
  "instanceCount" INTEGER NOT NULL,
  "templateData" JSONB NOT NULL,
  "agreementSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledByType" VARCHAR(20),
  "cancellationReason" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedById" UUID,
  CONSTRAINT "reservation_series_pkey" PRIMARY KEY ("id")
);

-- Codex P2 #3599414660 fix: partial unique で soft-delete 後の同 (spaceId, dtstart) 再作成を許可
CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"
  ON "reservation_series" ("spaceId", "dtstart") WHERE "deletedAt" IS NULL;
-- 通常 index (deletedAt 無関係の query 用) は別途
CREATE INDEX "reservation_series_spaceId_dtstart_idx"
  ON "reservation_series" ("spaceId", "dtstart");
CREATE INDEX "reservation_series_customerId_idx" ON "reservation_series" ("customerId");
CREATE INDEX "reservation_series_spaceId_idx" ON "reservation_series" ("spaceId");
CREATE INDEX "reservation_series_createdAt_idx" ON "reservation_series" ("createdAt");
CREATE INDEX "reservation_series_deletedAt_idx" ON "reservation_series" ("deletedAt");

-- FK
ALTER TABLE "reservation_series"
  ADD CONSTRAINT "reservation_series_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reservation_series_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "reservation_series_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "reservation_series_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- reservation columns (nullable additions, no default needed)
ALTER TABLE "reservations"
  ADD COLUMN "seriesId" UUID,
  ADD COLUMN "recurrenceInstanceIndex" INTEGER;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "reservation_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "reservations_seriesId_recurrenceInstanceIndex_idx"
  ON "reservations" ("seriesId", "recurrenceInstanceIndex");

-- Settings column (nullable-with-default, safe)
ALTER TABLE "settings"
  ADD COLUMN "maxRecurrenceInstances" INTEGER NOT NULL DEFAULT 26;
```

**deploy impact**:

- `CREATE TABLE` / `ADD COLUMN nullable` / `ADD COLUMN NOT NULL DEFAULT` の 3 種のみ = **add-only migration、breaking mode 不発生、無停止デプロイ**
- `ALTER TYPE ADD VALUE` は Postgres 12+ で in-transaction 実行不能な既存 latent risk あるが、本 project の migration runner (`prisma migrate deploy`) は各 SQL 文を暗黙 autocommit で流すため safe
- squawk lint: `adding-required-field` / `adding-not-nullable-field` は `NOT NULL DEFAULT` があるため safe、他は excluded_rules

### 3. Enum SSoT (`src/shared/lib/validations/enums/prisma-types.ts`)

```ts
export const RESERVATION_SERIES_FREQ = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;
export type ReservationSeriesFreqValue =
  (typeof RESERVATION_SERIES_FREQ)[keyof typeof RESERVATION_SERIES_FREQ];
export const RESERVATION_SERIES_FREQ_VALUES = Object.values(
  RESERVATION_SERIES_FREQ,
) as ReservationSeriesFreqValue[];

// TERMS_SCOPE の VALUES に "RESERVATION_SERIES" を追加
export const TERMS_SCOPE = {
  // ... existing
  RESERVATION_SERIES: "RESERVATION_SERIES",
} as const;
```

### 4. Domain layer

#### 4.1 `src/shared/domain/reservations/series-commands.ts` (新規)

**exports**:

```ts
export async function createReservationSeriesCommand(
  input: CreateReservationSeriesInput,
): Promise<{ series: ReservationSeries; instances: Reservation[] }>;
export async function cancelReservationSeriesCommand(input: {
  seriesId: string;
  scope: "this-only" | "this-and-following" | "series-all";
  fromInstanceId?: string;
  cancellationReason?: string;
  cancelledByType: string;
  now: Date;
}): Promise<{ cancelledCount: number; cancelledReservationIds: string[] }>;
```

**createReservationSeriesCommand の実装フロー**:

1. `parseRruleAndValidate(rrule, dtstart, maxInstances)`: rrule.js で parse、`between(dtstart, dtstart+2year, true)` で instance 数計算、`Settings.maxRecurrenceInstances` を超えたら DomainError VALIDATION
2. `prisma.$transaction(async tx => ...)`:
   a. `pg_advisory_xact_lock(728357, hashtext(spaceId + customerId))` で series 単位直列化
   b. `pg_advisory_xact_lock(728351, hashtext(spaceId))` で Space 単位直列化 (既存)
   c. rrule.js で instance dates を展開 (最大 `maxInstances`)
   d. 各 instance の `checkReservationOverlapQuery` を実行、重複あれば DomainError CONFLICT (「N 回目 (YYYY-MM-DD) の時間帯は既に予約されています」)
   e. `TermsAgreement` を series scope で **各 required 文書ごとに 1 行 append** (`resourceId = series.id`)、既存 `recordTermsAgreements` (`src/shared/domain/terms/commands.ts:403-420`) の 1-doc-per-row pattern を継承。3 required 文書なら 3 行 insert。`assertAllRequiredTermsAgreed` の RESERVATION_SERIES scope 実装は §4.3 参照。`agreementSnapshot` (§1 の series field) は series row にも fingerprint を独立に保持 (append-only 契約温存 + query 最適化 SSoT)
   f. `Coupon.usageCount { increment: 1 }` (series 全体で 1 usage、既存 pattern 温存)
   g. `tx.reservationSeries.create({...templateData, rrule, dtstart, instanceCount})`
   h. `tx.reservation.createMany({ data: instances.map(...) })` で N rows 一括 insert (EXCLUDE 制約に依り重複自動拒否、CROSS-TABLE TRIGGER も自動追従)
   i. 各 instance に `seriesId` + `recurrenceInstanceIndex` を紐付け
3. tx 外で `applySeriesCreationSideEffects(seriesId)` を fire-and-forget:
   - GCal outbound: master event 1 個作成 (`event.recurrence: [rrule]`) → 各 instance の childId (`{masterId}_{yyyymmddTHHMMSSZ}`) を各 `Reservation.googleCalendarEventId` に write-back
   - SwitchBot: 各 instance で `issueSmartLockPasscodes(reservation.id)` を逐次 (rate limit 回避)
   - 顧客向けメール: series 作成完了メール 1 通 (「毎週火曜 10 回の予約完了」+ instance 一覧添付 + `.ics` (series iCal REQUEST) 1 個)
   - 管理者通知: 1 通 (「series 予約作成」+ 詳細)
   - AuditLog: series 作成 1 レコード + 各 instance 作成 N レコード (chain 順序保証、sequential)

**cancelReservationSeriesCommand の実装フロー**:

1. scope 分岐:
   - `this-only`: 既存 `applyCancellation(fromInstanceId)` を流用、series の `instanceCount` は減算しない (履歴保持)。**instance 側は `couponId = null` (Codex fix §1 の設計、coupon は series row のみに保持) のため、既存 `applyCancellation` の `coupon.usageCount { decrement: 1 }` (cancel-core.ts:106-110) 経路は自動 skip され、残り instance の割引を保護できる**
   - `this-and-following`: `updateMany({ where: { seriesId, startTime: { gte: from.startTime }, status: { in: CANCELLABLE_STATUSES } } })` + `series.rrule` の UNTIL を `from.startTime - 1min` に更新 (今後 instance の materialize が起きないよう先行 lock、ただし既存 instance は残存)。coupon は series-level のため触らない
   - `series-all`: `updateMany({ where: { seriesId, status: { in: CANCELLABLE_STATUSES } } })` + `series.cancelledAt = now, cancelledByType, cancellationReason` + `series.deletedAt = now, deletedById` (soft-delete) + `tx.coupon.updateMany({ where: { id: series.couponId, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } })` (series 全体キャンセルで初めて 1 usage 戻す)
2. tx 外で `applyBulkCancellationSideEffects(reservationIds: string[])`:
   - 各 id で既存 `applyCancellationSideEffects` を逐次発火 (順序保証、AuditLog chain / Stripe rate limit 回避)
   - GCal 側: `this-only` は既存 `deleteCalendarSync(instanceEventId)`、`this-and-following` は master event を events.patch で新 UNTIL 適用、`series-all` は master event を events.delete で一括削除
   - series 全体キャンセルメール: 1 通に集約 (「series 予約 N 件キャンセル」+ ics CANCEL 1 個)、既存 `sendReservationCancelledEmail` の対応 signature 追加

#### 4.2 `src/shared/domain/reservations/series-rrule.ts` (新規)

**exports**:

```ts
export function parseRruleString(rrule: string, dtstart: Date): RRule; // rrule.js RRule 型
export function expandInstances(
  rrule: string,
  dtstart: Date,
  upTo: Date,
): Date[];
export function countInstances(
  rrule: string,
  dtstart: Date,
  upTo: Date,
): number;
export function validateRruleForSeries(input: {
  rrule: string;
  dtstart: Date;
  duration: number; // minutes
  maxInstances: number;
}):
  | { ok: true; instanceCount: number; instances: Date[] }
  | { ok: false; error: string };
```

- freq は WHITELIST (`DAILY / WEEKLY / MONTHLY` のみ、Zod validation で先制)
- rrule.js の `RRule` 型を直接 export しない (domain layer から library 型 leak 防止、`Date[]` の primitive で境界を切る)

#### 4.3 `src/shared/domain/terms/queries.ts` (拡張)

- `assertAllRequiredTermsAgreed` の scope 引数に `RESERVATION_SERIES` を追加、既存 RESERVATION scope の validation logic を re-use (series-level 1 agreement で全 instance に効く)
- `agreementSnapshot` field を `ReservationSeries` に持たせて created-at fingerprint を append-only 保存

#### 4.4 `src/shared/domain/reservations/cancel-core.ts` (拡張)

- 既存 `applyCancellation(tx, reservation, options)` を bulk 対応:
  ```ts
  export async function applyBulkCancellation(
    tx,
    ids: string[],
    options,
  ): Promise<{ cancelledIds: string[] }>;
  ```
- 内部で `updateMany` を id array で一括、返り値 count / 影響 ids を返す
- coupon usageCount decrement は series 単位で 1 回のみ (series-all scope で `usageCount { decrement: 1 }`、this-only / this-and-following では skip)

#### 4.5 `src/shared/domain/reservations/cancellation-side-effects.ts` (拡張)

- **既存 `CancellationSideEffectInput` に `SideEffectSuppressFlags` を追加** (Codex P2 #3599414659 fix):
  ```ts
  export interface CancellationSideEffectInput {
    // ... existing fields ...
    suppress?: {
      customerEmail?: boolean; // bulk aggregate 通信時に true、per-instance 個別メール抑止
      adminEmail?: boolean;
      gcalDelete?: boolean; // series-all で master event 一括 delete に置換するとき true
    };
  }
  ```
- **既存 `applyCancellationSideEffects` を suppress flag 対応に拡張** (単発予約経路は `suppress` 未指定 = 従前挙動、既存契約温存)
- `applyBulkCancellationSideEffects(input: { reservationIds: string[]; scope: "this-only"|"this-and-following"|"series-all"; ... })` を追加:
  - `for-await` で各 id ごとに `applyCancellationSideEffects` を発火 (Promise.all は AuditLog chain 順序破壊)
  - **`this-only` 以外の scope では `suppress: { customerEmail: true, adminEmail: true, gcalDelete: true }` を全 instance に渡す** — per-instance 個別メール (顧客 N 通 + 管理者 N 通 = 2N 通スパム) と per-instance GCal 削除 API 呼出 (rate limit / master event 再削除 race) を根本抑止
  - Loop 完了後、集約 email + master GCal event 操作を 1 回だけ実行:
    - `this-and-following`: master event `events.patch(masterId, { recurrence: [new-rrule-with-UNTIL] })` 1 回
    - `series-all`: master event `events.delete(masterId)` 1 回
    - 顧客集約メール 1 通 (`bulkReservationCancelledEmailTemplate` 新規、対象 instance 一覧 + ics CANCEL 1 個添付)
    - 管理者集約メール 1 通
    - 集約 AuditLog 1 レコード (chain の末尾に「series bulk cancel: N 件」)
- **`this-only` は既存 `applyCancellation(fromInstanceId)` + suppress 無し** — 単発予約と同じ 1 通メール / 1 GCal delete で完結、bulk 経路を通らない

### 5. iCal 出力改修 (`src/shared/lib/ical/`)

- `buildReservationSeriesCalendar(params)` を新規追加:
  ```ts
  export function buildReservationSeriesCalendar(params: {
    series: { id, rrule, dtstart, duration, ... };
    reservation: Reservation;  // template instance
    method: "REQUEST" | "CANCEL";
    host: string;
  }): ICalCalendar
  ```
- `event.repeating(rrule)` で RRULE を ics に埋込 (`ical-generator@11` API)
- master UID = `reservation-series-${seriesId}@${host}`
- individual instance ics (顧客が「今回のみ」ダウンロード時) は master UID + `event.recurrenceId(originalStart)` を組合わせて特定
- `buildReservationCalendar` (既存 single) はそのまま維持 (series 未使用時の互換)

### 6. Google Calendar sync 改修 (`src/shared/lib/calendar-sync/outbound.ts`)

- `syncReservationSeriesToCalendar(seriesId)` を追加:
  ```ts
  export async function syncReservationSeriesToCalendar(
    seriesId: string,
  ): Promise<CalendarEventResult>;
  ```
- `CalendarEventParams` に `recurrence?: string[]` を追加 (`{ recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=..."] }`)
- `buildEventBody(params, settings, options)` を拡張して `recurrence` field を包含
- master event 作成成功時、`events.instances(masterId)` を fetch して各 childId を series の instances と 1:1 マッピング (dtstart で match)、各 `Reservation.googleCalendarEventId` に childId を write-back (`writeBackInstanceGoogleCalendarEventIds` helper 新設)
- Reservation series update (this-and-following で UNTIL 変更) は `events.patch(masterId, { recurrence: [newRrule] })`
- Reservation series cancel (series-all) は `events.delete(masterId)` で一括削除、write-back 済 childId 経由の個別 delete は不要
- 単発 Reservation の既存 sync 経路 (`syncReservationToCalendar`) は unchanged (`seriesId === null` で分岐、既存契約温存)

### 7. Admin UI 改修 (`src/app/(admin)/admin/(dashboard)/reservations/_components/`)

#### 7.1 `reservation-form-schema.ts` 拡張

- 新規 field:
  ```ts
  isRecurring: booleanFromCheckbox
  recurrence?: {
    freq: "DAILY" | "WEEKLY" | "MONTHLY"
    interval: number  // 1-4 (default 1)
    byday?: ("SU"|"MO"|"TU"|"WE"|"TH"|"FR"|"SA")[]  // WEEKLY のみ、multi-select
    endMode: "count" | "until"
    count?: number  // 1-52 (validation で Settings.maxRecurrenceInstances upper bound)
    until?: string  // YYYY-MM-DD (dtstart 以降)
  }
  ```
- Zod refine: `isRecurring === true` で `recurrence` 必須 + `count` OR `until` のいずれか必須 + `count <= maxInstances`
- `recurrence` を RRULE string に組立てる `buildRruleString({freq, interval, byday, count, until})` helper (`src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts` 新規)

#### 7.2 `ReservationForm.tsx` 拡張

- 「繰返し予約」toggle (Switch component)
- toggle ON → `RecurrenceFields` sub-component 表示:
  - freq RadioGroup (DAILY / WEEKLY / MONTHLY)
  - interval number input (「毎 __ 週」)
  - byday multi-select (WEEKLY のみ、7 曜日 checkbox)
  - endMode RadioGroup (「__ 回で終了」 / 「__ 日まで」)
  - count/until 入力
- **client-side preview**: `useEffect` で rrule.js を dynamic import → `RRule.fromString(rruleString).between(dtstart, dtstart+1yr, true)` で instance dates を計算 → 「毎週火・木、10 回、次回 2026-07-22」を text 表示 + expanded date list を collapsible で表示
- submit action: `createRecurringReservationAction` を新規追加 (既存 `createReservationAction` は unchanged で non-recurring path 継続)

#### 7.3 `calendar/EventCell.tsx` / `EventBadge.tsx` 拡張

- `CalendarEvent` type に `seriesId?: string` と `recurrenceInstanceIndex?: number` を追加
- 表示: `seriesId != null` の event に repeat icon (🔁 or `<RepeatIcon />` from `lucide-react`) + tooltip「series 予約 N 回目 / 全 M 回」
- style: 通常 event と同色、icon のみで区別 (色分けは a11y 的に情報過多)

#### 7.4 admin 予約詳細ページ (`/admin/reservations/[id]`) 拡張

- series 予約なら series 情報 section 追加:
  - 「毎週火/木、10 回」表示
  - 全 instance list (link 付き)
  - 「今回のみ / 今回以降 / 全て」の 3 択キャンセルボタン (backend `cancelReservationSeriesCommand({scope, seriesId, fromInstanceId})` 呼出)

### 8. Public UI 改修

- **繰返し予約作成 UI は含まない** (admin-only、Phase B.2 MVP scope)
- 顧客側の instance 表示 (mypage / calendar-event.ics ダウンロード):
  - `getCustomerReservationDetail(id)` の返却型に `series: { rrule, dtstart, instanceCount, currentIndex } | null` を含める
  - series 予約なら「毎週火曜 10 回のうち 3 回目」を表示
- キャンセル 3 択:
  - `Settings.customerCanCancelSeriesInFull Boolean @default(false)` 新設で「顧客も series-all キャンセルできるか」を制御 (安全側は false = admin のみ)。default false のとき、顧客は `this-only` のみ選択可、series-all は「管理者にご相談ください」文言
  - true のときは admin 同様の 3 択を露出

### 9. Cron 対応

- `/api/cron/pending-reservation-expire` (既存): series の各 instance も個別に expire 判定 (既存経路そのまま)
- `/api/cron/data-retention` (既存): series soft-delete → cascade で instances も deletedAt 継承 (既存 pattern)

### 10. Feature module gate

- Phase B.2 は既存 `reservation` feature module に依存 (新規 module 追加なし)
- `reservation` feature module OFF の環境では admin 「繰返し」toggle も自動的に非表示 (既存 gate 継承)

## テスト戦略

### unit test

- `__tests__/unit/domain/reservations/series-rrule.test.ts`: `parseRruleString` / `expandInstances` / `validateRruleForSeries` の RRULE 3 freq × 各 case (count 上限違反、UNTIL 無効、freq WHITELIST 外) を全パターン
- `__tests__/unit/domain/reservations/series-commands.test.ts`: `createReservationSeriesCommand` の overlap 検出 / TermsAgreement snapshot / coupon usage 加算 / instance materialize 数
- `__tests__/unit/domain/reservations/cancel-series.test.ts`: 3 scope 各々の `updateMany` where clause + AuditLog 順序
- `__tests__/unit/lib/ical/series.test.ts`: `buildReservationSeriesCalendar` の RRULE / master UID / RECURRENCE-ID 出力
- `__tests__/unit/architecture-boundaries.test.ts`: `rrule` npm package の import が domain 層のみ (app 層で直接触れないこと) を gate 追加

### integration test (real DB)

- `__tests__/integration/domain/reservations/series-overlap.test.ts`: series 作成時 EXCLUDE 制約が各 instance で機能、CROSS-TABLE TRIGGER で Event slot と重複時 error
- `__tests__/integration/domain/reservations/series-cancel-scopes.test.ts`: 3 scope で `updateMany` claim + coupon usage decrement (series-all のみ) + advisory lock 728357 直列化
- `__tests__/integration/lib/calendar-sync/series-outbound.test.ts`: mock GCal API に対して master event 作成 → `events.instances` mock 応答から childId を write-back する end-to-end

### E2E (Playwright)

- `e2e/authenticated/admin/create-recurring-reservation.spec.ts`: admin form で「毎週火/木、10 回」を入力 → preview 確認 → submit → 10 instance が calendar view に表示 → 3 択キャンセル (series-all) → 全 10 instance が CANCELLED 表示

### architecture-boundaries

- `rrule` package の import 制限 gate: `src/shared/domain/reservations/` および `src/app/(admin)/admin/(dashboard)/reservations/_components/rrule-utils.ts` のみ許可、他 file は禁止
- `RRule` 型が domain export に leak しないこと (Date[] / string で境界を切る) の gate

## リスク & 未解決事項

### risk-1: Instance 一括 insert 時の EXCLUDE 制約 CONFLICT

**影響**: `createMany({ data: instances })` で 26 rows 一括 insert 中、1 instance でも重複あれば全体 rollback。エラー message が「N 回目が重複」と特定できないと admin UX 悪化。

**対策**:

- tx 内で先制的に各 instance の `checkReservationOverlapQuery` を実行、重複 index を検出して「N 回目 (YYYY-MM-DD) の時間帯は既に予約されています」の specific error を返す (createMany 実行前 gate)
- CROSS-TABLE TRIGGER (Event slot との重複) も同型 check を追加、事前 detection

### risk-2: rrule.js の RFC 5545 準拠限定

**影響**: `rrule@2.8` は RFC 5545 の RRULE 属性のうち `BYWEEKNO` (year 内 week 番号) と `BYYEARDAY` を部分実装。本 phase では `FREQ=DAILY/WEEKLY/MONTHLY` + `BYDAY` + `INTERVAL` + `COUNT/UNTIL` のみ許可なので該当なしだが、将来 phase で BYWEEKNO を使う場合は library alternative 検討要。

**対策**: freq WHITELIST + Zod validation で BYWEEKNO/BYYEARDAY を先制拒否。実装 test で `rrule.js` の対応範囲を pin。

### risk-3: GCal `event.recurrence[]` の validation ずれ

**影響**: `event.recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260901T000000Z"]` を GCal API に投げる際、UNTIL の TZ 表現 (末尾 Z 必須) や BYDAY の表記 (SU/MO/TU) が rrule.js の toString と微妙にずれる可能性。

**対策**: rrule.js の `RRule.toString()` 出力を直接 GCal に渡すのではなく、`buildGcalRecurrenceString(rrule, dtstart)` helper を新設して UNTIL の UTC 変換 + BYDAY 正規化を明示的に行う。unit test で GCal 公式 doc の例文 5 パターンとの一致を pin。

### risk-4: SwitchBot API rate limit for per-instance passcode

**影響**: series 26 instance = 26 回の `createPasscode` API call。SwitchBot Cloud API の rate limit (documented: 10 req/sec、undocumented burst あり) に触れる可能性。

**対策**:

- `applySeriesCreationSideEffects` 内で SwitchBot 呼出を逐次化 (`for-await`)、100ms 遅延を挟む
- API 失敗時は該当 instance の passcode を PENDING 状態で保存、cron `switchbot-passcode-retry` (既存) が自動 retry

### risk-5: Stripe 支払 UX の series 対応不足

**影響**: 顧客が admin 経由で作成された series 予約を支払う際、現状の checkout 経路は 1 予約 = 1 session。26 instance = 26 session を順次案内するのは UX 悪。

**対策**:

- Phase B.2 では **admin が予約作成時に status を CONFIRMED + paymentStatus を後払い運用** で回避 (現状 admin 経由の予約はこの pattern が主流)
- 顧客 self-pay UI で series を扱うのは Phase B.2.1 で Stripe Payment Links の一括生成 (Stripe API `PaymentLinks.create({ line_items: [{ price, quantity: 26 }] })`) を検討 (本 phase の scope 外)

### risk-6: iCal `.repeating(rrule)` の recipient client 互換

**影響**: 一部の古い calendar client (Outlook 2016 以前) は RRULE を正しく展開できず、単発 event として表示する既知の互換問題。

**対策**: `buildReservationSeriesCalendar` の出力に加え、series 作成完了メールには「instance 一覧」を本文に列挙して RRULE 非対応 client でも情報を失わない。iCal は auxiliary、メール本文が primary。

## PR 分割案

Phase B.2 全体を **6 PR** で分割 (Phase B.1 の 2 PR より多い、scope 大のため段階的品質確保優先):

### PR 1: schema + migration + enum SSoT + Settings

- prisma/schema.prisma に `ReservationSeries` model + `Reservation.seriesId/recurrenceInstanceIndex` + `Settings.maxRecurrenceInstances` + `ReservationSeriesFreq` / `TermsScope.RESERVATION_SERIES`
- 新規 migration file (add-only、非破壊)
- `prisma-types.ts` に SSoT + `TERMS_SCOPE.RESERVATION_SERIES`
- unit test (enum SSoT / architecture-boundaries gate 追加)
- **見積り**: 6-8 file、200-300 行

### PR 2: `rrule` install + series-rrule.ts + series validation

- `bun add rrule@2.8+`
- `series-rrule.ts` (`parseRruleString` / `expandInstances` / `validateRruleForSeries`)
- unit test (RRULE 3 freq × 各 case)
- **見積り**: 4-5 file、200-300 行

### PR 3: series-commands.ts (create + cancel) + cancel-core bulk 拡張

- `series-commands.ts` (`createReservationSeriesCommand` / `cancelReservationSeriesCommand`)
- `cancel-core.ts` に `applyBulkCancellation` 追加
- `cancellation-side-effects.ts` に `applyBulkCancellationSideEffects` 追加
- terms/queries.ts に RESERVATION_SERIES scope 実装
- integration test (real DB overlap / cancel scope / advisory lock)
- **見積り**: 10-12 file、400-600 行

### PR 4: iCal + GCal outbound 拡張

- `buildReservationSeriesCalendar` 新規
- `CalendarEventParams` に `recurrence` 追加、`buildEventBody` 拡張
- `syncReservationSeriesToCalendar` + `writeBackInstanceGoogleCalendarEventIds`
- unit + integration test (mocked GCal)
- **見積り**: 8-10 file、300-400 行

### PR 5: Admin UI (form + calendar view + detail page)

- `ReservationForm.tsx` に「繰返し」toggle + `RecurrenceFields` sub-component + client-side preview
- `reservation-form-schema.ts` に isRecurring / recurrence field
- calendar `EventCell.tsx` / `EventBadge.tsx` に repeat icon
- admin 予約詳細ページに series section + 3 択キャンセルボタン
- `createRecurringReservationAction` + `cancelReservationSeriesAction`
- **見積り**: 12-15 file、500-700 行

### PR 6: Public UI (customer-side series 表示) + E2E + docs

- mypage / customer reservation detail に series 情報表示
- `Settings.customerCanCancelSeriesInFull` を admin settings に追加
- 顧客キャンセル UI で 3 択 (Settings で制御)
- E2E: admin create recurring → 10 instance → cancel series-all の golden path
- **見積り**: 8-10 file、300-400 行

**合計**: 48-60 file、1900-2700 行、6 PR

**PR merge 順序**: 1 → 2 → 3 → 4 → 5 → 6 (dependency 順、各 PR で単体 CI green + E2E smoke pass 必須)。

## Rollout

1. **PR 1 merge** → main → 自動 deploy (add-only migration、無停止)
2. **PR 2 merge** → 依存 install 完了
3. **PR 3 merge** → domain layer 完了、本番の admin API で series command が enable (ただし UI 経路無しで直接呼出は困難、安全)
4. **PR 4 merge** → iCal / GCal 経路完了
5. **PR 5 merge** → admin UI 公開、本番で管理者が series 予約作成可能に
6. **PR 6 merge** → 顧客側 UI 完成、Phase B.2 完了
7. **本番検証**: admin で weekly × 4 回の series 予約作成 → 4 instance が calendar 表示 → this-only / series-all の 3 択キャンセル動作確認 → GCal 側 master event + childId write-back を Cloud Logging で verify
8. **Settings.customerCanCancelSeriesInFull を true 化**する運用判断 (顧客の series-all キャンセル自主権限)

## 完了後の Phase B.2.1 候補 (本 phase 範囲外、将来提案)

- **RECURRENCE-ID override**: series 中の 1 instance のみ時刻変更 (Google Calendar の "この予定のみ編集")
- **Customer self-service series creation**: 顧客が admin 権限なしで繰返し予約を作成する UI
- **Stripe Payment Links / Subscription mode**: series を 1 支払 or 定期支払で扱う
- **YEARLY freq / custom BYSETPOS**: 「毎月第 2 火曜」等の advanced RRULE
- **Series template preset**: admin が「毎週レッスン」等の template を保存して 1 click で series 作成
- **Series 分割 / 合併 UI**: admin が既存 series を任意 date で split / 2 series を merge
