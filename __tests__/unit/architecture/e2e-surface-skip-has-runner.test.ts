import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * file スコープの surface skip に、それを**偽にする CI step が実在する**ことを強制する。
 *
 * ## なぜ
 *
 * `APP_SURFACE` は webServer プロセス単位の env なので、1 回の playwright 実行では
 * admin と public を同時に満たせない。spec 先頭の
 * `test.skip(appSurface !== "public", ...)` は、その surface を供給する CI step が
 * 無ければ**常に真**になり、ファイル内の全 test が静かに消える。job は exit 0 で緑。
 *
 * 実際に起きた（監査 F-16）。広域 E2E の唯一の step が `APP_SURFACE: admin` だったため、
 * `spaces-filters` / `events-filters` / `homepage` / `public-mobile.interactions` の
 * 4 本・約 20 test が**どの CI ジョブでも 1 度も実行されていなかった**。
 * 「skip したこと」はレポートに出るが、誰も 0 実行を assert していない。
 *
 * ## 何を見るか
 *
 * 1. `e2e/**\/*.spec.ts` の**行頭**（= file スコープ）にある
 *    `test.skip(appSurface !== "<surface>")` を集める。
 *    route 単位の skip（`test()` の内側 = インデントされている）は対象外 —
 *    あれは「この spec は走るが、この 1 route だけ飛ばす」であって空振りではない。
 * 2. `playwright.config.ts` の project を `testMatch` / `testIgnore` ごと読む。
 * 3. `.github/workflows/ci.yml` の `playwright test` を叩く step を、
 *    `--project` の選択と `APP_SURFACE` の値ごと読む。
 * 4. 1 の各 spec について、**要求する surface を持つ step が、その spec を含む
 *    project を選んでいる**ことを assert する。
 *
 * ## 直し方
 *
 * 落ちたら選択肢は 2 つ。どちらも「skip を消して誤魔化す」ではない。
 *
 * - その surface を供給する CI step を足す（`--project` にその spec を含む
 *   project を入れる）。public surface 専用 project は
 *   `chromium-feature-modules-a11y`（mutator の鎖）に依存させないこと（public では `/admin` が 404 で
 *   `setup-admin` が落ちる）。
 * - spec が本当はその surface を要求しないなら、skip ごと消す。
 *   `/` を踏まない spec は admin surface でも動く（proxy が特別扱いするのは
 *   `pathname === "/"` だけ）。
 *
 * ## 限界
 *
 * project の `dependencies` 経由で走る setup spec は追っていない（setup spec は
 * surface skip を持たないため）。`--grep` による絞り込みも見ていないので、
 * grep で全 test が外れる形は捕まえられない。
 */

const E2E_ROOT = join(process.cwd(), "e2e");
const PLAYWRIGHT_CONFIG = join(process.cwd(), "playwright.config.ts");
const CI_WORKFLOW = join(process.cwd(), ".github", "workflows", "ci.yml");

type PlaywrightProject = {
  readonly name: string;
  readonly testMatch: readonly RegExp[];
  readonly testIgnore: readonly RegExp[];
};

type PlaywrightCiStep = {
  readonly name: string;
  /** 空配列 = `--project` 指定なし ＝ 全 project が対象。 */
  readonly projects: readonly string[];
  readonly appSurface: string | null;
};

/** `e2e/**` の spec を repo 相対の posix path で列挙する。 */
function collectSpecFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSpecFiles(entryPath));
      continue;
    }
    if (!entry.name.endsWith(".spec.ts")) continue;
    files.push(relative(process.cwd(), entryPath).split(sep).join("/"));
  }

  return files;
}

/**
 * file スコープの surface skip が要求する surface を返す。無ければ null。
 *
 * 行頭固定にしているのが本質。インデントされた `test.skip(...)` は
 * `test()` / `describe()` の内側 ＝ route 単位の分岐で、空振りではない。
 */
function requiredSurface(specSource: string): string | null {
  const match =
    /^test\.skip\(\s*(?:appSurface|process\.env\["APP_SURFACE"\][^!\n]*)\s*!==\s*"([a-z]+)"/mu.exec(
      specSource,
    );
  return match?.[1] ?? null;
}

/** `key: /re/` または `key: [/re/, /re/]` から正規表現リテラルを取り出す。 */
function extractPatternList(block: string, key: string): RegExp[] {
  const at = block.indexOf(`${key}:`);
  if (at === -1) return [];

  const rest = block.slice(at + key.length + 1);
  const firstNonSpace = rest.search(/\S/u);
  if (firstNonSpace === -1) return [];

  let segment: string;
  if (rest[firstNonSpace] === "[") {
    const close = rest.indexOf("]", firstNonSpace);
    segment = close === -1 ? rest : rest.slice(firstNonSpace, close + 1);
  } else {
    const eol = rest.indexOf("\n", firstNonSpace);
    segment = eol === -1 ? rest : rest.slice(firstNonSpace, eol);
  }

  return [...segment.matchAll(/\/((?:[^/\\\n]|\\.)+)\/([a-z]*)/gu)].flatMap(
    (found) => {
      const source = found[1];
      if (source === undefined) return [];
      return [new RegExp(source, found[2] === "" ? "u" : found[2])];
    },
  );
}

function parseProjects(configSource: string): PlaywrightProject[] {
  const projects: PlaywrightProject[] = [];
  const names = [...configSource.matchAll(/\n {6}name: "([a-z0-9-]+)",/gu)];

  for (const [index, found] of names.entries()) {
    const name = found[1];
    if (name === undefined) continue;

    const start = found.index;
    const next = names[index + 1];
    const block = configSource.slice(start, next?.index ?? undefined);

    projects.push({
      name,
      testMatch: extractPatternList(block, "testMatch"),
      testIgnore: extractPatternList(block, "testIgnore"),
    });
  }

  return projects;
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

function projectOwnsSpec(
  project: PlaywrightProject,
  specPath: string,
): boolean {
  if (!project.testMatch.some((pattern) => pattern.test(specPath)))
    return false;
  return !project.testIgnore.some((pattern) => pattern.test(specPath));
}

/** その spec が実際に実行されうる surface の集合。 */
function runnableSurfaces(
  specPath: string,
  projects: readonly PlaywrightProject[],
  steps: readonly PlaywrightCiStep[],
): Set<string> {
  const surfaces = new Set<string>();

  for (const step of steps) {
    if (step.appSurface === null) continue;

    const selected =
      step.projects.length === 0
        ? projects
        : projects.filter((project) =>
            step.projects.some((selector) =>
              wildcardToRegExp(selector).test(project.name),
            ),
          );

    if (selected.some((project) => projectOwnsSpec(project, specPath))) {
      surfaces.add(step.appSurface);
    }
  }

  return surfaces;
}

describe("E2E surface skip has a CI runner", () => {
  const specFiles = collectSpecFiles(E2E_ROOT);
  const projects = parseProjects(readFileSync(PLAYWRIGHT_CONFIG, "utf8"));
  const steps = parsePlaywrightCiSteps(readFileSync(CI_WORKFLOW, "utf8"));

  test("scan reaches the real spec / project / step population", () => {
    expect(specFiles.length).toBeGreaterThan(30);
    expect(projects.length).toBeGreaterThan(10);
    expect(steps.length).toBeGreaterThan(3);
    // project は全部 testMatch を持つ（持たない = 解析に失敗している）。
    expect(projects.every((project) => project.testMatch.length > 0)).toBe(
      true,
    );
    // surface を渡す step が 1 つも読めていないなら解析が壊れている。
    expect(steps.some((step) => step.appSurface === "public")).toBe(true);
    expect(steps.some((step) => step.appSurface === "admin")).toBe(true);
  });

  test("every file-scoped surface skip is made false by some CI step", () => {
    const unreachable: string[] = [];
    let guarded = 0;

    for (const specPath of specFiles) {
      const surface = requiredSurface(readFileSync(specPath, "utf8"));
      if (surface === null) continue;
      guarded += 1;

      if (!runnableSurfaces(specPath, projects, steps).has(surface)) {
        unreachable.push(`${specPath} (needs APP_SURFACE=${surface})`);
      }
    }

    // 対象が 0 件になったら、この gate は何も見ていない。
    expect(guarded).toBeGreaterThan(0);
    expect(unreachable).toEqual([]);
  });
});

describe("E2E surface skip parser fixtures", () => {
  test("file スコープの skip だけを surface 要求として拾う", () => {
    expect(
      requiredSurface(
        'const appSurface = process.env["APP_SURFACE"] ?? "admin";\n' +
          'test.skip(\n  appSurface !== "public",\n  "reason",\n);\n',
      ),
    ).toBe("public");

    // route 単位（インデント = test() の内側）は空振りではないので拾わない。
    expect(
      requiredSurface(
        'test("x", async () => {\n  test.skip(appSurface !== "public", "reason");\n});\n',
      ),
    ).toBeNull();

    expect(requiredSurface('test("x", async () => {});\n')).toBeNull();
  });

  const projectFixtures: PlaywrightProject[] = [
    {
      name: "chromium",
      testMatch: [/e2e\/public\/.*\.spec\.ts/u],
      testIgnore: [/e2e\/public\/homepage\.spec\.ts/u],
    },
    {
      name: "chromium-public-root",
      testMatch: [/e2e\/public\/homepage\.spec\.ts/u],
      testIgnore: [],
    },
  ];

  test("surface を供給する step が無ければ 0 件になる（F-16 の形）", () => {
    const adminOnly: PlaywrightCiStep[] = [
      { name: "Run E2E tests", projects: [], appSurface: "admin" },
    ];

    expect([
      ...runnableSurfaces(
        "e2e/public/homepage.spec.ts",
        projectFixtures,
        adminOnly,
      ),
    ]).toEqual(["admin"]);
    // admin しか無い ＝ public を要求する spec は実行されない。
    expect(
      runnableSurfaces(
        "e2e/public/homepage.spec.ts",
        projectFixtures,
        adminOnly,
      ).has("public"),
    ).toBe(false);
  });

  test("public step が spec を含む project を選んでいれば通る", () => {
    const withPublic: PlaywrightCiStep[] = [
      { name: "Run E2E tests", projects: [], appSurface: "admin" },
      {
        name: "Run E2E tests (public surface)",
        projects: ["chromium-public-root"],
        appSurface: "public",
      },
    ];

    expect(
      runnableSurfaces(
        "e2e/public/homepage.spec.ts",
        projectFixtures,
        withPublic,
      ).has("public"),
    ).toBe(true);
  });

  test("public step が別 project しか選んでいなければ落ちる", () => {
    const wrongProject: PlaywrightCiStep[] = [
      {
        name: "Run E2E tests (public surface)",
        projects: ["chromium"],
        appSurface: "public",
      },
    ];

    // chromium は homepage.spec.ts を testIgnore しているので所有しない。
    expect(
      runnableSurfaces(
        "e2e/public/homepage.spec.ts",
        projectFixtures,
        wrongProject,
      ).has("public"),
    ).toBe(false);
  });

  test("--project のワイルドカードを解決する", () => {
    const wildcard: PlaywrightCiStep[] = [
      {
        name: "Run E2E tests (public surface)",
        projects: ["chromium-public-*"],
        appSurface: "public",
      },
    ];

    expect(
      runnableSurfaces(
        "e2e/public/homepage.spec.ts",
        projectFixtures,
        wildcard,
      ).has("public"),
    ).toBe(true);
  });

  test("playwright.config.ts / ci.yml のパーサが実ファイル形式を読める", () => {
    const parsed = parseProjects(
      "  projects: [\n" +
        '    {\n      name: "setup-admin",\n      testMatch: /e2e\\/auth\\/admin\\.setup\\.ts/,\n    },\n' +
        '    {\n      name: "chromium",\n' +
        "      testMatch: [\n        /e2e\\/public\\/.*\\.spec\\.ts/,\n        /e2e\\/a11y\\/.*\\.spec\\.ts/,\n      ],\n" +
        "      testIgnore: /e2e\\/public\\/homepage\\.spec\\.ts/,\n    },\n  ],\n",
    );

    expect(parsed.map((project) => project.name)).toEqual([
      "setup-admin",
      "chromium",
    ]);
    expect(parsed[1]?.testMatch).toHaveLength(2);
    expect(parsed[1]?.testIgnore).toHaveLength(1);
    expect(
      projectOwnsSpec(
        parsed[1] as PlaywrightProject,
        "e2e/public/homepage.spec.ts",
      ),
    ).toBe(false);
    expect(
      projectOwnsSpec(
        parsed[1] as PlaywrightProject,
        "e2e/public/spaces-filters.spec.ts",
      ),
    ).toBe(true);

    const parsedSteps = parsePlaywrightCiSteps(
      "\n      - name: Run E2E tests (public surface)\n" +
        "        run: bunx playwright test --project=chromium-public-root --project=webkit-mobile\n" +
        "        env:\n          CI: true\n          APP_SURFACE: public\n" +
        "\n      - name: Upload Playwright report\n        uses: actions/upload-artifact@v7\n",
    );

    expect(parsedSteps).toHaveLength(1);
    expect(parsedSteps[0]?.projects).toEqual([
      "chromium-public-root",
      "webkit-mobile",
    ]);
    expect(parsedSteps[0]?.appSurface).toBe("public");
  });
});
