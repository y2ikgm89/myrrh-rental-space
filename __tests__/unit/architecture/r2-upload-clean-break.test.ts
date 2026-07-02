import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("R2 upload clean-break boundary", () => {
  test("upload helpers require an explicit validation policy", () => {
    const source = read("src/shared/lib/r2/upload.ts");

    expect(source).not.toContain("DEFAULT_VALIDATION");
    expect(source).not.toContain("validation?: MediaUploadValidation");
    expect(source).not.toContain("options?.validation ??");
    expect(source).toContain("validation: MediaUploadValidation");
  });
});
