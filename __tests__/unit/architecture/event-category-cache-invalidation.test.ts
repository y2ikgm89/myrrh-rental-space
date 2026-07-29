import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("event-category cache invalidation", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "src/app/(admin)/admin/(dashboard)/_shared/actions/event-category.ts",
    ),
    { encoding: "utf8" },
  );

  test("create/delete は EVENT_CATEGORIES のみ invalidate する", () => {
    expect(source).toContain("invalidateEventCategoryListCache");
    expect(source).toMatch(
      /createEventCategory[\s\S]*?invalidateEventCategoryListCache\(\)/,
    );
    expect(source).toMatch(
      /deleteEventCategory[\s\S]*?invalidateEventCategoryListCache\(\)/,
    );
  });

  test("update/order/active は EVENT_CATEGORIES + EVENTS を co-invalidate する", () => {
    expect(source).toContain("invalidateEventCategoryAndEventsCache");
    expect(source).toContain("CACHE_TAGS.EVENTS");
    expect(source).toMatch(
      /updateEventCategory[\s\S]*?invalidateEventCategoryAndEventsCache\(\)/,
    );
    expect(source).toMatch(
      /updateEventCategoryOrder[\s\S]*?invalidateEventCategoryAndEventsCache\(\)/,
    );
    expect(source).toMatch(
      /updateEventCategoryActive[\s\S]*?invalidateEventCategoryAndEventsCache\(\)/,
    );
  });
});
