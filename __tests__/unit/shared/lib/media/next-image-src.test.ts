import { describe, expect, test } from "bun:test";
import {
  collectDisallowedManagedImageSrcs,
  isAllowedManagedImageSrc,
} from "@/shared/lib/media/next-image-src";

describe("isAllowedManagedImageSrc", () => {
  const config = { publicMediaUrl: "https://media.example.com" };

  test("ローカル public パスを許可する", () => {
    expect(isAllowedManagedImageSrc("/images/seed/event.svg", config)).toBe(
      true,
    );
  });

  test("設定済み R2 public URL の同一 origin を許可する", () => {
    expect(
      isAllowedManagedImageSrc(
        "https://media.example.com/events/poster.webp",
        config,
      ),
    ).toBe(true);
  });

  test("管理メディア origin 外の任意外部 URL を拒否する", () => {
    expect(
      isAllowedManagedImageSrc("https://example.com/poster.jpg", config),
    ).toBe(false);
  });

  test("管理メディア origin 外の旧デフォルト外部画像を拒否する", () => {
    expect(
      isAllowedManagedImageSrc(
        "https://images.unsplash.com/photo-1497366216548-37526070297c",
        config,
      ),
    ).toBe(false);
  });

  test("protocol-relative URL を拒否する", () => {
    expect(
      isAllowedManagedImageSrc("//media.example.com/poster.jpg", config),
    ).toBe(false);
  });
});

describe("collectDisallowedManagedImageSrcs", () => {
  const config = { publicMediaUrl: "https://media.example.com" };

  test("Lexical の画像系ノードから管理外 origin を検出する", () => {
    expect(
      collectDisallowedManagedImageSrcs(
        {
          root: {
            children: [
              {
                type: "image",
                src: "https://external.example.com/inline.jpg",
              },
              {
                type: "cover",
                backgroundImageUrl: "https://cdn.example.com/cover.jpg",
              },
              {
                type: "link",
                url: "https://external.example.com/page",
              },
            ],
          },
        },
        config,
      ),
    ).toEqual([
      "https://external.example.com/inline.jpg",
      "https://cdn.example.com/cover.jpg",
    ]);
  });

  test("セクションのメディア URL だけを検査し、ボタンリンクは検査しない", () => {
    expect(
      collectDisallowedManagedImageSrcs(
        {
          images: [
            {
              url: "https://external.example.com/hero.jpg",
              alt: "外部画像",
            },
          ],
          media: [
            {
              url: "https://media.example.com/hero.mp4",
              alt: "",
              caption: "",
            },
          ],
          buttons: [
            {
              label: "外部サイト",
              url: "https://external.example.com/page",
              openInNewTab: true,
            },
          ],
        },
        config,
      ),
    ).toEqual(["https://external.example.com/hero.jpg"]);
  });
});
