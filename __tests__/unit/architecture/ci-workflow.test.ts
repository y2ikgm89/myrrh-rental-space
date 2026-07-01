import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const workflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
);
const playwrightConfig = readFileSync(
  join(process.cwd(), "playwright.config.ts"),
  "utf8",
);

const ADMIN_ROLE_GROUP_ENV_KEYS = [
  "ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL",
  "ADMIN_ROLE_GROUP_ADMIN_EMAIL",
  "ADMIN_ROLE_GROUP_EDITOR_EMAIL",
  "ADMIN_ROLE_GROUP_VIEWER_EMAIL",
] as const;

describe("CI admin auth environment", () => {
  test("provides Google role group env for production-mode Playwright web servers", () => {
    for (const key of ADMIN_ROLE_GROUP_ENV_KEYS) {
      expect(workflow, key).toContain(`${key}:`);
      expect(playwrightConfig, key).toContain(`${key}:`);
    }
  });

  test("does not use legacy initial admin bootstrap env", () => {
    expect(workflow).not.toContain("INITIAL_ADMIN_EMAIL");
    expect(workflow).not.toContain("INITIAL_ADMIN_NAME");
    expect(playwrightConfig).not.toContain("INITIAL_ADMIN_EMAIL");
    expect(playwrightConfig).not.toContain("INITIAL_ADMIN_NAME");
  });
});
