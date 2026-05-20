import { describe, expect, test } from "bun:test";
import {
  getNewsPreviewHref,
  getPagePreviewHref,
  getPostPreviewHref,
} from "@/shared/lib/preview-routes";

describe("preview routing", () => {
  test("投稿 preview は dedicated id-based route を返す", () => {
    expect(getPostPreviewHref("abc-123")).toBe("/preview/posts/abc-123");
  });

  test("ニュース preview は dedicated id-based route を返す", () => {
    expect(getNewsPreviewHref("xyz-789")).toBe("/preview/news/xyz-789");
  });

  test("固定ページ preview は page 専用 route を返す", () => {
    expect(getPagePreviewHref("about")).toBe("/preview/pages/about");
    expect(getPagePreviewHref("home")).toBe("/preview/pages/home");
  });
});
