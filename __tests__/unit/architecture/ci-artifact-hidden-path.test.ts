/**
 * upload-artifact の検索 root が hidden なら `include-hidden-files: true` が要る。
 *
 * ## なぜ
 *
 * `actions/upload-artifact` は `@actions/glob` で `path` を展開する。
 * actions/toolkit `packages/glob/src/internal-globber.ts` は search path を
 * stack に積んだあと、while ループで
 * `if (options.excludeHiddenFiles && path.basename(item.path).match(/^\./)) { continue }`
 * しており、これは **root にも** 適用される。
 * `.lighthouseci/` は basename が `.` 始まりなので、フラグ無しだと
 * lhr-*.json / assertion-results.json / links.json / lighthouse.log ごと
 * スキップされる。
 *
 * ## 何を見るか
 *
 * `.github/workflows/**` の `actions/upload-artifact` について、include の
 * `searchRootBasename` が `.` 始まりなら `with["include-hidden-files"]` が true。
 *
 * ## 直し方
 *
 * その step の `with:` に `include-hidden-files: true` を足す。
 * hidden 配下に secret が無いことをコメントで残す。
 *
 * Parser helpers（`unquote` / `splitPathEntries` / `collectArtifactUploads` /
 * `collectStepContexts` / `Bun.YAML.parse`）は
 * `__tests__/unit/architecture/deploy-plan-artifact-no-binary.test.ts` からの
 * コピー。3rd-copy 規則のため共有モジュールには抽出しない。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

type Step = Record<string, unknown>;

type ArtifactUpload = {
  readonly stepLabel: string;
  readonly includes: readonly string[];
  readonly excludes: readonly string[];
  readonly with: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type StepContext = {
  readonly step: Step;
  readonly defaultWorkingDirectory: string | null;
};

function readDefaultWorkingDirectory(container: unknown): string | null {
  if (!isRecord(container)) return null;
  const defaults = container["defaults"];
  if (!isRecord(defaults)) return null;
  const run = defaults["run"];
  if (!isRecord(run)) return null;
  const workingDirectory = run["working-directory"];
  return typeof workingDirectory === "string" ? workingDirectory : null;
}

function collectStepContexts(document: unknown): StepContext[] {
  if (!isRecord(document)) return [];
  const jobs = document["jobs"];
  if (!isRecord(jobs)) return [];
  const workflowDefault = readDefaultWorkingDirectory(document);
  const contexts: StepContext[] = [];
  for (const job of Object.values(jobs)) {
    if (!isRecord(job)) continue;
    const list = job["steps"];
    if (!Array.isArray(list)) continue;
    const jobDefault = readDefaultWorkingDirectory(job) ?? workflowDefault;
    for (const step of list) {
      if (isRecord(step))
        contexts.push({ step, defaultWorkingDirectory: jobDefault });
    }
  }
  return contexts;
}

function unquote(entry: string): string {
  const trimmed = entry.trim();
  if (trimmed.length < 2) return trimmed;
  const head = trimmed[0];
  if ((head === '"' || head === "'") && trimmed.endsWith(head)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function splitPathEntries(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split("\n")
      .map(unquote)
      .filter((line) => line.length > 0);
  }
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map(unquote)
      .filter((entry) => entry.length > 0);
  }
  return [];
}

function collectArtifactUploads(
  contexts: readonly StepContext[],
): ArtifactUpload[] {
  const uploads: ArtifactUpload[] = [];
  for (const { step } of contexts) {
    const uses = step["uses"];
    if (typeof uses !== "string" || !uses.startsWith("actions/upload-artifact"))
      continue;
    const withBlock = isRecord(step["with"]) ? step["with"] : {};
    const entries = splitPathEntries(withBlock["path"]);
    const includes: string[] = [];
    const excludes: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith("!")) excludes.push(entry.slice(1).trim());
      else includes.push(entry);
    }
    const name = step["name"];
    uploads.push({
      stepLabel: typeof name === "string" ? name : uses,
      includes,
      excludes,
      with: withBlock,
    });
  }
  return uploads;
}

/**
 * glob magic（`*` `?` `[` `+( `）より前の、最後の path セグメント。
 * `.lighthouseci/` → `.lighthouseci`
 * `.next/diagnostics/analyze/` → `analyze`
 * `e2e/visual/` + globstar + snapshots → `visual`
 */
function searchRootBasename(entry: string): string {
  const segments = entry.split("/").filter((segment) => segment.length > 0);
  const beforeMagic: string[] = [];
  for (const segment of segments) {
    if (
      segment.includes("*") ||
      segment.includes("?") ||
      segment.includes("[") ||
      segment.includes("+(")
    ) {
      break;
    }
    beforeMagic.push(segment);
  }
  return beforeMagic.at(-1) ?? "";
}

function findHiddenSearchRootViolations(
  workflowName: string,
  document: unknown,
): string[] {
  const violations: string[] = [];
  for (const upload of collectArtifactUploads(collectStepContexts(document))) {
    for (const entry of upload.includes) {
      const root = searchRootBasename(entry);
      if (!root.startsWith(".")) continue;
      if (upload.with["include-hidden-files"] === true) continue;
      violations.push(
        `${workflowName} / "${upload.stepLabel}" path "${entry}" (search root "${root}") lacks include-hidden-files: true`,
      );
    }
  }
  return violations;
}

function uploadDocument(withLines: string): unknown {
  return Bun.YAML.parse(`
jobs:
  example:
    steps:
      - name: Upload
        uses: actions/upload-artifact@v7
        with:
${withLines
  .split("\n")
  .map((line) => `          ${line}`)
  .join("\n")}
`);
}

const workflowFiles = readdirSync(WORKFLOWS_DIR).filter(
  (entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"),
);

const workflows = workflowFiles.map((fileName) => ({
  fileName,
  document: Bun.YAML.parse(
    readFileSync(join(WORKFLOWS_DIR, fileName), "utf8"),
  ) as unknown,
}));

const uploads = workflows.flatMap(({ document }) =>
  collectArtifactUploads(collectStepContexts(document)),
);

describe("ci: hidden artifact search root は include-hidden-files が要る", () => {
  test("走査対象の workflow が存在する（空振り防止）", () => {
    expect(workflowFiles.length).toBeGreaterThan(4);
  });

  test("upload-artifact step を実際に検出できている（空振り防止）", () => {
    expect(uploads.length).toBeGreaterThan(5);
  });

  test("hidden search root の upload は include-hidden-files: true を付けている", () => {
    const violations = workflows.flatMap(({ fileName, document }) =>
      findHiddenSearchRootViolations(fileName, document),
    );
    expect(violations).toEqual([]);
  });
});

describe("ci: hidden search root 判定の見本", () => {
  test("searchRootBasename は glob magic より前の最後のセグメント", () => {
    expect(searchRootBasename(".lighthouseci/")).toBe(".lighthouseci");
    expect(searchRootBasename(".next/diagnostics/analyze/")).toBe("analyze");
    expect(searchRootBasename("e2e/visual/**/*-snapshots/")).toBe("visual");
  });

  test("落ちるべき: path: .lighthouseci/ に include-hidden-files が無い", () => {
    expect(
      findHiddenSearchRootViolations(
        "fixture.yml",
        uploadDocument("path: .lighthouseci/"),
      ),
    ).toHaveLength(1);
  });

  test("落ちてはいけない: 同じ path に include-hidden-files: true", () => {
    expect(
      findHiddenSearchRootViolations(
        "fixture.yml",
        uploadDocument("path: .lighthouseci/\ninclude-hidden-files: true"),
      ),
    ).toEqual([]);
  });

  test("落ちてはいけない: .next/diagnostics/analyze/（root は analyze）", () => {
    expect(
      findHiddenSearchRootViolations(
        "fixture.yml",
        uploadDocument("path: .next/diagnostics/analyze/"),
      ),
    ).toEqual([]);
  });

  test("落ちてはいけない: .typedoc/api/（root は api）", () => {
    expect(
      findHiddenSearchRootViolations(
        "fixture.yml",
        uploadDocument("path: .typedoc/api/"),
      ),
    ).toEqual([]);
  });

  test("落ちてはいけない: ci.yml visual-regression の複数行 path（glob magic）", () => {
    const ci = workflows.find((workflow) => workflow.fileName === "ci.yml");
    if (!ci) throw new Error("ci.yml is not in the workflow scan");
    const visual = collectArtifactUploads(
      collectStepContexts(ci.document),
    ).find(
      (upload) => upload.stepLabel === "Upload Playwright visual diff report",
    );
    if (!visual) throw new Error("visual-regression upload step missing");
    expect(visual.includes).toEqual([
      "playwright-report/",
      "e2e/visual/**/*-snapshots/",
    ]);
    expect(searchRootBasename("e2e/visual/**/*-snapshots/")).toBe("visual");
    expect(
      visual.includes.filter((entry) =>
        searchRootBasename(entry).startsWith("."),
      ),
    ).toEqual([]);
  });
});
