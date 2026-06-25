import { describe, expect, test } from "bun:test";
import DOMPurify from "isomorphic-dompurify";
import { SANITIZE_OPTIONS } from "@/shared/components/SanitizedHtml";

describe("SanitizedHtml allows gallery data attrs", () => {
  test("preserves data-gallery on div", () => {
    const dirty =
      '<div data-gallery="true" data-gallery-columns="3" data-gallery-style="grid"><img data-gallery-img="true" data-src="x.jpg"/></div>';
    const clean = DOMPurify.sanitize(dirty, SANITIZE_OPTIONS);
    expect(clean).toContain("data-gallery");
    expect(clean).toContain("data-gallery-columns");
    expect(clean).toContain("data-gallery-style");
    expect(clean).toContain("data-gallery-img");
    expect(clean).toContain("data-src");
  });

  test("preserves all 9 gallery data attributes", () => {
    const dirty = `<div
      data-gallery="items"
      data-gallery-columns="2"
      data-gallery-style="masonry"
      data-gallery-item="0"
      data-src="img.jpg"
      data-alt="An image"
      data-caption="Caption text"
      data-gallery-img="true"
      data-gallery-placeholder="loading">
      <img/>
    </div>`;
    const clean = DOMPurify.sanitize(dirty, SANITIZE_OPTIONS);
    expect(clean).toContain("data-gallery");
    expect(clean).toContain("data-gallery-columns");
    expect(clean).toContain("data-gallery-style");
    expect(clean).toContain("data-gallery-item");
    expect(clean).toContain("data-src");
    expect(clean).toContain("data-alt");
    expect(clean).toContain("data-caption");
    expect(clean).toContain("data-gallery-img");
    expect(clean).toContain("data-gallery-placeholder");
  });
});
