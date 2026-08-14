import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Playwright の mobile device project が、CI 上で本当に 1 test でも走りうる
 * ことの gate。
 *
 * ## なぜ
 *
 * `chromium-mobile` / `webkit-mobile` の testMatch は
 * `e2e/mobile/public-mobile.*.spec.ts` に当たる。当たるファイルは file スコープで
 * `test.skip(appSurface !== "public")` を持つ。ファイル一致だけを見ると、
 * その project を回す step が `APP_SURFACE: admin` でも gate は緑のまま、
 * Pixel 5 / iPhone 13 の touch 回帰は 1 度も実行されない（監査 F-84）。
 *
 * ## 何を見るか
 *
 * 1. 各必須 project の `testMatch` が 1 件以上の spec に当たる。
 * 2. 当たった spec に file スコープの APP_SURFACE skip があるなら、
 *    `ci.yml` のどこかが**その project 名**をその surface で回している。
 *    spec 単位の被覆（別 project が同じファイルを public で回す）では足りない —
 *    デバイス emulation はその project でしか乗らない。
 * 3. device / isMobile / hasTouch / storageState の文字列契約。
 *
 * ## 直し方
 *
 * 落ちたら、その project を要求 surface で回す CI step を足す。
 * public 専用 spec は `APP_SURFACE: public` の step で `--project=<name>` する
 * （F-16 が入れた public surface step が現行の見本）。skip を消して誤魔化さない。
 */

const PLAYWRIGHT_CONFIG = join(process.cwd(), "playwright.config.ts");
const CI_WORKFLOW = join(process.cwd(), ".github", "workflows", "ci.yml");
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

type PlaywrightCiStep = {
  readonly name: string;
  /** 空配列 = `--project` 指定なし ＝ 全 project が対象。 */
  readonly projects: readonly string[];
  readonly appSurface: string | null;
};

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

/**
 * file スコープの surface skip が要求する surface。無ければ null。
 *
 * 行頭固定が本質。インデントされた `test.skip(...)` は `test()` の内側で、
 * 「この spec は走るがこの 1 本だけ飛ばす」なので project を殺さない。
 */
function requiredSurface(specSource: string): string | null {
  const match =
    /^test\.skip\(\s*(?:appSurface|process\.env\["APP_SURFACE"\][^!\n]*)\s*!==\s*"([a-z]+)"/mu.exec(
      specSource,
    );
  return match?.[1] ?? null;
}

function parsePlaywrightCiSteps(workflowSource: string): PlaywrightCiStep[] {
  const steps: PlaywrightCiStep[] = [];
  const chunks = workflowSource.split(/\n {6}- name: /u).slice(1);

  for (const chunk of chunks) {
    if (!chunk.includes("playwright test")) continue;

    const name = chunk.slice(0, chunk.indexOf("\n"));
    const projects = [
      ...new Set(
        [...chunk.matchAll(/--project[= ]([A-Za-z0-9_*-]+)/gu)].flatMap(
          (found) => (found[1] === undefined ? [] : [found[1]]),
        ),
      ),
    ];
    const surface = /\n {10}APP_SURFACE: "?([a-z]+)"?/u.exec(chunk)?.[1];

    steps.push({ name, projects, appSurface: surface ?? null });
  }

  return steps;
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "iu");
}

function ciRunsProjectWithSurface(
  projectName: string,
  surface: string,
  steps: readonly PlaywrightCiStep[],
): boolean {
  return steps.some((step) => {
    if (step.appSurface !== surface) return false;
    if (step.projects.length === 0) return true;
    return step.projects.some((selector) =>
      wildcardToRegExp(selector).test(projectName),
    );
  });
}

/**
 * 当たった spec が要求する surface のうち、この project をその surface で
 * 回す CI step が無いもの。空なら project は死んでいない。
 */
function missingCiSurfaces(
  projectName: string,
  matchedSpecSources: readonly string[],
  steps: readonly PlaywrightCiStep[],
): string[] {
  const required = new Set<string>();
  for (const source of matchedSpecSources) {
    const surface = requiredSurface(source);
    if (surface !== null) required.add(surface);
  }

  return [...required].filter(
    (surface) => !ciRunsProjectWithSurface(projectName, surface, steps),
  );
}

describe("Playwright mobile device projects", () => {
  const e2eFiles = collectE2eFiles(E2E_ROOT);
  const ciSteps = parsePlaywrightCiSteps(readFileSync(CI_WORKFLOW, "utf8"));

  test("CI parser sees admin and public playwright steps", () => {
    expect(ciSteps.length).toBeGreaterThan(3);
    expect(ciSteps.some((step) => step.appSurface === "public")).toBe(true);
    expect(ciSteps.some((step) => step.appSurface === "admin")).toBe(true);
  });

  for (const project of REQUIRED_MOBILE_PROJECTS) {
    // testMatch が 1 件も拾わない dead project は、CI が緑のまま
    // 「そのデバイスを検証している」という誤った安心を与える。
    // browser install（webkit 等）だけ増えて実行対象がゼロ、という状態を静的に禁じる。
    test(`${project.name} testMatch resolves to at least one spec file`, () => {
      const matcher = new RegExp(project.testMatch, "u");
      const matched = e2eFiles.filter((file) => matcher.test(file));

      expect(matched.length).toBeGreaterThan(0);
    });

    test(`${project.name} file-scope APP_SURFACE skip is runnable in CI`, () => {
      const matcher = new RegExp(project.testMatch, "u");
      const matched = e2eFiles.filter((file) => matcher.test(file));
      const sources = matched.map((file) =>
        readFileSync(join(process.cwd(), ...file.split("/")), "utf8"),
      );

      expect(missingCiSurfaces(project.name, sources, ciSteps)).toEqual([]);
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

describe("Playwright mobile project surface fixtures", () => {
  const publicSkipSpec =
    'const appSurface = process.env["APP_SURFACE"] ?? "admin";\n' +
    'test.skip(\n  appSurface !== "public",\n  "Public homepage root is served only on public surface.",\n);\n';

  const adminOnlySteps: PlaywrightCiStep[] = [
    { name: "Run E2E tests", projects: [], appSurface: "admin" },
  ];

  test("落ちるべき: testMatch は当たるが CI が APP_SURFACE=admin だけで project を回す（F-84）", () => {
    expect(
      missingCiSurfaces("chromium-mobile", [publicSkipSpec], adminOnlySteps),
    ).toEqual(["public"]);
    expect(
      missingCiSurfaces("webkit-mobile", [publicSkipSpec], adminOnlySteps),
    ).toEqual(["public"]);
  });

  test("落ちてはいけない: 同じ project を APP_SURFACE=public で回す step がある", () => {
    const withPublic: PlaywrightCiStep[] = [
      { name: "Run E2E tests", projects: [], appSurface: "admin" },
      {
        name: "Run E2E tests (public surface)",
        projects: ["chromium-mobile", "webkit-mobile"],
        appSurface: "public",
      },
    ];

    expect(
      missingCiSurfaces("chromium-mobile", [publicSkipSpec], withPublic),
    ).toEqual([]);
    expect(
      missingCiSurfaces("webkit-mobile", [publicSkipSpec], withPublic),
    ).toEqual([]);
  });

  test("落ちてはいけない: surface skip の無い spec は admin-only でも死んでいない", () => {
    expect(
      missingCiSurfaces(
        "chromium-customer-mobile",
        ['test("x", async () => {});\n'],
        adminOnlySteps,
      ),
    ).toEqual([]);
  });

  test("file スコープ以外の skip は要求に数えない", () => {
    const innerSkip =
      'test("x", async () => {\n  test.skip(appSurface !== "public", "reason");\n});\n';

    expect(
      missingCiSurfaces("chromium-mobile", [innerSkip], adminOnlySteps),
    ).toEqual([]);
  });

  test('process.env["APP_SURFACE"] 直書きも同等のガードとして拾う', () => {
    const envSkip =
      'test.skip(process.env["APP_SURFACE"] !== "public", "reason");\n';

    expect(
      missingCiSurfaces("chromium-mobile", [envSkip], adminOnlySteps),
    ).toEqual(["public"]);
  });
});
