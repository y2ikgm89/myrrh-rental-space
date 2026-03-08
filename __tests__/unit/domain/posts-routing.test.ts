import { describe, expect, test } from "bun:test";
import { PostPermalinkStructure } from "@/shared/db/enums";
import {
  buildPostCanonicalPath,
  resolvePostDetailRoute,
} from "@/shared/domain/posts/routing";

describe("posts routing", () => {
  test("post_name 形式の URL を解決する", () => {
    expect(resolvePostDetailRoute(["spring-campaign"])).toEqual({
      slug: "spring-campaign",
      structure: PostPermalinkStructure.post_name,
      segments: ["spring-campaign"],
      pathname: "/spring-campaign",
    });
  });

  test("category_name 形式の URL を解決する", () => {
    expect(resolvePostDetailRoute(["events", "spring-campaign"])).toEqual({
      slug: "spring-campaign",
      structure: PostPermalinkStructure.category_name,
      segments: ["events", "spring-campaign"],
      pathname: "/events/spring-campaign",
    });
  });

  test("date_name 形式の URL を解決する", () => {
    expect(resolvePostDetailRoute(["2026", "03", "spring-campaign"])).toEqual({
      slug: "spring-campaign",
      structure: PostPermalinkStructure.date_name,
      segments: ["2026", "03", "spring-campaign"],
      pathname: "/2026/03/spring-campaign",
    });
  });

  test("予約済みセグメントは投稿 URL として解決しない", () => {
    expect(resolvePostDetailRoute(["posts"])).toBeNull();
    expect(resolvePostDetailRoute(["preview", "draft-post"])).toBeNull();
    expect(resolvePostDetailRoute(["category", "draft-post"])).toBeNull();
  });

  test("不正な日付形式は解決しない", () => {
    expect(resolvePostDetailRoute(["2026", "13", "spring-campaign"])).toBeNull();
    expect(resolvePostDetailRoute(["1999", "12", "spring-campaign"])).toBeNull();
    expect(resolvePostDetailRoute(["2026", "march", "spring-campaign"])).toBeNull();
    expect(resolvePostDetailRoute(["too", "many", "segments", "here"])).toBeNull();
  });

  test("canonical path は permalink 設定に従って生成する", () => {
    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
        },
        {
          postUrlPrefixEnabled: true,
          postPermalinkStructure: PostPermalinkStructure.post_name,
        },
      ),
    ).toBe("/posts/spring-campaign");

    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
          category: { slug: "events" },
        },
        {
          postUrlPrefixEnabled: false,
          postPermalinkStructure: PostPermalinkStructure.category_name,
        },
      ),
    ).toBe("/events/spring-campaign");

    expect(
      buildPostCanonicalPath(
        {
          slug: "spring-campaign",
          publishedAt: "2026-03-07T00:00:00.000Z",
        },
        {
          postUrlPrefixEnabled: true,
          postPermalinkStructure: PostPermalinkStructure.date_name,
        },
      ),
    ).toBe("/posts/2026/03/spring-campaign");
  });
});
