# Project Scorecard Improvements — Clean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 8-agent audit scorecard (7.2/10) の全改善項目をクリーンに実装し、後方互換ハックなしで品質を底上げする。

**Architecture:** Phase 1 (Critical/Route) → Phase 2 (Security/CodeQuality) → Phase 3 (Performance/DB) の順で修正。各タスクは独立してコミット可能。

**Tech Stack:** Next.js 16, React 19 (Compiler 1.0), TypeScript 6, Prisma 7, Zod 4, Better Auth, bun:test

---

## Phase 1: ルート構造 & アーキテクチャ境界

### Task 1: `[...segments]` に loading.tsx + error.tsx 追加

**Files:**

- Create: `src/app/(public)/[...segments]/loading.tsx`
- Create: `src/app/(public)/[...segments]/error.tsx`

- [ ] **Step 1: loading.tsx 作成**

```tsx
// src/app/(public)/[...segments]/loading.tsx
export default function SegmentsLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-accent" />
    </div>
  );
}
```

- [ ] **Step 2: error.tsx 作成**

```tsx
// src/app/(public)/[...segments]/error.tsx
"use client";

import { Button } from "@/public/components/design-system/button";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default function SegmentsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container>
      <div className="flex min-h-[60vh] items-center justify-center">
        <Stack gap="md" className="text-center">
          <Heading level={1}>ページを表示できません</Heading>
          <p className="text-muted-foreground">
            一時的な問題が発生しました。しばらくしてからもう一度お試しください。
          </p>
          <Button variant="editorial" onClick={reset}>
            もう一度試す
          </Button>
        </Stack>
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: type-check**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(public)/[...segments]/loading.tsx' 'src/app/(public)/[...segments]/error.tsx'
git commit -m "fix(public): add loading.tsx + error.tsx for [...segments] catch-all route"
```

---

### Task 2: `reservation/` に loading.tsx + error.tsx 追加

**Files:**

- Create: `src/app/(public)/reservation/loading.tsx`
- Create: `src/app/(public)/reservation/error.tsx`

- [ ] **Step 1: loading.tsx 作成**

```tsx
// src/app/(public)/reservation/loading.tsx
export default function ReservationLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-accent" />
    </div>
  );
}
```

- [ ] **Step 2: error.tsx 作成**

```tsx
// src/app/(public)/reservation/error.tsx
"use client";

import { Button } from "@/public/components/design-system/button";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";

export default function ReservationError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Container>
      <div className="flex min-h-[60vh] items-center justify-center">
        <Stack gap="md" className="text-center">
          <Heading level={1}>予約ページを表示できません</Heading>
          <p className="text-muted-foreground">
            一時的な問題が発生しました。しばらくしてからもう一度お試しください。
          </p>
          <Button variant="editorial" onClick={reset}>
            もう一度試す
          </Button>
        </Stack>
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: type-check + commit**

```bash
git add 'src/app/(public)/reservation/loading.tsx' 'src/app/(public)/reservation/error.tsx'
git commit -m "fix(public): add loading.tsx + error.tsx for reservation route"
```

---

### Task 3: 残り公開ルートに error.tsx 追加

**Files:**

- Create: `src/app/(public)/events/error.tsx`
- Create: `src/app/(public)/events/[slug]/error.tsx`
- Create: `src/app/(public)/mypage/error.tsx`

- [ ] **Step 1: events/error.tsx 作成**

同じパターンで events と events/[slug] に error.tsx を作成。Heading text を「イベント情報を表示できません」に変更。

- [ ] **Step 2: mypage/error.tsx 作成**

mypage/error.tsx を作成。これが mypage 配下の全サブルート（events, inquiries, settings）のエラーバウンダリとして機能する。Heading text を「マイページを表示できません」に変更。

- [ ] **Step 3: type-check + commit**

```bash
git add 'src/app/(public)/events/error.tsx' 'src/app/(public)/events/[slug]/error.tsx' 'src/app/(public)/mypage/error.tsx'
git commit -m "fix(public): add error.tsx for events, events/[slug], and mypage routes"
```

---

### Task 4: Post bulk operations をドメインコマンドに移行

**Files:**

- Modify: `src/shared/domain/posts/commands.ts` — `bulkTogglePublishedCommand`, `bulkDeletePostsCommand` 追加
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts` — Prisma 直 import 削除

- [ ] **Step 1: domain commands に bulk 操作を追加**

`src/shared/domain/posts/commands.ts` 末尾に追加:

```typescript
export async function bulkTogglePublishedCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean }> {
  const result = await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: {
      status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
      publishedAt: publish ? new Date() : null,
    },
  });
  return { count: result.count, isPublished: publish };
}

export async function bulkDeletePostsCommand(
  ids: string[],
): Promise<{ count: number }> {
  const result = await prisma.post.deleteMany({
    where: { id: { in: ids } },
  });
  return { count: result.count };
}
```

- [ ] **Step 2: bulk.ts を domain command 経由に書き換え**

`src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts` から `prisma` import を削除し、domain commands を使用:

```typescript
// 削除: import { prisma } from "@/shared/db/prisma";
// 追加:
import {
  bulkTogglePublishedCommand,
  bulkDeletePostsCommand,
} from "@/shared/domain/posts/commands";

// execute ブロック内を置換:
// bulkTogglePostPublished:
execute: async () => bulkTogglePublishedCommand(parsed.data, publish),

// bulkDeletePosts:
execute: async () => bulkDeletePostsCommand(parsed.data),
```

- [ ] **Step 3: 未使用 import 除去確認 + type-check**

`PostStatus` import も `@generated/prisma/enums` から domain commands に移動されるため、bulk.ts からは不要になる場合がある。type-check で確認。

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(domain): extract post bulk operations to domain commands"
```

---

### Task 5: Reservation mutations から Prisma 直クエリを除去

**Files:**

- Modify: `src/shared/domain/reservations/admin-queries.ts` — `getReservationGuestData` クエリ追加
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts` — Prisma import 削除

- [ ] **Step 1: getReservationGuestData ドメインクエリ追加**

`src/shared/domain/reservations/admin-queries.ts` に追加:

```typescript
export async function getReservationGuestData(id: string) {
  return prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: {
      customerId: true,
      guestLastName: true,
      guestFirstName: true,
      guestPhone: true,
      guestCompanyName: true,
    },
  });
}
```

- [ ] **Step 2: mutations.ts を書き換え**

`updateCustomerFromReservation` 内の直接 prisma 呼び出しをドメインクエリに置換:

```typescript
// 削除: import { prisma } from "@/shared/db/prisma";
// 追加:
import { getReservationGuestData } from "@/shared/domain/reservations/admin-queries";

// execute 内:
const reservation = await getReservationGuestData(parsed.data);
```

- [ ] **Step 3: type-check + commit**

```bash
git commit -m "refactor(domain): extract reservation guest data query to domain layer"
```

---

### Task 6: Reservation bulk から Prisma 直クエリを除去

**Files:**

- Modify: `src/shared/domain/reservations/admin-queries.ts` — `getReservationStatus` クエリ追加
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/bulk.ts` — Prisma import 削除

- [ ] **Step 1: getReservationStatus ドメインクエリ追加**

```typescript
export async function getReservationStatus(id: string) {
  return prisma.reservation.findUnique({
    where: { id, deletedAt: null },
    select: { status: true },
  });
}
```

- [ ] **Step 2: bulk.ts を書き換え**

両関数（`bulkConfirmReservations`, `bulkCancelReservations`）内の `prisma.reservation.findUnique` を `getReservationStatus` に置換。`prisma` import を削除。

- [ ] **Step 3: type-check + commit**

```bash
git commit -m "refactor(domain): extract reservation status query to domain layer"
```

---

### Task 7: Event import cron から Prisma 直クエリを除去

**Files:**

- Modify: `src/app/api/cron/event-import/route.ts` — 既存のドメインクエリを使用

- [ ] **Step 1: cron route を読み、代替可能な settings ドメインクエリを特定**

`getEventImportSettings()` が `src/shared/domain/settings/admin-queries.ts` に存在するか確認。存在しなければ作成。

- [ ] **Step 2: Prisma 直クエリをドメインクエリに置換**

- [ ] **Step 3: type-check + commit**

```bash
git commit -m "refactor(domain): use domain query in event-import cron route"
```

---

### Task 8: Reservation detail page から Prisma 直クエリを除去

**Files:**

- Modify: `src/shared/domain/terms/queries.ts` — `getTermsAgreementsForReservation` 追加
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/[id]/page.tsx` — Prisma import 削除

- [ ] **Step 1: terms ドメインクエリ追加**

```typescript
export async function getTermsAgreementsForReservation(reservationId: string) {
  return prisma.termsAgreement.findMany({
    where: { reservationId },
    select: {
      id: true,
      agreedAt: true,
      terms: {
        select: {
          id: true,
          title: true,
          type: true,
          slug: true,
        },
      },
    },
    orderBy: { agreedAt: "desc" },
  });
}
```

- [ ] **Step 2: page.tsx を書き換え**

`prisma` import を削除し、`getTermsAgreementsForReservation` を使用。

- [ ] **Step 3: type-check + commit**

```bash
git commit -m "refactor(domain): extract terms agreements query to domain layer"
```

---

## Phase 2: セキュリティ & コード品質

### Task 9: UUID バリデーション統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/navigation.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/notification.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/announcement-bar.ts`
- Modify: `src/app/(public)/_shared/actions/event-registration.ts`

- [ ] **Step 1: 各ファイルに idSchema + safeParse ガードを追加**

パターン（各ファイル共通）:

```typescript
const idSchema = z.string().uuid({ error: "IDが不正です" });

// 各関数の先頭に追加:
export async function deleteNavigationItem(
  id: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    // resourceId を parsed.data に変更
    resourceId: parsed.data,
    // execute 内も parsed.data を使用
    execute: async () => {
      await deleteNavigationItemCommand(parsed.data);
      return null;
    },
    // ...
  });
}
```

対象関数一覧:

- `navigation.ts`: `deleteNavigationItem`, `deleteSocialLink`, `updateNavigationItem`, `updateSocialLink`
- `space.ts`: `updateSpacePublish`, `deleteSpace`, `toggleSpacePublished`
- `notification.ts`: `markNotificationAsRead`, `deleteNotification`
- `page-section.ts`: `deletePageSection`, `togglePageSection`, `duplicatePageSection`
- `editor-comment.ts`: `resolveThread`, `reopenThread`, `deleteThread`, `deleteComment`
- `announcement-bar.ts`: `updateAnnouncementBar`, `deleteAnnouncementBar`, `toggleAnnouncementBarActive`
- `event-registration.ts`: `cancelEventRegistration`

- [ ] **Step 2: type-check + lint**

Run: `bun run validate`

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(security): add UUID validation to all admin Server Actions"
```

---

### Task 10: Export routes に unstable_rethrow 追加

**Files:**

- Modify: `src/app/api/admin/export/customers/route.ts`
- Modify: `src/app/api/admin/export/reservations/route.ts`

- [ ] **Step 1: 参照実装（event-registrations）を確認**

`src/app/api/admin/export/event-registrations/route.ts` の try/catch + `unstable_rethrow` パターンを確認。

- [ ] **Step 2: customers/route.ts と reservations/route.ts に try/catch + unstable_rethrow 追加**

```typescript
import { unstable_rethrow } from "next/navigation";

// 既存の handler body を try/catch でラップ:
try {
  // ... 既存のハンドラロジック
} catch (error) {
  unstable_rethrow(error);
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    context: { operation: "exportCustomers" },
  });
  return NextResponse.json(
    { error: "エクスポートに失敗しました" },
    { status: 500 },
  );
}
```

- [ ] **Step 3: type-check + commit**

```bash
git commit -m "fix(api): add unstable_rethrow to export route handlers"
```

---

### Task 11: images.unsplash.com を本番設定から除去

**Files:**

- Modify: `src/proxy.ts` — `img-src` から `images.unsplash.com` 削除
- Modify: `next.config.ts` — `remotePatterns` から `images.unsplash.com` 削除

- [ ] **Step 1: proxy.ts の img-src から削除**

`images.unsplash.com` を CSP `img-src` ディレクティブから削除。

- [ ] **Step 2: next.config.ts の remotePatterns から削除**

`images.unsplash.com` のエントリを削除。

- [ ] **Step 3: seed.ts で unsplash URL を使っている箇所を確認**

`grep -r "unsplash" prisma/seed.ts` で確認。seed は開発専用なので URL はそのまま維持可（画像最適化を通さない直接アクセスは引き続き動作）。

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(security): remove images.unsplash.com from production CSP and remotePatterns"
```

---

### Task 12: form.getValues() → useWatch() 置換

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/StripeSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ResendSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/GoogleCalendarSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/CloudflareSection.tsx`

- [ ] **Step 1: 各ファイルの render 内 form.getValues() を useWatch に置換**

パターン:

```typescript
// 変更前:
const stripeTestMode = form.getValues("stripeTestMode");
const stripeSecretKey = form.getValues("stripeSecretKey");

// 変更後:
import { useWatch } from "react-hook-form";

const stripeTestMode = useWatch({
  control: form.control,
  name: "stripeTestMode",
});
const stripeSecretKey = useWatch({
  control: form.control,
  name: "stripeSecretKey",
});
```

対象:

- `StripeSection.tsx`: `stripeTestMode`, `stripeSecretKey`
- `ResendSection.tsx`: `resendApiKey`
- `GoogleCalendarSection.tsx`: `serviceAccountJson`, `googleCalendarId`
- `CloudflareSection.tsx`: `cloudflareApiToken`

- [ ] **Step 2: type-check + commit**

```bash
git commit -m "fix(react): replace form.getValues() in render with useWatch()"
```

---

### Task 13: className テンプレートリテラル → cn()

**Files:**

- Modify: `src/app/(public)/events/_components/event-card.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx`

- [ ] **Step 1: 各ファイルのテンプレートリテラルを cn() に置換**

```typescript
// 変更前:
className={`${iconSize} shrink-0`}

// 変更後:
import { cn } from "@/shared/lib/cn";
className={cn(iconSize, "shrink-0")}
```

- [ ] **Step 2: type-check + commit**

```bash
git commit -m "fix(style): replace className template literals with cn()"
```

---

### Task 14: zod-introspection.ts の型安全化

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection.ts`

- [ ] **Step 1: ファイルを読んで現在の as キャストを把握**

- [ ] **Step 2: `isRecord()` ガード + Zod 4 public API に書き換え**

```typescript
import { isRecord } from "@/shared/lib/serialize";
import { z } from "zod";

// 変更前:
(schema as Record<string, unknown>)._zod.def.shape;

// 変更後:
if (schema instanceof z.ZodObject) {
  const shape = schema.shape; // Zod 4 public API
  // ... shape を使って field metadata を抽出
}
```

4件の `as Record<string, unknown>` を `isRecord()` ガードまたは `instanceof z.ZodObject` チェックに置換。

- [ ] **Step 3: type-check + commit**

```bash
git commit -m "fix(type-safety): replace as assertions with type guards in zod-introspection"
```

---

### Task 15: auto-section-form の any 型除去

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoBooleanField.tsx`

- [ ] **Step 1: FieldValues constrained generic に統一**

```typescript
import type { FieldValues, UseFormReturn, Control } from "react-hook-form";

// 変更前:
type Props = {
  form: ReturnType<typeof useForm<any>>;
  control: Control<any>;
};

// 変更後:
type Props = {
  form: UseFormReturn<FieldValues>;
  control: Control<FieldValues>;
};
```

- [ ] **Step 2: 全対象ファイルで置換 + type-check**

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(type-safety): replace any types with FieldValues in auto-section-form"
```

---

## Phase 3: パフォーマンス & DB

### Task 16: Prisma スキーマにインデックス追加

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 不足インデックスを追加**

```prisma
// News モデルに追加（既に @@index([isPublished, publishedAt]) がある場合は確認のみ）

// Space モデルに追加:
@@index([publishedAt, isActive])

// Inquiry モデルに追加:
@@index([createdAt, status])

// EventRegistration モデルに追加:
@@index([eventId, status, createdAt])
```

- [ ] **Step 2: Event モデルに deletedById 追加**

```prisma
model Event {
  // 既存の deletedAt の近くに:
  deletedById  String?   @db.Uuid
  deletedBy    User?     @relation("EventDeletions", fields: [deletedById], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 3: マイグレーション実行**

```bash
bunx --bun prisma migrate dev --name add_missing_indexes_and_event_audit
```

- [ ] **Step 4: type-check + commit**

```bash
git commit -m "feat(db): add missing indexes and event soft-delete audit trail"
```

---

### Task 17: Lexical を dynamic import に変更

**Files:**

- 調査が必要: admin layout / dashboard layout で Lexical がどのように import されているか確認
- Modify: Lexical エディタを使うページのみ（posts/[id], news/[id], pages/[slug]/edit 等）

- [ ] **Step 1: Lexical の import チェーンを調査**

```bash
# admin layout から Lexical への import path を特定
grep -r "lexical" src/app/(admin)/admin/layout.tsx src/app/(admin)/admin/(dashboard)/layout.tsx
```

- [ ] **Step 2: Lexical エディタコンポーネントを dynamic import に変更**

エディタが直接 layout に import されていない場合、個別ページのバレル import を確認。`next/dynamic` でラップ:

```typescript
import dynamic from "next/dynamic";

const LexicalEditor = dynamic(
  () => import("@/admin/components/editor/lexical/LexicalEditor"),
  { ssr: false },
);
```

- [ ] **Step 3: build でバンドルサイズ確認**

```bash
bun run build:skip-env
```

- [ ] **Step 4: Commit**

```bash
git commit -m "perf(admin): lazy-load Lexical editor to reduce shared JS bundle"
```

---

### Task 18: Recharts を dynamic import に変更

**Files:**

- Modify: ダッシュボードのチャートコンポーネント

- [ ] **Step 1: Recharts の import チェーンを調査**

```bash
grep -r "recharts" src/app/(admin)/admin/(dashboard)/_components/
```

- [ ] **Step 2: チャートコンポーネントを dynamic import に変更**

ダッシュボード page.tsx で dynamic import:

```typescript
const DashboardChartSection = dynamic(
  () => import("./_components/DashboardChartSection"),
  { ssr: false },
);
```

- [ ] **Step 3: build でバンドルサイズ確認 + commit**

```bash
git commit -m "perf(admin): lazy-load Recharts to reduce shared JS bundle"
```

---

## Phase 4: テストカバレッジ（継続的）

### Task 19: events/commands.ts テスト作成

**Files:**

- Create: `__tests__/unit/domain/events/commands.test.ts`

- [ ] **Step 1: テストファイル作成**

既存の `__tests__/unit/domain/reservations/commands.test.ts` パターンに従い、events domain の7関数（createEventCommand, updateEventCommand, deleteEventCommand, publishEventCommand, cancelEventCommand, upsertEventFromCalendar, ensureUniqueSlug）のテストを作成。

- [ ] **Step 2: テスト実行**

```bash
bun test __tests__/unit/domain/events
```

- [ ] **Step 3: package.json の test スクリプトにバッチ追加**

`bun test __tests__/unit/domain/events` を test スクリプトに追加。

- [ ] **Step 4: Commit**

```bash
git commit -m "test(domain): add unit tests for events/commands.ts"
```

---

## 検証 & 完了

### Task 20: 全体検証

- [ ] **Step 1: validate**

```bash
bun run validate
```

- [ ] **Step 2: build**

```bash
bun run build:skip-env
```

- [ ] **Step 3: test**

```bash
bun run test
```

---

## 未着手（次フェーズ）

以下は本計画の scope 外。別計画で対応:

- **T1**: ドメインクエリテスト31件の段階的追加
- **T2-T3**: 決済統合テスト + 公開ページ E2E 拡充
- **T5**: E2E の hardcoded delay 除去（38件）
- **D4-D8**: 追加インデックス + ソフトデリートパターン統一
- **P3**: GSAP/Lenis の LenisProvider スコープ縮小
- **C5**: `@prisma/client/runtime` 直 import の構造型置換
- **C6**: `text-white` ハードコードカラーの semantic token 化
