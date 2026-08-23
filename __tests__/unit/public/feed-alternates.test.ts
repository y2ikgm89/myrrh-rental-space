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

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: (module: FeatureModule) =>
    Promise.resolve(enabledFixture.has(module)),
}));

const { getFeedAlternates, buildAlternates } =
  await import("@/public/lib/seo/feed-alternates");

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

/**
 * canonical と RSS の link を **1 つの `alternates`** にまとめる（監査 A-41）。
 *
 * Next.js の metadata マージはキー単位の置換なので、page 側が
 * `alternates: { canonical }` を返すと root layout の `types` は丸ごと消える。
 * 旧実装は全公開ページが canonical を返していたので、RSS の link は実質
 * どこにも出ていなかった。
 */
describe("buildAlternates", () => {
  beforeEach(() => {
    enabledFixture = new Set();
  });

  test("posts ON なら canonical と types を両方返す", async () => {
    enabledFixture = new Set<FeatureModule>(["posts"]);
    const result = await buildAlternates("https://example.com/blog");
    expect(result).toEqual({
      canonical: "https://example.com/blog",
      types: { "application/rss+xml": "/feed.xml" },
    });
  });

  test("posts OFF なら types キー自体を作らない", async () => {
    const result = await buildAlternates("https://example.com/");
    expect(result).toEqual({ canonical: "https://example.com/" });
    expect("types" in result).toBe(false);
  });
});
