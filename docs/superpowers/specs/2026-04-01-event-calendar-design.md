# イベントカレンダー機能 設計書

## 概要

レンタルスペースで開催されるイベント（ワークショップ、セミナー等）を告知・集客するためのイベントカレンダー機能。管理画面でのイベント管理 + Google Calendar からの取り込み（設定トグル）のハイブリッド構成。

## 要件

- 管理画面でイベントの CRUD（タイトル・日時・場所・定員・料金・説明・画像）
- Google Calendar からのイベント取り込み（設定でオン/オフ切替）
- 公開カレンダーページ（月間/週間/リスト 3モード切替）
- イベント詳細ページ（`/events/[slug]`）
- カレンダー上クリックでモーダル概要表示 → 「詳細を見る」で詳細ページへ
- 簡易申込機能（名前・メール・電話・人数・備考）
- 定員管理（残枠リアルタイム計算、満員時フォーム非表示）
- 顧客・管理者双方から申込/キャンセル操作可能
- キャンセル時に残枠自動復活
- メール自動送信（申込確認・キャンセル確認・管理者通知・イベント中止通知・変更通知）
- マイページから自分の申込一覧確認・キャンセル

## フェーズ分割

| Phase   | 内容                                                                         | 依存    |
| ------- | ---------------------------------------------------------------------------- | ------- |
| Phase 1 | Event モデル + 管理画面 CRUD + 公開カレンダーページ + 詳細ページ（告知のみ） | なし    |
| Phase 2 | EventRegistration + 申込フォーム + 参加者管理 + メール通知 + マイページ      | Phase 1 |
| Phase 3 | Google Calendar 取り込み連携（設定トグル）                                   | Phase 1 |

---

## データモデル

### Enum 定義

```prisma
enum EventStatus {
  DRAFT
  PUBLISHED
  CANCELLED
  ARCHIVED
}

enum RegistrationStatus {
  CONFIRMED
  CANCELLED
}
```

### Event モデル

```prisma
model Event {
  id                    String              @id @default(cuid()) @db.VarChar(21)
  title                 String              @db.VarChar(200)
  slug                  String              @unique @db.VarChar(100)
  description           String?             @db.Text
  contentJson           Json?               // Lexical リッチテキスト
  thumbnailUrl          String?
  startTime             DateTime
  endTime               DateTime
  capacity              Int?                // null = 無制限
  price                 Int?                // null = 無料（円単位）
  location              String?             @db.VarChar(200)
  spaceId               String?             @db.VarChar(21)
  status                EventStatus         @default(DRAFT)
  registrationOpen      Boolean             @default(true)
  googleCalendarEventId String?             @unique
  publishedAt           DateTime?
  deletedAt             DateTime?
  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt

  // Relations
  space                 Space?              @relation(fields: [spaceId], references: [id], onDelete: SetNull)
  registrations         EventRegistration[]

  @@index([startTime, endTime])
  @@index([status])
  @@index([spaceId])
  @@index([deletedAt])
  @@map("events")
}
```

### EventRegistration モデル

```prisma
model EventRegistration {
  id              String             @id @default(cuid()) @db.VarChar(21)
  eventId         String             @db.VarChar(21)
  name            String             @db.VarChar(100)
  email           String             @db.VarChar(255)
  phone           String?            @db.VarChar(20)
  note            String?            @db.Text
  numberOfPeople  Int                @default(1)
  status          RegistrationStatus @default(CONFIRMED)
  customerId      String?            @db.VarChar(21)
  cancelledAt     DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  // Relations
  event           Event              @relation(fields: [eventId], references: [id], onDelete: Cascade)
  customer        Customer?          @relation(fields: [customerId], references: [id], onDelete: SetNull)

  @@index([eventId])
  @@index([customerId])
  @@index([status])
  @@map("event_registrations")
}
```

### 既存モデル変更

- **Space**: `events Event[]` リレーション追加
- **Customer**: `eventRegistrations EventRegistration[]` リレーション追加

### 残枠計算ロジック

```
remainingCapacity = event.capacity - SUM(registrations.numberOfPeople WHERE status = CONFIRMED)
```

- `capacity` が null → 無制限（残枠表示なし）
- 残枠 <= 0 → 申込フォーム非表示 + 「満員」Badge 表示
- キャンセル（status → CANCELLED）→ active カウント減少 → 枠自動復活

### ソフトデリート

- Event: `deletedAt` フィールドあり。全クエリに `deletedAt: null` 必須（gotchas.md 準拠）
- EventRegistration: ソフトデリートなし。status: CANCELLED + cancelledAt で管理

---

## RBAC（権限）

### Resource 追加

```typescript
// permissions.ts の Resource 型に追加
| "event"
```

### ロール別権限

```
SUPER_ADMIN: event:create, event:read, event:update, event:delete, event:publish
ADMIN:       event:create, event:read, event:update, event:delete, event:publish
EDITOR:      event:read, event:update
VIEWER:      event:read
```

---

## キャッシュ戦略

### CACHE_TAGS 追加

```typescript
EVENTS: "events",
EVENT_REGISTRATIONS: "event-registrations",
```

### getCacheTag 追加

```typescript
events: {
  list: () => CACHE_TAGS.EVENTS,
  detail: (id: string) => `${CACHE_TAGS.EVENTS}-${id}`,
  slug: (slug: string) => `${CACHE_TAGS.EVENTS}-slug-${slug}`,
},
eventRegistrations: {
  list: (eventId: string) => `${CACHE_TAGS.EVENT_REGISTRATIONS}-${eventId}`,
},
```

### 無効化マトリクス

| 操作                   | 無効化タグ                                             |
| ---------------------- | ------------------------------------------------------ |
| イベント作成/更新/削除 | `EVENTS` + `events-${id}` + `events-slug-${slug}`      |
| イベント公開           | 同上                                                   |
| イベント中止           | 同上 + 全参加者へメール                                |
| 申込/キャンセル        | `event-registrations-${eventId}` + `events-${eventId}` |

---

## Server Actions

### 管理画面（executeAdminMutationResult パターン）

```
_shared/actions/event.ts
  - createEvent: Zod → executeAdminMutationResult → slug生成(generateSlug) → DB作成 → updateTag → メール(afterSuccess)
  - updateEvent: Zod → executeAdminMutationResult → DB更新 → updateTag
  - deleteEvent: executeAdminMutationResult → ソフトデリート(deletedAt設定) → updateTag
  - publishEvent: executeAdminMutationResult → status=PUBLISHED, publishedAt設定 → updateTag
  - cancelEvent: executeAdminMutationResult → status=CANCELLED → updateTag → 全参加者へ中止メール

_shared/actions/event-registration.ts
  - getEventRegistrations: イベント別参加者一覧（管理画面用）
  - adminCreateRegistration: 管理者による手動申込登録
  - adminCancelRegistration: 管理者によるキャンセル → updateTag → メール
```

### 公開 Server Actions（セキュリティ多層防御）

```
(public)/_shared/actions/event.ts
  - registerForEvent:
    1. checkActionRateLimit(formSubmitRateLimiter)
    2. Zod safeParse
    3. validateTurnstile
    4. 残枠チェック（capacity - SUM(CONFIRMED numberOfPeople)）
    5. DB書き込み + Customer自動紐づけ（ensureCustomerLinked パターン）
    6. fireAndForget: 確認メール（参加者 + 管理者）
    7. updateTag(EVENTS + EVENT_REGISTRATIONS)

  - cancelRegistration（マイページ経由）:
    1. checkActionRateLimit(formSubmitRateLimiter)
    2. getSession + getCustomerByUserId（認証）
    3. 所有権チェック（registration.customerId === customer.id）
    4. status → CANCELLED, cancelledAt設定
    5. fireAndForget: キャンセル確認メール
    6. updateTag
```

### 公開クエリ（'use cache' パターン）

```
src/shared/domain/events/public-queries.ts
  - getPublishedEvents: 'use cache' + cacheLife(PUBLIC_CONTENT) + cacheTag(EVENTS) + safeFetch + toPlainArray
  - getPublishedEventBySlug: 'use cache' + cacheTag(EVENTS, events.slug) + safeFetch + toPlainObject
  - getEventRegistrationCount: 'use cache' + cacheTag(eventRegistrations.list) + safeFetch
```

---

## 公開ページ

### ルーティング

```
src/app/(public)/events/
├── page.tsx              — カレンダーページ（PPR: 静的シェル + Suspense）
├── loading.tsx           — SectionSkeleton ベース
└── [slug]/
    ├── page.tsx          — イベント詳細（SC + 申込フォーム CC）
    └── loading.tsx
```

### カレンダー UI

**@fullcalendar/react** を採用。

パッケージ: `@fullcalendar/core` + `@fullcalendar/react` + `@fullcalendar/daygrid`（月） + `@fullcalendar/timegrid`（週） + `@fullcalendar/list`（リスト） + `@fullcalendar/interaction`（クリック）

理由:

- React 19 対応済み、2026-03 最終リリース（活発メンテナンス）
- 月/週/日/リスト全ビュー対応
- プラグインアーキテクチャで必要分のみ追加
- npm 週 100 万 DL+、実績十分

### PPR + Suspense 設計

```tsx
// events/page.tsx — Server Component
export default async function EventsPage() {
  return (
    <main id="main-content">
      <PageHero title="イベントカレンダー" description="..." />
      <Container>
        <Suspense fallback={<CalendarSkeleton />}>
          <EventCalendarLoader />
        </Suspense>
      </Container>
    </main>
  );
}

// EventCalendarLoader — Server Component（データ取得）
async function EventCalendarLoader() {
  const events = await getPublishedEvents();
  return <EventCalendar events={events} />;
}
```

### コンポーネント構成

```
(public)/_shared/components/
├── event-calendar/
│   ├── EventCalendar.tsx          — 'use client' FullCalendar ラッパー（月/週/リスト切替）
│   ├── EventModal.tsx             — 'use client' Dialog（Design System）で概要表示
│   └── CalendarSkeleton.tsx       — Server Component（Suspense fallback）
├── event-detail/
│   ├── EventInfo.tsx              — Server Component（Prose + Stack + Badge）
│   ├── EventCapacityBadge.tsx     — Server Component（残枠表示）
│   └── EventRegistrationForm.tsx  — 'use client'（Turnstile + Zod）
```

### 詳細ページ

```tsx
// [slug]/page.tsx
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);
  if (!event) return { title: "イベントが見つかりません" };
  return { title: event.title };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);
  if (!event) notFound();

  return (
    <main id="main-content">
      <Container>
        <Stack gap="lg">
          <EventInfo event={event} />
          <EventCapacityBadge
            capacity={event.capacity}
            registeredCount={event._count.registrations}
          />
          {event.registrationOpen && event.status === "PUBLISHED" ? (
            <Suspense fallback={<FormSkeleton />}>
              <EventRegistrationForm eventId={event.id} />
            </Suspense>
          ) : (
            <div role="alert">受付終了</div>
          )}
        </Stack>
      </Container>
    </main>
  );
}
```

### モーダル表示

カレンダー上のイベントクリック → Dialog（Design System）で概要表示:

- タイトル、日時、場所、残枠
- 「詳細を見る」ボタン → `/events/[slug]` へ遷移

---

## 管理画面

### ルーティング（既存パターン完全準拠）

```
src/app/(admin)/admin/(dashboard)/events/
├── page.tsx              — リスト（Suspense + nuqs フィルター）
├── loading.tsx           — export { default } from "../_shared/components/ResourceLoading"
├── error.tsx             — "use client"; export { default } from "../_shared/components/ResourceError"
├── new/
│   ├── page.tsx          — AdminDetailLayout + EventForm
│   ├── loading.tsx
│   └── error.tsx
├── [id]/
│   ├── page.tsx          — AdminDetailLayout + DetailSection + 参加者一覧
│   ├── loading.tsx
│   ├── error.tsx
│   └── edit/
│       ├── page.tsx      — AdminDetailLayout + EventEditForm
│       ├── loading.tsx
│       └── error.tsx
└── _components/
    ├── EventFilters.tsx           — 'use client' nuqs（ステータス/日付範囲/検索）
    ├── EventTable.tsx             — 'use client' SortableColumnHeader + Table
    ├── EventActionCell.tsx        — ActionDropdown（編集/削除/公開/中止）
    ├── EventForm.tsx              — 'use client' RHF + Lexical + 日時ピッカー
    ├── EventEditForm.tsx          — 'use client' 編集フォーム
    ├── EventRegistrationTable.tsx — 参加者一覧テーブル（詳細ページ内）
    └── EventStatusBadge.tsx       — ステータスバッジ
```

### ナビゲーション追加

```typescript
// sidebar-items.tsx に追加
{ label: "イベント", href: "/admin/events", icon: <IconCalendarEvent /> },
```

### リストページ

```tsx
export default async function EventsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          イベント管理
        </h1>
        <Button asChild>
          <Link href="/admin/events/new">新規イベント</Link>
        </Button>
      </div>
      <EventFilters />
      <Suspense fallback={<LoadingState />}>
        <EventList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

### 詳細ページ（参加者一覧含む）

```tsx
export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/events"
      title={event.title}
      subtitle={`${formatDate(event.startTime)} 〜 ${formatDate(event.endTime)}`}
      actions={
        <>
          <DetailDeleteButton
            itemName={event.title}
            onDelete={deleteEvent.bind(null, id)}
            redirectTo="/admin/events"
            successMessage="イベントを削除しました"
          />
          <Button asChild>
            <Link href={`/admin/events/${id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" /> 編集
            </Link>
          </Button>
        </>
      }
    >
      <DetailSection title="イベント情報">
        {/* 日時・場所・定員・料金・ステータス・説明 */}
      </DetailSection>
      <DetailSection title={`参加者一覧（${event._count.registrations}名）`}>
        <EventRegistrationTable
          registrations={event.registrations}
          eventId={id}
        />
      </DetailSection>
    </AdminDetailLayout>
  );
}
```

### nuqs フィルター

```typescript
// nuqs パーサー定義
export const adminEventSearchParamsParsers = {
  search: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  sortBy: parseAsString.withDefault("startTime"),
  sortOrder: parseAsString.withDefault("desc"),
};
```

---

## メール

既存 React Email + Resend + `fireAndForget()` パターン準拠。

```
src/shared/emails/
├── event-registration-confirmation.tsx  — 参加者: 申込完了確認
├── event-registration-cancelled.tsx     — 参加者: キャンセル完了確認
├── event-admin-notification.tsx         — 管理者: 新規申込/キャンセル通知
├── event-cancelled-notification.tsx     — 全参加者: イベント中止通知
├── event-updated-notification.tsx       — 全参加者: イベント変更通知（日時変更等）
```

### トリガー

| トリガー       | 宛先                | テンプレート                                   |
| -------------- | ------------------- | ---------------------------------------------- |
| 申込確定時     | 参加者              | event-registration-confirmation                |
| 申込確定時     | 管理者              | event-admin-notification（type: registration） |
| キャンセル時   | 参加者              | event-registration-cancelled                   |
| キャンセル時   | 管理者              | event-admin-notification（type: cancellation） |
| イベント変更時 | 全 CONFIRMED 参加者 | event-updated-notification                     |
| イベント中止時 | 全 CONFIRMED 参加者 | event-cancelled-notification                   |

---

## Google Calendar 取り込み（Phase 3）

### 設計

既存 `calendar-sync/outbound.ts` に対して inbound を追加:

```
src/shared/lib/calendar-sync/
├── outbound.ts          — 既存: 予約 → Google Calendar
└── event-inbound.ts     — 新規: Google Calendar → Event モデル
```

### 動作

- 管理画面の設定で「Google Calendar イベント取り込み」トグル
- オン時: 指定 Google Calendar からイベント取得 → `googleCalendarEventId` で重複チェック → Event テーブルに upsert（status: DRAFT で取り込み、管理者が PUBLISHED に変更）
- 取り込んだイベントも管理画面で自由に編集可能
- `googleCalendarEventId` がある場合「GCal 連携中」バッジ表示

---

## マイページ拡張（Phase 2）

```
src/app/(public)/mypage/events/
└── page.tsx — 自分の申込一覧（verifyCustomerSession + getCustomerByUserId）
```

- 申込済みイベント一覧表示
- ステータス表示（CONFIRMED / CANCELLED）
- CONFIRMED のイベントはキャンセルボタン表示

### キャンセル方式

- ログイン済み顧客: マイページ `/mypage/events` からキャンセル操作
- 未ログイン申込者: 確認メールに「マイページでキャンセルできます」案内（アカウント作成促進）

---

## セクション登録（任意）

`event-calendar` セクションタイプを追加し、トップページや他ページにもカレンダーを埋め込み可能にする。

```
src/shared/lib/sections/definitions/event-calendar/
├── schema.ts    — maxEvents, layout("calendar"|"list"), showPastEvents
├── metadata.ts  — { label: "イベントカレンダー", icon: "IconCalendarEvent", category: "list" }
```

registry.ts に登録。

---

## テスト方針

### Unit テスト

- 残枠計算ロジック（capacity null、0、正常、オーバーフロー）
- Zod スキーマバリデーション（EventStatus enum、日時範囲、capacity/price）
- slug 生成（日本語タイトル、空文字、重複時のフォールバック）

### Integration テスト

- createEvent Server Action（認証・権限・バリデーション・キャッシュ無効化）
- registerForEvent（レート制限・Turnstile・残枠チェック・メール送信）
- cancelRegistration（所有権チェック・残枠復活・メール送信）

### E2E テスト

- イベント作成 → 公開 → カレンダー表示 → 詳細ページ → 申込 → マイページ確認 → キャンセル
