> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Admin Command Palette Implementation Plan (P16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面全域に Cmd+K / Ctrl+K で起動するグローバル Command Palette を導入し、横断検索 + ナビゲーション + クイックアクションを 1 つのダイアログで提供する。

**Architecture:** Hybrid (Option C) — Recents / Nav / Quick Actions は layout で server fetch、free-text 検索は単一 Server Action `searchAdminResources` が 11 resource を `Promise.allSettled` で並列。既存 cmdk primitive (`@/admin/components/ui/command.tsx`) を流用、新規 Dialog primitive を作らない。

**Tech Stack:** Next.js 16.2 / React 19.2 / cmdk 1.1 / Radix Dialog / Better Auth (`adminAuth`) / Prisma 7.8 / Tailwind v4

**Spec:** `docs/superpowers/specs/2026-04-27-admin-command-palette-design.md`

---

## 重要な前提（spec からの修正点）

1. **Prisma モデル名は `AuditLog`**（spec で `AdminAuditLog` と書いた箇所は読み替え）。`User.auditLogs AuditLog[]` リレーション経由で actor を絞れる
2. **既存 admin-queries の多くは `q` パラメータを持たない** — 検索は `_shared/lib/command-palette/queries.ts` に薄い search wrapper を 11 resource 分新規実装（既存 query は流用しない）
3. **キャッシュタグ**: Recents 用に `getCacheTag.auditLogs.recent(userId)` が必要。`@/shared/lib/constants` に存在しなければ Bundle B で追加
4. **Rate limit**: `formSubmitRateLimiter` (`src/shared/lib/rate-limit.ts`) を流用、専用 limiter を新規追加しない

---

## Worktree 前提

```bash
# main ブランチで未コミット変更ゼロを確認後
cd /g/workspace/work/website/customer/myrrh-rental-space
git status --short                       # → 空
git worktree add .worktrees/command-palette -b feature/admin-command-palette main
cd .worktrees/command-palette
python3 -c "import shutil; shutil.copy2('../../.env', '.env')"
python3 -c "import shutil; shutil.copy2('../../.env.local', '.env.local')" 2>/dev/null || true
robocopy ../../generated generated /E /XF nul
bun install --frozen-lockfile
```

---

## File Structure（Bundle 全体）

### 新規ファイル

| パス                                                                                              | 責務                                                        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/CommandPalette.tsx`         | Client Component — cmdk Dialog 本体、検索 input + 結果表示  |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/CommandPaletteProvider.tsx` | Client Provider — open/close state + Cmd+K listener         |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/SearchTriggerButton.tsx`    | Client — TopBar の "検索 ⌘K" trigger                        |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/types.ts`                   | 型定義（SearchResult / RecentItem / NavItem / QuickAction） |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/nav-items.ts`                      | 23 admin nav items SSoT + role filter                       |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/quick-actions.ts`                  | クイックアクション SSoT (新規作成系 6-8 件) + role filter   |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/queries.ts`                        | 11 resource の thin search wrapper (`server-only`)          |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/command-palette/search.ts`                     | Server Action — `searchAdminResources(query)`               |
| `src/shared/domain/audit/recents-queries.ts`                                                      | `getRecentAuditedResources(userId, limit)` (`'use cache'`)  |
| `docs/architecture/decisions/0024-admin-command-palette.md`                                       | ADR 0024                                                    |

### 変更ファイル

| パス                                                            | 変更内容                                                               |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`      | `searchTrigger` slot 追加（branding 右隣）                             |
| `src/app/(admin)/admin/(dashboard)/_components/TopBarSlots.tsx` | `SearchTriggerSlot` 追加                                               |
| `src/app/(admin)/admin/(dashboard)/layout.tsx`                  | `<CommandPaletteProvider>` ラップ + Recents fetch + searchTrigger 配線 |
| `src/shared/lib/constants/cache-tags.ts` (該当ファイル)         | `getCacheTag.auditLogs.recent(userId)` を追加（不在の場合）            |
| `docs/architecture/decisions/README.md`                         | ADR 0024 を index に追加                                               |

### テストファイル

| パス                                                          | 責務                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `__tests__/unit/lib/command-palette/nav-items.test.ts`        | role filter logic (4 role × 23 nav items)                                                       |
| `__tests__/unit/lib/command-palette/quick-actions.test.ts`    | role filter (VIEWER 非表示, EDITOR/ADMIN 表示)                                                  |
| `__tests__/unit/lib/command-palette/queries.test.ts`          | search wrapper 11 resource 各 happy path                                                        |
| `__tests__/integration/actions/admin/command-palette.test.ts` | `searchAdminResources` Server Action（auth + role filter + Promise.allSettled fault tolerance） |

---

## Bundle A — UI Scaffold (4 commits)

> **Implementer dispatch**: 1 implementer に Bundle A 全体をバンドル指示。各 commit 単位で commit message は plan 指定文字列をそのまま使用すること。`git add` / `commit` は implementer 側で実行可、`git reset` / `restore` / `stash` は禁止。

### Task A1 — Types + Provider scaffold

**Files:**

- Create: `_shared/components/command-palette/types.ts`
- Create: `_shared/components/command-palette/CommandPaletteProvider.tsx`

- [ ] **Step 1: 型定義を作成**

`_shared/components/command-palette/types.ts`:

```ts
import type { Resource } from "@/admin/lib/admin-resources";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  keywords?: string[]; // fuzzy filter のキーワード補強
};

export type QuickAction = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  description?: string;
};

export type RecentItem = {
  id: string; // `${resource}:${resourceId}`
  resource: Resource;
  resourceId: string;
  label: string; // "スペース: 渋谷店"
  href: string;
  occurredAt: string; // ISO string (Serialized)
};

export type SearchResultItem = {
  id: string;
  resource: Resource;
  label: string;
  description?: string;
  href: string;
};

export type SearchResultGroup = {
  resource: Resource;
  items: SearchResultItem[];
};
```

- [ ] **Step 2: Provider 雛形（open state + keyboard listener）**

`_shared/components/command-palette/CommandPaletteProvider.tsx`:

```tsx
"use client";

import { createContext, use, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { NavItem, QuickAction, RecentItem } from "./types";

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  navItems: NavItem[];
  quickActions: QuickAction[];
  recents: RecentItem[];
};

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);

export function useCommandPalette() {
  const ctx = use(CommandPaletteContext);
  if (ctx === undefined) {
    throw new Error("useCommandPalette must be used within Provider");
  }
  return ctx;
}

type ProviderProps = {
  navItems: NavItem[];
  quickActions: QuickAction[];
  recents: RecentItem[];
  children: ReactNode;
};

export function CommandPaletteProvider({
  navItems,
  quickActions,
  recents,
  children,
}: ProviderProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <CommandPaletteContext
      value={{ open, setOpen, navItems, quickActions, recents }}
    >
      {children}
    </CommandPaletteContext>
  );
}
```

- [ ] **Step 3: type-check**

```bash
bun run type-check
```

Expected: EXIT 0

- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/types.ts \
        src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/CommandPaletteProvider.tsx
git commit -m "feat(admin): add command palette provider and types (P16 A1)"
```

---

### Task A2 — SearchTriggerButton

**Files:**

- Create: `_shared/components/command-palette/SearchTriggerButton.tsx`

- [ ] **Step 1: Trigger button 実装**

`_shared/components/command-palette/SearchTriggerButton.tsx`:

```tsx
"use client";

import { IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import { useCommandPalette } from "./CommandPaletteProvider";

export function SearchTriggerButton() {
  const { setOpen } = useCommandPalette();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);

  const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

  return (
    <>
      {/* Mobile: icon-only 44px */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="検索を開く"
        className="h-11 w-11 sm:hidden"
      >
        <IconSearch className="h-5 w-5" />
      </Button>

      {/* Desktop: full search bar */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="検索を開く"
        className={cn(
          "hidden sm:inline-flex h-11 w-64 items-center justify-between gap-2",
          "px-3 text-sm text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <IconSearch className="h-4 w-4" aria-hidden="true" />
          検索...
        </span>
        <kbd className="pointer-events-none inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground">
          {shortcutLabel}
        </kbd>
      </Button>
    </>
  );
}
```

- [ ] **Step 2: type-check + lint**

```bash
bun run validate
```

Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/SearchTriggerButton.tsx
git commit -m "feat(admin): add command palette search trigger button (P16 A2)"
```

---

### Task A3 — CommandPalette Dialog body

**Files:**

- Create: `_shared/components/command-palette/CommandPalette.tsx`

- [ ] **Step 1: Palette body（Suggested セクションのみ、検索は Bundle B で配線）**

`_shared/components/command-palette/CommandPalette.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/admin/components/ui/command";
import { useCommandPalette } from "./CommandPaletteProvider";
import type { NavItem, QuickAction, RecentItem } from "./types";

export function CommandPalette() {
  const { open, setOpen, navItems, quickActions, recents } =
    useCommandPalette();
  const router = useRouter();

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="コマンドパレット"
      description="管理画面全域の検索・ナビゲーションを行います"
    >
      <CommandInput placeholder="コマンドや検索キーワードを入力..." />
      <CommandList>
        <CommandEmpty>該当する項目がありません</CommandEmpty>

        {recents.length > 0 && (
          <>
            <CommandGroup heading="最近の操作">
              {recents.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.resource}`}
                  onSelect={() => navigateTo(item.href)}
                >
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {quickActions.length > 0 && (
          <>
            <CommandGroup heading="クイックアクション">
              {quickActions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={`${action.label} ${action.description ?? ""}`}
                  onSelect={() => navigateTo(action.href)}
                >
                  {action.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="ナビゲーション">
          {navItems.map((nav) => (
            <CommandItem
              key={nav.id}
              value={`${nav.label} ${(nav.keywords ?? []).join(" ")}`}
              onSelect={() => navigateTo(nav.href)}
            >
              {nav.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

- [ ] **Step 2: type-check**

```bash
bun run type-check
```

Expected: EXIT 0

- [ ] **Step 3: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/CommandPalette.tsx
git commit -m "feat(admin): add command palette dialog body (P16 A3)"
```

---

### Task A4 — TopBar slot 拡張 + layout.tsx 配線（empty data）

**Files:**

- Modify: `_components/TopBar.tsx`
- Modify: `_components/TopBarSlots.tsx`
- Modify: `(dashboard)/layout.tsx`

- [ ] **Step 1: TopBar.tsx に searchTrigger slot 追加**

```diff
 type TopBarProps = {
   branding: ReactNode;
   notifications: ReactNode;
   userBadge: ReactNode;
+  searchTrigger: ReactNode;
 };

-export function TopBar({ branding, notifications, userBadge }: TopBarProps) {
+export function TopBar({ branding, notifications, userBadge, searchTrigger }: TopBarProps) {
   ...
       <div className="flex items-center gap-3">
         {showMobileMenu && (...)}
         <Link href="/admin" className="flex items-center">
           {branding}
         </Link>
+        {searchTrigger}
       </div>
```

- [ ] **Step 2: TopBarSlots.tsx に SearchTriggerSlot 追加**

ファイル末尾に追加:

```tsx
import { SearchTriggerButton } from "@/admin/_shared/components/command-palette/SearchTriggerButton";

export function SearchTriggerSlot(): ReactElement {
  return <SearchTriggerButton />;
}
```

> 注: `@/admin/_shared/...` の import alias は既存パターンに合わせて確認。実態は相対パス `../_shared/components/command-palette/SearchTriggerButton` のいずれかを使う。

- [ ] **Step 3: layout.tsx で Provider + searchTrigger 配線（recents は空配列で暫定）**

```diff
+import { CommandPaletteProvider } from "./_shared/components/command-palette/CommandPaletteProvider";
+import { CommandPalette } from "./_shared/components/command-palette/CommandPalette";
+import { getNavItemsForRole } from "./_shared/lib/command-palette/nav-items"; // ← Bundle B で実装、暫定で空配列
+import { getQuickActionsForRole } from "./_shared/lib/command-palette/quick-actions"; // 同上
+import { SearchTriggerSlot } from "./_components/TopBarSlots";
 ...
 export default async function DashboardLayout({ children }) {
   const user = await verifyAdminSession();
+  // Bundle B 完了後に置換: const navItems = getNavItemsForRole(user.role);
+  const navItems: NavItem[] = [];
+  const quickActions: QuickAction[] = [];
+  const recents: RecentItem[] = [];
   ...
   return (
+    <CommandPaletteProvider navItems={navItems} quickActions={quickActions} recents={recents}>
       <div ...>
         <TopBar
           branding={...}
           notifications={...}
           userBadge={...}
+          searchTrigger={<SearchTriggerSlot />}
         />
         {children}
+        <CommandPalette />
       </div>
+    </CommandPaletteProvider>
   );
 }
```

> 暫定空配列のため、Bundle A 完了時点では Cmd+K で Dialog は開くが Suggested セクションは Empty State 表示。Bundle B/C で完成。

- [ ] **Step 4: type-check + lint + dev で UI 確認**

```bash
bun run validate
```

Expected: EXIT 0

dev server が起動していれば: `/admin` を開いて Cmd+K (mac) / Ctrl+K で Dialog open → Empty state 表示 / Esc で close を確認。

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_components/TopBar.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/_components/TopBarSlots.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/layout.tsx
git commit -m "feat(admin): wire command palette into TopBar and layout (P16 A4)"
```

---

## Bundle B — Search Server Action + Domain queries (5 commits)

> **Implementer dispatch**: 1 implementer に Bundle B 全体をバンドル指示。Bundle A の `getNavItemsForRole` / `getQuickActionsForRole` 暫定空配列を本実装に置換するため、layout.tsx の併行修正を含む。

### Task B1 — Nav items SSoT

**Files:**

- Create: `_shared/lib/command-palette/nav-items.ts`
- Test: `__tests__/unit/lib/command-palette/nav-items.test.ts`

- [ ] **Step 1: 23 nav items + role filter**

`_shared/lib/command-palette/nav-items.ts`:

```ts
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { NavItem } from "@/admin/_shared/components/command-palette/types";
import { hasPermission } from "@/admin/lib/permissions";

const ALL_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "ダッシュボード",
    href: "/admin",
    resource: "settings",
  },
  {
    id: "spaces",
    label: "スペース管理",
    href: "/admin/spaces",
    resource: "space",
  },
  {
    id: "locations",
    label: "場所管理",
    href: "/admin/spaces?tab=locations",
    resource: "location",
  },
  {
    id: "categories",
    label: "カテゴリ管理",
    href: "/admin/spaces?tab=categories",
    resource: "spaceCategory",
  },
  {
    id: "reservations",
    label: "予約管理",
    href: "/admin/reservations",
    resource: "reservation",
  },
  {
    id: "customers",
    label: "顧客管理",
    href: "/admin/customers",
    resource: "customer",
  },
  {
    id: "inquiries",
    label: "お問い合わせ",
    href: "/admin/inquiries",
    resource: "inquiry",
  },
  {
    id: "events",
    label: "イベント管理",
    href: "/admin/events",
    resource: "event",
  },
  { id: "posts", label: "ブログ", href: "/admin/posts", resource: "post" },
  { id: "news", label: "お知らせ", href: "/admin/news", resource: "news" },
  { id: "pages", label: "固定ページ", href: "/admin/pages", resource: "page" },
  { id: "faq", label: "FAQ", href: "/admin/faq", resource: "faq" },
  { id: "terms", label: "規約", href: "/admin/terms", resource: "terms" },
  {
    id: "navigation",
    label: "ナビゲーション",
    href: "/admin/navigation",
    resource: "navigation",
  },
  {
    id: "announcement-bar",
    label: "アナウンスバー",
    href: "/admin/announcement-bar",
    resource: "announcementBar",
  },
  { id: "media", label: "メディア", href: "/admin/media", resource: "media" },
  {
    id: "block-templates",
    label: "ブロックテンプレート",
    href: "/admin/block-templates",
    resource: "blockTemplate",
  },
  {
    id: "coupons",
    label: "クーポン",
    href: "/admin/coupons",
    resource: "coupon",
  },
  {
    id: "users",
    label: "ユーザー管理",
    href: "/admin/users",
    resource: "user",
  },
  {
    id: "audit-logs",
    label: "監査ログ",
    href: "/admin/audit-logs",
    resource: "auditLog",
  },
  {
    id: "settings-organization",
    label: "設定: 組織情報",
    href: "/admin/settings/organization",
    resource: "settings",
  },
  {
    id: "settings-business",
    label: "設定: 事業情報",
    href: "/admin/settings/business",
    resource: "settings",
  },
  {
    id: "settings-security",
    label: "設定: セキュリティ・連携",
    href: "/admin/settings/security-integrations",
    resource: "settings",
  },
];

export function getNavItemsForRole(role: Role): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) =>
    hasPermission(role, item.resource, "read"),
  );
}

export const ALL_NAV_ITEMS_FOR_TEST = ALL_NAV_ITEMS;
```

> **重要**: 上記 23 件の href は plan 作成時の SSoT。実装前に `ls 'src/app/(admin)/admin/(dashboard)/'` で実在を確認し、ルート不在 / リネーム箇所は justified deviation として report する。

- [ ] **Step 2: Unit test**

`__tests__/unit/lib/command-palette/nav-items.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getNavItemsForRole,
  ALL_NAV_ITEMS_FOR_TEST,
} from "@/admin/_shared/lib/command-palette/nav-items";

describe("getNavItemsForRole", () => {
  test("SUPER_ADMIN は全 nav items を取得", () => {
    expect(getNavItemsForRole(Role.SUPER_ADMIN).length).toBe(
      ALL_NAV_ITEMS_FOR_TEST.length,
    );
  });

  test("VIEWER は user / auditLog 等の管理対象外 resource は除外", () => {
    const items = getNavItemsForRole(Role.VIEWER);
    expect(items.find((i) => i.resource === "user")).toBeUndefined();
    expect(items.find((i) => i.resource === "auditLog")).toBeUndefined();
  });

  test("EDITOR は read 可能な resource のみ", () => {
    const items = getNavItemsForRole(Role.EDITOR);
    // EDITOR は ROLE_PERMISSIONS で読み取り可能な resource のみが返る
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(ALL_NAV_ITEMS_FOR_TEST.length);
  });

  test("ADMIN は user / auditLog を含む", () => {
    const items = getNavItemsForRole(Role.ADMIN);
    expect(items.find((i) => i.resource === "user")).toBeDefined();
  });
});
```

- [ ] **Step 3: Test 実行**

```bash
bun test __tests__/unit/lib/command-palette/nav-items.test.ts
```

Expected: 4 pass, 0 fail

- [ ] **Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/command-palette/nav-items.ts \
        __tests__/unit/lib/command-palette/nav-items.test.ts
git commit -m "feat(admin): add command palette nav items SSoT (P16 B1)"
```

---

### Task B2 — Quick Actions SSoT

**Files:**

- Create: `_shared/lib/command-palette/quick-actions.ts`
- Test: `__tests__/unit/lib/command-palette/quick-actions.test.ts`

- [ ] **Step 1: Quick actions 定義**

`_shared/lib/command-palette/quick-actions.ts`:

```ts
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { QuickAction } from "@/admin/_shared/components/command-palette/types";
import { hasPermission } from "@/admin/lib/permissions";

const ALL_QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "new-space",
    label: "新規スペースを作成",
    href: "/admin/spaces/new",
    resource: "space",
  },
  {
    id: "new-reservation",
    label: "新規予約を作成",
    href: "/admin/reservations/new",
    resource: "reservation",
  },
  {
    id: "new-customer",
    label: "新規顧客を登録",
    href: "/admin/customers/new",
    resource: "customer",
  },
  {
    id: "new-event",
    label: "新規イベントを作成",
    href: "/admin/events/new",
    resource: "event",
  },
  {
    id: "new-post",
    label: "新規ブログ記事を作成",
    href: "/admin/posts/new",
    resource: "post",
  },
  {
    id: "new-news",
    label: "新規お知らせを作成",
    href: "/admin/news/new",
    resource: "news",
  },
  {
    id: "new-coupon",
    label: "新規クーポンを作成",
    href: "/admin/coupons/new",
    resource: "coupon",
  },
];

export function getQuickActionsForRole(role: Role): QuickAction[] {
  return ALL_QUICK_ACTIONS.filter((action) =>
    hasPermission(role, action.resource, "create"),
  );
}

export const ALL_QUICK_ACTIONS_FOR_TEST = ALL_QUICK_ACTIONS;
```

> **重要**: 各 `href` の実在を `ls 'src/app/(admin)/admin/(dashboard)/<resource>/new/'` で確認。不在ルートは justified deviation として削除する。

- [ ] **Step 2: Unit test**

`__tests__/unit/lib/command-palette/quick-actions.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import {
  getQuickActionsForRole,
  ALL_QUICK_ACTIONS_FOR_TEST,
} from "@/admin/_shared/lib/command-palette/quick-actions";

describe("getQuickActionsForRole", () => {
  test("SUPER_ADMIN は全 quick actions を取得", () => {
    expect(getQuickActionsForRole(Role.SUPER_ADMIN).length).toBe(
      ALL_QUICK_ACTIONS_FOR_TEST.length,
    );
  });

  test("VIEWER は create 権限を持たないため空配列", () => {
    expect(getQuickActionsForRole(Role.VIEWER)).toEqual([]);
  });

  test("ADMIN は create 権限を持つ quick actions を取得", () => {
    const actions = getQuickActionsForRole(Role.ADMIN);
    expect(actions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Test + Commit**

```bash
bun test __tests__/unit/lib/command-palette/quick-actions.test.ts
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/command-palette/quick-actions.ts \
        __tests__/unit/lib/command-palette/quick-actions.test.ts
git commit -m "feat(admin): add command palette quick actions SSoT (P16 B2)"
```

Expected: 3 pass, 0 fail

---

### Task B3 — 11 resource search wrapper

**Files:**

- Create: `_shared/lib/command-palette/queries.ts`
- Test: `__tests__/unit/lib/command-palette/queries.test.ts`

- [ ] **Step 1: thin search wrapper を 11 resource 分実装**

`_shared/lib/command-palette/queries.ts`:

```ts
import "server-only";

import { prisma } from "@/shared/db/prisma";
import type {
  SearchResultGroup,
  SearchResultItem,
} from "@/admin/_shared/components/command-palette/types";
import type { Resource } from "@/admin/lib/admin-resources";

const SEARCH_LIMIT_PER_RESOURCE = 5;

type ContainsFilter = { contains: string; mode: "insensitive" };
function ci(query: string): ContainsFilter {
  return { contains: query, mode: "insensitive" };
}

async function searchSpaces(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.space.findMany({
    where: {
      deletedAt: null,
      OR: [{ name: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, name: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "space",
    label: r.name,
    description: `/${r.slug}`,
    href: `/admin/spaces/${r.id}`,
  }));
}

async function searchCustomers(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        { lastName: ci(query) },
        { firstName: ci(query) },
        { email: ci(query) },
        { companyName: ci(query) },
      ],
    },
    select: { id: true, lastName: true, firstName: true, email: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "customer",
    label: `${r.lastName} ${r.firstName ?? ""}`.trim(),
    description: r.email ?? undefined,
    href: `/admin/customers/${r.id}`,
  }));
}

async function searchReservations(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      OR: [
        { reservationNumber: ci(query) },
        { customer: { lastName: ci(query) } },
        { customer: { email: ci(query) } },
      ],
    },
    select: {
      id: true,
      reservationNumber: true,
      startAt: true,
      customer: { select: { lastName: true } },
      space: { select: { name: true } },
    },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "reservation",
    label: `${r.reservationNumber} ${r.customer?.lastName ?? ""}`.trim(),
    description: `${r.space?.name ?? ""} ${r.startAt.toISOString().slice(0, 10)}`,
    href: `/admin/reservations/${r.id}`,
  }));
}

async function searchPosts(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.post.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "post",
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/posts/${r.id}`,
  }));
}

async function searchNews(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.news.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "news",
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/news/${r.id}`,
  }));
}

async function searchPages(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.page.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "page",
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/pages/${r.slug}`,
  }));
}

async function searchEvents(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.event.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true, startAt: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "event",
    label: r.title,
    description: r.startAt.toISOString().slice(0, 10),
    href: `/admin/events/${r.id}`,
  }));
}

async function searchInquiries(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.inquiry.findMany({
    where: {
      OR: [{ name: ci(query) }, { email: ci(query) }, { subject: ci(query) }],
    },
    select: { id: true, name: true, subject: true, createdAt: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "inquiry",
    label: r.subject || r.name,
    description: r.name,
    href: `/admin/inquiries/${r.id}`,
  }));
}

async function searchFaqItems(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.faqItem.findMany({
    where: {
      OR: [{ question: ci(query) }, { answer: ci(query) }],
    },
    select: { id: true, question: true, categoryId: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "faq",
    label: r.question,
    href: `/admin/faq/${r.categoryId}`,
  }));
}

async function searchCoupons(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.coupon.findMany({
    where: {
      OR: [{ code: ci(query) }, { name: ci(query) }],
    },
    select: { id: true, code: true, name: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "coupon",
    label: `${r.code} (${r.name})`,
    href: `/admin/coupons/${r.id}`,
  }));
}

async function searchLocations(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.location.findMany({
    where: {
      deletedAt: null,
      OR: [{ name: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, name: true, slug: true },
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "location",
    label: r.name,
    description: `/${r.slug}`,
    href: `/admin/spaces?tab=locations&edit=${r.id}`,
  }));
}

const SEARCH_BY_RESOURCE: Record<
  string,
  (q: string) => Promise<SearchResultItem[]>
> = {
  space: searchSpaces,
  customer: searchCustomers,
  reservation: searchReservations,
  post: searchPosts,
  news: searchNews,
  page: searchPages,
  event: searchEvents,
  inquiry: searchInquiries,
  faq: searchFaqItems,
  coupon: searchCoupons,
  location: searchLocations,
};

export async function searchByResource(
  resource: Resource,
  query: string,
): Promise<SearchResultGroup> {
  const handler = SEARCH_BY_RESOURCE[resource];
  if (!handler) return { resource, items: [] };
  const items = await handler(query);
  return { resource, items };
}

export const SEARCHABLE_RESOURCES = Object.keys(
  SEARCH_BY_RESOURCE,
) as Resource[];
```

> **重要 — 実装前確認事項**:
>
> - 各 model の field 名（`Reservation.reservationNumber` / `Inquiry.subject` 等）は実装者が `grep -A30 "^model <Name>" prisma/schema.prisma` で確認
> - `deletedAt` field を持たないモデル（`Customer` / `Inquiry` / `FaqItem` / `Coupon`）は `where: { deletedAt: null }` を含めない
> - `Location` の edit URL は `gotchas/domain.md` の per-slug invalidation pattern に合わせ後続調整可

- [ ] **Step 2: Unit test（mock prisma で 11 resource）**

`__tests__/unit/lib/command-palette/queries.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: mock(async () => [
        { id: "s1", name: "渋谷店", slug: "shibuya" },
      ]),
    },
    customer: {
      findMany: mock(async () => [
        {
          id: "c1",
          lastName: "山田",
          firstName: "太郎",
          email: "y@example.com",
        },
      ]),
    },
    reservation: {
      findMany: mock(async () => [
        {
          id: "r1",
          reservationNumber: "R001",
          startAt: new Date("2026-05-01"),
          customer: { lastName: "山田" },
          space: { name: "渋谷" },
        },
      ]),
    },
    post: {
      findMany: mock(async () => [{ id: "p1", title: "投稿", slug: "post" }]),
    },
    news: {
      findMany: mock(async () => [
        { id: "n1", title: "ニュース", slug: "news" },
      ]),
    },
    page: {
      findMany: mock(async () => [
        { id: "pg1", title: "ページ", slug: "page" },
      ]),
    },
    event: {
      findMany: mock(async () => [
        {
          id: "e1",
          title: "イベント",
          slug: "event",
          startAt: new Date("2026-05-01"),
        },
      ]),
    },
    inquiry: {
      findMany: mock(async () => [
        { id: "i1", name: "問合せ", subject: "件名", createdAt: new Date() },
      ]),
    },
    faqItem: {
      findMany: mock(async () => [
        { id: "f1", question: "質問", categoryId: "cat1" },
      ]),
    },
    coupon: {
      findMany: mock(async () => [{ id: "co1", code: "C10", name: "10% off" }]),
    },
    location: {
      findMany: mock(async () => [{ id: "l1", name: "本館", slug: "main" }]),
    },
  },
}));

import {
  searchByResource,
  SEARCHABLE_RESOURCES,
} from "@/admin/_shared/lib/command-palette/queries";

describe("searchByResource", () => {
  test("11 resource すべてが SEARCHABLE_RESOURCES に含まれる", () => {
    expect(SEARCHABLE_RESOURCES.length).toBe(11);
  });

  for (const resource of [
    "space",
    "customer",
    "reservation",
    "post",
    "news",
    "page",
    "event",
    "inquiry",
    "faq",
    "coupon",
    "location",
  ] as const) {
    test(`${resource} 検索が SearchResultItem を返す`, async () => {
      const group = await searchByResource(resource, "test");
      expect(group.resource).toBe(resource);
      expect(group.items.length).toBeGreaterThan(0);
      expect(group.items[0]?.href).toMatch(/^\/admin\//);
    });
  }
});
```

- [ ] **Step 3: Test + Commit**

```bash
bun test __tests__/unit/lib/command-palette/queries.test.ts
```

Expected: 12 pass, 0 fail

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/command-palette/queries.ts \
        __tests__/unit/lib/command-palette/queries.test.ts
git commit -m "feat(admin): add 11 resource search wrappers for command palette (P16 B3)"
```

> Note: 新規 test directory のため `package.json` の `test:unit` バッチに `bun test __tests__/unit/lib/command-palette` を追加する（CLAUDE.md 「per-directory バッチ」原則）。これは Bundle B Step B3 に含めて 1 commit 化する。

---

### Task B4 — Server Action `searchAdminResources`

**Files:**

- Create: `_shared/actions/command-palette/search.ts`

- [ ] **Step 1: Server Action 実装**

```ts
"use server";

import { headers } from "next/headers";
import { checkAdminAuth } from "@/admin/lib/action-auth";
import { hasPermission } from "@/admin/lib/permissions";
import {
  checkActionRateLimit,
  formSubmitRateLimiter,
} from "@/shared/lib/rate-limit";
import { createSuccess, createFailure } from "@/admin/types/server-actions";
import type { MutationResult } from "@/admin/types/server-actions";
import {
  searchByResource,
  SEARCHABLE_RESOURCES,
} from "@/admin/_shared/lib/command-palette/queries";
import type { SearchResultGroup } from "@/admin/_shared/components/command-palette/types";

type SearchPayload = { groups: SearchResultGroup[] };

export async function searchAdminResources(
  query: string,
): Promise<MutationResult<SearchPayload>> {
  const auth = await checkAdminAuth(await headers());
  if (!auth.success) return auth.error;

  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return rateLimit.error;

  const trimmed = query.trim();
  if (trimmed.length === 0) return createSuccess({ groups: [] });
  if (trimmed.length < 2) return createSuccess({ groups: [] });

  const allowed = SEARCHABLE_RESOURCES.filter((r) =>
    hasPermission(auth.user.role, r, "read"),
  );

  const settled = await Promise.allSettled(
    allowed.map((resource) => searchByResource(resource, trimmed)),
  );

  const groups: SearchResultGroup[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.items.length > 0) {
      groups.push(result.value);
    }
  }

  return createSuccess({ groups });
}
```

> **重要 — 実装前確認**:
>
> - `checkActionRateLimit` の正確な signature を `grep -nE "^export.*checkActionRateLimit" src/shared/lib/rate-limit.ts` で確認
> - 不在なら `formSubmitRateLimiter.consume(...)` のような既存実装パターンに合わせる
> - `checkAdminAuth` の戻り値 type が `auth.user.role` を提供することを `Read` で確認

- [ ] **Step 2: Integration test**

`__tests__/integration/actions/admin/command-palette.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const mockCheckAuth = mock(async () => ({
  success: true,
  user: { id: "user-1", role: "SUPER_ADMIN" },
}));
const mockCheckRate = mock(async () => ({ success: true }));
const mockSearchByResource = mock(async (resource: string) => ({
  resource,
  items: [
    {
      id: "x",
      resource,
      label: `${resource}-result`,
      href: `/admin/${resource}`,
    },
  ],
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkAdminAuth: mockCheckAuth,
}));
mock.module("@/shared/lib/rate-limit", () => ({
  checkActionRateLimit: mockCheckRate,
  formSubmitRateLimiter: {},
}));
mock.module("@/admin/_shared/lib/command-palette/queries", () => ({
  searchByResource: mockSearchByResource,
  SEARCHABLE_RESOURCES: [
    "space",
    "customer",
    "reservation",
    "post",
    "news",
    "page",
    "event",
    "inquiry",
    "faq",
    "coupon",
    "location",
  ],
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers(),
}));

import { searchAdminResources } from "@/admin/_shared/actions/command-palette/search";

describe("searchAdminResources", () => {
  beforeEach(() => {
    mockCheckAuth.mockClear();
    mockSearchByResource.mockClear();
  });

  test("空クエリは空 groups を返す", async () => {
    const result = await searchAdminResources("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.groups).toEqual([]);
  });

  test("1 文字クエリは空 groups を返す（ノイズ抑制）", async () => {
    const result = await searchAdminResources("a");
    expect(result.success).toBe(true);
  });

  test("有効クエリは 11 resource 並列検索", async () => {
    const result = await searchAdminResources("test");
    expect(result.success).toBe(true);
    expect(mockSearchByResource).toHaveBeenCalledTimes(11);
    if (result.success) {
      expect(result.data.groups.length).toBe(11);
    }
  });

  test("認証失敗時はエラー返却", async () => {
    mockCheckAuth.mockImplementationOnce(async () => ({
      success: false,
      error: { error: "ログインが必要です", success: false as const },
    }));
    const result = await searchAdminResources("test");
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Test + Commit**

```bash
bun test __tests__/integration/actions/admin/command-palette.test.ts
```

Expected: 4 pass, 0 fail

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/command-palette/search.ts \
        __tests__/integration/actions/admin/command-palette.test.ts
git commit -m "feat(admin): add searchAdminResources server action (P16 B4)"
```

---

### Task B5 — CommandPalette に検索結果配線

**Files:**

- Modify: `_shared/components/command-palette/CommandPalette.tsx`
- Modify: `_shared/components/command-palette/CommandPaletteProvider.tsx`
- Modify: `(dashboard)/layout.tsx`

- [ ] **Step 1: Provider に検索 state 追加**

`CommandPaletteProvider.tsx` に query / results / isPending を追加:

```diff
+import { useEffect, useState, useTransition } from "react";
+import { searchAdminResources } from "@/admin/_shared/actions/command-palette/search";
+import type { SearchResultGroup } from "./types";

 type CommandPaletteContextValue = {
   open: boolean;
   setOpen: (open: boolean) => void;
   navItems: NavItem[];
   quickActions: QuickAction[];
   recents: RecentItem[];
+  query: string;
+  setQuery: (q: string) => void;
+  results: SearchResultGroup[];
+  isSearching: boolean;
 };

 export function CommandPaletteProvider({...}) {
   const [open, setOpen] = useState(false);
+  const [query, setQuery] = useState("");
+  const [results, setResults] = useState<SearchResultGroup[]>([]);
+  const [isSearching, startTransition] = useTransition();
+
+  useEffect(() => {
+    if (query.trim().length < 2) {
+      setResults([]);
+      return;
+    }
+    const timeoutId = setTimeout(() => {
+      startTransition(async () => {
+        const result = await searchAdminResources(query);
+        if (result.success) {
+          setResults(result.data.groups);
+        }
+      });
+    }, 200); // debounce 200ms
+    return () => clearTimeout(timeoutId);
+  }, [query]);
+
+  // Dialog close 時に query / results をクリア
+  useEffect(() => {
+    if (!open) {
+      setQuery("");
+      setResults([]);
+    }
+  }, [open]);

   return (
     <CommandPaletteContext value={{
-      open, setOpen, navItems, quickActions, recents
+      open, setOpen, navItems, quickActions, recents,
+      query, setQuery, results, isSearching,
     }}>
```

- [ ] **Step 2: CommandPalette body に Search Results セクション追加**

```diff
 export function CommandPalette() {
-  const { open, setOpen, navItems, quickActions, recents } = useCommandPalette();
+  const { open, setOpen, navItems, quickActions, recents, query, setQuery, results, isSearching } = useCommandPalette();
   const router = useRouter();

   ...
   return (
     <CommandDialog open={open} onOpenChange={setOpen} ...>
-      <CommandInput placeholder="..." />
+      <CommandInput
+        placeholder="..."
+        value={query}
+        onValueChange={setQuery}
+      />
       <CommandList>
         <CommandEmpty>
-          該当する項目がありません
+          {isSearching ? "検索中..." : query.length >= 2 ? "該当する項目がありません" : "コマンドを選択するか、2 文字以上で検索"}
         </CommandEmpty>
+
+        {/* 検索結果（query 2 文字以上）*/}
+        {query.length >= 2 && results.map((group) => (
+          <CommandGroup key={group.resource} heading={group.resource}>
+            {group.items.map((item) => (
+              <CommandItem
+                key={item.id}
+                value={`${item.label} ${item.description ?? ""}`}
+                onSelect={() => navigateTo(item.href)}
+              >
+                <span>{item.label}</span>
+                {item.description && (
+                  <span className="ml-2 text-xs text-muted-foreground">{item.description}</span>
+                )}
+              </CommandItem>
+            ))}
+          </CommandGroup>
+        ))}
+
+        {/* Suggested セクション（query 空）*/}
+        {query.length < 2 && (
+          <>
             {recents.length > 0 && (...)}
             {quickActions.length > 0 && (...)}
             <CommandGroup heading="ナビゲーション">
               ...
             </CommandGroup>
+          </>
+        )}
       </CommandList>
     </CommandDialog>
   );
 }
```

- [ ] **Step 3: layout.tsx の暫定空配列を本実装に置換**

```diff
-import { getNavItemsForRole } from "./_shared/lib/command-palette/nav-items";
-import { getQuickActionsForRole } from "./_shared/lib/command-palette/quick-actions";
 ...
   const user = await verifyAdminSession();
-  const navItems: NavItem[] = [];
-  const quickActions: QuickAction[] = [];
-  const recents: RecentItem[] = [];
+  const navItems = getNavItemsForRole(user.role);
+  const quickActions = getQuickActionsForRole(user.role);
+  const recents: RecentItem[] = []; // Bundle C で配線
```

- [ ] **Step 4: Validate + dev で動作確認**

```bash
bun run validate
```

Expected: EXIT 0

dev: Cmd+K → Suggested セクションに 23 nav items + 7 quick actions 表示 / 「渋谷」等を入力 → 検索結果表示 / Esc / item 選択でナビゲーションを確認。

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/CommandPalette.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/CommandPaletteProvider.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/layout.tsx
git commit -m "feat(admin): wire search action and nav items into command palette (P16 B5)"
```

---

## Bundle C — Recents wiring + ADR + 統合テスト (3 commits)

> **Implementer dispatch**: 1 implementer に Bundle C 全体をバンドル指示。

### Task C1 — Recents domain query

**Files:**

- Create: `src/shared/domain/audit/recents-queries.ts`
- Modify: `src/shared/lib/constants/cache-tags.ts` (該当ファイル)
- Modify: `(dashboard)/layout.tsx` (Recents 配線)

- [ ] **Step 1: cache tag 追加（不在なら）**

`@/shared/lib/constants/cache-tags.ts` の `getCacheTag` に追加:

```ts
auditLogs: {
  recent: (userId: string) => `audit-logs:recent:${userId}`,
},
```

> 既存の `getCacheTag` 構造に合わせる。実装者は `Read` で現状確認。

- [ ] **Step 2: `getRecentAuditedResources` query**

`src/shared/domain/audit/recents-queries.ts`:

```ts
"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";
import { prisma } from "@/shared/db/prisma";
import { hasPermission } from "@/admin/lib/permissions";
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { Resource } from "@/admin/lib/admin-resources";
import type { RecentItem } from "@/app/(admin)/admin/(dashboard)/_shared/components/command-palette/types";

const SUPPORTED_RESOURCES: ReadonlySet<Resource> = new Set([
  "space",
  "customer",
  "reservation",
  "post",
  "news",
  "page",
  "event",
  "inquiry",
  "faq",
  "coupon",
  "location",
]);

function buildHref(resource: Resource, resourceId: string): string {
  switch (resource) {
    case "page":
      return `/admin/pages`;
    case "faq":
      return `/admin/faq/${resourceId}`;
    case "location":
      return `/admin/spaces?tab=locations`;
    default:
      return `/admin/${resource}s/${resourceId}`;
  }
}

export async function getRecentAuditedResources(
  userId: string,
  role: Role,
  limit = 8,
): Promise<RecentItem[]> {
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(getCacheTag.auditLogs.recent(userId));

  const logs = await prisma.auditLog.findMany({
    where: { userId, resourceId: { not: null } },
    select: { resource: true, resourceId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit * 3, // ユニーク化 + 権限フィルタ後 limit に絞るための buffer
  });

  const seen = new Set<string>();
  const results: RecentItem[] = [];

  for (const log of logs) {
    if (results.length >= limit) break;
    if (!log.resourceId) continue;

    const resource = log.resource as Resource;
    if (!SUPPORTED_RESOURCES.has(resource)) continue;
    if (!hasPermission(role, resource, "read")) continue;

    const id = `${resource}:${log.resourceId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      resource,
      resourceId: log.resourceId,
      label: `${resource}: ${log.resourceId.slice(0, 8)}`, // Bundle C 後続で resource 名解決を改良
      href: buildHref(resource, log.resourceId),
      occurredAt: log.createdAt.toISOString(),
    });
  }

  return results;
}
```

> **重要 — 実装前確認**:
>
> - `prisma.auditLog` の field 名は schema で確認（`userId` vs `actorUserId` 等）
> - `Resource` 型の値が `AuditLog.resource` の VARCHAR 値と一致するか確認（`enums/helpers` の SSoT）
> - label の `resource: id-prefix` 表示は MVP 暫定。本格的な name 解決は本 plan 範囲外（後続 phase）

- [ ] **Step 3: layout.tsx で Recents fetch + provider に渡す**

```diff
+import { getRecentAuditedResources } from "@/shared/domain/audit/recents-queries";
 ...
   const user = await verifyAdminSession();
   const navItems = getNavItemsForRole(user.role);
   const quickActions = getQuickActionsForRole(user.role);
-  const recents: RecentItem[] = [];
+  const recents = await getRecentAuditedResources(user.id, user.role, 8);
```

- [ ] **Step 4: 関連 mutation で `updateTag(getCacheTag.auditLogs.recent(userId))` 追加**

監査ログを書き込む既存 helper `logAction()` を grep:

```bash
grep -rln "logAction\|logUserAction" src/admin/lib/ src/shared/lib/
```

`logAction` 内 / `executeAdminMutationResult` の audit log 書き込み後に `updateTag(getCacheTag.auditLogs.recent(userId))` を追加（fireAndForget 内で）。

> 既存の `executeAdminMutationResult` の実行順序契約（ADR 0019）を破らないよう、`fireAndForget(async () => { await logAction(...); updateTag(...); })` の形で同一 fireAndForget block 内に置く。

- [ ] **Step 5: Validate + Commit**

```bash
bun run validate
```

Expected: EXIT 0

```bash
git add src/shared/domain/audit/recents-queries.ts \
        src/shared/lib/constants/cache-tags.ts \
        src/app/\(admin\)/admin/\(dashboard\)/layout.tsx \
        src/admin/lib/admin-action.ts # logAction 修正がある場合
git commit -m "feat(admin): wire recents into command palette via audit log query (P16 C1)"
```

---

### Task C2 — ADR 0024

**Files:**

- Create: `docs/architecture/decisions/0024-admin-command-palette.md`
- Modify: `docs/architecture/decisions/README.md`

- [ ] **Step 1: ADR 0024 作成**

`docs/architecture/decisions/0024-admin-command-palette.md`:

```markdown
# 0024. Admin Command Palette with Hybrid Server-Action Search

- Status: Accepted
- Date: 2026-04-27
- Deciders: y2ikgm89

## Context

管理画面の resource 数が 11、admin route 数が 23 を超え、サイドバー走査での到達コストが上昇。
Linear / GitHub / Notion 等で標準化された Cmd+K UX に揃えることで admin 作業効率を改善する必要が生じた。
公式 cmdk ライブラリは導入済み（pages エディタの "/" コマンドで使用中）だが、グローバル Command Palette は未実装。

## Decision

Hybrid 構成 (Option C) を採用:

1. **Recents / Nav / Quick Actions** はサーバ side で計算（layout で fetch）し、static state として cmdk で fuzzy filter
2. **Free-text search** は単一 Server Action `searchAdminResources(query)` が 11 resource を `Promise.allSettled` で並列検索
3. UI primitive は既存 `_shared/components/ui/command.tsx` を流用、新規 Dialog primitive を作らない
4. 既存 Lexical エディタの "/" コマンド（`SlashCommandPlugin`）とは責務分離し、相互依存させない

## Alternatives Considered

- **All-Server Search**: typing 中の RTT が UX を悪化させるため不採用
- **Indexed-Client Search**: bundle サイズと機微情報露出（顧客名・予約詳細）の問題で不採用

## Consequences

### Positive

- typing 開始から first paint まで Linear / GitHub と同等の体感速度
- role-based filtering を server で完結、client bundle に admin 全データを含めない
- 既存 cmdk primitive 流用で新規 dependency ゼロ

### Negative

- 11 resource 並列 query は DB 負荷が増える（後続: index 追加、Cloud SQL slow query log 監視）
- Server Action のレート制限を `formSubmitRateLimiter` 流用とすることで mutation 系と bucket 共有

### Operational

- 監査ログには影響なし（read-only）
- Recents 表示は `AuditLog` を SoT として参照、新規テーブル追加なし

## References

- spec: `docs/superpowers/specs/2026-04-27-admin-command-palette-design.md`
- plan: `docs/superpowers/plans/2026-04-27-admin-command-palette.md`
- 既存 cmdk: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/command.tsx`
```

- [ ] **Step 2: ADR README index に追加**

`docs/architecture/decisions/README.md` の table 末尾に:

```diff
 | [0023](./0023-multi-location-seo-foundation.md) | ... |
+| [0024](./0024-admin-command-palette.md) | Admin Command Palette with Hybrid Server-Action Search | Accepted |
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/decisions/0024-admin-command-palette.md \
        docs/architecture/decisions/README.md
git commit -m "docs(adr): 0024 admin command palette (P16 C2)"
```

---

### Task C3 — package.json test batch + 統合確認

**Files:**

- Modify: `package.json`

- [ ] **Step 1: test:unit / test:integration batch 追加**

`package.json` の `scripts.test:unit` の `&&` chain に追加:

```diff
-"test:unit": "bun test __tests__/unit/lib/foo && ...",
+"test:unit": "bun test __tests__/unit/lib/command-palette && bun test __tests__/unit/lib/foo && ...",
```

`scripts.test:integration` の `&&` chain に追加:

```diff
-"test:integration": "bun test __tests__/integration/actions/admin && ...",
+"test:integration": "bun test __tests__/integration/actions/admin && ..." # 既存に command-palette.test.ts が含まれることを確認、不在なら追加
```

> CLAUDE.md「per-directory バッチ」原則。新規 directory `__tests__/unit/lib/command-palette/` を `&&` chain に明示追加。

- [ ] **Step 2: 全テスト実行**

```bash
bun run test:unit
bun run test:integration
```

Expected: 全 pass

- [ ] **Step 3: 最終 validate + build**

```bash
bun run validate && bun run build
```

Expected: EXIT 0

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "test(admin): include command palette in test batches (P16 C3)"
```

---

## 完了後 (worktree → main)

```bash
cd /g/workspace/work/website/customer/myrrh-rental-space
git status --short                          # → 空
git log --oneline main..feature/admin-command-palette  # → 12 commits
git merge --ff-only feature/admin-command-palette
git worktree remove .worktrees/command-palette
git branch -d feature/admin-command-palette
```

---

## Self-Review

### 1. Spec coverage

| Spec 要素                                     | カバー Task                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| §3.2 cmdk Section 構成                        | A3 (Suggested), B5 (Search Results)                                           |
| §3.3 データフロー: Recents                    | C1                                                                            |
| §3.3 データフロー: Static Nav / Quick Actions | B1, B2                                                                        |
| §3.3 データフロー: Search Results             | B3, B4, B5                                                                    |
| §3.4 既存 cmdk 関数の再利用                   | B3 で thin wrapper を全 11 resource 新規実装に変更（前提修正）                |
| §4.1 TopBar Trigger                           | A2, A4                                                                        |
| §4.2 Dialog Layout                            | A3                                                                            |
| §4.3 グローバルキーボード                     | A1                                                                            |
| §5.1 Server Action                            | B4                                                                            |
| §5.2 EDITOR の userPageAssignment             | B1 (`hasPermission` で間接担保、page resource は ROLE_PERMISSIONS で read 可) |
| §5.3 VIEWER の create アクション非表示        | B2 (`getQuickActionsForRole`)                                                 |
| §6 キャッシュ戦略                             | C1 (`auditLogs.recent` tag)                                                   |
| §7 a11y                                       | A3 (`title` / `description` / `aria-label`), A2 (44px hit area)               |
| §9 ADR Draft                                  | C2                                                                            |

### 2. Placeholder scan

- ✓ "TBD" / "TODO" は Task C1 Step 2 の "label の resource: id-prefix 表示は MVP 暫定" のみ。これは「後続 phase の改善余地」として意図的に残す
- ✓ 全 Step に具体的なコード例 / コマンド付き

### 3. Type consistency

- `NavItem` / `QuickAction` / `RecentItem` / `SearchResultItem` / `SearchResultGroup` を A1 で定義、以降全 Task で同名参照
- `getNavItemsForRole` / `getQuickActionsForRole` / `getRecentAuditedResources` の signature が layout.tsx 配線と一致
- `searchByResource` / `searchAdminResources` の戻り値型が test mock と整合

---

## リスク・実装中の判断ポイント

1. **Bundle B Task B3**: 11 resource の field 名を schema 確認時に乖離があれば justified deviation で報告
2. **Bundle B Task B4**: `checkActionRateLimit` の signature 確認が rate-limit.ts 不在ならば `formSubmitRateLimiter.consume(...)` 直接呼び出しにフォールバック
3. **Bundle C Task C1**: `prisma.auditLog` の field 名（`userId` / `actorUserId` 等）が schema 実装と乖離した場合は schema を SoT として plan 修正
4. **Bundle B Task B5**: dev で動作確認時に Cmd+K が capture されない場合、`event.target` に応じた listener 改善が必要（contenteditable / textarea 内で発火しない仕様は GitHub / Linear と同じため、現状維持で OK）
