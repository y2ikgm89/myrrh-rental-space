import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SIDEBAR_GROUPS } from "@/app/(admin)/admin/(dashboard)/_components/sidebar-items";
import { ALL_NAV_ITEMS_FOR_TEST } from "@/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/nav-items";
import { ALL_QUICK_ACTIONS_FOR_TEST } from "@/app/(admin)/admin/(dashboard)/_shared/lib/command-palette/quick-actions";

const ADMIN_DASHBOARD_ROOT = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
);

function adminRoutePagePath(href: string): string {
  const path = href.split("?")[0] ?? href;
  if (!path.startsWith("/admin")) {
    throw new Error(`Expected an admin href, got ${href}`);
  }

  const relativePath = path.replace(/^\/admin\/?/u, "");
  if (relativePath.length === 0) {
    return join(ADMIN_DASHBOARD_ROOT, "page.tsx");
  }

  return join(ADMIN_DASHBOARD_ROOT, ...relativePath.split("/"), "page.tsx");
}

function missingRoutePages(
  entries: readonly { readonly label: string; readonly href: string }[],
) {
  return entries
    .map((entry) => ({
      ...entry,
      pagePath: adminRoutePagePath(entry.href),
    }))
    .filter(({ pagePath }) => !existsSync(pagePath));
}

describe("admin navigation route contract", () => {
  test("sidebar links point at existing App Router pages", () => {
    const sidebarEntries = SIDEBAR_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        label: `${group.label}: ${item.label}`,
        href: item.href,
      })),
    );

    expect(missingRoutePages(sidebarEntries)).toEqual([]);
  });

  test("command palette links point at existing App Router pages", () => {
    const commandPaletteEntries = [
      ...ALL_NAV_ITEMS_FOR_TEST.map((item) => ({
        label: `nav: ${item.label}`,
        href: item.href,
      })),
      ...ALL_QUICK_ACTIONS_FOR_TEST.map((action) => ({
        label: `quick: ${action.label}`,
        href: action.href,
      })),
    ];

    expect(missingRoutePages(commandPaletteEntries)).toEqual([]);
  });
});
