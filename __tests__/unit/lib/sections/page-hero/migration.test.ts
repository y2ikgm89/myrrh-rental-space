import { describe, expect, test } from "bun:test";
import { buildPageHeroPayloadFromLegacyHomepageHeroConfig } from "@/shared/lib/sections/page-hero/migrate-legacy";
import { parsePageHero } from "@/shared/lib/sections/page-hero/schema";

describe("page-hero migration (legacy homepage-hero → pageHero)", () => {
  test("典型 config は editorial-split としてパースできる", () => {
    const payload = buildPageHeroPayloadFromLegacyHomepageHeroConfig({
      label: "Flow",
      title: "タイトル",
      description: "本文",
      images: [
        {
          url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
          alt: "alt text",
        },
      ],
      transition: "ken-burns",
      buttonText: "詳細",
      buttonUrl: "/spaces",
    });
    const hero = parsePageHero(payload);
    expect(hero?.variant).toBe("editorial-split");
    if (hero?.variant === "editorial-split") {
      expect(hero.transition).toBe("ken-burns");
    }
  });

  test("images 空は parsePageHero がフォールバック画像で緩和する", () => {
    const payload = buildPageHeroPayloadFromLegacyHomepageHeroConfig({});
    const hero = parsePageHero(payload);
    expect(hero?.variant).toBe("editorial-split");
    if (hero && hero.variant === "editorial-split") {
      expect(hero.images.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("transition 欠落は crossfade 相当になる", () => {
    const payload = buildPageHeroPayloadFromLegacyHomepageHeroConfig({
      images: [
        {
          url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
          alt: "x",
        },
      ],
    });
    const hero = parsePageHero(payload);
    expect(hero?.variant).toBe("editorial-split");
    if (hero?.variant === "editorial-split") {
      expect(hero.transition).toBe("crossfade");
    }
  });
});
