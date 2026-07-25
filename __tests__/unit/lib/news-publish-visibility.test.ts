import { describe, expect, test } from "bun:test";
import { getNewsPublishVisibility } from "@/shared/lib/news-publish-visibility";

describe("getNewsPublishVisibility", () => {
  const now = new Date("2026-07-26T03:00:00.000Z");

  test("isPublished=false → draft", () => {
    expect(
      getNewsPublishVisibility(false, "2026-07-26T01:00:00.000Z", now),
    ).toBe("draft");
    expect(getNewsPublishVisibility(false, null, now)).toBe("draft");
  });

  test("isPublished=true + future publishedAt → scheduled", () => {
    expect(
      getNewsPublishVisibility(true, "2026-07-26T04:00:00.000Z", now),
    ).toBe("scheduled");
    expect(
      getNewsPublishVisibility(true, new Date("2026-07-27T00:00:00.000Z"), now),
    ).toBe("scheduled");
  });

  test("isPublished=true + past/equal publishedAt → published", () => {
    expect(
      getNewsPublishVisibility(true, "2026-07-26T03:00:00.000Z", now),
    ).toBe("published");
    expect(
      getNewsPublishVisibility(true, "2026-07-26T01:00:00.000Z", now),
    ).toBe("published");
  });

  test("isPublished=true + null publishedAt → published（スイッチ ON と整合）", () => {
    expect(getNewsPublishVisibility(true, null, now)).toBe("published");
  });
});
