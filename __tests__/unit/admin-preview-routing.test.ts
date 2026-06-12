import { describe, expect, test } from "bun:test";
import {
  getNewsPreviewHref,
  getPagePreviewHref,
  getPostPreviewHref,
  getTermsPreviewHref,
  normalizePreviewPathname,
} from "@/shared/lib/preview-routes";

describe("preview routing", () => {
  test("投稿 preview は dedicated id-based route を返す", () => {
    expect(getPostPreviewHref("abc-123")).toBe("/preview/posts/abc-123");
  });

  test("ニュース preview は dedicated id-based route を返す", () => {
    expect(getNewsPreviewHref("xyz-789")).toBe("/preview/news/xyz-789");
  });

  test("規約 preview は dedicated id-based route を返す", () => {
    expect(getTermsPreviewHref("trm-456")).toBe("/preview/terms/trm-456");
  });

  test("固定ページ preview は page 専用 route を返す", () => {
    expect(getPagePreviewHref("about")).toBe("/preview/pages/about");
    expect(getPagePreviewHref("home")).toBe("/preview/pages/home");
  });

  test("preview pathname は本番 public URL に正規化される", () => {
    expect(normalizePreviewPathname("/preview/posts/abc-123")).toBe("/blog");
    expect(normalizePreviewPathname("/preview/news/xyz-789")).toBe("/news");
    expect(normalizePreviewPathname("/preview/terms/trm-456")).toBe("/terms");
    expect(normalizePreviewPathname("/preview/pages/about")).toBe("/about");
    expect(normalizePreviewPathname("/preview/pages/home")).toBe("/");
    expect(normalizePreviewPathname("/spaces")).toBe("/spaces");
  });
});
