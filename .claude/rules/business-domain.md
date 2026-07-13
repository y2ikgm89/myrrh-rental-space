---
paths:
  [
    "src/shared/domain/reservations/**",
    "src/shared/domain/events/**",
    "src/shared/domain/coupons/**",
    "src/shared/domain/terms/**",
    "src/shared/lib/date-format.ts",
    "src/shared/lib/pricing/**",
  ]
---

# 予約・イベント・ビジネス不変条件

## 予約の同時実行制御（最重要）

- 空き確認は read-before-write のため、可用性に影響する**全書込経路**は
  `prisma.$transaction` 内で `lockSpaceForTransaction(tx, spaceId)` を
  overlap チェック・書込より先に取得する（`src/shared/domain/reservations/space-locks.ts`）。
  Reservation と Event (EventTimeSlot) の書込は同一 Space namespace (728351) を共有する
- 重複判定の SSoT は `checkReservationOverlapQuery`: deletedAt null +
  status ∈ {PENDING, CONFIRMED} + **半開区間 `startTime < end AND endTime > start`**。
  lt/gt を lte/gte に変えると隣接予約が誤検出になる（テストが where 句を pin）

## イベント定員（TOCTOU 防止）

- 申込 create は interactive tx 冒頭で `pg_advisory_xact_lock(728350, hashtext(eventId))`、
  残枠は **CONFIRMED 申込の quantity 合計**のみで判定
- tx 内のクエリは逐次 await（理由は db-domain ルールの「トランザクション」参照）

## Waitlist FIFO promote

- 満員時の申込は `status: WAITLISTED` で create。`waitlistedAt` を tx 内 `now` で設定
  (FIFO 用の ordering key)
- 誰かがキャンセルすると `applyEventRegistrationCancellation` 完了直後に同一 tx 内で
  `offerNextWaitlistEntryCommand(tx, {slotId, ticketId, now})` が呼ばれ、同じ
  (slotId, ticketId) の WAITLISTED を `waitlistedAt ASC LIMIT 1` で選定して
  updateMany WHERE claim で `WAITLISTED_OFFERED` に昇格 + `offeredAt = now`,
  `expiresAt = now + 24h` を設定する。**別 tx で呼ぶと race する** ため必ず tx 内
- cron `/api/cron/waitlist-expire` は hourly に `status: WAITLISTED_OFFERED AND expiresAt < now`
  を updateMany claim で `EXPIRED` に、その後 event 単位で 728354 session lock を握って
  空いた枠に次の WAITLISTED を再度 promote する。**session lock は commit で自動解放
  されない** ため release を finally で必ず呼ぶ
- WAITLISTED_OFFERED 中の quantity 変更は禁止 (`updateMany` の WHERE で status で claim 済み
  のため意味的に不整合)、変更したい場合は「キャンセル → 再 waitlist 登録」を促す

## 二重副作用防止 = 「updateMany の WHERE で claim」パターン

キャンセル（status ∈ CANCELLABLE）/ 決済確定（paymentStatus ∈ {UNPAID, PENDING}）/
リマインダー（reminderSentAt: null、失敗時 release）はすべて claim の count で
メール送信・クーポン戻し等の副作用を gate する。count=0 なら skip。
クーポン usageCount の decrement（`gt: 0` ガード付き）は claim 成功後の同一 tx 内。
この構造を tx 外に切り出さない。

## 臨時休業（BlockedDate）

- GLOBAL / LOCATION / SPACE の 3 階層 **additive** cascade（override なし）
- `ensureDateNotBlocked` は公開予約経路のみ（tx 外プリチェック + tx 内の 2 回）。
  **admin 経路は override 許容のため意図的に呼ばない**。安易に足さない・削らない

## 日付・時刻（JST 規約）

- `@db.Date` 列は「JST カレンダー日付を UTC 深夜で保持」。変換は
  `parseJstDateOnly` / `formatJstDateOnly`、時刻付き UTC → JST 日付は `formatJstDateString`
- 表示は `src/shared/lib/date-format.ts` の `timeZone: "Asia/Tokyo"` 固定 formatter のみ。
  date-fns `format()` 直呼びはサーバー UTC で 9 時間ずれる silent bug
- datetime-local 入力の JST 固定 parse は `parseDateTimeLocalAsJst`（+09:00 付与）。
  `new Date(\`${date}T${time}:00\`)` は server-local parse なので規約を混在させない

## 税・規約同意・DB 制約

- 税計算は経路で単位（% vs 割合）と丸め（round vs floor)が異なる。
  税関連の変更時は単位・丸め・書込経路の有無を必ず突合する
- 必須規約同意が `assertAllRequiredTermsAgreed` で **server-side 強制**されるのは
  RESERVATION / INQUIRY / EVENT_REGISTRATION の 3 経路（client gate のみは禁止）。
  LOGIN_SIGNUP は署名 cookie 経由の同意証跡記録のみでこの gate を通らない
- イベント/BlockedDate の CHECK 制約・DEFERRABLE trigger は baseline migration にのみ
  存在する手書き不変条件（Prisma DSL で表現不能）。migration 作業時に保全する
