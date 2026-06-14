import { describe, expect, test } from "bun:test";
import { PostPermalinkStructure } from "@generated/prisma/enums";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

describe("posts routing", () => {
  test("canonical path は構造設定に依らず /blog/{slug} を返す（単一セグメントルートのみ対応）", () => {
    // 記事詳細ルートは /blog/[slug] のみで、多セグメント permalink を受ける catch-all は
    // 存在しない。そのため post_name / category_name / date_name のいずれを設定しても
    // ルータブルな /blog/{slug} に正規化される（誤って多セグメント URL を返すと全記事 404）。
    expect(
      buildPostCanonicalPath(
        { slug: "spring-campaign" },
        { postPermalinkStructure: PostPermalinkStructure.post_name },
      ),
    ).toBe("/blog/spring-campaign");

    expect(
      buildPostCanonicalPath(
        { slug: "spring-campaign", category: { slug: "events" } },
        { postPermalinkStructure: PostPermalinkStructure.category_name },
      ),
    ).toBe("/blog/spring-campaign");

    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
          publishedAt: "2026-03-07T00:00:00.000Z",
        },
        { postPermalinkStructure: PostPermalinkStructure.date_name },
      ),
    ).toBe("/blog/spring-campaign");
  });
});
