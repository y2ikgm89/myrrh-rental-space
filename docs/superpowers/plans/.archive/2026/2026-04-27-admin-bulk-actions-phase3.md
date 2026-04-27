> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 3 — Admin Bulk Actions (status 一括変更 + メール通知) 実装計画

> **Spec**: `docs/superpowers/specs/2026-04-27-admin-bulk-actions-phase3-design.md`
> **対象**: customers / inquiries / events の bulk status 変更 + 関連メール通知
> **Bundle 構成**: 3 Bundle (G/H/I) = 3 commit、3 並列 dispatch 可能
> **参照ベース**: Phase 2 plan (`docs/superpowers/plans/2026-04-27-admin-bulk-actions-phase2.md`) を完全踏襲

## Context

Phase 1/2 で確立した `bulkDelete*` / `bulkToggleActive*` パターンに status 遷移マップ + メール通知を拡張する。各 Bundle は独立リソース実装 + 既存 Phase 1/2 component 拡張のため、ファイル衝突なしで 3 並列 dispatch 可能。

**Phase 2 で確立済みの規律**（再掲、全 Bundle で必須）:

- 🚫 git 全面禁止 (`add` / `commit` / `push` / `reset` / `checkout` / `restore` / `stash`)
- 🚫 JSDoc / コメントに「Phase 3」「P19」「Bundle X」等のタスク参照禁止
- ✅ import alias 二重 prefix 禁止 (`@/admin/_shared/X` ではなく `@/admin/X`)
- ✅ 参照実装 (Phase 2 Bundle D customers / Bundle E inquiries / Phase 1 Bundle B events) を Read してから実装
- ✅ plan API 名は実装ファイル Read で実在確認 (`getCacheTag.<resource>.detail` / `Action` enum / `createValidationMutationError`)
- ✅ **cloudflare mock + email 関連 mock は最初から全 export stub 化** (Phase 1 reactive fix `aebc3052` と同じ silent bug を再発させない)

---

## 共通: 状態遷移マップを `enums/helpers.ts` に追加

**Bundle G に同梱** (実装着手が一番軽く、cascade 影響が最小):

```typescript
// src/shared/lib/validations/enums/helpers.ts

import {
  CustomerStatus,
  InquiryStatus,
  EventStatus,
} from "@generated/prisma/enums";

/**
 * Customer ステータス遷移ルール（任意遷移、internal CRM）
 * 5 状態すべて自由遷移を許可。同一状態への変更は呼び出し側で no-op 化。
 */
export const CUSTOMER_STATUS_TRANSITIONS: Readonly<
  Record<CustomerStatus, readonly CustomerStatus[]>
> = {
  [CustomerStatus.NEW]: [
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.REGULAR]: [
    CustomerStatus.NEW,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.VIP]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.INACTIVE,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.INACTIVE]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.BLACKLIST,
  ],
  [CustomerStatus.BLACKLIST]: [
    CustomerStatus.NEW,
    CustomerStatus.REGULAR,
    CustomerStatus.VIP,
    CustomerStatus.INACTIVE,
  ],
};

/**
 * Inquiry ステータス遷移ルール（forward only）
 */
export const INQUIRY_STATUS_TRANSITIONS: Readonly<
  Record<InquiryStatus, readonly InquiryStatus[]>
> = {
  [InquiryStatus.NEW]: [
    InquiryStatus.IN_PROGRESS,
    InquiryStatus.RESOLVED,
    InquiryStatus.CLOSED,
  ],
  [InquiryStatus.IN_PROGRESS]: [InquiryStatus.RESOLVED, InquiryStatus.CLOSED],
  [InquiryStatus.RESOLVED]: [InquiryStatus.CLOSED],
  [InquiryStatus.CLOSED]: [],
};

/**
 * Event ステータス遷移ルール
 */
export const EVENT_STATUS_TRANSITIONS: Readonly<
  Record<EventStatus, readonly EventStatus[]>
> = {
  [EventStatus.DRAFT]: [
    EventStatus.PUBLISHED,
    EventStatus.CANCELLED,
    EventStatus.ARCHIVED,
  ],
  [EventStatus.PUBLISHED]: [EventStatus.CANCELLED, EventStatus.ARCHIVED],
  [EventStatus.CANCELLED]: [EventStatus.ARCHIVED],
  [EventStatus.ARCHIVED]: [],
};
```

**Bundle G/H/I の各 implementer**: マップ自体は Bundle G で追加されるため、Bundle H/I は **Bundle G 完了後に dispatch**。または各 Bundle が部分追加（Customer/Inquiry/Event のみ）するなら並列可だが、衝突 (`enums/helpers.ts` 同時編集) を避けるため **Bundle G で 3 マップすべて追加** とする。

---

## Bundle G — Customers Bulk Status

**Commit message**: `feat(admin): bulk status change for customers (5-state internal CRM transitions)`

### Files to create

1. `src/shared/domain/customers/bulk-status-commands.ts` (新規ファイル、`bulk-commands.ts` と分離)
2. `__tests__/unit/domain/customers/bulk-status-commands.test.ts`

### Files to modify

1. `src/shared/lib/validations/enums/helpers.ts` — 上記 3 マップ (Customer/Inquiry/Event) すべて追加
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk.ts` — `bulkSetStatusCustomers` を追記 (既存ファイルに export 追加)
3. `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerBulkActions.tsx` — status 変更 DropdownMenu 追加
4. `__tests__/integration/actions/admin/customer-bulk.test.ts` — `bulkSetStatusCustomers` test 追記

### Tasks

#### G1. domain command (`bulk-status-commands.ts`)

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { CustomerStatus } from "@generated/prisma/enums";
import { CUSTOMER_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

export type BulkSetStatusCustomersResult = {
  count: number;
  newStatus: CustomerStatus;
  affectedIds: string[];
  rejectedIds: string[];
};

export async function bulkSetStatusCustomersCommand(
  ids: string[],
  newStatus: CustomerStatus,
): Promise<BulkSetStatusCustomersResult> {
  if (ids.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds: [] };
  }
  const targets = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true },
  });

  const allowedIds: string[] = [];
  const rejectedIds: string[] = [];
  for (const t of targets) {
    if (t.status === newStatus) continue; // no-op skip
    const allowed = CUSTOMER_STATUS_TRANSITIONS[t.status];
    if (allowed.includes(newStatus)) allowedIds.push(t.id);
    else rejectedIds.push(t.id);
  }

  if (allowedIds.length === 0) {
    return { count: 0, newStatus, affectedIds: [], rejectedIds };
  }

  const result = await prisma.customer.updateMany({
    where: { id: { in: allowedIds } },
    data: { status: newStatus },
  });

  return {
    count: result.count,
    newStatus,
    affectedIds: allowedIds,
    rejectedIds,
  };
}
```

#### G2. Server Action (`actions/customer/bulk.ts` に追記)

参照: 既存 `bulkToggleActiveCustomers` / `bulkDeleteCustomers` (Phase 2 Bundle D)。

```typescript
import { CustomerStatus } from "@generated/prisma/enums";
import {
  bulkSetStatusCustomersCommand,
  type BulkSetStatusCustomersResult,
} from "@/shared/domain/customers/bulk-status-commands";

const bulkStatusInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  newStatus: z.enum(CustomerStatus),
});

export const bulkSetStatusCustomers = async (
  ids: string[],
  newStatus: CustomerStatus,
): Promise<MutationResult<BulkSetStatusCustomersResult>> => {
  const parsed = bulkStatusInputSchema.safeParse({ ids, newStatus });
  if (!parsed.success) return createValidationMutationError(parsed.error);
  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () =>
      bulkSetStatusCustomersCommand(parsed.data.ids, parsed.data.newStatus),
    afterSuccess: async (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      for (const id of data.affectedIds)
        updateTag(getCacheTag.customers.detail(id));
    },
  });
};
```

#### G3. UI 拡張 (`CustomerBulkActions.tsx`)

既存 `CustomerBulkActions.tsx` (Phase 2 Bundle D) に **status 変更 DropdownMenu** を追加。

- `IconUserStar` (VIP) / `IconUserExclamation` (BLACKLIST) / `IconUser` 等のアイコン
- `CUSTOMER_STATUS_LABELS` (`enums/helpers.ts`) を Dropdown items に展開
- 選択後 `confirm()` または既存 `DeleteConfirmDialog` 同型の `BulkConfirmDialog` で確認 → `bulkSetStatusCustomers(selectedIds, status)` 実行
- toast: 「N 件のステータスを「<label>」に変更しました（<rejected> 件は遷移不可のためスキップ）」

#### G4. Tests

**Unit** (`bulk-status-commands.test.ts`):

- 空配列で count: 0
- 同一 status の skip 確認 (no-op)
- 5 状態間の任意遷移成功
- rejectedIds は (現行マップでは) 同一 status のみが no-op で空、他は全許可
- マップ違反パターン (例: 将来 BLACKLIST → BLACKLIST が rejectedIds に積まれない、no-op skip 経路)

**Integration** (`customer-bulk.test.ts` 拡張):

- 認証 / 権限 / Zod validation (`newStatus` enum 必須) / mock executeAdminMutationResult / mock fireAndForget
- cloudflare mock は **既存 11 export stub 化を継続適用** (Phase 2 で確立済み、コピペ)

---

## Bundle H — Inquiries Bulk Status + Email

**Commit message**: `feat(admin): bulk status change for inquiries with notification email`

### Files to create

1. `src/shared/domain/inquiries/bulk-status-commands.ts`
2. `src/shared/emails/inquiry-status-notification.tsx` (新規 React Email テンプレ)
3. `__tests__/unit/domain/inquiries/bulk-status-commands.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry/bulk.ts` — `bulkSetStatusInquiries` 追記
2. `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryBulkActions.tsx` — status DropdownMenu 追加
3. `src/shared/lib/email/inquiry-emails.ts` — `sendInquiryStatusNotificationToAll` 追記
4. `__tests__/integration/actions/admin/inquiry-bulk.test.ts` — `bulkSetStatusInquiries` test 追記

### Tasks

#### H1. domain command

Customer Bundle G G1 と同型。`INQUIRY_STATUS_TRANSITIONS` を参照して forward-only 検証。戻り値型は `BulkSetStatusInquiriesResult { count, newStatus, affectedIds, rejectedIds }`。

#### H2. 新規 React Email テンプレ (`inquiry-status-notification.tsx`)

`event-cancelled-notification.tsx` を構造踏襲してコピー作成。

```typescript
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";

type Props = {
  customerName: string;
  inquirySubject: string;
  newStatus: "RESOLVED" | "CLOSED";
  siteName: string;
};

const HEADINGS: Record<Props["newStatus"], string> = {
  RESOLVED: "お問い合わせの対応が完了しました",
  CLOSED: "お問い合わせを終了いたしました",
};

const MESSAGES: Record<Props["newStatus"], string> = {
  RESOLVED: "お問い合わせの内容について対応が完了しましたのでお知らせいたします。\nまたご不明な点がございましたらお気軽にご連絡ください。",
  CLOSED: "お問い合わせを終了いたしました。\n再度ご相談の際は新規のお問い合わせとしてご連絡ください。",
};

export function InquiryStatusNotificationEmail({ customerName, inquirySubject, newStatus, siteName }: Props) {
  return (
    <Html>
      <Head />
      <Preview>{HEADINGS[newStatus]} - {inquirySubject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{HEADINGS[newStatus]}</Heading>
          <Text style={text}>{customerName} 様</Text>
          <Section style={detailsSection}>
            <Text style={detailsHeading}>お問い合わせ内容</Text>
            <Hr style={hr} />
            <Text style={detailItem}><strong>件名:</strong> {inquirySubject}</Text>
          </Section>
          <Hr style={hr} />
          <Text style={text}>{MESSAGES[newStatus]}</Text>
          <Text style={footer}>{siteName}</Text>
        </Container>
      </Body>
    </Html>
  );
}

// styles: event-cancelled-notification.tsx と同じ inline style 群をコピー
```

#### H3. send helper (`inquiry-emails.ts` に追記)

```typescript
export async function sendInquiryStatusNotificationToAll(
  inquiryIds: string[],
  newStatus: "RESOLVED" | "CLOSED",
): Promise<void> {
  if (inquiryIds.length === 0) return;
  const inquiries = await prisma.inquiry.findMany({
    where: { id: { in: inquiryIds } },
    select: { id: true, name: true, email: true, subject: true },
  });
  if (inquiries.length === 0) return;
  const siteName = await getSiteName();

  const results = await Promise.allSettled(
    inquiries.map((inquiry) =>
      sendEmail({
        payload: {
          to: inquiry.email,
          subject: `【お問い合わせ${newStatus === "RESOLVED" ? "対応完了" : "終了"}】${inquiry.subject}`,
          react: InquiryStatusNotificationEmail({
            customerName: inquiry.name,
            inquirySubject: inquiry.subject,
            newStatus,
            siteName,
          }),
        },
        idempotencyKey: `inquiry-status/${inquiry.id}/${newStatus}`,
        operation: "sendInquiryStatusNotificationToAll",
        context: { inquiryId: inquiry.id, email: inquiry.email },
      }),
    ),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const inquiry = inquiries[i];
      if (inquiry) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendInquiryStatusNotificationToAll",
            inquiryId: inquiry.id,
            email: inquiry.email,
          },
        });
      }
    }
  }
}
```

import 追加: `prisma` / `logError` / `normalizeError` / `ErrorCategory` / `ErrorSeverity` / `InquiryStatusNotificationEmail`.

#### H4. Server Action

Bundle G G2 と同型。`afterSuccess` で `fireAndForget(sendInquiryStatusNotificationToAll(data.affectedIds, data.newStatus), { operation: "bulkSetStatusInquiries.notify", category: ErrorCategory.EXTERNAL_API })` を **`newStatus === "RESOLVED" || newStatus === "CLOSED"` の場合のみ** 呼ぶ (NEW/IN_PROGRESS への遷移ではメール送信しない)。

#### H5. UI 拡張 (`InquiryBulkActions.tsx`)

既存 `InquiryBulkActions.tsx` (Phase 2 Bundle E、delete のみだった) に status 変更 DropdownMenu 追加。`INQUIRY_STATUS_LABELS` を items に展開。

#### H6. Tests

**Unit** (`bulk-status-commands.test.ts`): forward-only 検証 + RESOLVED → NEW/IN_PROGRESS が rejectedIds に積まれること、CLOSED → 任意遷移が全 rejected。

**Integration** (`inquiry-bulk.test.ts` 拡張):

- mock email 関連: `mock.module("@/shared/lib/email/inquiry-emails", () => ({ sendInquiryReplyEmail: mock(() => Promise.resolve({ success: true })), sendInquiryStatusNotificationToAll: mock<(ids: string[], status: "RESOLVED" | "CLOSED") => Promise<void>>(() => Promise.resolve()) }))` で 2 export 完全網羅
- newStatus が RESOLVED の場合のみ `sendInquiryStatusNotificationToAll` が affectedIds で呼ばれることを `toHaveBeenCalledWith` で検証 (CLAUDE.md learning「実 args 検証は `mock<(args: T) => ...>` 型必須」)
- IN_PROGRESS 遷移時は email 関数が呼ばれないこと (`expect(mockFn).not.toHaveBeenCalled()`)
- cloudflare mock は Phase 2 と同じ全 11 export stub

---

## Bundle I — Events Bulk Cancel + Email

**Commit message**: `feat(admin): bulk cancel for events with participant notification`

### Files to create

1. `src/shared/domain/events/bulk-status-commands.ts`
2. `src/app/(admin)/admin/(dashboard)/_shared/actions/event/bulk.ts` (Phase 1 Bundle B で `bulkPublishEvents` / `bulkDeleteEvents` 実装済み、新規 export 追記) — **Phase 1 で既に存在するため新規ファイルではなく追記の可能性あり、implementer が Read で確認**
3. `__tests__/unit/domain/events/bulk-status-commands.test.ts`

### Files to modify

1. `src/app/(admin)/admin/(dashboard)/events/_components/EventBulkActions.tsx` — Cancel ボタン追加
2. `__tests__/integration/actions/admin/event-bulk.test.ts` — `bulkSetStatusEvents` test 追記

### Tasks

#### I1. domain command

Bundle G/H と同型。`EVENT_STATUS_TRANSITIONS` 参照。`bulkSetStatusEventsCommand(ids, newStatus)` だが Phase 3 では UI から呼ぶのは `CANCELLED` のみ。マップは将来拡張用。

戻り値: `{ count, newStatus, affectedIds, rejectedIds }`。

**重要**: Event は soft delete (`deletedAt`) を持つため、`findMany` の where に `deletedAt: null` 必須。`updateMany` も同条件。

#### I2. Server Action

Bundle G G2 同型。`afterSuccess` で:

```typescript
afterSuccess: async (data) => {
  updateTag(CACHE_TAGS.EVENTS);
  for (const id of data.affectedIds) updateTag(getCacheTag.events.detail(id));
  if (data.newStatus === EventStatus.CANCELLED) {
    fireAndForget(
      Promise.allSettled(
        data.affectedIds.map((eventId) =>
          sendEventCancelledToAllParticipants(eventId),
        ),
      ),
      {
        operation: "bulkSetStatusEvents.cancel",
        category: ErrorCategory.EXTERNAL_API,
      },
    );
  }
};
```

`sendEventCancelledToAllParticipants` は `void` 返却なので `Promise.allSettled` でラップ。

`getCacheTag.events.detail(id)` の正確なシグネチャは `@/shared/lib/constants` を Read で確認 (slug ではなく id を渡す既存パターンに合わせる、Phase 1 plan の `affectedIds` cache 戦略と整合)。

#### I3. UI 拡張 (`EventBulkActions.tsx`)

既存 `EventBulkActions.tsx` (Phase 1 Bundle B) に「キャンセル」ボタン追加。`DeleteConfirmDialog` 同型の確認 dialog (「N 件のイベントをキャンセルし、参加者に通知メールを送信します」)。

#### I4. Tests

**Unit**: `EVENT_STATUS_TRANSITIONS` のマップどおり遷移検証。ARCHIVED → 任意は全 rejected。

**Integration**:

- mock event email: `mock.module("@/shared/lib/email/event-emails", () => ({ sendEventRegistrationConfirmation: mock(...), sendEventRegistrationCancelled: mock(...), sendEventAdminNotification: mock(...), sendEventCancelledToAllParticipants: mock<(eventId: string) => Promise<void>>(() => Promise.resolve()), sendEventUpdatedToAllParticipants: mock(...) }))` で 5 export 全 stub
- CANCELLED 遷移時のみ `sendEventCancelledToAllParticipants` が affectedIds 各々で呼ばれることを検証
- soft-deleted event が affectedIds に含まれないこと
- cloudflare mock は Phase 1/2 と同じ 11 export stub

---

## 全体検証 (Phase 3 完了時)

1. `bun run validate` exit 0
2. `bun test __tests__/unit/domain/{customers,inquiries,events}/bulk-status-commands.test.ts` 全 pass
3. `bun test __tests__/integration/actions/admin` (admin batch) で 全 pass 確認 (mock pollution が起きないこと、Phase 2 の 1458 pass を上回る件数で pass)
4. `git log --oneline main..HEAD` で 3 commit (G/H/I) 確認
5. 各 commit の `git show --stat HEAD~N` で対象ファイル + 行数妥当性
6. 手動 UI 確認は不要（CLAUDE.md feedback `dev-server-manual.md` のため CI に委ねる）

---

## Subagent Dispatch 規律 (Phase 1/2 と同じ)

- **3 並列 general-purpose (sonnet) dispatch を推奨**、ただし Bundle G が `enums/helpers.ts` に 3 マップすべて追加するため、**Bundle G を先行 1 dispatch → 完了後に Bundle H/I を 2 並列 dispatch** が安全 (`enums/helpers.ts` の race を避ける)
- 各 implementer 完了後、controller が `git status --short` + `git diff --stat HEAD` で実態確認 → controller が commit
- 🚫 git 全面禁止 (`add` / `commit` / `push` / `reset` / `checkout` / `restore` / `stash`)
- 🚫 タスク参照コメント禁止 (`Phase 3` / `Bundle G` 等)
- ✅ implementer は plan の Files セクションに記載されたファイルのみ touch
- ✅ 既存 Phase 1/2 component の改修は **既存 export を破壊しない** (status dropdown 追加のみ、delete/toggle は維持)
- ✅ `enums/helpers.ts` への 3 マップ追加は Bundle G implementer の責務、Bundle H/I は読み取り専用

### dispatch 順序

```
1. Bundle G dispatch (Customer + 3 マップ追加)
2. controller verify + commit
3. Bundle H + Bundle I 2 並列 dispatch
4. controller verify + 2 commit
```

または:

```
1. Bundle G を先行で実装し enums/helpers.ts のマップだけ最初の commit に含める
2. Bundle G の残り (domain/UI/test) + H + I を 3 並列 dispatch
```

implementer が `enums/helpers.ts` に 3 マップ全追加と Customer 専用実装の両方を持つので前者が単純。

---

## Phase 3 完了で P19 全完了

P19 Phase 1/2/3 の commit 履歴は `project_p17-19-sequential-handoff.md` に最終記録し、handoff memory を archive 候補に移行する。
