# イベントカレンダー Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EventRegistration モデル + 公開申込フォーム + 管理画面参加者管理 + メール通知 + マイページ申込一覧を実装する。

**Architecture:** EventRegistration モデルで申込管理。公開ページは Rate Limit + Turnstile + Zod の多層防御。残枠はリアルタイム計算（capacity - SUM(CONFIRMED numberOfPeople)）。メールは React Email + Resend + fireAndForget。マイページは verifyCustomerSession + getCustomerByUserId パターン。

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, React Email, Resend, Better Auth (CUSTOMER role)

---

## File Structure

### 新規作成ファイル

```
prisma/
  migrations/YYYYMMDD_add_event_registration/migration.sql

src/shared/
  domain/events/
    registration-commands.ts       — createRegistration, cancelRegistration, adminCancelRegistration
    registration-queries.ts        — getEventRegistrations, getRegistrationCount, getCustomerRegistrations
  lib/validations/
    event-registration.ts          — publicEventRegistrationSchema, adminEventRegistrationSchema

src/shared/emails/
  event-registration-confirmation.tsx  — 参加者: 申込完了
  event-registration-cancelled.tsx     — 参加者: キャンセル完了
  event-admin-notification.tsx         — 管理者: 申込/キャンセル通知
  event-cancelled-notification.tsx     — 全参加者: イベント中止通知

src/shared/lib/email/
  event-emails.ts                      — sendEventRegistrationConfirmation, sendEventCancellationEmail, etc.

src/app/(admin)/admin/(dashboard)/_shared/actions/
  event-registration.ts                — adminCreateRegistration, adminCancelRegistration

src/app/(admin)/admin/(dashboard)/events/
  [id]/_components/
    EventRegistrationTable.tsx         — 参加者一覧テーブル
    AdminRegistrationForm.tsx          — 管理者手動申込フォーム

src/app/(public)/_shared/actions/
  event-registration.ts                — registerForEvent, cancelEventRegistration

src/app/(public)/events/[slug]/
  _components/
    EventRegistrationForm.tsx          — 'use client' 申込フォーム

src/app/(public)/mypage/events/
  page.tsx                             — 申込一覧
  _components/
    EventRegistrationList.tsx          — 申込一覧コンポーネント

__tests__/unit/lib/validations/
  event-registration.test.ts
```

### 変更するファイル

```
prisma/schema.prisma                   — EventRegistration モデル + RegistrationStatus enum + Customer relation
prisma/seed.ts                         — サンプル申込データ
src/shared/lib/constants/cache.ts      — (EVENT_REGISTRATIONS は Phase 1 で追加済み)
src/shared/domain/events/commands.ts   — cancelEventCommand にメール送信追加
src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx — 参加者一覧セクション追加
src/app/(public)/events/[slug]/page.tsx — 申込フォーム追加
src/app/(public)/mypage/layout.tsx     — イベント申込リンク追加(ナビ)
```

---

## Task 1: EventRegistration Prisma モデル

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: RegistrationStatus enum と EventRegistration モデル追加**

```prisma
enum RegistrationStatus {
  CONFIRMED
  CANCELLED
}

model EventRegistration {
  id              String             @id @default(cuid()) @db.VarChar(30)
  eventId         String             @db.VarChar(30)
  name            String             @db.VarChar(100)
  email           String             @db.VarChar(255)
  phone           String?            @db.VarChar(20)
  note            String?            @db.Text
  numberOfPeople  Int                @default(1)
  status          RegistrationStatus @default(CONFIRMED)
  customerId      String?            @db.Uuid
  cancelledAt     DateTime?
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt

  event           Event              @relation(fields: [eventId], references: [id], onDelete: Cascade)
  customer        Customer?          @relation(fields: [customerId], references: [id], onDelete: SetNull)

  @@index([eventId])
  @@index([customerId])
  @@index([status])
  @@map("event_registrations")
}
```

Event モデルに `registrations EventRegistration[]` を追加。
Customer モデルに `eventRegistrations EventRegistration[]` を追加。

- [ ] **Step 2: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add-event-registration`

- [ ] **Step 3: 型確認 + コミット**

---

## Task 2: Zod バリデーション + テスト

**Files:**

- Create: `src/shared/lib/validations/event-registration.ts`
- Create: `__tests__/unit/lib/validations/event-registration.test.ts`

- [ ] **Step 1: スキーマ作成**

```typescript
import { z } from "zod";

export const publicEventRegistrationSchema = z.object({
  eventId: z.string().min(1, { error: "イベントIDは必須です" }),
  name: z.string().min(1, { error: "お名前は必須です" }).max(100),
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  phone: z.string().max(20).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  numberOfPeople: z
    .number()
    .int()
    .min(1, { error: "参加人数は1以上です" })
    .max(10, { error: "参加人数は10名以下です" })
    .default(1),
  turnstileToken: z.string().min(1, { error: "セキュリティ検証が必要です" }),
});

export type PublicEventRegistrationInput = z.infer<
  typeof publicEventRegistrationSchema
>;

export const adminEventRegistrationSchema = z.object({
  eventId: z.string().min(1, { error: "イベントIDは必須です" }),
  name: z.string().min(1, { error: "お名前は必須です" }).max(100),
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  phone: z.string().max(20).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  numberOfPeople: z
    .number()
    .int()
    .min(1, { error: "参加人数は1以上です" })
    .default(1),
});

export type AdminEventRegistrationInput = z.infer<
  typeof adminEventRegistrationSchema
>;
```

- [ ] **Step 2: テスト作成 + 実行**

残枠チェック、入力バリデーション、境界値テスト。

- [ ] **Step 3: コミット**

---

## Task 3: 申込ドメインコマンド + クエリ

**Files:**

- Create: `src/shared/domain/events/registration-commands.ts`
- Create: `src/shared/domain/events/registration-queries.ts`

- [ ] **Step 1: registration-commands.ts 作成**

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

export async function createEventRegistrationCommand(data: {
  eventId: string;
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  numberOfPeople: number;
  customerId?: string | null;
}) {
  // 1. イベント存在確認 + 残枠チェック
  const event = await prisma.event.findFirst({
    where: { id: data.eventId, deletedAt: null, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      capacity: true,
      registrationOpen: true,
      _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
    },
  });
  if (!event) throw new DomainError("イベントが見つかりません");
  if (!event.registrationOpen)
    throw new DomainError("このイベントは申込受付を終了しています");

  // 残枠チェック
  if (event.capacity != null) {
    const confirmedCount = event._count.registrations; // _count は number
    const remaining = event.capacity - confirmedCount;
    if (data.numberOfPeople > remaining) {
      throw new DomainError(
        remaining <= 0
          ? "このイベントは満員です"
          : `残り${remaining}枠です。参加人数を${remaining}名以下にしてください`,
      );
    }
  }

  // 2. 申込作成
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: data.eventId,
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      note: data.note ?? null,
      numberOfPeople: data.numberOfPeople,
      customerId: data.customerId ?? null,
    },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      numberOfPeople: true,
    },
  });

  return { registration, event: { title: event.title } };
}

export async function cancelEventRegistrationCommand(
  registrationId: string,
  customerId?: string,
) {
  const registration = await prisma.eventRegistration.findFirst({
    where: {
      id: registrationId,
      status: "CONFIRMED",
      ...(customerId ? { customerId } : {}),
    },
    select: {
      id: true,
      eventId: true,
      name: true,
      email: true,
      event: { select: { title: true } },
    },
  });
  if (!registration) throw new DomainError("申込が見つかりません");

  await prisma.eventRegistration.update({
    where: { id: registrationId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return registration;
}
```

- [ ] **Step 2: registration-queries.ts 作成**

イベント別参加者一覧、残枠計算、顧客別申込一覧のクエリ。

- [ ] **Step 3: 型確認 + コミット**

---

## Task 4: メールテンプレート + 送信関数

**Files:**

- Create: `src/shared/emails/event-registration-confirmation.tsx`
- Create: `src/shared/emails/event-registration-cancelled.tsx`
- Create: `src/shared/emails/event-admin-notification.tsx`
- Create: `src/shared/emails/event-cancelled-notification.tsx`
- Create: `src/shared/lib/email/event-emails.ts`

- [ ] **Step 1: メールテンプレート作成**

既存の `reservation-confirmation.tsx` パターンに従い、React Email コンポーネントを作成。各テンプレートには: イベント名、日時、場所、参加者名、参加人数を含む。

- [ ] **Step 2: 送信関数作成**

`event-emails.ts` に `sendEventRegistrationConfirmation`, `sendEventRegistrationCancelled`, `sendEventAdminNotification`, `sendEventCancelledNotification` を定義。既存の `reservation-emails.ts` パターンに従い、`fireAndForget` で非同期送信。

- [ ] **Step 3: 型確認 + コミット**

---

## Task 5: 公開申込 Server Action

**Files:**

- Create: `src/app/(public)/_shared/actions/event-registration.ts`

- [ ] **Step 1: registerForEvent 作成**

```
1. checkActionRateLimit(formSubmitRateLimiter)
2. Zod safeParse (publicEventRegistrationSchema)
3. validateTurnstile
4. getCurrentUser → getCustomerByUserId で customerId 取得（オプション）
5. createEventRegistrationCommand
6. updateTag(EVENTS + EVENT_REGISTRATIONS)
7. fireAndForget: 確認メール(参加者) + 通知メール(管理者)
```

- [ ] **Step 2: cancelEventRegistration 作成**

```
1. checkActionRateLimit(formSubmitRateLimiter)
2. getSession + getCustomerByUserId（認証）
3. cancelEventRegistrationCommand(registrationId, customer.id)
4. updateTag(EVENTS + EVENT_REGISTRATIONS)
5. fireAndForget: キャンセル確認メール
```

- [ ] **Step 3: 型確認 + コミット**

---

## Task 6: 管理画面申込管理 Server Actions + UI

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts`
- Create: `src/app/(admin)/admin/(dashboard)/events/[id]/_components/EventRegistrationTable.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/events/[id]/page.tsx`

- [ ] **Step 1: 管理画面申込アクション作成**

`adminCreateRegistration`, `adminCancelRegistration` を `executeAdminMutationResult` パターンで作成。

- [ ] **Step 2: EventRegistrationTable 作成**

参加者一覧テーブル（名前、メール、参加人数、ステータス、申込日時、キャンセルボタン）。

- [ ] **Step 3: 詳細ページに参加者一覧セクション追加**

`events/[id]/page.tsx` に `DetailSection title="参加者一覧"` + `EventRegistrationTable` を追加。

- [ ] **Step 4: 型確認 + コミット**

---

## Task 7: 公開申込フォーム + 詳細ページ統合

**Files:**

- Create: `src/app/(public)/events/[slug]/_components/EventRegistrationForm.tsx`
- Modify: `src/app/(public)/events/[slug]/page.tsx`

- [ ] **Step 1: EventRegistrationForm 作成**

`"use client"` コンポーネント。`usePublicForm` + `publicEventRegistrationSchema`。フィールド: 名前、メール、電話（任意）、参加人数、備考（任意）、Turnstile。残枠表示 + 満員時は非表示。`autoComplete` 属性設定（given-name, email, tel）。

- [ ] **Step 2: 詳細ページにフォーム統合**

`events/[slug]/page.tsx` の Phase 2 プレースホルダーを実際の申込フォームに差し替え。`registrationOpen && status === "PUBLISHED"` で表示制御。残枠計算してフォームに渡す。

- [ ] **Step 3: 型確認 + コミット**

---

## Task 8: マイページ イベント申込一覧

**Files:**

- Create: `src/app/(public)/mypage/events/page.tsx`
- Create: `src/app/(public)/mypage/events/_components/EventRegistrationList.tsx`

- [ ] **Step 1: マイページイベント一覧ページ作成**

`verifyCustomerSession` + `getCustomerByUserId` で認証。`getCustomerEventRegistrations(customer.id)` で申込一覧取得。CONFIRMED はキャンセルボタン表示。

- [ ] **Step 2: EventRegistrationList コンポーネント作成**

申込一覧表示。イベント名、日時、参加人数、ステータス、キャンセルボタン。

- [ ] **Step 3: マイページナビゲーションにイベントリンク追加**

- [ ] **Step 4: 型確認 + コミット**

---

## Task 9: イベント中止メール + cancelEventCommand 更新

**Files:**

- Modify: `src/shared/domain/events/commands.ts`

- [ ] **Step 1: cancelEventCommand にメール送信追加**

イベント中止時、全 CONFIRMED 参加者へ中止通知メールを `fireAndForget` で送信。

- [ ] **Step 2: 型確認 + コミット**

---

## Task 10: seed データ + 全体検証

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: サンプル申込データ追加**

PUBLISHED イベントに 2-3 件のサンプル申込を追加。

- [ ] **Step 2: 全体検証**

```bash
bun prisma/seed.ts
bun run validate
bun run build:skip-env
```

- [ ] **Step 3: コミット**
