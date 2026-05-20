# EventTicket Clean Break Implementation Plan

> **Goal**: Migrate from `Event.price` (single price) to `EventTicket` model (multiple ticket types, Peatix / Eventbrite 流). Break backward compatibility cleanly.

## Status

- **Created**: 2026-05-21
- **Branch**: `docs/event-tickets-clean-break-plan` (this plan PR)
- **Implementation branch**: TBD (next session)
- **Estimated effort**: 11-17 hours (multi-session via subagent-driven-development)

## Background

User requested support for "4 人で 5,000 円" pricing (group tickets). Initial discussion explored:

- **A**: `pricePerUnit` column on Event — minimal, half day, but limited to single price/unit
- **C (selected)**: `EventTicket` model with multiple ticket types — Peatix / Eventbrite 流, supports individual / pair / group / early-bird / student pricing

User chose **C** with breaking changes acceptable. First implementation session (2026-05-21) completed Phase 1 (schema + migration) but exhausted context budget at ~30+ type errors across 10+ files in Phase 2. **All changes reverted** to clean state before this plan was finalized.

## Schema Design

```prisma
model Event {
  // REMOVED: price Int?
  capacity Int?  // event 全体上限を維持

  tickets       EventTicket[]
  registrations EventRegistration[]
  // ... other fields unchanged
}

model EventTicket {
  id          String   @id @default(cuid()) @db.VarChar(30)
  eventId     String   @db.VarChar(30)
  name        String   @db.VarChar(100)   // "一般" / "ペア" / "グループ4名"
  description String?  @db.VarChar(500)
  price       Int                          // 0 = 無料、税込
  capacity    Int?                         // null = event 全体 capacity に従う
  unitSize    Int      @default(1)         // 1 ticket = 何名
  sortOrder   Int      @default(0)
  isAvailable Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  event         Event               @relation(fields: [eventId], references: [id], onDelete: Cascade)
  registrations EventRegistration[]

  @@index([eventId, sortOrder])
  @@index([eventId, isAvailable])
  @@map("event_tickets")
}

model EventRegistration {
  // RENAMED: numberOfPeople → quantity
  // ADDED:   ticketId (required FK to EventTicket)
  ticketId String @db.VarChar(30)
  quantity Int    @default(1)
  ticket   EventTicket @relation(fields: [ticketId], references: [id], onDelete: Restrict)
  // ... other fields unchanged
}
```

## Migration Strategy (data-preserving)

```sql
-- Step 1: event_tickets table creation
CREATE TABLE "event_tickets" (...);
CREATE INDEX ...;
ALTER TABLE "event_tickets" ADD CONSTRAINT ... FOREIGN KEY ...;

-- Step 2: existing Event.price → 1 "一般" ticket per event
INSERT INTO "event_tickets" (id, eventId, name, price, unitSize, ...)
SELECT 'tk' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 28),
       id, '一般', COALESCE(price, 0), 1, 0, true, NOW(), NOW()
FROM "events" WHERE "deletedAt" IS NULL;

-- Step 3: EventRegistration ticketId + quantity
ALTER TABLE "event_registrations" ADD COLUMN "ticketId" VARCHAR(30);
ALTER TABLE "event_registrations" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
UPDATE "event_registrations" SET "quantity" = "numberOfPeople";

-- Step 4: ticketId backfill (first ticket of each event)
UPDATE "event_registrations" er SET "ticketId" = t."id"
FROM (SELECT DISTINCT ON ("eventId") "id", "eventId" FROM "event_tickets"
      ORDER BY "eventId", "sortOrder" ASC, "createdAt" ASC) t
WHERE er."eventId" = t."eventId";

DELETE FROM "event_registrations" WHERE "ticketId" IS NULL;
ALTER TABLE "event_registrations" ALTER COLUMN "ticketId" SET NOT NULL;
ALTER TABLE "event_registrations" ADD CONSTRAINT ... FOREIGN KEY ...;

-- Step 5: drop old columns
ALTER TABLE "event_registrations" DROP COLUMN "numberOfPeople";
ALTER TABLE "events" DROP COLUMN "price";
```

## Phase Breakdown

### Phase 1: Schema + Migration (1-2h) ✅ verified feasible (PoC completed and reverted)

- `prisma/schema.prisma`: Event.price 削除 + EventTicket model 新規 + EventRegistration.ticketId/quantity 追加
- Hand-written migration SQL with data-preserving INSERT/UPDATE
- `bunx --bun prisma db execute --file ...` + `migrate resolve --applied`

### Phase 2: Domain layer (2-3h)

- `src/shared/domain/events/commands.ts`: `EventTicketInput[]` を `EventCommandInput` に追加、create/update/duplicate で transaction 化（ticket diff: upsert + restrict 削除）
- `src/shared/domain/events/public-queries.ts` + `admin-queries.ts`: select の `price: true` 削除、`tickets: { where, select, orderBy: { sortOrder: "asc" as const } }` を include
- `src/shared/domain/events/registration-commands.ts`: `ticketId` 必須化、capacity check は event capacity + ticket capacity の min
- `src/shared/domain/events/registration-queries.ts`: `_sum.quantity` に migrate
- `src/shared/domain/events/export-queries.ts`: numberOfPeople → quantity

### Phase 3: Zod schemas (1-2h)

- `src/shared/lib/validations/event-registration.ts`: `numberOfPeople` → `quantity`、`ticketId: z.string()` 追加
- `src/app/(admin)/admin/(dashboard)/events/_components/event-form-schema.ts`: `price` 削除、`tickets: z.array(...)` 追加（FormData transit 用 `z.preprocess` で JSON.parse）

### Phase 4: Admin UI — EventTicketEditor (2-3h)

- `src/app/(admin)/admin/(dashboard)/events/_components/EventTicketEditor.tsx` 新規: dnd-kit master-detail master-detail editor、TicketRow ごとに name / description / price / capacity / unitSize / isAvailable 編集
- `EventForm.tsx`: `<EventTicketEditor value={tickets} onChange={setTickets} />` + `<input type="hidden" name="tickets" value={JSON.stringify(tickets)} />`
- `event-form-fields-types.ts` の `EventFormValues` を更新

### Phase 5: Server Actions (1h)

- `src/app/(admin)/admin/(dashboard)/_shared/actions/event.ts`: `buildEventCommandInput` で tickets array を `EventTicketInput[]` に変換 (id undefined を omitUndefined で drop)
- `omitUndefined` の戻り型と `EventCommandInput.tickets: readonly EventTicketInput[]` の `exactOptionalPropertyTypes` 互換確保

### Phase 6: 公開 UI — TicketSelector + EventInfoPanel (2-3h)

- `src/app/(public)/events/[slug]/_components/event-info-panel.tsx`: `price` prop 削除、`tickets` prop 追加、`TicketList` component で 1 ticket は inline 表示 / 複数 ticket は list 表示 (name + price + unit suffix)
- `src/app/(public)/events/[slug]/page.tsx`: `event.price` → `event.tickets`、EventJsonLd の offers を per-ticket array 化 (or 最小 ticket price)
- `src/app/(public)/events/[slug]/_components/related-events.tsx`: `event.price` 表示を `event.tickets[0]?.price` に
- `src/app/(public)/_shared/components/sections/section-renderer.tsx`: 同上
- `src/app/(public)/events/[slug]/_components/event-registration-form.tsx`: ticket selector UI 追加（select / radio）

### Phase 7: EventRegistrationForm 改造 (2-3h)

- `EventRegistrationForm.tsx`: ticket selector + quantity 入力（1 ticket = unitSize 名）、合計人数表示
- `src/app/(public)/_shared/actions/event-registration.ts`: `ticketId` を必須として受信、capacity check 連動
- `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts`: 同上、type 修正
- mypage の `event-registration-list.tsx`: `numberOfPeople` → `quantity`

### Phase 8: Email / iCal / JSON-LD / CSV (1-2h)

- `src/shared/lib/email/event-emails.ts`: `numberOfPeople` → `quantity`、ticket 名を明示
- `src/shared/emails/event-registration-confirmation.tsx` + `event-admin-notification.tsx`: 同上
- `src/shared/lib/ical/index.ts` + `types.ts`: `numberOfPeople` → `quantity`、`参加人数: N 名` → `チケット: <name> × <quantity> 枚`
- `EventJsonLd` の `offers`: per-ticket 配列化 (`PriceSpecification` 配列)
- `src/app/api/admin/export/event-registrations/route.ts`: ticket name 列追加

### Phase 9: Seed / Test (1-2h)

- `prisma/seed.ts`: sample event 作成時に tickets create を nested transaction で
- 関連 unit / integration test fixture を `numberOfPeople` → `quantity` + `ticketId` 必須に修正
- E2E: ticket selector を含む申込フロー検証

## Implementation Notes

### Type System Pitfalls

1. **`omitUndefined` + `exactOptionalPropertyTypes` + `readonly EventTicketInput[]`**: `EventTicketInput.id?` が `string | undefined` のまま渡ると invariance で fail。明示マップ: `tickets.map(t => t.id !== undefined ? { id: t.id, ...rest } : { ...rest })`

2. **Prisma select の `orderBy: { sortOrder: "asc" }`**: `"asc"` literal は `SortOrder` enum へ narrow されない。`as const` 必須

3. **`numberOfPeople` → `quantity` 全変換**: 13 files in src/ + 1 in prisma/seed.ts (実証済み、`replace` で安全)

### Subagent Dispatch 戦略

各 Phase を独立 implementer に dispatch 可能:

- **Phase 1**: schema editor（small, 1 file）
- **Phase 2-3**: domain + zod editor（medium, 8-10 files）
- **Phase 4**: admin UI editor（medium, 3-4 files、dnd-kit 含む）
- **Phase 5**: server action editor（small, 2 files）
- **Phase 6-7**: public UI editor（large, 6-8 files）
- **Phase 8-9**: email/iCal/seed/test editor（medium, 8-10 files）

各 Phase 完了で `bun run type-check` pass を gate にする。

### Risk Assessment

- **Cloud Run deploy 影響**: schema change には migrate Job 実行が必要（cloudbuild.yaml）。production data の price → ticket 変換は本 SQL で data-preserving
- **既存 dev DB drift**: 他開発者が並行で event 関連を触る場合は merge conflict 高確率。先に main で実装し、他作業は branch off で隔離
- **テストカバレッジ**: registration capacity check は ticket 単位 + event 全体の min check → 既存 unit test の overlap 検出を見直し
- **Cache invalidation**: `invalidateEventCaches` に ticket 関連を追加（per-event tag のみで OK、ticket は event 配下）

## Out of Scope (future PR)

- Ticket-specific availability windows (early-bird 期間限定)
- Ticket-specific discount codes (coupon system 連携)
- Ticket 在庫の atomic claim (Stripe webhook 連携時)
- Per-ticket gallery / images
- Ticket transfer / refund operations
