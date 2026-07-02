import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, ...path.split("/")), "utf8");
}

describe("public access map clean break", () => {
  test("AccessMap requires explicit location input and does not fallback to organization settings", () => {
    const source = read("src/app/(public)/_components/access-map.tsx");

    expect(source).not.toContain("getOrganizationSettings");
    expect(source).not.toContain("props 未指定");
    expect(source).not.toContain("フォールバック");
    expect(source).not.toMatch(/AccessMapProps\s*=\s*\{\}/u);
  });

  test("LocationListSection passes location address explicitly", () => {
    const source = read("src/app/(public)/_components/LocationListSection.tsx");

    expect(source).toContain("<AccessMap");
    expect(source).toContain("address={location.address}");
  });
});
