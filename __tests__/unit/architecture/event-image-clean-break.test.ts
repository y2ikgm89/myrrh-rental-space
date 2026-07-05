import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("event image clean-break boundary", () => {
  test("event media pickers do not accept arbitrary URL input", () => {
    const publishFields = read(
      "src/app/(admin)/admin/(dashboard)/events/_components/EventPublishFields.tsx",
    );
    const seoFields = read(
      "src/app/(admin)/admin/(dashboard)/events/_components/EventSeoFields.tsx",
    );
    const eventForm = read(
      "src/app/(admin)/admin/(dashboard)/events/_components/EventForm.tsx",
    );

    expect(publishFields).toContain("showUrlTab: false");
    expect(seoFields).toContain("showUrlTab: false");
    expect(eventForm).toContain("showUrlTab={false}");
  });

  test("event detail hero uses one high-priority Image loading strategy", () => {
    const detailPage = read("src/app/(public)/events/[slug]/page.tsx");

    expect(detailPage).not.toContain("preload");
    expect(detailPage).toContain('loading="eager"');
    expect(detailPage).toContain('fetchPriority="high"');
  });
});
