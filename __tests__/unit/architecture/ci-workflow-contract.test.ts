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

/**
 * 変更パス由来の gate。`g` フラグを付けない — `RegExp.test` は `g` があると
 * `lastIndex` を持ち越し、同じ入力でも呼ぶたび結果が変わる。
 */
const PATH_GATE_PATTERN = /paths-filter|outputs\.code/u;

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

  /**
   * **`required_status_checks.strict` は false に固定する。**
   *
   * ## なぜ散文でなく gate なのか
   *
   * この判断は 1 度 revert されている。
   *
   * - 2026-05-30: auto-merge の PR が 14 件全部 BEHIND で永久停止したので strict を外した。
   *   理由は CI の job 戦略を書いた文書（PR #335）に残したが、**そのファイルは後に消えた**。
   *   だからここにある。
   * - 2026-08-21 (#2461): 「Renovate は behind なら自分で rebase するので auto-merge は壊れない」
   *   として strict を戻した。これは **Renovate PR にしか当てはまらない**。
   *   人が作った PR を rebase するものは存在しない。
   * - 2026-08-24: 実際に同じ停止が再現した。auto-merge 有効の 14 PR が
   *   1 時間 48 分マージ 0 件。全件 fail=0 で BEHIND 。
   *
   * 散文は削られる。gate なら 3 度目の flip がテストで落ちる。
   *
   * ## strict を保ったまま直す方法は無いのか
   *
   * GitHub の公式解は merge queue だが、**user-owned repository では使えない**（実測）。
   * rulesets API に `merge_queue` rule を投げると、パラメータを何にしても
   * `422 Invalid rule 'merge_queue'`。同じ envelope で `deletion` rule なら作成できる。
   * （queue を導入するなら required check を出す workflow に `merge_group` trigger が必要。
   *   無いと check が MISSING になって queue が何もマージできない。試作は closed PR #2604。）
   *
   * ## 失うものと、その受け皿
   *
   * 古い base で緑になった PR がマージできる（semantic conflict は事前に止まらない）。
   * 受け皿は main への push で毎回 full CI が走ること。検知は数分で、その場で直せる。
   */
  test("required_status_checks.strict は false（auto-merge の永久停止を作らない）", () => {
    const bp = JSON.parse(
      readFileSync(
        join(process.cwd(), ".github/branch-protection.json"),
        "utf8",
      ),
    ) as { required_status_checks: { strict: boolean } };

    expect(bp.required_status_checks.strict).toBe(false);
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

  test("uses split lint and type-check checks without legacy compatibility shims", () => {
    expect(ciWorkflow).toContain("lint-format:");
    expect(ciWorkflow).toContain("name: Lint & Format");
    expect(ciWorkflow).toContain("type-check:");
    expect(ciWorkflow).toContain("name: Type Check");
    expect(ciWorkflow).not.toContain("name: Lint & Type Check");
    expect(ciWorkflow).not.toMatch(/backwards?-compat/iu);
    expect(ciWorkflow).not.toMatch(/compat(?:ibility)? shim/iu);
  });

  /**
   * required check の検証 step は、変更パスを理由に skip されない。
   *
   * ## なぜ
   *
   * 旧 `changes` job は dorny/paths-filter で「コード変更なし」を判定し、
   * `unit-tests` / `build` / `smoke-e2e` などの重い step を丸ごと skip していた。
   * **job 自体は走るので conclusion は success** になり、required check は緑のまま
   * 何ひとつ検証しない。CLAUDE.md が「CI が緑でもテストが走ったとは限らない」と
   * 明記していたほど、実際に踏まれ続けた形。
   *
   * 除外リストは markdown 全体と `docs` 配下を含んでいたため、md を読む
   * architecture gate（`observability-docs-alert-names` など）が docs のみの PR で
   * 一度も走らないまま merge できた。
   * （除外パターンをそのまま引用しない — glob の `*` と `/` が JSDoc を
   * 途中で閉じる。実際にこの docstring で踏んだ。）
   *
   * 実測（2026-08-24、main への push 8 本）: docs のみの run は 3.8 分、コード変更
   * ありは 6.6〜7.3 分。job と postgres service は skip 時も起動するので、
   * 節約できていたのは **約 3 分だけ**だった。
   *
   * ## 何を見るか
   *
   * 入力範囲に依存しない検証を持つ job（依存監査 / lint / 型 / テスト / smoke /
   * build）が、paths-filter とその出力を参照する `if:` を持たないこと。
   *
   * `migration-safety` は対象外。squawk は migration SQL を読む道具で、SQL が
   * 変わっていなければ何度走らせても同じ結果になるため、skip が見逃しを作らない。
   *
   * ## 直し方
   *
   * 速度が要るならキャッシュか実行対象の絞り込みで縮める。
   * 「変更が無いから検証しない」は required check の意味そのものを壊す。
   */
  test("required check の検証 step は変更パスで skip されない", () => {
    const alwaysVerifyJobs = [
      "dependency-audit",
      "lint-format",
      "type-check",
      "unit-tests",
      "smoke-e2e",
      "build",
    ];
    // 走査が空振りしていないこと。`extractJob` は job 名が無ければ throw するので、
    // 綴り違いは 6 件揃わない形で必ず出る。
    const jobBodies = alwaysVerifyJobs.map((job) => ({
      job,
      body: extractJob(job),
    }));
    expect(
      jobBodies.filter(({ body }) => body.includes("runs-on:")),
    ).toHaveLength(6);

    expect(
      jobBodies
        .filter(({ body }) => PATH_GATE_PATTERN.test(body))
        .map(({ job }) => job),
    ).toEqual([]);
  });

  test("path gate の検出が実際に効く（見本）", () => {
    // 落ちるべき形: 変更パス由来の出力で検証 step を gate している
    expect(
      PATH_GATE_PATTERN.test(
        [
          "    steps:",
          "      - name: Run unit and integration tests",
          "        if: needs.changes.outputs.code == 'true'",
          "        run: bun run test:all",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(
      PATH_GATE_PATTERN.test(
        [
          "      - name: Filter paths",
          "        uses: dorny/paths-filter@v4",
        ].join("\n"),
      ),
    ).toBe(true);

    // 落ちてはいけない形: 無条件に走る検証 step、および event 種別だけの分岐
    expect(
      PATH_GATE_PATTERN.test(
        [
          "    steps:",
          "      - name: Run unit and integration tests",
          "        run: bun run test:all",
        ].join("\n"),
      ),
    ).toBe(false);
    expect(
      PATH_GATE_PATTERN.test("    if: github.event_name == 'pull_request'"),
    ).toBe(false);
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
