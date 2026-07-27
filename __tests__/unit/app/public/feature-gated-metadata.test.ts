import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  FEATURE_DISABLED_PAGE_METADATA,
  NOINDEX_ROBOTS,
  createMetadataErrorFallback,
  withFeatureGate,
} from "@/public/lib/seo/feature-gated-metadata";

mock.module("server-only", () => ({}));

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: (module: string) => mockIsFeatureEnabled(module),
}));

describe("createMetadataErrorFallback", () => {
  test("title/description を残しつつ noindex", () => {
    expect(createMetadataErrorFallback("ブログ", "説明")).toEqual({
      title: "ブログ",
      description: "説明",
      robots: NOINDEX_ROBOTS,
    });
  });

  test("description 省略時も noindex", () => {
    expect(createMetadataErrorFallback("規約一覧")).toEqual({
      title: "規約一覧",
      robots: NOINDEX_ROBOTS,
    });
  });
});

describe("withFeatureGate", () => {
  beforeEach(() => {
    mockIsFeatureEnabled.mockReset();
    mockIsFeatureEnabled.mockResolvedValue(true);
  });

  test("feature ON → builder の metadata を返す", async () => {
    const metadata = await withFeatureGate("posts", async () => ({
      title: "Blog",
    }));
    expect(metadata.title).toBe("Blog");
  });

  test("feature OFF → FEATURE_DISABLED_PAGE_METADATA", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);
    const metadata = await withFeatureGate("posts", async () => ({
      title: "Blog",
    }));
    expect(metadata).toEqual(FEATURE_DISABLED_PAGE_METADATA);
    expect(metadata.robots).toEqual(NOINDEX_ROBOTS);
  });
});
