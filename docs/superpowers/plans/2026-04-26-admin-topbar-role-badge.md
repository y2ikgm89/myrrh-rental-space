# P5: Admin TopBar Role Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面 TopBar 右端に管理者の email + Role badge を表示。SUPER_ADMIN / ADMIN / EDITOR / VIEWER の判別が UI 上で常時可視化され、「なぜこの操作ができないのか」「自分はどの権限か」が即座に分かる UX 改善。後方互換なしの clean-break。

**Architecture:** ① 新規 Server Component `TopBarUserBadge.tsx`（`getAdminSession` + `getAdminSessionUser` で型安全に role 取得 → email + `ROLE_LABELS[role]` 表示）② `TopBar.tsx` に `userBadge: ReactNode` prop 追加（mobile では非表示で notification 干渉回避）③ `layout.tsx` で `<TopBarUserBadgeSlot />` を Suspense で渡す。GitHub / Vercel / Linear 標準パターン（admin 系 SaaS のヘッダー右端 user identity）。

**Out of scope:** Cmd+K Command Palette / 行クリック遷移（HTML 仕様制約）/ Settings ヘルスチェック alert（別 plan）。

---

## Task 1: TopBarUserBadge 新規 + TopBar 拡張

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_components/TopBarUserBadge.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/TopBarSlots.tsx`（slot wrapper 追加）
- Modify: `src/app/(admin)/admin/(dashboard)/layout.tsx`（slot を TopBar に渡す）

**TopBarUserBadge:**

```tsx
import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { ROLE_LABELS } from "@/shared/lib/admin-roles";

export async function TopBarUserBadge() {
  const session = await getAdminSession();
  const user = getAdminSessionUser(session);
  if (!user) return null;
  return (
    <div className="hidden lg:flex items-center gap-2 text-sm">
      <span className="text-muted-foreground truncate max-w-[16rem]">
        {user.email}
      </span>
      <span className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        {ROLE_LABELS[user.role]}
      </span>
    </div>
  );
}

export function TopBarUserBadgeFallback() {
  return (
    <div className="hidden lg:flex items-center gap-2 text-sm animate-pulse">
      <div className="h-4 w-32 bg-muted rounded" />
      <div className="h-5 w-16 bg-muted rounded" />
    </div>
  );
}
```

**TopBar 修正:** `userBadge: ReactNode` prop 追加、`notifications` の左隣に配置。mobile では Hidden（lg:flex で表示）。

**layout.tsx:** 既存 `TopBarBrandingSlot` / `NotificationBellSlot` と同パターンで `TopBarUserBadgeSlot` を Suspense で wrap。

---

## Task 2: 検証

- `bun run validate` EXIT=0
- `bun run build` EXIT=0
- 目視: `/admin` で右上に email + role badge が表示
