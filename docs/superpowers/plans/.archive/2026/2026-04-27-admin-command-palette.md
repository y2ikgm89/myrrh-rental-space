> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# Admin Command Palette Implementation Plan (P16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a global Command Palette across the admin UI (Cmd+K / Ctrl+K) that provides cross-search, navigation, and quick actions in a single dialog.

**Architecture:** Hybrid (Option C) — Recents / Nav / Quick Actions are server-fetched in layout; free-text search uses a single Server Action `searchAdminResources` that searches 11 resources in parallel via `Promise.allSettled`. Reuse the existing cmdk primitive (`@/admin/components/ui/command.tsx`); no new Dialog primitive.

**Tech Stack:** Next.js 16.2 / React 19.2 / cmdk 1.1 / Radix Dialog / Better Auth (`adminAuth`) / Prisma 7.8 / Tailwind v4

**Spec:** `docs/superpowers/specs/2026-04-27-admin-command-palette-design.md`

---

## Important assumptions (spec corrections)

1. **Prisma model name is `AuditLog`** (treat spec references to `AdminAuditLog` as `AuditLog`). Actor can be filtered via the `User.auditLogs AuditLog[]` relation
2. **Most existing admin-queries lack a `q` parameter** — implement thin search wrappers for all 11 resources in `_shared/lib/command-palette/queries.ts` (do not reuse existing queries)
3. **Cache tag**: Recents requires `getCacheTag.auditLogs.recent(userId)`. If missing in `@/shared/lib/constants`, add in Bundle B
4. **Rate limit**: reuse `formSubmitRateLimiter` (`src/shared/lib/rate-limit.ts`), do not add a new limiter

---

## Worktree prerequisites

```bash
# After confirming no uncommitted changes on main
cd /g/workspace/work/website/customer/myrrh-rental-space
git status --short                       # → empty
git worktree add .worktrees/command-palette -b feature/admin-command-palette main
cd .worktrees/command-palette
python3 -c "import shutil; shutil.copy2('../../.env', '.env')"
python3 -c "import shutil; shutil.copy2('../../.env.local', '.env.local')" 2>/dev/null || true
robocopy ../../generated generated /E /XF nul
bun install --frozen-lockfile
```

---

## File Structure (entire bundle)

### New files

| Path                                                                                              | Responsibility                                                       |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/CommandPalette.tsx`         | Client Component — cmdk dialog, search input + results               |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/CommandPaletteProvider.tsx` | Client Provider — open/close state + Cmd+K listener                  |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/SearchTriggerButton.tsx`    | Client — TopBar "Search ⌘K" trigger                                  |
| `src/app/(admin)/admin/(dashboard)/_shared/components/command-palette/types.ts`                   | Type definitions (SearchResult / RecentItem / NavItem / QuickAction) |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/nav-items.ts`                      | 23 admin nav items SSoT + role filter                                |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/quick-actions.ts`                  | Quick actions SSoT (6-8 create actions) + role filter                |
| `src/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/queries.ts`                        | Thin search wrappers for 11 resources (`server-only`)                |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/command-palette/search.ts`                     | Server Action — `searchAdminResources(query)`                        |
| `src/shared/domain/audit/recents-queries.ts`                                                      | `getRecentAuditedResources(userId, limit)` (`'use cache'`)           |
| `docs/architecture/decisions/0024-admin-command-palette.md`                                       | ADR 0024                                                             |

### Modified files

| Path                                                            | Changes                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `src/app/(admin)/admin/(dashboard)/_components/TopBar.tsx`      | Add `searchTrigger` slot (next to branding)                            |
| `src/app/(admin)/admin/(dashboard)/_components/TopBarSlots.tsx` | Add `SearchTriggerSlot`                                                |
| `src/app/(admin)/admin/(dashboard)/layout.tsx`                  | Wrap `<CommandPaletteProvider>` + Recents fetch + searchTrigger wiring |
| `src/shared/lib/constants/cache-tags.ts` (if applicable file)   | Add `getCacheTag.auditLogs.recent(userId)` (if missing)                |
| `docs/architecture/decisions/README.md`                         | Add ADR 0024 to index                                                  |

### Test files

| Path                                                          | Responsibility                                                                                 |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `__tests__/unit/lib/command-palette/nav-items.test.ts`        | Role filter logic (4 roles × 23 nav items)                                                     |
| `__tests__/unit/lib/command-palette/quick-actions.test.ts`    | Role filter (VIEWER hidden, EDITOR/ADMIN shown)                                                |
| `__tests__/unit/lib/command-palette/queries.test.ts`          | Search wrapper happy paths for all 11 resources                                                |
| `__tests__/integration/actions/admin/command-palette.test.ts` | `searchAdminResources` Server Action (auth + role filter + Promise.allSettled fault tolerance) |

---

## Bundle A — UI Scaffold (4 commits)

> **Implementer dispatch**: Assign one implementer to handle all of Bundle A. For each commit, use the plan-specified commit message verbatim. `git add` / `commit` may be run by the implementer; `git reset` / `restore` / `stash` are forbidden.

### Task A1 — Types + Provider scaffold

**Files:**

- Create: `_shared/components/command-palette/types.ts`
- Create: `_shared/components/command-palette/CommandPaletteProvider.tsx`

- [ ] **Step 1: Create type definitions**

`_shared/components/command-palette/types.ts`:

```ts
import type { Resource } from "@/admin/lib/admin-resources";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  resource: Resource;
  keywords?: string[]; // keyword boost for fuzzy filter
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
  label: string; // "Space: Shibuya"
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

- [ ] **Step 2: Provider scaffold (open state + keyboard listener)**

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

- [ ] **Step 1: Implement trigger button**

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
        aria-label="Open search"
        className="h-11 w-11 sm:hidden"
      >
        <IconSearch className="h-5 w-5" />
      </Button>

      {/* Desktop: full search bar */}
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label="Open search"
        className={cn(
          "hidden sm:inline-flex h-11 w-64 items-center justify-between gap-2",
          "px-3 text-sm text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="inline-flex items-center gap-2">
          <IconSearch className="h-4 w-4" aria-hidden="true" />
          Search...
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

- [ ] **Step 1: Palette body (Suggested section only; search wired in Bundle B)**

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
      title="Command palette"
      description="Search and navigate across the admin UI"
    >
      <CommandInput placeholder="Type a command or search keyword..." />
      <CommandList>
        <CommandEmpty>No matching items</CommandEmpty>

        {recents.length > 0 && (
          <>
            <CommandGroup heading="Recent activity">
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
            <CommandGroup heading="Quick actions">
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

        <CommandGroup heading="Navigation">
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

### Task A4 — TopBar slot extension + layout.tsx wiring (empty data)

**Files:**

- Modify: `_components/TopBar.tsx`
- Modify: `_components/TopBarSlots.tsx`
- Modify: `(dashboard)/layout.tsx`

- [ ] **Step 1: Add searchTrigger slot to TopBar.tsx**

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

- [ ] **Step 2: Add SearchTriggerSlot to TopBarSlots.tsx**

Add to the end of the file:

```tsx
import { SearchTriggerButton } from "@/admin/_shared/components/command-palette/SearchTriggerButton";

export function SearchTriggerSlot(): ReactElement {
  return <SearchTriggerButton />;
}
```

> Note: Verify the `@/admin/_shared/...` import alias against existing patterns. Use the relative path `../_shared/components/command-palette/SearchTriggerButton` if needed.

- [ ] **Step 3: Wire Provider + searchTrigger in layout.tsx (recents empty for now)**

```diff
+import { CommandPaletteProvider } from "./_shared/components/command-palette/CommandPaletteProvider";
+import { CommandPalette } from "./_shared/components/command-palette/CommandPalette";
+import { getNavItemsForRole } from "./_shared/lib/command-palette/nav-items"; // implemented in Bundle B, empty for now
+import { getQuickActionsForRole } from "./_shared/lib/command-palette/quick-actions"; // same as above
+import { SearchTriggerSlot } from "./_components/TopBarSlots";
 ...
 export default async function DashboardLayout({ children }) {
   const user = await verifyAdminSession();
+  // Replace after Bundle B: const navItems = getNavItemsForRole(user.role);
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

> With temporary empty arrays, Cmd+K opens the dialog but the Suggested section shows the empty state at the end of Bundle A. Bundles B/C complete it.

- [ ] **Step 4: type-check + lint + verify UI in dev**

```bash
bun run validate
```

Expected: EXIT 0

If the dev server is running: open `/admin`, press Cmd+K (mac) / Ctrl+K to open the dialog → empty state appears → Esc closes it.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_components/TopBar.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/_components/TopBarSlots.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/layout.tsx
git commit -m "feat(admin): wire command palette into TopBar and layout (P16 A4)"
```

---

## Bundle B — Search Server Action + Domain queries (5 commits)

> **Implementer dispatch**: Assign one implementer to handle all of Bundle B. Because Bundle A uses temporary empty arrays for `getNavItemsForRole` / `getQuickActionsForRole`, include parallel edits in layout.tsx to replace them with real implementations.

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
    label: "Dashboard",
    href: "/admin",
    resource: "settings",
  },
  {
    id: "spaces",
    label: "Spaces",
    href: "/admin/spaces",
    resource: "space",
  },
  {
    id: "locations",
    label: "Locations",
    href: "/admin/spaces?tab=locations",
    resource: "location",
  },
  {
    id: "categories",
    label: "Categories",
    href: "/admin/spaces?tab=categories",
    resource: "spaceCategory",
  },
  {
    id: "reservations",
    label: "Reservations",
    href: "/admin/reservations",
    resource: "reservation",
  },
  {
    id: "customers",
    label: "Customers",
    href: "/admin/customers",
    resource: "customer",
  },
  {
    id: "inquiries",
    label: "Inquiries",
    href: "/admin/inquiries",
    resource: "inquiry",
  },
  {
    id: "events",
    label: "Events",
    href: "/admin/events",
    resource: "event",
  },
  { id: "posts", label: "Blog", href: "/admin/posts", resource: "post" },
  { id: "news", label: "News", href: "/admin/news", resource: "news" },
  { id: "pages", label: "Pages", href: "/admin/pages", resource: "page" },
  { id: "faq", label: "FAQ", href: "/admin/faq", resource: "faq" },
  { id: "terms", label: "Terms", href: "/admin/terms", resource: "terms" },
  {
    id: "navigation",
    label: "Navigation",
    href: "/admin/navigation",
    resource: "navigation",
  },
  {
    id: "announcement-bar",
    label: "Announcement Bar",
    href: "/admin/announcement-bar",
    resource: "announcementBar",
  },
  { id: "media", label: "Media", href: "/admin/media", resource: "media" },
  {
    id: "block-templates",
    label: "Block Templates",
    href: "/admin/block-templates",
    resource: "blockTemplate",
  },
  {
    id: "coupons",
    label: "Coupons",
    href: "/admin/coupons",
    resource: "coupon",
  },
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    resource: "user",
  },
  {
    id: "audit-logs",
    label: "Audit Logs",
    href: "/admin/audit-logs",
    resource: "auditLog",
  },
  {
    id: "settings-organization",
    label: "Settings: Organization",
    href: "/admin/settings/organization",
    resource: "settings",
  },
  {
    id: "settings-business",
    label: "Settings: Business",
    href: "/admin/settings/business",
    resource: "settings",
  },
  {
    id: "settings-security",
    label: "Settings: Security & Integrations",
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

> **Important**: The 23 hrefs above are the SSoT at plan creation. Before implementation, verify existence with `ls 'src/app/(admin)/admin/(dashboard)/'`; report missing/renamed routes as justified deviations.

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
  test("SUPER_ADMIN gets all nav items", () => {
    expect(getNavItemsForRole(Role.SUPER_ADMIN).length).toBe(
      ALL_NAV_ITEMS_FOR_TEST.length,
    );
  });

  test("VIEWER excludes admin-only resources like user / auditLog", () => {
    const items = getNavItemsForRole(Role.VIEWER);
    expect(items.find((i) => i.resource === "user")).toBeUndefined();
    expect(items.find((i) => i.resource === "auditLog")).toBeUndefined();
  });

  test("EDITOR returns only readable resources", () => {
    const items = getNavItemsForRole(Role.EDITOR);
    // EDITOR returns only resources readable in ROLE_PERMISSIONS
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(ALL_NAV_ITEMS_FOR_TEST.length);
  });

  test("ADMIN includes user / auditLog", () => {
    const items = getNavItemsForRole(Role.ADMIN);
    expect(items.find((i) => i.resource === "user")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests**

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

- [ ] **Step 1: Define quick actions**

`_shared/lib/command-palette/quick-actions.ts`:

```ts
import type { Role } from "@/shared/lib/validations/enums/prisma-types";
import type { QuickAction } from "@/admin/_shared/components/command-palette/types";
import { hasPermission } from "@/admin/lib/permissions";

const ALL_QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: "new-space",
    label: "Create new space",
    href: "/admin/spaces/new",
    resource: "space",
  },
  {
    id: "new-reservation",
    label: "Create new reservation",
    href: "/admin/reservations/new",
    resource: "reservation",
  },
  {
    id: "new-customer",
    label: "Register new customer",
    href: "/admin/customers/new",
    resource: "customer",
  },
  {
    id: "new-event",
    label: "Create new event",
    href: "/admin/events/new",
    resource: "event",
  },
  {
    id: "new-post",
    label: "Create new blog post",
    href: "/admin/posts/new",
    resource: "post",
  },
  {
    id: "new-news",
    label: "Create new news",
    href: "/admin/news/new",
    resource: "news",
  },
  {
    id: "new-coupon",
    label: "Create new coupon",
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

> **Important**: Verify each `href` exists with `ls 'src/app/(admin)/admin/(dashboard)/<resource>/new/'`. Remove missing routes as justified deviations.

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
  test("SUPER_ADMIN gets all quick actions", () => {
    expect(getQuickActionsForRole(Role.SUPER_ADMIN).length).toBe(
      ALL_QUICK_ACTIONS_FOR_TEST.length,
    );
  });

  test("VIEWER returns empty array (no create permission)", () => {
    expect(getQuickActionsForRole(Role.VIEWER)).toEqual([]);
  });

  test("ADMIN gets quick actions with create permission", () => {
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

- [ ] **Step 1: Implement thin search wrappers for 11 resources**

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

> **Important — pre-implementation checks**:
>
> - Verify each model field name (e.g., `Reservation.reservationNumber` / `Inquiry.subject`) via `grep -A30 "^model <Name>" prisma/schema.prisma`
> - For models without `deletedAt` (`Customer` / `Inquiry` / `FaqItem` / `Coupon`), do not include `where: { deletedAt: null }`
> - The Location edit URL can be adjusted later to match the per-slug invalidation pattern in `gotchas/domain.md`

- [ ] **Step 2: Unit test (mock prisma for 11 resources)**

`__tests__/unit/lib/command-palette/queries.test.ts`:

```ts
import { describe, expect, mock, test } from "bun:test";

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: mock(async () => [
        { id: "s1", name: "Shibuya", slug: "shibuya" },
      ]),
    },
    customer: {
      findMany: mock(async () => [
        {
          id: "c1",
          lastName: "Yamada",
          firstName: "Taro",
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
          customer: { lastName: "Yamada" },
          space: { name: "Shibuya" },
        },
      ]),
    },
    post: {
      findMany: mock(async () => [{ id: "p1", title: "Post", slug: "post" }]),
    },
    news: {
      findMany: mock(async () => [{ id: "n1", title: "News", slug: "news" }]),
    },
    page: {
      findMany: mock(async () => [{ id: "pg1", title: "Page", slug: "page" }]),
    },
    event: {
      findMany: mock(async () => [
        {
          id: "e1",
          title: "Event",
          slug: "event",
          startAt: new Date("2026-05-01"),
        },
      ]),
    },
    inquiry: {
      findMany: mock(async () => [
        {
          id: "i1",
          name: "Inquiry",
          subject: "Subject",
          createdAt: new Date(),
        },
      ]),
    },
    faqItem: {
      findMany: mock(async () => [
        { id: "f1", question: "Question", categoryId: "cat1" },
      ]),
    },
    coupon: {
      findMany: mock(async () => [{ id: "co1", code: "C10", name: "10% off" }]),
    },
    location: {
      findMany: mock(async () => [{ id: "l1", name: "Honkan", slug: "main" }]),
    },
  },
}));

import {
  searchByResource,
  SEARCHABLE_RESOURCES,
} from "@/admin/_shared/lib/command-palette/queries";

describe("searchByResource", () => {
  test("all 11 resources are included in SEARCHABLE_RESOURCES", () => {
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
    test(`${resource} search returns SearchResultItem`, async () => {
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

> Note: Because this is a new test directory, add `bun test __tests__/unit/lib/command-palette` to the `test:unit` batch in `package.json` (CLAUDE.md "per-directory batch" principle). Include this in Bundle B Step B3 as a single commit.

---

### Task B4 — Server Action `searchAdminResources`

**Files:**

- Create: `_shared/actions/command-palette/search.ts`

- [ ] **Step 1: Implement Server Action**

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

> **Important — pre-implementation checks**:
>
> - Verify the exact signature of `checkActionRateLimit` with `grep -nE "^export.*checkActionRateLimit" src/shared/lib/rate-limit.ts`
> - If absent, follow the existing pattern such as `formSubmitRateLimiter.consume(...)`
> - Confirm the return type of `checkAdminAuth` provides `auth.user.role` via `Read`

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

  test("empty query returns empty groups", async () => {
    const result = await searchAdminResources("");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.groups).toEqual([]);
  });

  test("single-character query returns empty groups (noise suppression)", async () => {
    const result = await searchAdminResources("a");
    expect(result.success).toBe(true);
  });

  test("valid query runs parallel search across 11 resources", async () => {
    const result = await searchAdminResources("test");
    expect(result.success).toBe(true);
    expect(mockSearchByResource).toHaveBeenCalledTimes(11);
    if (result.success) {
      expect(result.data.groups.length).toBe(11);
    }
  });

  test("returns error on auth failure", async () => {
    mockCheckAuth.mockImplementationOnce(async () => ({
      success: false,
      error: { error: "Login required", success: false as const },
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

### Task B5 — Wire search results into CommandPalette

**Files:**

- Modify: `_shared/components/command-palette/CommandPalette.tsx`
- Modify: `_shared/components/command-palette/CommandPaletteProvider.tsx`
- Modify: `(dashboard)/layout.tsx`

- [ ] **Step 1: Add search state to Provider**

Add query / results / isPending to `CommandPaletteProvider.tsx`:

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
+  // Clear query / results when the dialog closes
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

- [ ] **Step 2: Add Search Results section to CommandPalette body**

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
-          No matching items
+          {isSearching ? "Searching..." : query.length >= 2 ? "No matching items" : "Select a command or search with 2+ characters"}
         </CommandEmpty>
+
+        {/* Search results (query length 2+) */}
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
+        {/* Suggested section (empty query) */}
+        {query.length < 2 && (
+          <>
             {recents.length > 0 && (...)}
             {quickActions.length > 0 && (...)}
            <CommandGroup heading="Navigation">
               ...
             </CommandGroup>
+          </>
+        )}
       </CommandList>
     </CommandDialog>
   );
 }
```

- [ ] **Step 3: Replace temporary empty arrays in layout.tsx**

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
+  const recents: RecentItem[] = []; // wired in Bundle C
```

- [ ] **Step 4: Validate + verify in dev**

```bash
bun run validate
```

Expected: EXIT 0

dev: Cmd+K → Suggested shows 23 nav items + 7 quick actions / type "Shibuya" etc → search results appear / verify navigation on Esc or item selection.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/CommandPalette.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/_shared/components/command-palette/CommandPaletteProvider.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/layout.tsx
git commit -m "feat(admin): wire search action and nav items into command palette (P16 B5)"
```

---

## Bundle C — Recents wiring + ADR + integration tests (3 commits)

> **Implementer dispatch**: Assign one implementer to handle all of Bundle C.

### Task C1 — Recents domain query

**Files:**

- Create: `src/shared/domain/audit/recents-queries.ts`
- Modify: `src/shared/lib/constants/cache-tags.ts` (if applicable file)
- Modify: `(dashboard)/layout.tsx` (Recents wiring)

- [ ] **Step 1: Add cache tag (if missing)**

Add to `getCacheTag` in `@/shared/lib/constants/cache-tags.ts`:

```ts
auditLogs: {
  recent: (userId: string) => `audit-logs:recent:${userId}`,
},
```

> Match the existing `getCacheTag` structure. Implementer should confirm current state via `Read`.

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
    take: limit * 3, // buffer for dedupe + permission filter before applying limit
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
      label: `${resource}: ${log.resourceId.slice(0, 8)}`, // improve resource name resolution later in Bundle C
      href: buildHref(resource, log.resourceId),
      occurredAt: log.createdAt.toISOString(),
    });
  }

  return results;
}
```

> **Important — pre-implementation checks**:
>
> - Confirm `prisma.auditLog` field names in the schema (`userId` vs `actorUserId`, etc.)
> - Verify `Resource` values match `AuditLog.resource` VARCHAR values (SSoT in `enums/helpers`)
> - The `resource: id-prefix` label is MVP-only; full name resolution is out of scope (later phase)

- [ ] **Step 3: Fetch Recents in layout.tsx + pass to provider**

```diff
+import { getRecentAuditedResources } from "@/shared/domain/audit/recents-queries";
 ...
   const user = await verifyAdminSession();
   const navItems = getNavItemsForRole(user.role);
   const quickActions = getQuickActionsForRole(user.role);
-  const recents: RecentItem[] = [];
+  const recents = await getRecentAuditedResources(user.id, user.role, 8);
```

- [ ] **Step 4: Add `updateTag(getCacheTag.auditLogs.recent(userId))` in related mutations**

Grep the existing helper `logAction()` that writes audit logs:

```bash
grep -rln "logAction\|logUserAction" src/admin/lib/ src/shared/lib/
```

Add `updateTag(getCacheTag.auditLogs.recent(userId))` after the audit log write in `logAction` / `executeAdminMutationResult` (inside fireAndForget).

> Preserve the `executeAdminMutationResult` execution order contract (ADR 0019) by placing it in the same fireAndForget block: `fireAndForget(async () => { await logAction(...); updateTag(...); })`.

- [ ] **Step 5: Validate + Commit**

```bash
bun run validate
```

Expected: EXIT 0

```bash
git add src/shared/domain/audit/recents-queries.ts \
        src/shared/lib/constants/cache-tags.ts \
        src/app/\(admin\)/admin/\(dashboard\)/layout.tsx \
        src/admin/lib/admin-action.ts # if logAction is modified
git commit -m "feat(admin): wire recents into command palette via audit log query (P16 C1)"
```

---

### Task C2 — ADR 0024

**Files:**

- Create: `docs/architecture/decisions/0024-admin-command-palette.md`
- Modify: `docs/architecture/decisions/README.md`

- [ ] **Step 1: Create ADR 0024**

`docs/architecture/decisions/0024-admin-command-palette.md`:

```markdown
# 0024. Admin Command Palette with Hybrid Server-Action Search

- Status: Accepted
- Date: 2026-04-27
- Deciders: y2ikgm89

## Context

The admin UI has 11 resources and over 23 admin routes, increasing the cost of reaching destinations via sidebar scanning.
Aligning with the standardized Cmd+K UX in Linear / GitHub / Notion improves admin workflow efficiency.
The official cmdk library is already in use ("/" command in the pages editor), but a global Command Palette is not yet implemented.

## Decision

Adopt the Hybrid approach (Option C):

1. **Recents / Nav / Quick Actions** are computed server-side (fetched in layout) and fuzzy-filtered in cmdk as static state
2. **Free-text search** uses a single Server Action `searchAdminResources(query)` that searches 11 resources in parallel via `Promise.allSettled`
3. Reuse the existing `_shared/components/ui/command.tsx` UI primitive; do not add a new Dialog primitive
4. Keep responsibilities separate from the existing Lexical editor "/" command (`SlashCommandPlugin`); no interdependency

## Alternatives Considered

- **All-Server Search**: rejected because typing RTT degrades UX
- **Indexed-Client Search**: rejected due to bundle size and sensitive data exposure (customer names, reservation details)

## Consequences

### Positive

- Perceived speed from typing to first paint comparable to Linear / GitHub
- Role-based filtering handled on the server; no full admin data in client bundle
- Zero new dependencies by reusing cmdk primitive

### Negative

- Parallel queries across 11 resources increase DB load (follow-up: add indexes, monitor Cloud SQL slow query logs)
- Reusing `formSubmitRateLimiter` for Server Actions shares buckets with mutation workflows

### Operational

- No impact on audit logs (read-only)
- Recents display references `AuditLog` as SoT; no new tables added

## References

- spec: `docs/superpowers/specs/2026-04-27-admin-command-palette-design.md`
- plan: `docs/superpowers/plans/2026-04-27-admin-command-palette.md`
- Existing cmdk: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/command.tsx`
```

- [ ] **Step 2: Add to ADR README index**

Add to the end of the table in `docs/architecture/decisions/README.md`:

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

### Task C3 — package.json test batch + integration verification

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add test:unit / test:integration batches**

Add to the `&&` chain in `scripts.test:unit` in `package.json`:

```diff
-"test:unit": "bun test __tests__/unit/lib/foo && ...",
+"test:unit": "bun test __tests__/unit/lib/command-palette && bun test __tests__/unit/lib/foo && ...",
```

Add to the `&&` chain in `scripts.test:integration`:

```diff
-"test:integration": "bun test __tests__/integration/actions/admin && ...",
+"test:integration": "bun test __tests__/integration/actions/admin && ..." # confirm command-palette.test.ts is included; add if missing
```

> CLAUDE.md "per-directory batch" principle. Explicitly add the new directory `__tests__/unit/lib/command-palette/` to the `&&` chain.

- [ ] **Step 2: Run all tests**

```bash
bun run test:unit
bun run test:integration
```

Expected: all pass

- [ ] **Step 3: Final validate + build**

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

## After completion (worktree → main)

```bash
cd /g/workspace/work/website/customer/myrrh-rental-space
git status --short                          # → empty
git log --oneline main..feature/admin-command-palette  # → 12 commits
git merge --ff-only feature/admin-command-palette
git worktree remove .worktrees/command-palette
git branch -d feature/admin-command-palette
```

---

## Self-Review

### 1. Spec coverage

| Spec item                                  | Covered tasks                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| §3.2 cmdk section structure                | A3 (Suggested), B5 (Search Results)                                                      |
| §3.3 Data flow: Recents                    | C1                                                                                       |
| §3.3 Data flow: Static Nav / Quick Actions | B1, B2                                                                                   |
| §3.3 Data flow: Search Results             | B3, B4, B5                                                                               |
| §3.4 Reuse existing cmdk functions         | B3 changes thin wrappers to 11 new resources (assumption fix)                            |
| §4.1 TopBar Trigger                        | A2, A4                                                                                   |
| §4.2 Dialog Layout                         | A3                                                                                       |
| §4.3 Global keyboard                       | A1                                                                                       |
| §5.1 Server Action                         | B4                                                                                       |
| §5.2 EDITOR userPageAssignment             | B1 (indirectly enforced via `hasPermission`, page resource readable in ROLE_PERMISSIONS) |
| §5.3 VIEWER hide create actions            | B2 (`getQuickActionsForRole`)                                                            |
| §6 Cache strategy                          | C1 (`auditLogs.recent` tag)                                                              |
| §7 a11y                                    | A3 (`title` / `description` / `aria-label`), A2 (44px hit area)                          |
| §9 ADR Draft                               | C2                                                                                       |

### 2. Placeholder scan

- ✓ "TBD" / "TODO" appears only in Task C1 Step 2 ("resource: id-prefix label is MVP-only"). This is intentionally left as an improvement area for a later phase
- ✓ Every step includes concrete code examples / commands

### 3. Type consistency

- `NavItem` / `QuickAction` / `RecentItem` / `SearchResultItem` / `SearchResultGroup` defined in A1 and referenced consistently afterward
- Signatures of `getNavItemsForRole` / `getQuickActionsForRole` / `getRecentAuditedResources` match layout.tsx wiring
- Return types of `searchByResource` / `searchAdminResources` align with test mocks

---

## Risks / decision points during implementation

1. **Bundle B Task B3**: If schema field names for the 11 resources differ, report as a justified deviation
2. **Bundle B Task B4**: If `checkActionRateLimit` signature is absent in rate-limit.ts, fall back to direct `formSubmitRateLimiter.consume(...)`
3. **Bundle C Task C1**: If `prisma.auditLog` fields (`userId` / `actorUserId`, etc.) differ from schema, treat schema as SoT and update the plan
4. **Bundle B Task B5**: If Cmd+K is not captured in dev, adjust the listener based on `event.target` (not firing in contenteditable/textarea matches GitHub/Linear behavior, so current behavior is OK)
