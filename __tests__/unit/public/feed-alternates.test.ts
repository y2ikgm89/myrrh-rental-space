/**
 * `getFeedAlternates()` unit テスト。
 *
 * 公開 root layout の `<link rel="alternate" type="application/rss+xml">`
 * emit を `posts` feature module の ON/OFF に応じて切り替える契約を固定する。
 * posts OFF のとき `/feed.xml` route が `notFound()` を返すため、alternate を
 * 無条件 emit するとフィードリーダー auto-discovery が 404 リンクを踏む
 * (SEO-FEED-01)。
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { FeatureModule } from "@/shared/lib/features/registry";

let enabledFixture: ReadonlySet<FeatureModule> = new Set();

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (module: FeatureModule) =>
    Promise.resolve(enabledFixture.has(module)),
}));

const { getFeedAlternates } = await import("@/public/lib/seo/feed-alternates");

describe("getFeedAlternates()", () => {
  beforeEach(() => {
    enabledFixture = new Set();
  });

  test("posts feature OFF → null (layout は spread で alternates キーごと omit)", async () => {
    enabledFixture = new Set<FeatureModule>(["spaces", "reservation"]);
    const result = await getFeedAlternates();
    expect(result).toBeNull();
  });

  test("posts feature ON → application/rss+xml alternate を /feed.xml で emit", async () => {
    enabledFixture = new Set<FeatureModule>(["posts"]);
    const result = await getFeedAlternates();
    expect(result).not.toBeNull();
    expect(result?.types["application/rss+xml"]).toBe("/feed.xml");
  });

  test("他 module のみ ON でも posts OFF なら emit しない", async () => {
    enabledFixture = new Set<FeatureModule>([
      "spaces",
      "events",
      "news",
      "faq",
      "access",
      "contact",
      "reviews",
    ]);
    const result = await getFeedAlternates();
    expect(result).toBeNull();
  });
});
