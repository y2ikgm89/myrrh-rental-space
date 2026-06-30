import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function filePath(path: string): string {
  return join(ROOT, ...path.split("/"));
}

describe("section registry clean break", () => {
  test("section metadata compatibility wrapper is not reintroduced", () => {
    expect(
      existsSync(filePath("src/shared/lib/validations/section-metadata.ts")),
    ).toBe(false);

    const sectionSource = readFileSync(
      filePath("src/shared/lib/validations/section.ts"),
      "utf8",
    );
    expect(sectionSource).not.toContain("section-metadata");
  });

  test("section-defaults does not export the unused generic getSafeConfig API", () => {
    const source = readFileSync(
      filePath("src/shared/lib/validations/section-defaults.ts"),
      "utf8",
    );

    expect(source).not.toContain("export function getSafeConfig");
  });
});
