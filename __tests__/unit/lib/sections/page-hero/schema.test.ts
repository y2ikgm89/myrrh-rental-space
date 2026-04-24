import { describe, expect, test } from "bun:test";
import {
  pageHeroSchema,
  parsePageHero,
} from "@/shared/lib/sections/page-hero/schema";
import { defaultPageHeroHome } from "@/shared/lib/sections/page-hero/defaults";

describe("page-hero schema", () => {
  test("defaultPageHeroHome は editorial-split としてパースできる", () => {
    const parsed = pageHeroSchema.safeParse(defaultPageHeroHome);
    expect(parsed.success).toBe(true);
  });

  test("parsePageHero は null / 不正を null で返す", () => {
    expect(parsePageHero(null)).toBeNull();
    expect(parsePageHero({ variant: "no-such-variant" })).toBeNull();
    expect(parsePageHero({ variant: "compact" })).toBeNull();
  });

  test("minimal variant をパースできる", () => {
    const data = {
      variant: "minimal" as const,
      title: "Hello",
      description: "World",
    };
    expect(parsePageHero(data)?.variant).toBe("minimal");
  });

  test("editorial-split の buttonUrl は内部 application route のみ許可する", () => {
    const data = {
      ...defaultPageHeroHome,
      buttonUrl: "https://example.com/reservation",
    };
    const parsed = pageHeroSchema.safeParse(data);
    expect(parsed.success).toBe(false);
  });
});
