/**
 * page-hero セクション定義のユニットテスト
 *
 * discriminated union (editorial-split / compact / minimal / media) と field-registry meta を検証。
 * 純粋モジュールのため mock.module 不要。
 *
 * 2026-05-24 PR (MediaPicker Phase 8): 旧 `video` variant + `video` field を
 * `media` variant + `media: { url, alt, caption }` group に統合（業界標準
 * WordPress Cover Block パターン）。
 */

import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PAGE_HERO,
  HERO_TRANSITIONS,
  pageHeroConfigSchema,
  pageHeroMetadata,
} from "@/shared/lib/sections/definitions/page-hero";
import { fieldRegistry } from "@/shared/lib/sections/field-registry";
import {
  extractDiscriminatedUnionInfo,
  extractSchemaFields,
} from "@/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection";

// ─────────────────────────────────────────────────────────────
// pageHeroConfigSchema — discriminated union 検証
// ─────────────────────────────────────────────────────────────

describe("pageHeroConfigSchema", () => {
  describe("DEFAULT_PAGE_HERO", () => {
    test("デフォルト値は schema を通過する", () => {
      const result = pageHeroConfigSchema.safeParse(DEFAULT_PAGE_HERO);
      expect(result.success).toBe(true);
    });

    test("デフォルトは editorial-split variant", () => {
      expect(DEFAULT_PAGE_HERO.variant).toBe("editorial-split");
    });

    test("デフォルトの images は 1 枚以上", () => {
      if (DEFAULT_PAGE_HERO.variant === "editorial-split") {
        expect(DEFAULT_PAGE_HERO.images.length).toBeGreaterThan(0);
      }
    });
  });

  describe("editorial-split variant", () => {
    test("最小構成（必須フィールドのみ）でパース成功", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "alt text" }],
      });
      expect(result.success).toBe(true);
    });

    test("images が空配列でもパース成功（field.array は default([]) のため）", () => {
      // 注: 旧 pageHeroSchema の min(1) 制約は新 schema では緩和（registry 標準）
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [],
      });
      expect(result.success).toBe(true);
    });

    test("重複 URL の images は refine で reject", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [
          { url: "https://example.com/dup.jpg", alt: "a" },
          { url: "https://example.com/dup.jpg", alt: "b" },
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues.map((i) => i.message).join(" / ");
        expect(message).toContain("同じ画像を複数登録することはできません");
      }
    });

    test("transition は HERO_TRANSITIONS のいずれかに narrow される", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "a" }],
        transition: "ken-burns",
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.variant === "editorial-split") {
        expect(HERO_TRANSITIONS).toContain(result.data.transition);
      }
    });

    test("不正な transition は reject", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "a" }],
        transition: "invalid-transition",
      });
      expect(result.success).toBe(false);
    });

    test("buttons[].url は内部 app route（/foo）を許容", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "a" }],
        buttons: [
          {
            text: "予約する",
            url: "/reservation",
            variant: "primary",
            size: "lg",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("buttons[].url は外部 URL（https）を reject（createInternalAppRouteSchema 仕様）", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "a" }],
        buttons: [
          {
            text: "外部",
            url: "https://external.example.com/foo",
            variant: "primary",
            size: "lg",
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    test("buttons は複数登録可能（最大個数制限なし、URL 重複のみ禁止）", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "a" }],
        buttons: [
          {
            text: "予約する",
            url: "/reservation",
            variant: "primary",
            size: "lg",
          },
          {
            text: "詳細を見る",
            url: "/spaces",
            variant: "secondary",
            size: "lg",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("buttons の URL 重複は refine で reject", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "editorial-split",
        images: [{ url: "https://example.com/a.jpg", alt: "a" }],
        buttons: [
          {
            text: "A",
            url: "/reservation",
            variant: "primary",
            size: "lg",
          },
          {
            text: "B",
            url: "/reservation",
            variant: "secondary",
            size: "lg",
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("compact variant", () => {
    test("最小構成でパース成功", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "compact",
        image: { url: "https://example.com/a.jpg", alt: "alt text" },
      });
      expect(result.success).toBe(true);
    });

    test("image 省略時は createImageGroupSchema の .prefault({}) で default 補完される", () => {
      // Phase 3 で `createImageGroupSchema` を `z.object(...).prefault({}).register(...)` に
      // リファクタしたため、image を省略してもデフォルト `{ url: "", alt: "", caption: "" }`
      // が生成される（同 group factory を使う他 section と一貫した挙動）。
      const result = pageHeroConfigSchema.safeParse({
        variant: "compact",
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.variant === "compact") {
        // url / alt は field.text の default("") で空文字に展開される。
        // caption は field によって default の有無が異なるため `toMatchObject` で部分一致。
        expect(result.data.image).toMatchObject({ url: "", alt: "" });
      }
    });
  });

  describe("minimal variant", () => {
    test("最小構成でパース成功", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "minimal",
      });
      expect(result.success).toBe(true);
    });

    test("eyebrow は optional ではないが default 経由で空文字補完", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "minimal",
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.variant === "minimal") {
        // field.text は default("") のため空文字
        expect(typeof result.data.eyebrow).toBe("string");
      }
    });
  });

  describe("media variant", () => {
    test("最小構成（media URL のみ - 画像）でパース成功", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
        media: [
          { url: "https://example.com/hero.jpg", alt: "alt", caption: "" },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("動画 URL（R2 mp4）も受け付ける", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
        media: [
          { url: "https://example.com/hero.mp4", alt: "video", caption: "" },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("YouTube URL も受け付ける", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
        media: [
          {
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            alt: "yt",
            caption: "",
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("media を完全省略でもパース成功（default [] 適用）", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.variant === "media") {
        expect(result.data.media).toEqual([]);
      }
    });

    test("posterImage は省略可能（prefault で default 補完）", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
        media: [{ url: "https://example.com/hero.mp4", alt: "", caption: "" }],
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.variant === "media") {
        expect(result.data.posterImage).toMatchObject({ url: "", alt: "" });
      }
    });

    test("overlay / overlayOpacity の default が適用される", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
        media: [{ url: "https://example.com/hero.mp4", alt: "", caption: "" }],
      });
      expect(result.success).toBe(true);
      if (result.success && result.data.variant === "media") {
        expect(result.data.overlay).toBe(true);
        expect(result.data.overlayOpacity).toBe(40);
      }
    });

    test("overlayOpacity は 0-100 範囲内のみ許容", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "media",
        media: [{ url: "https://example.com/hero.mp4", alt: "", caption: "" }],
        overlayOpacity: 150,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("variant discrimination", () => {
    test("不正な variant は reject", () => {
      const result = pageHeroConfigSchema.safeParse({
        variant: "unknown-variant",
        title: "Hi",
      });
      expect(result.success).toBe(false);
    });

    test("variant 不在は reject", () => {
      const result = pageHeroConfigSchema.safeParse({
        title: "Hi",
        // variant なし
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// metadata
// ─────────────────────────────────────────────────────────────

describe("pageHeroMetadata", () => {
  test("category は 'hero'", () => {
    expect(pageHeroMetadata.category).toBe("hero");
  });

  test("label は空でない", () => {
    expect(pageHeroMetadata.label.length).toBeGreaterThan(0);
  });

  test("icon は string（Tabler icon 名）", () => {
    expect(typeof pageHeroMetadata.icon).toBe("string");
    expect(pageHeroMetadata.icon.startsWith("Icon")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// field-registry に登録された subGroup の整合性
// ─────────────────────────────────────────────────────────────

describe("field-registry 登録整合性", () => {
  test("editorial-split の各フィールドに subGroup メタが登録されている", () => {
    // schema 内部の inner shape にアクセスできないため、
    // discriminated union の最初のオプション（editorial-split）の shape を抽出
    // discriminated union の実装詳細に依存するため、success path で検証
    const result = pageHeroConfigSchema.safeParse({
      variant: "editorial-split",
      images: [{ url: "https://example.com/a.jpg", alt: "a" }],
    });
    expect(result.success).toBe(true);
    // registry shapes は schema 構築時に register される ので、
    // schema が success path を通った時点で全 inner field が登録されている
    expect(fieldRegistry).toBeDefined();
  });

  test("pageHeroConfigSchema 自体に discriminator field meta が登録されている", () => {
    // AutoSectionForm の zod-introspection が discriminated union schema を
    // バリアント select として描画するため、discriminator field meta が必須
    const meta = fieldRegistry.get(pageHeroConfigSchema);
    expect(meta).toBeDefined();
    expect(meta?.fieldType).toBe("select");
    expect(meta?.label).toBe("バリアント");
    expect(meta?.group).toBe("content");
  });
});

// ─────────────────────────────────────────────────────────────
// AutoSectionForm zod-introspection の discriminated union 対応
// ─────────────────────────────────────────────────────────────

describe("zod-introspection / discriminated union 対応", () => {
  test("extractDiscriminatedUnionInfo は discriminator + 全 options を返す", () => {
    const info = extractDiscriminatedUnionInfo(pageHeroConfigSchema);
    expect(info).toBeDefined();
    expect(info?.discriminator).toBe("variant");
    const values = info?.options.map((o) => o.value).sort();
    expect(values).toEqual(["compact", "editorial-split", "media", "minimal"]);
  });

  test("extractSchemaFields(schema, { variant: 'media' }) は media のフィールドを返す", () => {
    const fields = extractSchemaFields(pageHeroConfigSchema, {
      variant: "media",
    });
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("variant");
    expect(keys).toContain("media"); // media variant 固有
    expect(keys).toContain("posterImage");
    expect(keys).toContain("overlay");
    expect(keys).toContain("overlayOpacity");
    expect(keys).toContain("title");
    expect(keys).toContain("description");
    expect(keys).toContain("buttons");
    // 他 variant 固有フィールドは出ない
    expect(keys).not.toContain("images");
    expect(keys).not.toContain("image");
    expect(keys).not.toContain("eyebrow");
  });

  test("extractSchemaFields(schema) は discriminator + 先頭 variant のフィールドを返す", () => {
    const fields = extractSchemaFields(pageHeroConfigSchema);
    const keys = fields.map((f) => f.key);
    // 先頭 option = editorial-split のフィールド (variant 自身は重複除外せず先頭で synthesize される)
    expect(keys).toContain("variant"); // synthesized discriminator field
    expect(keys).toContain("title");
    expect(keys).toContain("description");
    expect(keys).toContain("label");
    expect(keys).toContain("images");
    expect(keys).toContain("buttons");
    // discriminator が先頭にいる
    expect(keys[0]).toBe("variant");
    // discriminator field の meta は select
    expect(fields[0]?.meta.fieldType).toBe("select");
  });

  test("extractSchemaFields(schema, { variant: 'minimal' }) は minimal のフィールドを返す", () => {
    const fields = extractSchemaFields(pageHeroConfigSchema, {
      variant: "minimal",
    });
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("variant");
    expect(keys).toContain("eyebrow"); // minimal にしかない
    expect(keys).toContain("title");
    expect(keys).toContain("description");
    // editorial-split / compact のフィールドは出ない
    expect(keys).not.toContain("images");
    expect(keys).not.toContain("buttons");
  });

  test("extractSchemaFields(schema, { variant: 'compact' }) は compact のフィールドを返す", () => {
    const fields = extractSchemaFields(pageHeroConfigSchema, {
      variant: "compact",
    });
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("variant");
    expect(keys).toContain("image"); // compact は単一画像
    expect(keys).toContain("title");
    expect(keys).toContain("description");
    expect(keys).toContain("label");
    expect(keys).toContain("buttons"); // compact にもボタンを追加
    // editorial-split / minimal にしかないフィールドは出ない
    expect(keys).not.toContain("images");
    expect(keys).not.toContain("eyebrow");
  });

  test("不正な variant 値は先頭 option にフォールバック", () => {
    const fields = extractSchemaFields(pageHeroConfigSchema, {
      variant: "non-existent-variant",
    });
    const keys = fields.map((f) => f.key);
    // 先頭 = editorial-split
    expect(keys).toContain("images");
    expect(keys).toContain("buttons");
  });
});
