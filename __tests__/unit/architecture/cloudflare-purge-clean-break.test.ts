import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, ...path.split("/")), "utf8");
}

describe("Cloudflare purge clean-break boundary", () => {
  test("tag purge does not keep plan-tier downgrade or purge_everything fallback", () => {
    const cloudflareSource = read("src/shared/lib/cloudflare.ts");
    const healthSource = read("src/shared/lib/cache/health.ts");
    const instrumentationSource = read("src/instrumentation.ts");

    for (const source of [
      cloudflareSource,
      healthSource,
      instrumentationSource,
    ]) {
      expect(source).not.toContain("plan-tier");
      expect(source).not.toContain("cloudflareTagPurgeEnabled");
      expect(source).not.toContain("setCloudflareTagPurgeEnabled");
      expect(source).not.toContain("isCloudflareTagPurgeEnabled");
      expect(source).not.toContain("falling back");
    }

    expect(cloudflareSource).not.toContain("return purgeAllCloudflareCache()");
  });
});
