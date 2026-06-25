import { describe, expect, test } from "bun:test";
import {
  galleryItemSchema,
  gallerySchema,
  parseGallery,
} from "@/shared/lib/validations/gallery";

describe("galleryItemSchema", () => {
  test("accepts valid URL with empty alt/caption", () => {
    const result = galleryItemSchema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "",
      caption: "",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid URL", () => {
    const result = galleryItemSchema.safeParse({
      url: "not-a-url",
      alt: "",
      caption: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects alt > 200 chars", () => {
    const result = galleryItemSchema.safeParse({
      url: "https://e.com/a.jpg",
      alt: "a".repeat(201),
      caption: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects caption > 500 chars", () => {
    const result = galleryItemSchema.safeParse({
      url: "https://e.com/a.jpg",
      alt: "",
      caption: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test("defaults empty string for missing alt/caption", () => {
    const result = galleryItemSchema.safeParse({
      url: "https://e.com/a.jpg",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alt).toBe("");
      expect(result.data.caption).toBe("");
    }
  });
});

describe("gallerySchema", () => {
  const item = (url: string) => ({ url, alt: "", caption: "" });

  test("accepts empty array", () => {
    expect(gallerySchema.safeParse([]).success).toBe(true);
  });

  test("accepts 20 unique URLs", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item(`https://e.com/${i}.jpg`),
    );
    expect(gallerySchema.safeParse(items).success).toBe(true);
  });

  test("rejects 21 items", () => {
    const items = Array.from({ length: 21 }, (_, i) =>
      item(`https://e.com/${i}.jpg`),
    );
    expect(gallerySchema.safeParse(items).success).toBe(false);
  });

  test("rejects duplicate URLs", () => {
    const items = [item("https://e.com/a.jpg"), item("https://e.com/a.jpg")];
    expect(gallerySchema.safeParse(items).success).toBe(false);
  });
});

describe("parseGallery", () => {
  test("returns [] for null", () => {
    expect(parseGallery(null)).toEqual([]);
  });

  test("returns [] for undefined", () => {
    expect(parseGallery(undefined)).toEqual([]);
  });

  test("returns [] for non-array", () => {
    expect(parseGallery({})).toEqual([]);
    expect(parseGallery("string")).toEqual([]);
  });

  test("parses valid array", () => {
    const input = [
      { url: "https://e.com/a.jpg", alt: "A", caption: "" },
      { url: "https://e.com/b.jpg", alt: "", caption: "B" },
    ];
    expect(parseGallery(input)).toEqual(input);
  });

  test("drops malformed items but keeps valid ones", () => {
    const input = [
      { url: "https://e.com/a.jpg", alt: "", caption: "" },
      { url: "not-a-url", alt: "", caption: "" }, // dropped
      { url: "https://e.com/b.jpg" }, // alt/caption default to ""
    ];
    const result = parseGallery(input);
    expect(result).toHaveLength(2);
    expect(result[0]?.url).toBe("https://e.com/a.jpg");
    expect(result[1]?.url).toBe("https://e.com/b.jpg");
    expect(result[1]?.alt).toBe("");
    expect(result[1]?.caption).toBe("");
  });
});
