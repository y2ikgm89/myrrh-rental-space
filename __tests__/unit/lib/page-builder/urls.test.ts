import { describe, expect, test } from "bun:test";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";
import {
  createPageBuilderLayoutBox,
  createPageBuilderResponsiveLayout,
} from "@/shared/lib/page-builder/layout";
import { parsePageBuilderDocument } from "@/shared/lib/page-builder/schema";
import { createPageBuilderResponsiveVisibility } from "@/shared/lib/page-builder/visibility";
import {
  normalizePageBuilderEmbedUrl,
  resolvePageBuilderEmbedConfig,
  resolvePageBuilderHref,
} from "@/shared/lib/page-builder/urls";

describe("page-builder urls", () => {
  test("button URL は内部パスと http(s) のみ許可する", () => {
    expect(resolvePageBuilderHref(" /contact ")).toBe("/contact");
    expect(resolvePageBuilderHref("https://example.com/contact")).toBe(
      "https://example.com/contact",
    );
    expect(resolvePageBuilderHref("javascript:alert(1)")).toBeNull();
  });

  test("embed URL を provider ごとの canonical URL に正規化する", () => {
    expect(
      normalizePageBuilderEmbedUrl(
        "youtube",
        "https://youtu.be/dQw4w9WgXcQ?t=42",
      ),
    ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");

    expect(
      normalizePageBuilderEmbedUrl(
        "instagram",
        "https://www.instagram.com/reel/Cx123AbCdEf/",
      ),
    ).toBe("https://www.instagram.com/p/Cx123AbCdEf/embed");

    expect(
      normalizePageBuilderEmbedUrl(
        "google-maps",
        "https://www.google.com/maps/embed?pb=!1m18!2m3",
      ),
    ).toContain("/maps/embed");

    expect(
      normalizePageBuilderEmbedUrl(
        "google-maps",
        "https://www.google.com/maps/place/Shibuya",
      ),
    ).toBeNull();
  });

  test("resolvePageBuilderEmbedConfig は provider ごとの iframe 設定を返す", () => {
    const youtubeConfig = resolvePageBuilderEmbedConfig(
      "youtube",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );

    expect(youtubeConfig).not.toBeNull();
    expect(youtubeConfig?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(youtubeConfig?.allowFullScreen).toBe(true);
    expect(youtubeConfig?.minHeight).toBe(360);
  });

  test("parsePageBuilderDocument は current document の embed URL も canonicalize する", () => {
    const document = createDefaultPageBuilderDocument("テスト");
    const frame = document.nodes["frame-main"];

    if (!frame || frame.type !== "frame") {
      throw new Error("frame-main is missing");
    }

    frame.children.push("embed-hero");
    document.nodes["embed-hero"] = {
      id: "embed-hero",
      type: "embed",
      parentId: frame.id,
      children: [],
      locked: false,
      visibility: createPageBuilderResponsiveVisibility(),
      name: "Hero Embed",
      layoutMode: "stack",
      style: {},
      layout: createPageBuilderResponsiveLayout(
        createPageBuilderLayoutBox({
          width: "fill",
          height: 320,
        }),
      ),
      content: {
        provider: "youtube",
        url: "https://youtu.be/dQw4w9WgXcQ",
      },
    };

    const parsed = parsePageBuilderDocument(document);
    const embed = parsed.nodes["embed-hero"];

    if (!embed || embed.type !== "embed") {
      throw new Error("embed-hero is missing");
    }

    expect(embed.content.url).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });
});
