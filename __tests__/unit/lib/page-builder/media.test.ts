import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  collectPageBuilderImageMediaIds,
  createPageBuilderResolvedMediaMap,
} from "@/shared/lib/page-builder/media";
import {
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
} from "@/shared/lib/page-builder/layout";
import { parsePageBuilderDocument } from "@/shared/lib/page-builder/schema";
import { createPageBuilderResponsiveVisibility } from "@/shared/lib/page-builder/visibility";

describe("page-builder media", () => {
  test("collectPageBuilderImageMediaIds は image node の mediaId を重複なく返す", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];

    if (!frame || frame.type !== "frame") {
      throw new Error("frame-main is missing");
    }

    frame.children.push("image-a", "image-b");
    document.nodes["image-a"] = {
      id: "image-a",
      type: "image",
      parentId: frame.id,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Image A",
      layoutMode: "stack",
      style: {},
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: 240,
        }),
      ),
      content: {
        mediaId: "media-1",
        alt: "",
        objectFit: "cover",
      },
    };
    document.nodes["image-b"] = {
      ...document.nodes["image-a"],
      id: "image-b",
      name: "Image B",
      content: {
        mediaId: "media-1",
        alt: "same asset",
        objectFit: "cover",
      },
    };

    expect(collectPageBuilderImageMediaIds(document)).toEqual(["media-1"]);
  });

  test("parsePageBuilderDocument は schemaVersion 3 の image src モデルを拒否する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const legacyDocument = {
      ...document,
      schemaVersion: 3,
    };

    expect(() => parsePageBuilderDocument(legacyDocument)).toThrow(
      "ページビルダードキュメントが不正です",
    );
  });

  test("createPageBuilderResolvedMediaMap は id で引ける map を返す", () => {
    const media = createPageBuilderResolvedMediaMap([
      {
        id: "media-1",
        url: "https://cdn.example.com/hero.jpg",
        alt: "hero",
        filename: "hero.jpg",
        width: 1600,
        height: 900,
      },
    ]);

    expect(media["media-1"]?.filename).toBe("hero.jpg");
  });
});
