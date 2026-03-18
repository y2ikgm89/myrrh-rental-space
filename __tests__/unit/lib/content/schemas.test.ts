import { describe, expect, it } from "bun:test";
import { homepageContentSchema } from "@/public/lib/content/schemas";

describe("homepageContentSchema", () => {
  it("validates correct homepage content", () => {
    const content = {
      hero: {
        title: "Myrrh Rental Space",
        subtitle: "特別な空間で、特別な時間を",
        image: { src: "/hero.jpg", alt: "Hero", width: 1920, height: 1080 },
        cta: {
          label: "予約する",
          href: "/reservation",
          variant: "primary" as const,
        },
      },
      concept: {
        label: "CONCEPT",
        heading: "私たちの想い",
        body: "テスト本文",
        image: {
          src: "/concept.jpg",
          alt: "Concept",
          width: 800,
          height: 600,
        },
      },
      features: {
        label: "FEATURES",
        heading: "特徴",
        items: [{ icon: "Sparkles", title: "清潔", description: "説明" }],
      },
      cta: {
        heading: "ご予約",
        body: "お気軽に",
        buttons: [
          {
            label: "予約",
            href: "/reservation",
            variant: "primary" as const,
          },
        ],
      },
    };
    const result = homepageContentSchema.safeParse(content);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = homepageContentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid button variant", () => {
    const content = {
      hero: {
        title: "T",
        subtitle: "S",
        image: { src: "/x.jpg", alt: "x", width: 1, height: 1 },
        cta: { label: "L", href: "/", variant: "invalid" },
      },
      concept: {
        label: "L",
        heading: "H",
        body: "B",
        image: { src: "/x.jpg", alt: "x", width: 1, height: 1 },
      },
      features: { label: "L", heading: "H", items: [] },
      cta: { heading: "H", body: "B", buttons: [] },
    };
    const result = homepageContentSchema.safeParse(content);
    expect(result.success).toBe(false);
  });
});
