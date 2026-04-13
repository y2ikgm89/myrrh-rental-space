# Admin Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面にインアプリ通知システムを追加する — Notification モデル、TopBar ベルアイコン（未読バッジ + ドロップダウン）、通知一覧ページ、既存アクションからの通知生成。

**Architecture:** Prisma `AdminNotification` モデルで通知を永続化。通知生成は既存 Server Action の `afterSuccess` 内で `fireAndForget(createNotificationCommand(...))` として実行。TopBar のベルアイコンは `Popover` で最新通知をドロップダウン表示し、`/admin/notifications` ページで全件一覧・フィルタ・一括既読を提供。

**Tech Stack:** Prisma 7, Next.js 16 Server Actions, nuqs, Radix Popover, Tabler Icons, `executeAdminMutationResult`

---

## File Structure

### 新規作成ファイル

| ファイル                                                                                  | 責務                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| `prisma/migrations/YYYYMMDD_add_admin_notification/migration.sql`                         | DB マイグレーション                          |
| `src/shared/domain/notifications/commands.ts`                                             | 通知作成・既読化・削除コマンド               |
| `src/shared/domain/notifications/admin-queries.ts`                                        | 管理画面用クエリ（一覧 + 未読数）            |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/notification.ts`                       | Server Actions（既読化・一括既読・削除）     |
| `src/app/(admin)/admin/(dashboard)/_shared/queries/notification.ts`                       | 管理画面クエリラッパー                       |
| `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx`                      | TopBar ベルアイコン + Popover ドロップダウン |
| `src/app/(admin)/admin/(dashboard)/_components/NotificationList.tsx`                      | ドロップダウン内の通知リスト                 |
| `src/app/(admin)/admin/(dashboard)/notifications/page.tsx`                                | 通知一覧ページ                               |
| `src/app/(admin)/admin/(dashboard)/notifications/loading.tsx`                             | ローディングスケルトン                       |
| `src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationFilters.tsx`     | フィルターコンポーネント                     |
| `src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationTable.tsx`       | 通知テーブル                                 |
| `src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationBulkActions.tsx` | 一括操作バー                                 |
| `__tests__/unit/domain/notifications/commands.test.ts`                                    | コマンドユニットテスト                       |

### 変更ファイル

| ファイル                                                                     | 変更内容                             |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| `prisma/schema.prisma`                                                       | `AdminNotification` モデル追加       |
| `src/shared/lib/constants/cache.ts`                                          | `NOTIFICATIONS` タグ追加             |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`               | `notification` リソース追加          |
| `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`                   | `NotificationBell` 組み込み          |
| `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`            | 通知ナビ項目追加                     |
| `src/app/(admin)/admin/(dashboard)/layout.tsx`                               | 未読数を TopBar に渡す               |
| `src/shared/lib/nuqs/parsers.ts`                                             | 通知一覧用 searchParams パーサー追加 |
| `src/shared/lib/validations/enums/helpers.ts`                                | NotificationType ラベル・バッジ追加  |
| 既存 Server Actions（reservation/mutations, inquiry, event-registration 等） | `afterSuccess` に通知生成追加        |

---

### Task 1: Prisma スキーマ — AdminNotification モデル

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: AdminNotification モデルをスキーマに追加**

`prisma/schema.prisma` の末尾（最後のモデル定義の後）に以下を追加:

```prisma
// ==============================================
// Admin Notification
// ==============================================

model AdminNotification {
  id           String   @id @default(uuid()) @db.Uuid
  type         String   @db.VarChar(50)    // "reservation_new" | "reservation_cancel" | etc.
  title        String   @db.VarChar(200)
  message      String   @db.VarChar(500)
  resourceType String?  @db.VarChar(50)    // "reservation" | "inquiry" | "event" | etc.
  resourceId   String?  @db.Uuid
  isRead       Boolean  @default(false)
  createdAt    DateTime @default(now()) @db.Timestamptz(6)

  @@index([isRead, createdAt(sort: Desc)])
  @@index([type])
  @@index([createdAt(sort: Desc)])
  @@map("admin_notification")
}
```

設計判断:

- `userId` なし — 全管理者共有の通知（小規模チーム前提、個人宛通知は YAGNI）
- `type` は `String @db.VarChar(50)` — Prisma enum ではなく DB VARCHAR（`enums/helpers.ts` で `as const` 管理。セクション型と同じパターン）
- `resourceType` + `resourceId` で通知から関連リソースへの遷移リンクを構築
- ソフトデリートなし（通知は物理削除）

- [ ] **Step 2: マイグレーション実行**

```bash
bunx --bun prisma migrate dev --name add_admin_notification
```

- [ ] **Step 3: Prisma Client 再生成確認**

```bash
bun run type-check
```

Expected: `AdminNotification` 型が `@generated/prisma/client` で利用可能。

- [ ] **Step 4: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(notifications): add AdminNotification model"
```

---

### Task 2: 定数・型ヘルパー — NotificationType + キャッシュタグ

**Files:**

- Modify: `src/shared/lib/constants/cache.ts`
- Modify: `src/shared/lib/validations/enums/helpers.ts`

- [ ] **Step 1: CACHE_TAGS に NOTIFICATIONS 追加**

`src/shared/lib/constants/cache.ts` の `CACHE_TAGS` オブジェクトの末尾（`EVENT_REGISTRATIONS` の後）に追加:

```typescript
/** 管理通知 */
NOTIFICATIONS: "notifications",
```

`getCacheTag` オブジェクトの末尾に追加:

```typescript
notifications: {
  list: () => CACHE_TAGS.NOTIFICATIONS,
},
```

- [ ] **Step 2: NotificationType 定数を enums/helpers.ts に追加**

`src/shared/lib/validations/enums/helpers.ts` に以下を追加:

```typescript
// =============================================================================
// AdminNotification Type（DB VARCHAR 管理 — Prisma enum ではない）
// =============================================================================

export const NOTIFICATION_TYPE = {
  RESERVATION_NEW: "reservation_new",
  RESERVATION_CANCEL: "reservation_cancel",
  RESERVATION_CHANGE: "reservation_change",
  INQUIRY_NEW: "inquiry_new",
  REVIEW_NEW: "review_new",
  EVENT_REGISTRATION: "event_registration",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

const VALID_NOTIFICATION_TYPES = new Set<string>(
  Object.values(NOTIFICATION_TYPE),
);

export function isValidNotificationType(
  value: unknown,
): value is NotificationType {
  return typeof value === "string" && VALID_NOTIFICATION_TYPES.has(value);
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  [NOTIFICATION_TYPE.RESERVATION_NEW]: "新規予約",
  [NOTIFICATION_TYPE.RESERVATION_CANCEL]: "予約キャンセル",
  [NOTIFICATION_TYPE.RESERVATION_CHANGE]: "予約変更",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "新規お問い合わせ",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "新規レビュー",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "イベント申込",
};

export const NOTIFICATION_TYPE_BADGE_VARIANTS: Record<
  NotificationType,
  BadgeVariant
> = {
  [NOTIFICATION_TYPE.RESERVATION_NEW]: "default",
  [NOTIFICATION_TYPE.RESERVATION_CANCEL]: "destructive",
  [NOTIFICATION_TYPE.RESERVATION_CHANGE]: "secondary",
  [NOTIFICATION_TYPE.INQUIRY_NEW]: "default",
  [NOTIFICATION_TYPE.REVIEW_NEW]: "default",
  [NOTIFICATION_TYPE.EVENT_REGISTRATION]: "default",
};
```

- [ ] **Step 3: enums/index.ts の barrel に追加**

`src/shared/lib/validations/enums/index.ts` に re-export を追加:

```typescript
export {
  NOTIFICATION_TYPE,
  type NotificationType,
  isValidNotificationType,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_BADGE_VARIANTS,
} from "./helpers";
```

- [ ] **Step 4: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/constants/cache.ts src/shared/lib/validations/enums/helpers.ts src/shared/lib/validations/enums/index.ts
git commit -m "feat(notifications): add cache tags and notification type constants"
```

---

### Task 3: 権限 — notification リソース追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`
- Test: `__tests__/unit/lib/permissions.test.ts`

- [ ] **Step 1: Resource 型に `notification` 追加**

`permissions.ts` の `Resource` 型に追加:

```typescript
export type Resource =
  | "space"
  | "location"
  // ... existing ...
  | "event"
  | "notification"; // 追加
```

- [ ] **Step 2: ROLE_PERMISSIONS に権限追加**

`SUPER_ADMIN` の配列末尾に:

```typescript
"notification:read",
"notification:update",
"notification:delete",
```

`ADMIN` の配列末尾に:

```typescript
"notification:read",
"notification:update",
"notification:delete",
```

`EDITOR` の配列末尾に:

```typescript
"notification:read",
"notification:update",
```

`VIEWER` の配列末尾に:

```typescript
"notification:read",
```

- [ ] **Step 3: 既存テストの更新**

`__tests__/unit/lib/permissions.test.ts` に `notification` 権限のテストケースがあれば更新。なければ既存パターンに合わせて追加。

- [ ] **Step 4: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 5: テスト実行**

```bash
bun test __tests__/unit/lib/permissions.test.ts
```

- [ ] **Step 6: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts __tests__/unit/lib/permissions.test.ts
git commit -m "feat(notifications): add notification resource permissions"
```

---

### Task 4: ドメイン層 — commands + admin-queries

**Files:**

- Create: `src/shared/domain/notifications/commands.ts`
- Create: `src/shared/domain/notifications/admin-queries.ts`
- Test: `__tests__/unit/domain/notifications/commands.test.ts`

- [ ] **Step 1: テストを書く**

`__tests__/unit/domain/notifications/commands.test.ts`:

```typescript
import { describe, test, expect, beforeEach, mock } from "bun:test";

// Prisma モック
const mockPrisma = {
  adminNotification: {
    create: mock(() => Promise.resolve({ id: "test-id" })),
    update: mock(() => Promise.resolve({ id: "test-id", isRead: true })),
    updateMany: mock(() => Promise.resolve({ count: 5 })),
    delete: mock(() => Promise.resolve({ id: "test-id" })),
  },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: mockPrisma,
}));

mock.module("server-only", () => ({}));

const {
  createNotificationCommand,
  markAsReadCommand,
  markAllAsReadCommand,
  deleteNotificationCommand,
} = await import("@/shared/domain/notifications/commands");

describe("createNotificationCommand", () => {
  beforeEach(() => {
    mockPrisma.adminNotification.create.mockClear();
  });

  test("creates notification with all fields", async () => {
    await createNotificationCommand({
      type: "reservation_new",
      title: "新規予約",
      message: "テスト太郎様が予約しました",
      resourceType: "reservation",
      resourceId: "res-123",
    });

    expect(mockPrisma.adminNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "reservation_new",
        title: "新規予約",
        message: "テスト太郎様が予約しました",
        resourceType: "reservation",
        resourceId: "res-123",
      }),
    });
  });

  test("creates notification without optional fields", async () => {
    await createNotificationCommand({
      type: "inquiry_new",
      title: "新規お問い合わせ",
      message: "お問い合わせがありました",
    });

    expect(mockPrisma.adminNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "inquiry_new",
        resourceType: undefined,
        resourceId: undefined,
      }),
    });
  });
});

describe("markAsReadCommand", () => {
  beforeEach(() => {
    mockPrisma.adminNotification.update.mockClear();
  });

  test("marks single notification as read", async () => {
    await markAsReadCommand("notif-1");

    expect(mockPrisma.adminNotification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { isRead: true },
    });
  });
});

describe("markAllAsReadCommand", () => {
  beforeEach(() => {
    mockPrisma.adminNotification.updateMany.mockClear();
  });

  test("marks all unread notifications as read", async () => {
    await markAllAsReadCommand();

    expect(mockPrisma.adminNotification.updateMany).toHaveBeenCalledWith({
      where: { isRead: false },
      data: { isRead: true },
    });
  });
});

describe("deleteNotificationCommand", () => {
  beforeEach(() => {
    mockPrisma.adminNotification.delete.mockClear();
  });

  test("deletes notification by id", async () => {
    await deleteNotificationCommand("notif-1");

    expect(mockPrisma.adminNotification.delete).toHaveBeenCalledWith({
      where: { id: "notif-1" },
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
bun test __tests__/unit/domain/notifications/commands.test.ts
```

Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: commands.ts を実装**

`src/shared/domain/notifications/commands.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { NotificationType } from "@/shared/lib/validations/enums";

type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
};

export async function createNotificationCommand(
  input: CreateNotificationInput,
): Promise<void> {
  await prisma.adminNotification.create({
    data: {
      type: input.type,
      title: input.title,
      message: input.message,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    },
  });
}

export async function markAsReadCommand(id: string): Promise<void> {
  await prisma.adminNotification.update({
    where: { id },
    data: { isRead: true },
  });
}

export async function markAllAsReadCommand(): Promise<void> {
  await prisma.adminNotification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });
}

export async function deleteNotificationCommand(id: string): Promise<void> {
  await prisma.adminNotification.delete({
    where: { id },
  });
}
```

- [ ] **Step 4: admin-queries.ts を実装**

`src/shared/domain/notifications/admin-queries.ts`:

```typescript
import "server-only";

import { prisma } from "@/shared/db/prisma";

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  message: true,
  resourceType: true,
  resourceId: true,
  isRead: true,
  createdAt: true,
} as const;

export type AdminNotificationData = {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: Date;
};

type GetNotificationsParams = {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
};

export async function getNotificationsQuery(params: GetNotificationsParams) {
  const { page, perPage, type, isRead } = params;

  const where: Record<string, unknown> = {};
  if (type) where["type"] = type;
  if (isRead !== undefined) where["isRead"] = isRead;

  const [total, notifications] = await prisma.$transaction([
    prisma.adminNotification.count({ where }),
    prisma.adminNotification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return {
    notifications,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

export async function getUnreadCountQuery(): Promise<number> {
  return prisma.adminNotification.count({
    where: { isRead: false },
  });
}

export async function getRecentNotificationsQuery(limit = 10) {
  return prisma.adminNotification.findMany({
    select: NOTIFICATION_SELECT,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
```

- [ ] **Step 5: テスト実行**

```bash
bun test __tests__/unit/domain/notifications/commands.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 7: コミット**

```bash
git add src/shared/domain/notifications/ __tests__/unit/domain/notifications/
git commit -m "feat(notifications): add domain commands and admin queries"
```

---

### Task 5: Server Actions — notification CRUD

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/notification.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/queries/notification.ts`

- [ ] **Step 1: クエリラッパーを作成**

`src/app/(admin)/admin/(dashboard)/_shared/queries/notification.ts`:

```typescript
import "server-only";

import {
  getNotificationsQuery,
  getUnreadCountQuery,
  getRecentNotificationsQuery,
} from "@/shared/domain/notifications/admin-queries";

export async function getNotifications(params: {
  page: number;
  perPage: number;
  type?: string;
  isRead?: boolean;
}) {
  return getNotificationsQuery(params);
}

export async function getUnreadNotificationCount() {
  return getUnreadCountQuery();
}

export async function getRecentNotifications(limit?: number) {
  return getRecentNotificationsQuery(limit);
}
```

- [ ] **Step 2: Server Actions を作成**

`src/app/(admin)/admin/(dashboard)/_shared/actions/notification.ts`:

```typescript
"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  markAsReadCommand,
  markAllAsReadCommand,
  deleteNotificationCommand,
} from "@/shared/domain/notifications/commands";
import type { MutationResult } from "@/shared/lib/mutation-result";

export async function markNotificationAsRead(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "notification",
    action: "update",
    resourceId: id,
    execute: async () => {
      await markAsReadCommand(id);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATIONS);
    },
  });
}

export async function markAllNotificationsAsRead(): Promise<
  MutationResult<null>
> {
  return executeAdminMutationResult({
    resource: "notification",
    action: "update",
    execute: async () => {
      await markAllAsReadCommand();
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATIONS);
    },
  });
}

export async function deleteNotification(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "notification",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteNotificationCommand(id);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATIONS);
    },
  });
}
```

- [ ] **Step 3: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/notification.ts' 'src/app/(admin)/admin/(dashboard)/_shared/queries/notification.ts'
git commit -m "feat(notifications): add server actions and query wrappers"
```

---

### Task 6: TopBar — NotificationBell コンポーネント

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_components/NotificationList.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/layout.tsx`

- [ ] **Step 1: NotificationList コンポーネントを作成**

`src/app/(admin)/admin/(dashboard)/_components/NotificationList.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { markNotificationAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import { NOTIFICATION_TYPE_LABELS } from "@/shared/lib/validations/enums";
import type { NotificationType } from "@/shared/lib/validations/enums";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: string;
};

function getResourceHref(
  resourceType: string | null,
  resourceId: string | null,
): string | null {
  if (!resourceType || !resourceId) return null;
  const routes: Record<string, string> = {
    reservation: `/admin/reservations/${resourceId}`,
    inquiry: `/admin/inquiries/${resourceId}`,
    review: `/admin/reviews`,
    event: `/admin/events/${resourceId}/edit`,
  };
  return routes[resourceType] ?? null;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${String(diffMin)}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${String(diffHour)}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${String(diffDay)}日前`;
  return date.toLocaleDateString("ja-JP");
}

export function NotificationList({
  notifications,
  onClose,
}: {
  notifications: NotificationItem[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleMarkAsRead = (id: string) => {
    startTransition(async () => {
      const result = await markNotificationAsRead(id);
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  if (notifications.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        通知はありません
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      {notifications.map((notification) => {
        const href = getResourceHref(
          notification.resourceType,
          notification.resourceId,
        );
        const typeLabel =
          NOTIFICATION_TYPE_LABELS[notification.type as NotificationType] ??
          notification.type;

        return (
          <div
            key={notification.id}
            className={`flex items-start gap-3 border-b px-4 py-3 last:border-b-0 ${
              notification.isRead ? "opacity-60" : "bg-primary/5"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {typeLabel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatRelativeTime(notification.createdAt)}
                </span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {notification.title}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {notification.message}
              </p>
              {href && (
                <Link
                  href={href}
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                  onClick={onClose}
                >
                  詳細を見る
                </Link>
              )}
            </div>
            {!notification.isRead && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => handleMarkAsRead(notification.id)}
                disabled={isPending}
                aria-label="既読にする"
              >
                <IconCheck className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: NotificationBell コンポーネントを作成**

`src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconBell } from "@tabler/icons-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/admin/components/ui/popover";
import { Button } from "@/admin/components/ui";
import { NotificationList } from "./NotificationList";
import { markAllNotificationsAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: string;
};

type NotificationBellProps = {
  unreadCount: number;
  recentNotifications: NotificationItem[];
};

export function NotificationBell({
  unreadCount,
  recentNotifications,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleMarkAllAsRead = () => {
    startTransition(async () => {
      const result = await markAllNotificationsAsRead();
      if (!isMutationError(result)) {
        router.refresh();
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 p-0"
          aria-label={`通知${unreadCount > 0 ? `（未読${String(unreadCount)}件）` : ""}`}
        >
          <IconBell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : String(unreadCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[380px] p-0"
        aria-label="通知一覧"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">通知</h3>
          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllAsRead}
              disabled={isPending}
            >
              すべて既読にする
            </Button>
          )}
        </div>

        <NotificationList
          notifications={recentNotifications}
          onClose={() => setOpen(false)}
        />

        <div className="border-t px-4 py-2 text-center">
          <Link
            href="/admin/notifications"
            className="text-xs text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            すべての通知を見る
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: layout.tsx を修正して未読数とリストを TopBar に渡す**

`src/app/(admin)/admin/(dashboard)/layout.tsx` を修正。既存の import に追加:

```typescript
import {
  getUnreadNotificationCount,
  getRecentNotifications,
} from "@/admin/queries/notification";
```

`DashboardLayout` 関数内で `brandingSettings` 取得後に追加:

```typescript
const [unreadCount, recentNotifications] = await Promise.all([
  getUnreadNotificationCount(),
  getRecentNotifications(10),
]);
```

`TopBar` の props に通知データを追加:

```tsx
<TopBar
  siteName={brandingSettings.siteName}
  headerLogoUrl={brandingSettings.headerLogoUrl}
  useHeaderLogo={brandingSettings.useHeaderLogo}
  unreadCount={unreadCount}
  recentNotifications={recentNotifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }))}
/>
```

- [ ] **Step 4: TopBar.tsx を修正**

`TopBar.tsx` の props 型に追加:

```typescript
type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: string;
};

type TopBarProps = {
  siteName: string | null;
  headerLogoUrl: string | null;
  useHeaderLogo: boolean;
  unreadCount: number;
  recentNotifications: NotificationItem[];
};
```

import に追加:

```typescript
import { NotificationBell } from "./NotificationBell";
```

`{/* 右: アクション */}` セクション内、`<Link href="/"...>` の前に追加:

```tsx
<NotificationBell
  unreadCount={unreadCount}
  recentNotifications={recentNotifications}
/>
```

- [ ] **Step 5: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 6: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx' 'src/app/(admin)/admin/(dashboard)/_components/NotificationList.tsx' 'src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx' 'src/app/(admin)/admin/(dashboard)/layout.tsx'
git commit -m "feat(notifications): add NotificationBell to TopBar with popover dropdown"
```

---

### Task 7: 通知一覧ページ

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/notifications/page.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/notifications/loading.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationFilters.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationTable.tsx`
- Modify: `src/shared/lib/nuqs/parsers.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx`

- [ ] **Step 1: nuqs パーサーを追加**

`src/shared/lib/nuqs/parsers.ts` に追加:

```typescript
// Notification search params
export const adminNotificationSearchParamsParsers = {
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
  type: parseAsString.withDefault(""),
  isRead: parseAsString.withDefault(""),
};

const adminNotificationSearchParamsCache = createSearchParamsCache(
  adminNotificationSearchParamsParsers,
);

export async function loadAdminNotificationSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminNotificationSearchParamsCache.parse(searchParams);
  return adminNotificationSearchParamsCache.all();
}
```

`src/shared/lib/nuqs/index.ts` の barrel に追加:

```typescript
export {
  adminNotificationSearchParamsParsers,
  loadAdminNotificationSearchParams,
} from "./parsers";
```

- [ ] **Step 2: NotificationFilters コンポーネントを作成**

`src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationFilters.tsx`:

```tsx
"use client";

import { useQueryStates } from "nuqs";
import { adminNotificationSearchParamsParsers } from "@/shared/lib/nuqs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { Button } from "@/admin/components/ui";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums";

export function NotificationFilters() {
  const [params, setParams] = useQueryStates(
    adminNotificationSearchParamsParsers,
    { history: "push", shallow: false },
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={params.type}
        onValueChange={(value) =>
          void setParams({ type: value === "all" ? "" : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="種別で絞り込み" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          {Object.entries(NOTIFICATION_TYPE).map(([key, value]) => (
            <SelectItem key={key} value={value}>
              {NOTIFICATION_TYPE_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.isRead}
        onValueChange={(value) =>
          void setParams({ isRead: value === "all" ? "" : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="既読状態" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">すべて</SelectItem>
          <SelectItem value="false">未読のみ</SelectItem>
          <SelectItem value="true">既読のみ</SelectItem>
        </SelectContent>
      </Select>

      {(params.type || params.isRead) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void setParams({ type: "", isRead: "", page: 1 })}
        >
          リセット
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: NotificationTable コンポーネントを作成**

`src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationTable.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconCheck, IconTrash } from "@tabler/icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui/table";
import { Badge, Button } from "@/admin/components/ui";
import {
  markNotificationAsRead,
  deleteNotification,
} from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_BADGE_VARIANTS,
} from "@/shared/lib/validations/enums";
import type { NotificationType } from "@/shared/lib/validations/enums";
import { formatSerializedDateTime } from "@/shared/lib/date-format";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string | null;
  resourceId: string | null;
  isRead: boolean;
  createdAt: string;
};

function getResourceHref(
  resourceType: string | null,
  resourceId: string | null,
): string | null {
  if (!resourceType || !resourceId) return null;
  const routes: Record<string, string> = {
    reservation: `/admin/reservations/${resourceId}`,
    inquiry: `/admin/inquiries/${resourceId}`,
    review: `/admin/reviews`,
    event: `/admin/events/${resourceId}/edit`,
  };
  return routes[resourceType] ?? null;
}

export function NotificationTable({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleMarkAsRead = (id: string) => {
    startTransition(async () => {
      const result = await markNotificationAsRead(id);
      if (!isMutationError(result)) router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteNotification(id);
      if (!isMutationError(result)) router.refresh();
    });
  };

  if (notifications.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        通知はありません
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]" />
              <TableHead className="whitespace-nowrap">種別</TableHead>
              <TableHead>内容</TableHead>
              <TableHead className="hidden md:table-cell">日時</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notifications.map((notification) => {
              const href = getResourceHref(
                notification.resourceType,
                notification.resourceId,
              );
              const typeLabel =
                NOTIFICATION_TYPE_LABELS[
                  notification.type as NotificationType
                ] ?? notification.type;
              const badgeVariant =
                NOTIFICATION_TYPE_BADGE_VARIANTS[
                  notification.type as NotificationType
                ] ?? "secondary";

              return (
                <TableRow
                  key={notification.id}
                  className={notification.isRead ? "opacity-60" : ""}
                >
                  <TableCell>
                    {!notification.isRead && (
                      <span className="inline-block h-2 w-2 rounded-full bg-primary" />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={badgeVariant}>{typeLabel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {notification.message}
                      </p>
                      {href && (
                        <Link
                          href={href}
                          className="mt-0.5 inline-block text-xs text-primary hover:underline"
                        >
                          詳細を見る
                        </Link>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {formatSerializedDateTime(notification.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!notification.isRead && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleMarkAsRead(notification.id)}
                          disabled={isPending}
                          aria-label="既読にする"
                        >
                          <IconCheck className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(notification.id)}
                        disabled={isPending}
                        aria-label="削除"
                      >
                        <IconTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: loading.tsx を作成**

`src/app/(admin)/admin/(dashboard)/notifications/loading.tsx`:

```tsx
import { LoadingState } from "@/admin/components/LoadingState";

export default function NotificationsLoading() {
  return <LoadingState />;
}
```

- [ ] **Step 5: page.tsx を作成**

`src/app/(admin)/admin/(dashboard)/notifications/page.tsx`:

```tsx
import { Suspense } from "react";
import { getNotifications } from "@/admin/queries/notification";
import { loadAdminNotificationSearchParams } from "@/shared/lib/nuqs";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { NotificationFilters } from "./_components/NotificationFilters";
import { NotificationTable } from "./_components/NotificationTable";
import { markAllNotificationsAsRead } from "@/admin/actions/notification";
import { MarkAllReadButton } from "./_components/MarkAllReadButton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "通知 | 管理画面",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function NotificationListSection({ searchParams }: PageProps) {
  const params = await loadAdminNotificationSearchParams(searchParams);
  const isReadFilter =
    params.isRead === "true"
      ? true
      : params.isRead === "false"
        ? false
        : undefined;

  const result = await getNotifications({
    page: params.page,
    perPage: params.perPage,
    type: params.type || undefined,
    isRead: isReadFilter,
  });

  return (
    <>
      <NotificationTable
        notifications={result.notifications.map((n) => ({
          ...n,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            通知
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            システムからの通知を確認します
          </p>
        </div>
        <MarkAllReadButton />
      </div>

      <Suspense fallback={<LoadingState variant="inline" />}>
        <NotificationFilters />
      </Suspense>

      <Suspense fallback={<LoadingState />}>
        <NotificationListSection searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

注意: `MarkAllReadButton` を別コンポーネントとして作成する必要がある（Client Component）。

`src/app/(admin)/admin/(dashboard)/notifications/_components/MarkAllReadButton.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconChecks } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { markAllNotificationsAsRead } from "@/admin/actions/notification";
import { isMutationError } from "@/shared/lib/mutation-result";

export function MarkAllReadButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleClick = () => {
    startTransition(async () => {
      const result = await markAllNotificationsAsRead();
      if (!isMutationError(result)) router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
    >
      <IconChecks className="mr-2 h-4 w-4" />
      すべて既読にする
    </Button>
  );
}
```

- [ ] **Step 6: サイドバーに通知ナビ項目を追加**

`src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx` に import 追加:

```typescript
import { IconBell } from "@tabler/icons-react";
```

`SIDEBAR_ITEMS` 配列で「監査ログ」の前に追加:

```typescript
{
  label: "通知",
  href: "/admin/notifications",
  icon: <IconBell className="h-5 w-5" />,
},
```

- [ ] **Step 7: type-check 実行**

```bash
bun run type-check
```

- [ ] **Step 8: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/notifications/ src/shared/lib/nuqs/ src/app/(admin)/admin/(dashboard)/_components/sidebar-items.tsx
git commit -m "feat(notifications): add notifications list page with filters"
```

---

### Task 8: 通知生成 — 既存アクションへの統合

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts`
- Modify: 公開フォーム Server Actions（予約・お問い合わせ）

この Task では代表的な統合ポイントを実装する。パターンが確立されたら、残りのアクションにも横展開する。

- [ ] **Step 1: fireAndForget ヘルパーの import パスを確認**

既存の `fireAndForget` の import パスを確認（`@/shared/lib/errors/server` から export されている）。

- [ ] **Step 2: 予約作成時の通知生成を追加**

通知生成は **公開フォームの Server Action**（`src/app/(public)/_shared/actions/reservation.ts`）の予約完了後に追加する。管理画面の予約作成（`src/app/(admin)/.../_shared/actions/reservation/admin.ts`）にも同様に追加。

各アクションの `afterSuccess`（管理）または成功後処理（公開）に以下パターンを追加:

```typescript
import { fireAndForget } from "@/shared/lib/errors/server";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { updateTag } from "next/cache";

// afterSuccess 内に追加:
fireAndForget(
  createNotificationCommand({
    type: NOTIFICATION_TYPE.RESERVATION_NEW,
    title: "新規予約",
    message: `${customerName}様が${spaceName}を予約しました`,
    resourceType: "reservation",
    resourceId: reservationId,
  }),
  {
    operation: "createReservationNotification",
    category: ErrorCategory.DATABASE,
  },
);
updateTag(CACHE_TAGS.NOTIFICATIONS);
```

同様に以下にも追加:

- 予約キャンセル（`RESERVATION_CANCEL`）
- 予約ステータス変更（`RESERVATION_CHANGE`）

- [ ] **Step 3: お問い合わせ作成時の通知生成を追加**

公開フォームの `submitInquiry` アクションの成功後に:

```typescript
fireAndForget(
  createNotificationCommand({
    type: NOTIFICATION_TYPE.INQUIRY_NEW,
    title: "新規お問い合わせ",
    message: `${name}様からお問い合わせがありました`,
    resourceType: "inquiry",
    resourceId: inquiryId,
  }),
  {
    operation: "createInquiryNotification",
    category: ErrorCategory.DATABASE,
  },
);
updateTag(CACHE_TAGS.NOTIFICATIONS);
```

- [ ] **Step 4: イベント申込時の通知生成を追加**

`event-registration.ts` の `registerForEvent` アクションの `afterSuccess` に:

```typescript
fireAndForget(
  createNotificationCommand({
    type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
    title: "イベント申込",
    message: `${name}様が「${eventTitle}」に申し込みました`,
    resourceType: "event",
    resourceId: eventId,
  }),
  {
    operation: "createEventRegistrationNotification",
    category: ErrorCategory.DATABASE,
  },
);
updateTag(CACHE_TAGS.NOTIFICATIONS);
```

- [ ] **Step 5: type-check + validate 実行**

```bash
bun run validate
```

- [ ] **Step 6: コミット**

```bash
git add src/app/
git commit -m "feat(notifications): integrate notification creation into existing actions"
```

---

### Task 9: テストバッチ登録 + 検証

**Files:**

- Modify: `package.json`（test スクリプトにバッチ追加）

- [ ] **Step 1: package.json の test スクリプトにバッチ追加**

既存の `test` スクリプトに `bun test __tests__/unit/domain/notifications` を追加。

- [ ] **Step 2: 全テスト実行**

```bash
bun run test:unit
```

- [ ] **Step 3: validate + build**

```bash
bun run validate && bun run build
```

- [ ] **Step 4: コミット**

```bash
git add package.json
git commit -m "chore: add notification tests to test batch"
```

---

## 実装上の注意

### Popover について

- `@radix-ui/react-popover` は shadcn/ui でインストール済みか確認。なければ `bunx --bun shadcn@latest add popover`
- `@/admin/components/ui/popover` が存在しない場合は生成

### formatSerializedDateTime について

- `@/shared/lib/date-format` に既存の日時フォーマット関数があるか確認
- なければ `src/shared/lib/date-format.ts` に追加

### 通知の自動削除

- 初期実装では手動削除のみ。30日超の通知自動削除は Cron として将来タスク（YAGNI）

### ポーリング vs リアルタイム

- 初期実装ではページ遷移時に `layout.tsx` で未読数を再取得（Server Component）
- WebSocket/SSE によるリアルタイム更新は将来タスク（YAGNI）
