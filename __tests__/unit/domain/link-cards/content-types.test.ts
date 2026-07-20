import { describe, expect, test } from "bun:test";
import {
  LINK_CARD_CONTENT_TYPES,
  filterEnabledLinkCardContentTypes,
} from "@/shared/domain/link-cards/content-types";
import type { FeatureModule } from "@/shared/lib/features/registry";

describe("filterEnabledLinkCardContentTypes", () => {
  test("全 Feature Module が有効なら全 content-type を返す（順序は LINK_CARD_CONTENT_TYPES 準拠）", () => {
    const enabled = new Set<FeatureModule>([
      "posts",
      "news",
      "spaces",
      "events",
    ]);

    expect(filterEnabledLinkCardContentTypes(enabled)).toEqual([
      ...LINK_CARD_CONTENT_TYPES,
    ]);
  });

  test("spaces / events が OFF なら space / event を除外する（M6 audit 対象ケース）", () => {
    const enabled = new Set<FeatureModule>(["posts", "news"]);

    expect(filterEnabledLinkCardContentTypes(enabled)).toEqual([
      "post",
      "news",
    ]);
  });

  test("全 Feature Module が無効なら空配列を返す", () => {
    expect(filterEnabledLinkCardContentTypes(new Set())).toEqual([]);
  });

  test("readonly array 入力（ReadonlySet 以外）も受け付ける", () => {
    const enabled: readonly FeatureModule[] = ["spaces"];

    expect(filterEnabledLinkCardContentTypes(enabled)).toEqual(["space"]);
  });

  test("link-card と無関係な Feature Module（faq 等）が含まれても影響しない", () => {
    const enabled = new Set<FeatureModule>(["posts", "faq", "contact"]);

    expect(filterEnabledLinkCardContentTypes(enabled)).toEqual(["post"]);
  });
});
