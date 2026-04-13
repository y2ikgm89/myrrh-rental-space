# Notification System Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理通知システムに5つの拡張機能を追加 — タブ未読数表示、リンク自動既読、ポーリング自動更新、ダッシュボードウィジェット、古い通知の自動削除 Cron。

**Architecture:** NotificationBell を拡張してポーリング + タブタイトル更新を追加。NotificationList のリンククリックで既読化を実行。ダッシュボードにウィジェットカードを追加。Cron Route Handler で 30 日超の通知を物理削除。

**Tech Stack:** Next.js 16 Server Actions, Route Handlers (Cron), Tabler Icons, `setInterval` ポーリング

---

## File Structure

### 新規作成ファイル

| ファイル                                                                          | 責務                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_components/NotificationPollingProvider.tsx`   | ポーリング + タブタイトル更新の Client Context Provider |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/notification-polling.ts`       | ポーリング用の軽量 Server Action（未読数のみ返す）      |
| `src/app/(admin)/admin/(dashboard)/_components/DashboardNotificationsSection.tsx` | ダッシュボードウィジェット（Server Component）          |
| `src/app/api/cron/notification-cleanup/route.ts`                                  | 古い通知の自動削除 Cron                                 |
| `src/shared/domain/notifications/commands.ts`                                     | `deleteOldNotificationsCommand` を追加                  |

### 変更ファイル

| ファイル                                                             | 変更内容                                |
| -------------------------------------------------------------------- | --------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx` | ポーリング Context から未読数を受け取る |
| `src/app/(admin)/admin/(dashboard)/_components/NotificationList.tsx` | リンククリック時に自動既読化            |
| `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`           | ポーリング Context から未読数を受け取る |
| `src/app/(admin)/admin/(dashboard)/layout.tsx`                       | NotificationPollingProvider でラップ    |
| `src/app/(admin)/admin/(dashboard)/page.tsx`                         | DashboardNotificationsSection 追加      |

---

### Task 1: ポーリング用 Server Action + Context Provider

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/notification-polling.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_components/NotificationPollingProvider.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/layout.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/NotificationBell.tsx`

- [ ] **Step 1: ポーリング用 Server Action を作成**

`src/app/(admin)/admin/(dashboard)/_shared/actions/notification-polling.ts`:

```typescript
"use server";

import { getUnreadNotificationCount } from "@/admin/queries/notification";

export async function fetchUnreadCount(): Promise<number> {
  return getUnreadNotificationCount();
}
```

- [ ] **Step 2: NotificationPollingProvider を作成**

`src/app/(admin)/admin/(dashboard)/_components/NotificationPollingProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchUnreadCount } from "@/admin/actions/notification-polling";

type NotificationPollingContextValue = {
  unreadCount: number;
  refresh: () => void;
};

const NotificationPollingContext = createContext<
  NotificationPollingContextValue | undefined
>(undefined);

export function useNotificationPolling() {
  const ctx = use(NotificationPollingContext);
  if (ctx === undefined) {
    throw new Error(
      "useNotificationPolling must be used within NotificationPollingProvider",
    );
  }
  return ctx;
}

const POLLING_INTERVAL_MS = 30_000; // 30 seconds

export function NotificationPollingProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const refresh = () => {
    void fetchUnreadCount().then(setUnreadCount);
  };

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void fetchUnreadCount().then(setUnreadCount);
    }, POLLING_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Sync initialCount on navigation (SSR re-render)
  useEffect(() => {
    setUnreadCount(initialCount);
  }, [initialCount]);

  // Update document title
  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, "");
    document.title =
      unreadCount > 0 ? `(${String(unreadCount)}) ${baseTitle}` : baseTitle;
  }, [unreadCount]);

  return (
    <NotificationPollingContext value={{ unreadCount, refresh }}>
      {children}
    </NotificationPollingContext>
  );
}
```

- [ ] **Step 3: layout.tsx に NotificationPollingProvider を追加**

`layout.tsx` を修正。import 追加:

```typescript
import { NotificationPollingProvider } from "./_components/NotificationPollingProvider";
```

JSX で `<AdminLayoutProvider>` の直後（`<ConfirmProvider>` の前）に Provider を挿入:

```tsx
<AdminLayoutProvider>
  <NotificationPollingProvider initialCount={unreadCount}>
    <ConfirmProvider>...</ConfirmProvider>
  </NotificationPollingProvider>
</AdminLayoutProvider>
```

- [ ] **Step 4: TopBar を修正 — props から unreadCount を削除**

`TopBar.tsx` の `TopBarProps` から `unreadCount` を削除（ポーリング Context から取得するため）。ただし `recentNotifications` は props のまま残す（SSR 初期データ）。

TopBar 内部で Context から unreadCount を取得:

```typescript
import { useNotificationPolling } from "./NotificationPollingProvider";
// ...
const { unreadCount } = useNotificationPolling();
```

TopBarProps から `unreadCount` を削除:

```typescript
type TopBarProps = {
  siteName: string | null;
  headerLogoUrl: string | null;
  useHeaderLogo: boolean;
  recentNotifications: SerializedAdminNotificationData[];
};
```

layout.tsx の TopBar 呼び出しからも `unreadCount={unreadCount}` を削除。

- [ ] **Step 5: NotificationBell を修正 — Context から unreadCount を取得**

`NotificationBell.tsx` の props から `unreadCount` を削除し、Context から取得:

```typescript
import { useNotificationPolling } from "./NotificationPollingProvider";

type NotificationBellProps = {
  recentNotifications: SerializedAdminNotificationData[];
};

export function NotificationBell({
  recentNotifications,
}: NotificationBellProps) {
  const { unreadCount, refresh } = useNotificationPolling();
  // ...
  // handleMarkAllAsRead の router.refresh() の後に refresh() を追加
}
```

既読化成功時に `refresh()` を呼んで即時反映:

```typescript
const handleMarkAllAsRead = () => {
  startTransition(async () => {
    const result = await markAllNotificationsAsRead();
    if (!isMutationError(result)) {
      router.refresh();
      refresh();
    }
  });
};
```

- [ ] **Step 6: type-check**

```bash
bun run type-check
```

- [ ] **Step 7: コミット**

```bash
git add src/app/(admin)/
git commit -m "feat(notifications): add polling provider with tab title unread count

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: リンククリック自動既読

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_components/NotificationList.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/notifications/_components/NotificationTable.tsx`

- [ ] **Step 1: NotificationList.tsx — リンククリック時に自動既読化**

「詳細を見る」リンクに onClick を追加し、未読の場合は既読化してから遷移:

```tsx
{
  href && (
    <Link
      href={href}
      className="text-xs text-primary hover:underline"
      onClick={() => {
        if (!notification.isRead) {
          handleMarkAsRead(notification.id);
        }
      }}
    >
      詳細を見る
    </Link>
  );
}
```

NotificationList の `handleMarkAsRead` で `refresh()` も呼ぶ。import と使用を追加:

```typescript
import { useNotificationPolling } from "./NotificationPollingProvider";
// ...
const { refresh } = useNotificationPolling();

const handleMarkAsRead = (id: string) => {
  startTransition(async () => {
    const result = await markNotificationAsRead(id);
    if (!isMutationError(result)) {
      router.refresh();
      refresh();
    }
  });
};
```

- [ ] **Step 2: NotificationTable.tsx — 同様にリンククリック自動既読**

テーブルの「詳細を見る」リンクにも同じパターンを適用。ただし NotificationTable は `/admin/notifications` ページ内なので、Context がスコープ内にあるか確認。`useNotificationPolling` を import して `refresh()` を呼ぶ。

- [ ] **Step 3: type-check**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/(admin)/
git commit -m "feat(notifications): auto-mark as read on resource link click

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ダッシュボードウィジェット

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_components/DashboardNotificationsSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/page.tsx`

- [ ] **Step 1: DashboardNotificationsSection を作成**

`src/app/(admin)/admin/(dashboard)/_components/DashboardNotificationsSection.tsx`:

```tsx
import Link from "next/link";
import { getRecentNotifications } from "@/admin/queries/notification";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import { Button } from "@/admin/components/ui/button";
import { Badge } from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_BADGE_VARIANTS,
  isValidNotificationType,
} from "@/shared/lib/validations/enums/helpers";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";
import { formatDateTimeShort } from "@/shared/lib/date-format";

export async function DashboardNotificationsSection() {
  const notifications = await getRecentNotifications(5);
  const unreadNotifications = notifications.filter((n) => !n.isRead);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>最新の通知</CardTitle>
          <CardDescription>
            {unreadNotifications.length > 0
              ? `未読 ${String(unreadNotifications.length)} 件`
              : "未読なし"}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/notifications">すべて表示</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <EmptyState message="通知はありません" />
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const typeLabel = isValidNotificationType(notification.type)
                ? NOTIFICATION_TYPE_LABELS[notification.type]
                : notification.type;
              const badgeVariant = isValidNotificationType(notification.type)
                ? NOTIFICATION_TYPE_BADGE_VARIANTS[notification.type]
                : "secondary";
              const href = getNotificationResourceHref(
                notification.resourceType,
                notification.resourceId,
              );

              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-3 ${notification.isRead ? "opacity-60" : ""}`}
                >
                  {!notification.isRead && (
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  {notification.isRead && <span className="w-2 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant}>{typeLabel}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTimeShort(notification.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{notification.title}</p>
                    {href && (
                      <Link
                        href={href}
                        className="text-xs text-primary hover:underline"
                      >
                        詳細を見る
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: page.tsx にウィジェットを追加**

`src/app/(admin)/admin/(dashboard)/page.tsx` を修正。

import 追加:

```typescript
import { DashboardNotificationsSection } from "./_components/DashboardNotificationsSection";
```

ウィジェットのスケルトン定義を追加:

```tsx
function NotificationsSkeleton() {
  return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
}
```

JSX 内で `DashboardStatsSection` の直後（チャートセクションの前）に追加:

```tsx
{
  /* 最新通知 */
}
<Suspense fallback={<NotificationsSkeleton />}>
  <DashboardNotificationsSection />
</Suspense>;
```

- [ ] **Step 3: type-check**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/app/(admin)/
git commit -m "feat(notifications): add dashboard notifications widget

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 古い通知の自動削除 Cron

**Files:**

- Modify: `src/shared/domain/notifications/commands.ts`
- Create: `src/app/api/cron/notification-cleanup/route.ts`

- [ ] **Step 1: deleteOldNotificationsCommand を追加**

`src/shared/domain/notifications/commands.ts` に追加:

```typescript
export async function deleteOldNotificationsCommand(
  olderThanDays: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);

  const result = await prisma.adminNotification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}
```

- [ ] **Step 2: Cron Route Handler を作成**

`src/app/api/cron/notification-cleanup/route.ts`:

```typescript
import { unstable_rethrow } from "next/navigation";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { deleteOldNotificationsCommand } from "@/shared/domain/notifications/commands";
import { serverEnv } from "@/shared/lib/env/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { logger } from "@/shared/lib/logger";

const RETENTION_DAYS = 30;

export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "notificationCleanup",
    });
    if (authResult) return authResult;

    const deletedCount = await deleteOldNotificationsCommand(RETENTION_DAYS);

    logger.info("Notification cleanup completed", {
      deletedCount,
      retentionDays: RETENTION_DAYS,
    });

    return jsonSuccess({ deletedCount, retentionDays: RETENTION_DAYS });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "notificationCleanup" },
    });
    return jsonError("Cleanup failed", 500);
  }
}
```

- [ ] **Step 3: type-check**

```bash
bun run type-check
```

- [ ] **Step 4: コミット**

```bash
git add src/shared/domain/notifications/commands.ts src/app/api/cron/notification-cleanup/
git commit -m "feat(notifications): add 30-day auto-cleanup cron endpoint

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 最終検証

**Files:**

- None (verification only)

- [ ] **Step 1: ユニットテスト実行**

```bash
bun test __tests__/unit/domain/notifications
```

- [ ] **Step 2: validate**

```bash
bun run validate
```

- [ ] **Step 3: build**

```bash
bun run build
```

- [ ] **Step 4: 完了確認**

全テスト通過、validate 通過、build 通過を確認。
