import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PLAYWRIGHT_CONFIG = join(process.cwd(), "playwright.config.ts");
const E2E_ROOT = join(process.cwd(), "e2e");

const REQUIRED_MOBILE_PROJECTS = [
  {
    name: "chromium-mobile",
    device: '...devices["Pixel 5"]',
    testMatch: "e2e\\/mobile\\/public-mobile\\..*\\.spec\\.ts",
    storageState: null,
    dependency: null,
    browserName: null,
  },
  {
    name: "chromium-customer-mobile",
    device: '...devices["Pixel 5"]',
    testMatch: "e2e\\/mobile\\/customer-mobile\\..*\\.spec\\.ts",
    storageState: "playwright/.auth/customer.json",
    dependency: "setup-customer",
    browserName: null,
  },
  {
    name: "chromium-admin-mobile",
    device: '...devices["Pixel 5"]',
    testMatch: "e2e\\/mobile\\/admin-mobile\\..*\\.spec\\.ts",
    storageState: "playwright/.auth/admin.json",
    dependency: "setup-admin",
    browserName: null,
  },
  {
    name: "webkit-mobile",
    device: '...devices["iPhone 13"]',
    testMatch: "e2e\\/mobile\\/public-mobile\\..*\\.spec\\.ts",
    storageState: null,
    dependency: null,
    browserName: "webkit",
  },
  {
    name: "webkit-customer-mobile",
    device: '...devices["iPhone 13"]',
    testMatch: "e2e\\/mobile\\/customer-mobile\\..*\\.spec\\.ts",
    storageState: "playwright/.auth/customer.json",
    dependency: "setup-customer",
    browserName: "webkit",
  },
  {
    name: "webkit-admin-mobile",
    device: '...devices["iPhone 13"]',
    testMatch: "e2e\\/mobile\\/admin-mobile\\..*\\.spec\\.ts",
    storageState: "playwright/.auth/admin.json",
    dependency: "setup-admin",
    browserName: "webkit",
  },
] as const;

/** `e2e/**` の全ファイルを repo 相対の posix path で列挙する。 */
function collectE2eFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectE2eFiles(entryPath));
    } else {
      files.push(relative(process.cwd(), entryPath).split(sep).join("/"));
    }
  }

  return files;
}

function projectBlock(source: string, name: string): string {
  const start = source.indexOf(`name: "${name}"`);
  if (start === -1) return "";

  const nextProject = source.indexOf("\n    {\n      name:", start + 1);
  return source.slice(start, nextProject === -1 ? undefined : nextProject);
}

describe("Playwright mobile device projects", () => {
  const e2eFiles = collectE2eFiles(E2E_ROOT);

  for (const project of REQUIRED_MOBILE_PROJECTS) {
    // testMatch が 1 件も拾わない dead project は、CI が緑のまま
    // 「そのデバイスを検証している」という誤った安心を与える。
    // browser install（webkit 等）だけ増えて実行対象がゼロ、という状態を静的に禁じる。
    test(`${project.name} testMatch resolves to at least one spec file`, () => {
      const matcher = new RegExp(project.testMatch, "u");
      const matched = e2eFiles.filter((file) => matcher.test(file));

      expect(matched.length).toBeGreaterThan(0);
    });

    test(`${project.name} uses official device emulation with an isolated spec set`, () => {
      const { browserName, dependency, device, name, storageState, testMatch } =
        project;
      const source = readFileSync(PLAYWRIGHT_CONFIG, "utf8");
      const block = projectBlock(source, name);

      expect(block).not.toBe("");
      expect(block).toContain(device);
      expect(block).toContain(testMatch);
      expect(block).toContain("isMobile: true");
      expect(block).toContain("hasTouch: true");
      if (browserName !== null)
        expect(block).toContain(`browserName: "${browserName}"`);
      if (storageState !== null) expect(block).toContain(storageState);
      if (dependency !== null) expect(block).toContain(`"${dependency}"`);
    });
  }
});
