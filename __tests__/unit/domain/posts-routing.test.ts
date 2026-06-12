import { describe, expect, test } from "bun:test";
import { PostPermalinkStructure } from "@generated/prisma/enums";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

describe("posts routing", () => {
  test("canonical path は /blog プレフィックスで生成する", () => {
    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
        },
        {
          postPermalinkStructure: PostPermalinkStructure.post_name,
        },
      ),
    ).toBe("/blog/spring-campaign");

    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
          category: { slug: "events" },
        },
        {
          postPermalinkStructure: PostPermalinkStructure.category_name,
        },
      ),
    ).toBe("/blog/events/spring-campaign");

    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
          publishedAt: "2026-03-07T00:00:00.000Z",
        },
        {
          postPermalinkStructure: PostPermalinkStructure.date_name,
        },
      ),
    ).toBe("/blog/2026/03/spring-campaign");
  });
});
