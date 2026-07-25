import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_TWITTER_IMAGE_PATH,
  resolveOpenGraphImages,
  resolveTwitterImages,
} from "@/public/lib/seo/default-social-images";

describe("resolveOpenGraphImages", () => {
  test("custom image → url + alt", () => {
    expect(
      resolveOpenGraphImages("My Site", "https://cdn.example/og.png", "Custom"),
    ).toEqual([{ url: "https://cdn.example/og.png", alt: "Custom" }]);
  });

  test("no custom → Route Handler default with siteName alt", () => {
    expect(resolveOpenGraphImages("My Site")).toEqual([
      {
        url: DEFAULT_OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "My Site",
      },
    ]);
  });
});

describe("resolveTwitterImages", () => {
  test("custom image → url string", () => {
    expect(
      resolveTwitterImages("My Site", "https://cdn.example/og.png"),
    ).toEqual(["https://cdn.example/og.png"]);
  });

  test("no custom → Route Handler default with alt", () => {
    expect(resolveTwitterImages("My Site")).toEqual([
      { url: DEFAULT_TWITTER_IMAGE_PATH, alt: "My Site" },
    ]);
  });
});
