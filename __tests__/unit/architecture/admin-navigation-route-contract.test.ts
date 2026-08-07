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
  test("href → page.tsx の解決と欠落検出（fixture）", () => {
    // ルート・サブルート・query 付きの解決。
    expect(adminRoutePagePath("/admin")).toBe(
      join(ADMIN_DASHBOARD_ROOT, "page.tsx"),
    );
    expect(adminRoutePagePath("/admin/spaces")).toBe(
      join(ADMIN_DASHBOARD_ROOT, "spaces", "page.tsx"),
    );
    expect(adminRoutePagePath("/admin/spaces?tab=categories")).toBe(
      join(ADMIN_DASHBOARD_ROOT, "spaces", "page.tsx"),
    );

    // **実在しない href は欠落として拾う**（これが拾えないと gate は空振りする）。
    expect(
      missingRoutePages([
        { label: "probe", href: "/admin/does-not-exist-probe" },
      ]),
    ).toHaveLength(1);

    // 実在する href は拾わない。
    expect(
      missingRoutePages([{ label: "spaces", href: "/admin/spaces" }]),
    ).toEqual([]);

    // admin 以外の href は解決させない（黙って通さない）。
    expect(() => adminRoutePagePath("/mypage")).toThrow();
  });

  test("走査対象が空でない（gate が空振りしていない）", () => {
    expect(
      SIDEBAR_GROUPS.flatMap((group) => group.items).length,
    ).toBeGreaterThan(5);
  });

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
