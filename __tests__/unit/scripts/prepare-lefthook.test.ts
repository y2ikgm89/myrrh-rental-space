import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  runPrepareLefthook,
  shouldSkipLefthookInstall,
} from "../../../scripts/prepare-lefthook";

describe("prepare lefthook", () => {
  test("package.json prepare は || true せず script に委譲する", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: { prepare?: string } };
    expect(pkg.scripts?.prepare).toBe("bun scripts/prepare-lefthook.ts");
  });

  test("CI=true または .git 不在だけ skip する", () => {
    expect(
      shouldSkipLefthookInstall({ ci: "true", gitEntryExists: true }),
    ).toBe(true);
    expect(
      shouldSkipLefthookInstall({ ci: undefined, gitEntryExists: false }),
    ).toBe(true);
    expect(
      shouldSkipLefthookInstall({ ci: undefined, gitEntryExists: true }),
    ).toBe(false);
    expect(shouldSkipLefthookInstall({ ci: "1", gitEntryExists: true })).toBe(
      false,
    );
  });

  test("skip しないとき install 失敗を伝播する", async () => {
    const result = await runPrepareLefthook({
      ci: undefined,
      gitEntryExists: true,
      install: () => Promise.resolve(1),
    });
    expect(result).toBe(1);
  });

  test("skip するとき install を呼ばない", async () => {
    let called = 0;
    const result = await runPrepareLefthook({
      ci: "true",
      gitEntryExists: true,
      install: () => {
        called += 1;
        return Promise.resolve(1);
      },
    });
    expect(called).toBe(0);
    expect(result).toBe(0);
  });
});
