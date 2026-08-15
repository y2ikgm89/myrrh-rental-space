/**
 * F-119: 非公開 / 非アクティブな Space は公開イベント上で名前だけ出し、
 * `/spaces/<slug>` リンクと JSON-LD venue.url は出さない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildEventVenues } from "@/app/(public)/events/[slug]/_components/event-static-panel-props";
import { publicEventSpaceVenuePath } from "@/shared/lib/events/venue";

const ROOT = process.cwd();

const UNPUBLISHED_SPACE = {
  name: "非公開スタジオ",
  slug: "hidden-studio",
  isPublished: false,
  isActive: true,
} as const;

const INACTIVE_SPACE = {
  name: "停止スタジオ",
  slug: "inactive-studio",
  isPublished: true,
  isActive: false,
} as const;

const PUBLIC_SPACE = {
  name: "公開スタジオ",
  slug: "open-studio",
  isPublished: true,
  isActive: true,
} as const;

describe("unpublished space venue (F-119)", () => {
  test("unpublished space is name-only: no venue href and no JSON-LD venue.url", () => {
    const unpublishedVenues = buildEventVenues({
      format: "OFFLINE",
      space: UNPUBLISHED_SPACE,
      location: null,
      addressDetail: null,
    });
    expect(unpublishedVenues).toEqual([
      { kind: "space", name: "非公開スタジオ" },
    ]);
    expect(publicEventSpaceVenuePath(UNPUBLISHED_SPACE)).toBeUndefined();

    const inactiveVenues = buildEventVenues({
      format: "OFFLINE",
      space: INACTIVE_SPACE,
      location: null,
      addressDetail: null,
    });
    expect(inactiveVenues).toEqual([{ kind: "space", name: "停止スタジオ" }]);
    expect(publicEventSpaceVenuePath(INACTIVE_SPACE)).toBeUndefined();

    const publicVenues = buildEventVenues({
      format: "OFFLINE",
      space: PUBLIC_SPACE,
      location: null,
      addressDetail: null,
    });
    expect(publicVenues).toEqual([
      { kind: "space", slug: "open-studio", name: "公開スタジオ" },
    ]);
    expect(publicEventSpaceVenuePath(PUBLIC_SPACE)).toBe("/spaces/open-studio");

    const page = readFileSync(
      join(ROOT, "src", "app", "(public)", "events", "[slug]", "page.tsx"),
      "utf8",
    );
    expect(page).toContain("publicEventSpaceVenuePath");
    expect(page).not.toMatch(/event\.space\?\.slug/u);

    const panel = readFileSync(
      join(
        ROOT,
        "src",
        "app",
        "(public)",
        "events",
        "[slug]",
        "_components",
        "event-info-panel.tsx",
      ),
      "utf8",
    );
    expect(panel).toMatch(/venue\.slug/u);
    expect(panel).toMatch(/<span>\{venue\.name\}<\/span>/u);

    const queries = readFileSync(
      join(ROOT, "src", "shared", "domain", "events", "public-queries.ts"),
      "utf8",
    );
    expect(queries).toMatch(
      /space:\s*\{\s*select:\s*\{[^}]*isPublished:\s*true[^}]*isActive:\s*true/u,
    );
  });
});
