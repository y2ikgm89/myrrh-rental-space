import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
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

const PAGE_AUTH_FILE = join(
  ADMIN_DASHBOARD_ROOT,
  "_shared",
  "helpers",
  "page-auth.ts",
);

/**
 * `page-auth.ts` の helper 名 → その helper が要求する `(resource, action)`。
 *
 * 表を手書きすると `page-auth.ts` とドリフトするので、実ファイルから読む。
 * 引数を取る helper（`requireStaffDetailPage` 等）は
 * `requireAdminPermission("x", "y")` のリテラル呼出を持たないので自然に対象外になる。
 */
export function parsePageAuthPermissions(
  source: string,
): Map<string, { resource: string; action: string }> {
  const map = new Map<string, { resource: string; action: string }>();
  const re =
    /export async function (\w+)\([^)]*\)[^{]*\{\s*return requireAdminPermission\(\s*"([^"]+)",\s*"([^"]+)",?\s*\);/gu;
  for (const m of source.matchAll(re)) {
    const [, name, resource, action] = m;
    if (name && resource && action) map.set(name, { resource, action });
  }
  return map;
}

/**
 * nav item の宣言権限と、その href のページが実際に呼ぶ guard の権限を突き合わせる。
 *
 * **粗い**: 対象は「page.tsx が `page-auth.ts` の helper をリテラルで呼んでいる」
 * ページだけ。多くの admin ページは `admin-page-auth-before-suspense` の allowlist に
 * 凍結されていて本体で guard を呼ばないため、そこは検査できない。
 * 検査できない範囲があることを隠さないために、突合できた件数の下限も別 test で置く。
 */
export function navPermissionMismatches(
  entries: readonly {
    readonly label: string;
    readonly href: string;
    readonly resource: string;
    readonly requiredAction: string;
  }[],
  readPage: (pagePath: string) => string | null,
  helpers: Map<string, { resource: string; action: string }>,
) {
  const mismatches: string[] = [];
  for (const entry of entries) {
    const source = readPage(adminRoutePagePath(entry.href));
    if (source === null) continue;
    for (const [name, permission] of helpers) {
      if (!source.includes(`${name}(`)) continue;
      if (
        permission.resource !== entry.resource ||
        permission.action !== entry.requiredAction
      ) {
        mismatches.push(
          `${entry.label}: 宣言 ${entry.resource}:${entry.requiredAction} / ページ ${permission.resource}:${permission.action}`,
        );
      }
    }
  }
  return mismatches;
}

/** 突合できた（= ページ側 guard を検出できた）nav item 数。 */
export function navPermissionCheckedCount(
  entries: readonly { readonly href: string }[],
  readPage: (pagePath: string) => string | null,
  helpers: Map<string, { resource: string; action: string }>,
): number {
  return entries.filter((entry) => {
    const source = readPage(adminRoutePagePath(entry.href));
    if (source === null) return false;
    return [...helpers.keys()].some((name) => source.includes(`${name}(`));
  }).length;
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

  /**
   * 監査 A-01: command palette は `settings:manage` を要求する 4 ページを
   * `settings:read` しか持たない role にも出していた（選ぶと `notFound()`）。
   * href の存在だけを見ていたこの gate は素通りさせていた。
   */
  describe("nav item の宣言権限がページ側 guard と一致する", () => {
    const readPage = (pagePath: string): string | null =>
      existsSync(pagePath) ? readFileSync(pagePath, "utf8") : null;
    const helpers = parsePageAuthPermissions(
      readFileSync(PAGE_AUTH_FILE, "utf8"),
    );
    const entries = ALL_NAV_ITEMS_FOR_TEST.map((item) => ({
      label: `nav: ${item.label}`,
      href: item.href,
      resource: item.requiredPermission.resource,
      requiredAction: item.requiredPermission.action,
    }));

    test("page-auth helper の権限表が読めている", () => {
      expect(helpers.size).toBeGreaterThan(3);
      expect(helpers.get("requireSettingsPage")).toEqual({
        resource: "settings",
        action: "read",
      });
      expect(helpers.get("requireSettingsManagePage")).toEqual({
        resource: "settings",
        action: "manage",
      });
    });

    test("突合できた nav item が空でない（gate が空振りしていない）", () => {
      expect(
        navPermissionCheckedCount(entries, readPage, helpers),
      ).toBeGreaterThan(3);
    });

    test("宣言とページ側 guard に不一致が無い", () => {
      expect(navPermissionMismatches(entries, readPage, helpers)).toEqual([]);
    });

    test("不一致を実際に検出する（見本）", () => {
      const fakeHelpers = new Map([
        [
          "requireSettingsManagePage",
          { resource: "settings", action: "manage" },
        ],
      ]);
      const fakeRead = () => "await requireSettingsManagePage();";

      // 落ちるべき形: ページは manage を要求するのに read で宣言している
      expect(
        navPermissionMismatches(
          [
            {
              label: "nav: 設定: システム管理",
              href: "/admin/settings/system",
              resource: "settings",
              requiredAction: "read",
            },
          ],
          fakeRead,
          fakeHelpers,
        ),
      ).toEqual([
        "nav: 設定: システム管理: 宣言 settings:read / ページ settings:manage",
      ]);

      // 落ちてはいけない形: 宣言が一致している
      expect(
        navPermissionMismatches(
          [
            {
              label: "nav: 設定: システム管理",
              href: "/admin/settings/system",
              resource: "settings",
              requiredAction: "manage",
            },
          ],
          fakeRead,
          fakeHelpers,
        ),
      ).toEqual([]);

      // ページを読めない（存在しない）entry は対象外
      expect(
        navPermissionCheckedCount(
          [{ href: "/admin/settings/system" }],
          () => null,
          fakeHelpers,
        ),
      ).toBe(0);
    });
  });
});
