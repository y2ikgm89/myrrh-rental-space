import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIALOG = join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "_shared",
  "components",
  "design-system",
  "dialog.tsx",
);

describe("public dialog mobile accessibility contract", () => {
  test("dialog content declares modal semantics and mobile-safe bounds", () => {
    const source = readFileSync(PUBLIC_DIALOG, "utf8");
    const contentBlock = source.slice(
      source.indexOf("DialogPrimitive.Content"),
    );

    expect(contentBlock).toContain('aria-modal="true"');
    expect(contentBlock).toContain("w-[calc(100%-2rem)]");
    expect(contentBlock).toContain("max-h-[calc(100dvh-2rem)]");
    expect(contentBlock).toContain("overflow-y-auto");
  });
});
