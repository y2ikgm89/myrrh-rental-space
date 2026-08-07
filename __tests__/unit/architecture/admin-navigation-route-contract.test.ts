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

/**
 * href から解決した page.tsx が存在しない entry。
 *
 * **存在判定は必須引数で受ける（既定値を置かない）。** fixture は合成した述語を渡して
 * 「今この checkout に何があるか」から切り離す。実ファイルに依存した fixture は、
 * 無関係な route 移動で落ちるうえ、gate の判定そのものを確かめていない
 * （Codex が PR #2019 で指摘）。
 *
 * 既定を `existsSync` にすると、**実走査だけが既定を通り fixture は誰もそこを
 * 通らない**。既定の配線が壊れても fixture は緑のままで、この変更が潰そうとした
 * 「繋ぎ方が検証されない」状態がそのまま残る（Codex が PR #2020 で指摘）。
 * 依存は呼び出し側の境界で明示する。
 */
export function missingRoutePages(
  entries: readonly { readonly label: string; readonly href: string }[],
  pageExists: (pagePath: string) => boolean,
) {
  return entries
    .map((entry) => ({
      ...entry,
      pagePath: adminRoutePagePath(entry.href),
    }))
    .filter(({ pagePath }) => !pageExists(pagePath));
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

    // 存在判定は合成した述語で差し込む（実ファイルに依存させない）。
    const present = new Set([
      join(ADMIN_DASHBOARD_ROOT, "spaces", "page.tsx"),
      join(ADMIN_DASHBOARD_ROOT, "page.tsx"),
    ]);
    const pageExists = (pagePath: string): boolean => present.has(pagePath);

    // **実在しない href は欠落として拾う**（これが拾えないと gate は空振りする）。
    expect(
      missingRoutePages(
        [{ label: "probe", href: "/admin/does-not-exist-probe" }],
        pageExists,
      ),
    ).toHaveLength(1);

    // 実在する href は拾わない。
    expect(
      missingRoutePages(
        [{ label: "spaces", href: "/admin/spaces" }],
        pageExists,
      ),
    ).toEqual([]);

    // query 付きでも同じ page.tsx へ解決してから判定する。
    expect(
      missingRoutePages(
        [{ label: "categories", href: "/admin/spaces?tab=categories" }],
        pageExists,
      ),
    ).toEqual([]);

    // 混在時は欠落しているものだけを返す。
    expect(
      missingRoutePages(
        [
          { label: "spaces", href: "/admin/spaces" },
          { label: "probe", href: "/admin/does-not-exist-probe" },
        ],
        pageExists,
      ).map((entry) => entry.label),
    ).toEqual(["probe"]);

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

    expect(missingRoutePages(sidebarEntries, existsSync)).toEqual([]);
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

    expect(missingRoutePages(commandPaletteEntries, existsSync)).toEqual([]);
  });
});
