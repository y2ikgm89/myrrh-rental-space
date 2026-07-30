/**
 * GitHub Actions の `run:` 既定 shell は非 Windows で `bash -e {0}` と定義されており
 * `-o pipefail` を含まない（`shell: bash` を明示したときだけ
 * `bash --noprofile --norc -eo pipefail {0}` になる）。
 *
 * このため pipefail 無しでパイプを書くと、パイプライン全体の終了コードが
 * **最後のコマンドのもの**になり、前段の失敗が丸ごと握り潰される。
 * 実害例: `Dependency Audit (bun audit)` job は required status check でありながら
 * `bun audit ... | tee audit-report.txt` と書かれていたため、`tee` が常に 0 を返し、
 * prod 依存に high advisory が 12 件あっても success を返し続けていた。
 *
 * 公式: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

type ShellStep = {
  readonly source: string;
  readonly name: string;
  readonly run: string;
  readonly shell: string | null;
};

const GITHUB_DIR = join(process.cwd(), ".github");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/** `defaults.run.shell`（workflow / job どちらの階層でも同じ形） */
function readDefaultShell(container: Record<string, unknown>): string | null {
  const defaults = container["defaults"];
  if (!isRecord(defaults)) return null;
  const run = defaults["run"];
  if (!isRecord(run)) return null;
  return readString(run, "shell");
}

function collectYamlPaths(): string[] {
  const paths: string[] = [];

  const workflowsDir = join(GITHUB_DIR, "workflows");
  for (const entry of readdirSync(workflowsDir)) {
    if (entry.endsWith(".yml") || entry.endsWith(".yaml")) {
      paths.push(join(workflowsDir, entry));
    }
  }

  const actionsDir = join(GITHUB_DIR, "actions");
  for (const entry of readdirSync(actionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const fileName of ["action.yml", "action.yaml"]) {
      const candidate = join(actionsDir, entry.name, fileName);
      if (existsSync(candidate)) paths.push(candidate);
    }
  }

  return paths;
}

function collectShellSteps(): ShellStep[] {
  const steps: ShellStep[] = [];

  for (const path of collectYamlPaths()) {
    const source = path.slice(process.cwd().length + 1).replaceAll("\\", "/");
    const document = Bun.YAML.parse(readFileSync(path, "utf8"));
    if (!isRecord(document)) continue;

    const workflowShell = readDefaultShell(document);

    const pushSteps = (
      rawSteps: unknown,
      inheritedShell: string | null,
    ): void => {
      if (!Array.isArray(rawSteps)) return;
      for (const rawStep of rawSteps) {
        if (!isRecord(rawStep)) continue;
        const run = readString(rawStep, "run");
        if (run === null) continue;
        steps.push({
          source,
          name:
            readString(rawStep, "name") ?? run.split("\n")[0] ?? "(unnamed)",
          run,
          shell: readString(rawStep, "shell") ?? inheritedShell,
        });
      }
    };

    const jobs = document["jobs"];
    if (isRecord(jobs)) {
      for (const job of Object.values(jobs)) {
        if (!isRecord(job)) continue;
        pushSteps(job["steps"], readDefaultShell(job) ?? workflowShell);
      }
    }

    // composite action は `runs.steps[]`（各 step は shell 必須）
    const runs = document["runs"];
    if (isRecord(runs)) pushSteps(runs["steps"], workflowShell);
  }

  return steps;
}

/**
 * シェルのパイプが含まれるか。クォート内の `|`（`--jq '.[] | select(…)'` 等）、
 * `#` コメント、論理 OR の `||` は対象外。
 */
function hasShellPipe(script: string): boolean {
  const withoutQuotes = script
    .replace(/'[^']*'/gu, "''")
    .replace(/"(?:\\.|[^"\\])*"/gu, '""');
  const withoutComments = withoutQuotes.replace(/#[^\n]*/gu, "");
  return withoutComments.replaceAll("||", "").includes("|");
}

function enablesPipefail(step: ShellStep): boolean {
  // `shell: bash` は `bash --noprofile --norc -eo pipefail {0}` に展開される。
  // `sh` / `pwsh` 等は pipefail を持たないため bash 系のみ許可する。
  if (step.shell !== null && /^bash\b/u.test(step.shell)) return true;
  return /\bset\b[^\n]*\bpipefail\b/u.test(step.run);
}

const shellSteps = collectShellSteps();

describe("GitHub Actions shell pipelines", () => {
  test("enumerates run: steps from every workflow and composite action", () => {
    // 収集ロジックが壊れて 0 件になると、以降の gate が空振りで緑になる。
    expect(shellSteps.length).toBeGreaterThan(10);
    expect(shellSteps.map((step) => step.source)).toContain(
      ".github/workflows/ci.yml",
    );
  });

  test("never lets a pipeline swallow a non-zero exit code", () => {
    const offenders = shellSteps
      .filter((step) => hasShellPipe(step.run) && !enablesPipefail(step))
      .map((step) => `${step.source} :: ${step.name}`);

    // 既定 shell (`bash -e {0}`) は pipefail を持たないため、パイプを含む run: は
    // 本文に `set -o pipefail` を書くか `shell: bash` を明示する必要がある。
    expect(offenders).toEqual([]);
  });
});

describe("Dependency Audit (bun audit) gate", () => {
  const auditStep = shellSteps.find(
    (step) =>
      step.source === ".github/workflows/ci.yml" &&
      /\bbun audit\b/u.test(step.run),
  );

  test("exists as a run: step in ci.yml", () => {
    expect(auditStep).toBeDefined();
  });

  test("propagates the bun audit exit code through the tee pipeline", () => {
    expect(auditStep && enablesPipefail(auditStep)).toBe(true);
  });

  test("uses the real bun audit severity flag", () => {
    // `--severity` は bun audit に存在しないフラグで、bun は未知フラグを黙って無視する。
    // 正しくは `--audit-level`（https://bun.com/docs/install/audit）。
    expect(auditStep?.run).toContain("--audit-level=high");
    expect(auditStep?.run).not.toContain("--severity");
  });

  test("stays registered as a required status check", () => {
    const branchProtection = readFileSync(
      join(GITHUB_DIR, "branch-protection.json"),
      "utf8",
    );
    expect(branchProtection).toContain("Dependency Audit (bun audit)");
  });
});
