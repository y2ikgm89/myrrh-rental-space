import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("one-time backfill clean-break contract", () => {
  test("does not keep historical one-off data repair scripts", () => {
    const removedScripts = [
      "backfill-page-hero-buttons.ts",
      "migrate-gallery-images-to-media.ts",
      "update-access-sections.ts",
    ];

    for (const script of removedScripts) {
      expect(existsSync(join(process.cwd(), "scripts", script))).toBe(false);
    }
  });

  test("runtime source does not describe backward compatibility obligations", async () => {
    const checkedFiles = [
      "src/shared/lib/json-validators.ts",
      "src/shared/lib/pagination.ts",
      "src/shared/lib/r2/media-magic-bytes.ts",
    ];

    for (const relativePath of checkedFiles) {
      const source = await Bun.file(join(process.cwd(), relativePath)).text();
      expect(source).not.toMatch(
        /後方互換|backward-compatible|compatibility shim/iu,
      );
    }
  });
});
