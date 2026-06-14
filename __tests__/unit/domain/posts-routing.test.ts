import { describe, expect, test } from "bun:test";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

describe("posts routing", () => {
  test("canonical path は単一セグメントルート /blog/{slug} を返す", () => {
    // 記事詳細ルートは /blog/[slug] のみで、多セグメント permalink を受ける
    // catch-all は存在しない。slug 以外のフィールド（カテゴリ・公開日）を渡しても
    // ルータブルな /blog/{slug} に正規化される（誤って多セグメント URL を返すと全記事 404）。
    expect(buildPostCanonicalPath({ slug: "spring-campaign" })).toBe(
      "/blog/spring-campaign",
    );

    expect(
      buildPostCanonicalPath({
        slug: "spring-campaign",
        category: { slug: "events" },
      }),
    ).toBe("/blog/spring-campaign");

    expect(
      buildPostCanonicalPath({
        slug: "spring-campaign",
        publishedAt: "2026-03-07T00:00:00.000Z",
      }),
    ).toBe("/blog/spring-campaign");
  });
});
