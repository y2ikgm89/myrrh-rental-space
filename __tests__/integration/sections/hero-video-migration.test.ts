/**
 * Hero `videoUrl` → `video` migration semantics test
 *
 * `prisma/migrations/20260523163310_section_hero_video_url_to_video/migration.sql` の
 * PL/pgSQL JSONB rename ロジックを PostgreSQL に依存せず純粋 JS で再現し、
 * data-preserving 動作を契約として検証する。
 *
 * SQL 仕様:
 *   UPDATE sections
 *   SET config = (config - 'videoUrl') || jsonb_build_object(
 *     'video',
 *     COALESCE(config -> 'videoUrl', '""'::jsonb)
 *   )
 *   WHERE type = 'hero'
 *     AND config ? 'videoUrl'
 *     AND NOT (config ? 'video');
 */

import { describe, expect, test } from "bun:test";

interface SectionRow {
  readonly type: string;
  readonly config: Record<string, unknown>;
}

/**
 * PL/pgSQL の `(config - 'videoUrl') || jsonb_build_object('video', COALESCE(config->'videoUrl', '""'::jsonb))` を
 * 純粋 JS で再現する。WHERE 句の idempotent guard も含む。
 */
function applyMigration(row: SectionRow): SectionRow {
  // WHERE clause: type='hero' AND config?'videoUrl' AND NOT config?'video'
  if (row.type !== "hero") return row;
  if (!("videoUrl" in row.config)) return row;
  if ("video" in row.config) return row;

  const { videoUrl, ...rest } = row.config;
  return {
    ...row,
    config: {
      ...rest,
      video: videoUrl ?? "",
    },
  };
}

describe("hero videoUrl → video migration", () => {
  test("既存の videoUrl 文字列を video に data-preserving 変換", () => {
    const before: SectionRow = {
      type: "hero",
      config: {
        title: "Welcome",
        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        variant: "video",
      },
    };
    const after = applyMigration(before);
    expect(after.config["video"]).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect("videoUrl" in after.config).toBe(false);
    expect(after.config["title"]).toBe("Welcome");
    expect(after.config["variant"]).toBe("video");
  });

  test("R2 / direct mp4 URL も string のまま preserve される", () => {
    const before: SectionRow = {
      type: "hero",
      config: { videoUrl: "https://media.example.com/hero.mp4" },
    };
    const after = applyMigration(before);
    expect(after.config["video"]).toBe("https://media.example.com/hero.mp4");
  });

  test("Vimeo URL も string のまま preserve される", () => {
    const before: SectionRow = {
      type: "hero",
      config: { videoUrl: "https://vimeo.com/123456789" },
    };
    const after = applyMigration(before);
    expect(after.config["video"]).toBe("https://vimeo.com/123456789");
  });

  test("空文字 videoUrl は空文字 video として preserve", () => {
    const before: SectionRow = {
      type: "hero",
      config: { videoUrl: "" },
    };
    const after = applyMigration(before);
    expect(after.config["video"]).toBe("");
    expect("videoUrl" in after.config).toBe(false);
  });

  test("hero 以外の section type は影響を受けない", () => {
    const before: SectionRow = {
      type: "cta",
      config: { videoUrl: "https://example.com/x.mp4" },
    };
    const after = applyMigration(before);
    expect(after).toEqual(before);
    expect("videoUrl" in after.config).toBe(true);
    expect("video" in after.config).toBe(false);
  });

  test("既に video キーを持つ row は idempotent skip", () => {
    const before: SectionRow = {
      type: "hero",
      config: {
        video: "https://existing.example.com/already.mp4",
        videoUrl: "https://stale.example.com/old.mp4",
      },
    };
    const after = applyMigration(before);
    expect(after).toEqual(before);
  });

  test("videoUrl を持たない hero row は no-op", () => {
    const before: SectionRow = {
      type: "hero",
      config: { title: "No video here", variant: "default" },
    };
    const after = applyMigration(before);
    expect(after).toEqual(before);
    expect("video" in after.config).toBe(false);
  });

  test("他の config フィールド (backgroundImage / buttons 等) は影響を受けない", () => {
    const before: SectionRow = {
      type: "hero",
      config: {
        title: "Hero",
        backgroundImage: { url: "/bg.jpg", alt: "" },
        buttons: [{ url: "/contact", label: [] }],
        videoUrl: "https://youtu.be/abc123",
      },
    };
    const after = applyMigration(before);
    expect(after.config["title"]).toBe("Hero");
    expect(after.config["backgroundImage"]).toEqual({
      url: "/bg.jpg",
      alt: "",
    });
    expect(after.config["buttons"]).toEqual([{ url: "/contact", label: [] }]);
    expect(after.config["video"]).toBe("https://youtu.be/abc123");
    expect("videoUrl" in after.config).toBe(false);
  });
});
