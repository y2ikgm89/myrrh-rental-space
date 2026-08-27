/**
 * `hashicorp/setup-terraform` の既定 wrapper は `-detailed-exitcode` を無効化する。
 *
 * ## なぜ
 *
 * wrapper (`wrapper/terraform.js`) は terraform を実行したあと
 *
 * ```js
 * if (exitCode === 0 || exitCode === 2) {
 *   return;
 * }
 * core.setFailed(`Terraform exited with code ${exitCode}.`);
 * ```
 *
 * と書かれており、**2 を成功として `return` する**。Node プロセスはそのまま 0 で
 * 終了するため、`terraform plan -detailed-exitcode` の「差分あり = 2」は
 * シェルの `$?` からは **必ず 0 に見える**。真の値は step の `exitcode` output に
 * しか現れず、しかも同じ step が自前で `exitcode=` を `$GITHUB_OUTPUT` へ書くと
 * 後勝ちで潰れる。
 *
 * 実害: `terraform-drift.yml` は毎晩 read-only plan を走らせ
 * `exitcode == '2'` のときだけ drift Issue を開く設計だったが、
 * 2026-08-22〜08-26 の全 run が `Plan: 27 to add, 4 to change, 0 to destroy.` 等の
 * **非空 plan を出しながら** `No drift (exit 0)` を報告していた。
 * つまり drift 検知は一度も発火し得なかった。
 *
 * ## 何を見るか
 *
 * workflow の **job 単位**で次の 2 つを対にして見る。
 *
 * 1. その job の `run:` が（コメント行を除いて）`-detailed-exitcode` を実行しているか
 * 2. 同じ job の `hashicorp/setup-terraform` step が wrapper を無効化しているか
 *
 * action 側は `core.getInput('terraform_wrapper') === 'true'` で判定するので、
 * `true` 以外なら wrapper は入らない。既定値が `'true'` のため **未指定は違反**。
 * setup-terraform を使わない job は wrapper と無縁なので対象外。
 *
 * ## 直し方
 *
 * その job の setup step に `terraform_wrapper: false` を足す。
 * wrapper の `stdout` / `stderr` / `exitcode` output が必要な場合だけ wrapper を
 * 残し、`$?` ではなく `steps.<id>.outputs.exitcode` を読む形に変える
 * （その場合は自前で `exitcode=` を `$GITHUB_OUTPUT` へ書かないこと。後勝ちで潰れる）。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

type Job = {
  readonly source: string;
  readonly name: string;
  readonly steps: readonly Record<string, unknown>[];
};

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");
const SETUP_TERRAFORM = "hashicorp/setup-terraform@";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `#` で始まる行を落とす。コメント内の言及で誤検知しないため。 */
function stripComments(script: string): string {
  return script
    .split("\n")
    .filter((line) => !/^\s*#/u.test(line))
    .join("\n");
}

function collectJobs(document: unknown, source: string): Job[] {
  if (!isRecord(document)) return [];
  const jobs = document["jobs"];
  if (!isRecord(jobs)) return [];

  const collected: Job[] = [];
  for (const [name, job] of Object.entries(jobs)) {
    if (!isRecord(job)) continue;
    const steps = job["steps"];
    collected.push({
      source,
      name,
      steps: Array.isArray(steps) ? steps.filter(isRecord) : [],
    });
  }
  return collected;
}

function readWorkflowJobs(): Job[] {
  const jobs: Job[] = [];
  for (const entry of readdirSync(WORKFLOWS_DIR)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const document = Bun.YAML.parse(
      readFileSync(join(WORKFLOWS_DIR, entry), "utf8"),
    );
    jobs.push(...collectJobs(document, entry));
  }
  return jobs;
}

function usesDetailedExitcode(job: Job): boolean {
  return job.steps.some((step) => {
    const run = step["run"];
    return (
      typeof run === "string" &&
      stripComments(run).includes("-detailed-exitcode")
    );
  });
}

/** wrapper が入るのは `terraform_wrapper` が文字列 `"true"` に評価されるときだけ。 */
function wrapperIsDisabled(job: Job): boolean {
  const setup = job.steps.find((step) => {
    const uses = step["uses"];
    return typeof uses === "string" && uses.startsWith(SETUP_TERRAFORM);
  });
  // setup-terraform を通していない job には wrapper が存在しない。
  if (setup === undefined) return true;

  const withBlock = setup["with"];
  if (!isRecord(withBlock)) return false;
  const value = withBlock["terraform_wrapper"];
  // 未指定は action 既定の `'true'` = wrapper 有効。
  if (value === undefined) return false;
  return String(value) !== "true";
}

function findViolations(jobs: readonly Job[]): string[] {
  return jobs
    .filter((job) => usesDetailedExitcode(job) && !wrapperIsDisabled(job))
    .map((job) => `${job.source} :: ${job.name}`);
}

function parseFixture(yaml: string): Job[] {
  return collectJobs(Bun.YAML.parse(yaml), "fixture.yml");
}

/**
 * 2026-08 に実在した形。setup step が `terraform_version` だけを渡しており、
 * plan の `$?` は非空 plan でも 0 になっていた。
 */
const ORIGINAL_DEFECT_SHAPE = `
jobs:
  drift-detect:
    steps:
      - name: Set up Terraform
        uses: hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e # v4.0.1
        with:
          terraform_version: 1.15.9
      - name: Terraform drift detection
        id: plan
        run: |
          set +e
          terraform plan -detailed-exitcode -lock=false -no-color -out=drift.plan
          EXITCODE=$?
          set -e
          echo "exitcode=$EXITCODE" >> "$GITHUB_OUTPUT"
`;

const workflowJobs = readWorkflowJobs();

describe("setup-terraform wrapper と -detailed-exitcode", () => {
  test("scans every workflow job", () => {
    // 走査が壊れて 0 件になると、以降の gate が空振りで緑になる。
    expect(workflowJobs.length).toBeGreaterThan(20);
    expect(workflowJobs.map((job) => job.source)).toContain(
      "terraform-drift.yml",
    );
  });

  test("reaches the jobs that actually pass -detailed-exitcode", () => {
    // 走査規模とは別の層。判定式に届いた候補が 0 件でも上の下限は満たせてしまう。
    const reached = workflowJobs
      .filter(usesDetailedExitcode)
      .map((job) => `${job.source} :: ${job.name}`);

    expect(reached.length).toBeGreaterThanOrEqual(2);
    expect(reached).toContain("terraform-drift.yml :: drift-detect");
    expect(reached).toContain("deploy-production.yml :: terraform-apply");
  });

  test("never lets the wrapper swallow exit code 2", () => {
    expect(findViolations(workflowJobs)).toEqual([]);
  });

  test("rejects the shape that actually shipped", () => {
    expect(findViolations(parseFixture(ORIGINAL_DEFECT_SHAPE))).toEqual([
      "fixture.yml :: drift-detect",
    ]);
  });

  test("rejects an explicit terraform_wrapper: true", () => {
    const yaml = ORIGINAL_DEFECT_SHAPE.replace(
      "terraform_version: 1.15.9",
      "terraform_version: 1.15.9\n          terraform_wrapper: true",
    );
    expect(findViolations(parseFixture(yaml))).toEqual([
      "fixture.yml :: drift-detect",
    ]);
  });

  test("accepts the same job once the wrapper is disabled", () => {
    const yaml = ORIGINAL_DEFECT_SHAPE.replace(
      "terraform_version: 1.15.9",
      "terraform_version: 1.15.9\n          terraform_wrapper: false",
    );
    expect(findViolations(parseFixture(yaml))).toEqual([]);
  });

  test("leaves jobs that never ask for -detailed-exitcode alone", () => {
    // 実在の witness: terraform.yml の validate job は wrapper 既定のままだが
    // `-detailed-exitcode` を使わないので違反ではない。
    const validate = workflowJobs.find(
      (job) => job.source === "terraform.yml" && job.name === "validate",
    );
    expect(validate).toBeDefined();
    expect(validate && wrapperIsDisabled(validate)).toBe(false);
    expect(findViolations(validate ? [validate] : [])).toEqual([]);
  });
});
