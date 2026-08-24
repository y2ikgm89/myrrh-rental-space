import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW = {
  ci: [
    "Dependency Audit (bun audit)",
    "Migration Safety (squawk)",
    "Lint & Format",
    "Type Check",
    "Unit Tests",
    "Smoke E2E (critical path)",
    "Build (env validation)",
  ],
  terraform: ["Terraform / validate"],
  actionlint: ["Validate GitHub Actions workflows"],
} as const;

const REQUIRED_STATUS_CONTEXTS = [
  ...REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.ci,
  ...REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.terraform,
  ...REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.actionlint,
];

/** `on:` 直下の `merge_group:`。コメント内の言及を拾わないよう行頭固定。 */
const MERGE_GROUP_TRIGGER = /^ {2}merge_group:\s*$/mu;

const ciWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "ci.yml"),
  "utf8",
);
const terraformWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "terraform.yml"),
  "utf8",
);
const actionlintWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "actionlint.yml"),
  "utf8",
);
const migrationLintScript = readFileSync(
  join(process.cwd(), "scripts", "lint-migrations.ts"),
  "utf8",
);
const squawkConfig = readFileSync(join(process.cwd(), ".squawk.toml"), "utf8");
const migrationFixtureNotes = ["safe.sql", "unsafe.sql", "ignored.sql"].map(
  (fileName) => {
    return readFileSync(
      join(process.cwd(), "scripts", "lint-migrations.fixtures", fileName),
      "utf8",
    );
  },
);

function extractJob(jobName: string): string {
  const startMarker = `  ${jobName}:\n`;
  const start = ciWorkflow.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`CI job not found: ${jobName}`);
  }
  const nextJob = ciWorkflow
    .slice(start + startMarker.length)
    .search(/\n  [a-zA-Z0-9_-]+:\n/u);
  return nextJob === -1
    ? ciWorkflow.slice(start)
    : ciWorkflow.slice(start, start + startMarker.length + nextJob);
}

describe("CI workflow contract", () => {
  test("branch-protection required contexts pin the merge-blocking checks", () => {
    const bp = JSON.parse(
      readFileSync(
        join(process.cwd(), ".github/branch-protection.json"),
        "utf8",
      ),
    ) as { required_status_checks: { contexts: string[] } };
    expect(bp.required_status_checks.contexts).toEqual([
      ...REQUIRED_STATUS_CONTEXTS,
    ]);
  });

  test("required status contexts exist as workflow job names", () => {
    for (const context of REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.ci) {
      expect(ciWorkflow).toContain(`name: ${context}`);
    }
    for (const context of REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.terraform) {
      expect(terraformWorkflow).toContain(`name: ${context}`);
    }
    for (const context of REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.actionlint) {
      expect(actionlintWorkflow).toContain(`name: ${context}`);
    }
  });

  /**
   * merge queue は `merge_group` イベントで required check を評価する。
   *
   * required check を出す workflow が `merge_group` を trigger に持たないと、
   * queue 内でその check が **MISSING** になり、**queue は何一つマージできないまま
   * timeout する**。required check に paths filter を付けたとき（PR #1103）と同じ壊れ方で、
   * しかも今回は影響がリポジトリ全体に及ぶ。
   */
  test("required check を出す workflow は merge_group を trigger に持つ", () => {
    const byWorkflow = [
      ["ci.yml", ciWorkflow],
      ["terraform.yml", terraformWorkflow],
      ["actionlint.yml", actionlintWorkflow],
    ] as const;

    // 走査規模の下限。required context が 0 件なら以下は素通りする。
    expect(REQUIRED_STATUS_CONTEXTS.length).toBeGreaterThan(8);

    for (const [name, source] of byWorkflow) {
      expect(
        MERGE_GROUP_TRIGGER.test(source),
        `${name}: on: に merge_group が無い`,
      ).toBe(true);
    }
  });

  /**
   * `if:` で event 名を列挙している required job は、`merge_group` を落としていないこと。
   *
   * trigger を追加しても job 側の `if:` が `pull_request` / `push` だけを許していると、
   * job が skip ではなく **生成されない** ので check は MISSING のまま。
   * 実際 `Build (env validation)` がこの形だった。
   */
  test("event 名を列挙する required job は merge_group を許している", () => {
    const CI_JOB_IDS: Record<string, string> = {
      "Dependency Audit (bun audit)": "dependency-audit",
      "Migration Safety (squawk)": "migration-safety",
      "Lint & Format": "lint-format",
      "Type Check": "type-check",
      "Unit Tests": "unit-tests",
      "Smoke E2E (critical path)": "smoke-e2e",
      "Build (env validation)": "build",
    };

    // 写写した対応表が required context を取りこぼしていないこと。
    expect(Object.keys(CI_JOB_IDS).toSorted()).toEqual(
      [...REQUIRED_STATUS_CONTEXTS_BY_WORKFLOW.ci].toSorted(),
    );

    const offenders = Object.entries(CI_JOB_IDS).flatMap(([context, jobId]) => {
      const job = extractJob(jobId);
      // `if:` で event 名を見ていない job は全 event で走るので対象外。
      if (!job.includes("github.event_name ==")) return [];
      return job.includes("github.event_name == 'merge_group'")
        ? []
        : [`${context} (${jobId})`];
    });

    expect(offenders).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    const withTrigger = ["on:", "  pull_request:", "  merge_group:"].join("\n");
    const withoutTrigger = ["on:", "  pull_request:"].join("\n");
    const commentOnly = ["on:", "  # merge_group: をあとで足す"].join("\n");

    expect(MERGE_GROUP_TRIGGER.test(withTrigger)).toBe(true);
    expect(MERGE_GROUP_TRIGGER.test(withoutTrigger)).toBe(false);
    // コメント内の言及だけでは成立しないこと。
    expect(MERGE_GROUP_TRIGGER.test(commentOnly)).toBe(false);
  });

  test("uses split lint and type-check checks without legacy compatibility shims", () => {
    expect(ciWorkflow).toContain("lint-format:");
    expect(ciWorkflow).toContain("name: Lint & Format");
    expect(ciWorkflow).toContain("type-check:");
    expect(ciWorkflow).toContain("name: Type Check");
    expect(ciWorkflow).not.toContain("name: Lint & Type Check");
    expect(ciWorkflow).not.toMatch(/backwards?-compat/iu);
    expect(ciWorkflow).not.toMatch(/compat(?:ibility)? shim/iu);
  });

  test("uses an exclusion filter that can actually report code=false", () => {
    const changesJob = extractJob("changes");
    const filterPatterns = [...changesJob.matchAll(/^\s+- '([^']+)'$/gmu)]
      .map((match) => match[1])
      .filter((pattern): pattern is string => pattern !== undefined);

    expect(filterPatterns.length).toBeGreaterThan(0);
    // `code` フィルタは除外リスト（全ルールが `!` prefix）で構成されている。
    expect(filterPatterns.every((pattern) => pattern.startsWith("!"))).toBe(
      true,
    );
    // 除外リストは predicate-quantifier: every でのみ意図どおり動く。
    // 既定の `some`（いずれか 1 ルールに一致で true）だと、.md しか変わらない PR でも
    // 「`!docs/**` に一致（= docs 配下ではない）」で必ず true になり gate が no-op 化する。
    // https://github.com/dorny/paths-filter
    expect(changesJob).toContain('predicate-quantifier: "every"');
  });

  test("runs lint and format together inside the lint-format job", () => {
    const lintFormatJob = extractJob("lint-format");

    expect(lintFormatJob).toContain("run: bun run lint-format");
    expect(lintFormatJob).not.toMatch(/^\s*run: bun run format:check$/mu);
    expect(lintFormatJob).not.toMatch(/^\s*run: bun run lint$/mu);
  });

  test("only hands added or modified migrations to squawk", () => {
    const migrationJob = extractJob("migration-safety");

    // paths-filter の既定 change type は **deleted も含む**。履歴を 1 本の baseline へ
    // 畳む PR は 99 本を削除して 1 本を追加するので、絞らないと実体の無いパスが
    // squawk に渡って job が落ちる。削除された migration は lint しようが無い。
    expect(migrationJob).toContain(
      "added|modified: 'prisma/migrations/**/migration.sql'",
    );
    expect(migrationJob).not.toMatch(
      /^\s+- 'prisma\/migrations\/\*\*\/migration\.sql'$/mu,
    );
  });

  test("describes migration safety as an explicit destructive-change gate", () => {
    const migrationSafetyText = [
      ciWorkflow,
      migrationLintScript,
      squawkConfig,
      ...migrationFixtureNotes,
    ].join("\n");

    expect(migrationSafetyText).toContain("意図的な破壊的 migration");
    expect(migrationSafetyText).toContain("squawk-ignore");
    expect(migrationSafetyText).toContain("squawk-ignore-file");
    expect(migrationSafetyText).not.toContain("後方互換ゲート");
    expect(migrationSafetyText).not.toContain("後方互換でない");
    expect(migrationSafetyText).not.toContain("後方互換な変更");
    expect(migrationSafetyText).not.toContain("後方互換");
  });

  test("does not run redundant Prisma generate before package scripts that already generate", () => {
    const typeCheckJob = extractJob("type-check");
    const unitTestsJob = extractJob("unit-tests");
    const buildJob = extractJob("build");
    const bundleAnalysisJob = extractJob("bundle-analysis");

    expect(typeCheckJob).toContain("run: bun run type-check");
    expect(typeCheckJob).not.toContain("Generate Prisma client");
    expect(unitTestsJob).toContain("run: bun run test:all");
    expect(unitTestsJob).not.toContain("run: bun run test:unit");
    expect(unitTestsJob).not.toContain("run: bun run test:integration");
    expect(unitTestsJob).not.toContain("Generate Prisma client");
    expect(unitTestsJob).not.toContain("run: bunx --bun prisma migrate deploy");

    expect(buildJob).toContain("run: bun run build");
    expect(buildJob).not.toContain("Generate Prisma client");
    expect(bundleAnalysisJob).toContain("run: bun run analyze");
    expect(bundleAnalysisJob).not.toContain("Generate Prisma client");
  });

  test("prepared skip-env build を使う job は自分で Prisma client を生成する", () => {
    // `build:skip-env:prepared` は `prisma generate` を**含まない**（"prepared" の意味）。
    // 生成 step を job から落とすと、build が生成済み client を前提に落ちる。
    for (const jobName of [
      "smoke-e2e",
      "e2e-tests",
      "visual-regression",
      "lighthouse-ci",
    ]) {
      const job = extractJob(jobName);

      expect(job).toContain("run: bun run build:skip-env:prepared");
      expect(job).toContain("Generate Prisma client");
      expect(job).not.toContain("run: bun run build:skip-env\n");
    }

    const bundleSizeDiffJob = extractJob("bundle-size-diff");
    expect(bundleSizeDiffJob).toContain('build-script: "build:skip-env"');
  });

  test("Playwright webServer を使う job は migrate / seed を二重に流さない", () => {
    // chain（`playwright.config.ts`）が `test:db:migrate` →
    // `bun prisma/seed.ts --dev` を**毎回**実行する。job 側にも置くと同じ DB を
    // 2 度作り直すだけになる（`prisma db seed` は引数なし = dev モードで同一経路）。
    for (const jobName of ["smoke-e2e", "e2e-tests", "visual-regression"]) {
      const job = extractJob(jobName);

      expect(job).not.toContain("run: bunx --bun prisma migrate deploy");
      expect(job).not.toContain("run: bunx --bun prisma db seed");
    }

    // Lighthouse は chain を通らない（`scripts/lhci-start.ts` は `next start` と
    // readiness poll だけ）ので、この 2 step が**唯一の DB 準備**。外すと
    // 空の DB に対して計測することになる。
    const lighthouseJob = extractJob("lighthouse-ci");
    expect(lighthouseJob).toContain("run: bunx --bun prisma migrate deploy");
    expect(lighthouseJob).toContain("run: bunx --bun prisma db seed");

    // **依存している側だけでなく、依存されている側も見る。** chain から seed が
    // 消えたら「どちらにも無い」状態になるので、ここで落とす。
    const playwrightConfig = readFileSync(
      join(process.cwd(), "playwright.config.ts"),
      "utf8",
    );
    expect(playwrightConfig).toContain("bun run test:db:migrate");
    expect(playwrightConfig).toContain("bun prisma/seed.ts --dev");
  });
});
