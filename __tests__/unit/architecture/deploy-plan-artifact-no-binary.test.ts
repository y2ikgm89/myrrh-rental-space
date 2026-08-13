/**
 * Terraform の binary plan を GitHub Actions の artifact に載せない。
 *
 * ## なぜ
 *
 * `terraform plan -out=<file>` が作る saved plan file は、`sensitive = true` の値も
 * **平文で**保持する。伏せられるのは terminal 描画だけで、ファイル自体は伏せない。
 * 公式が明記している:
 * https://developer.hashicorp.com/terraform/cli/commands/plan
 * >  If your plan includes any sort of sensitive data, even if obscured in
 * >  Terraform's terminal output, it will be saved in cleartext in the plan file.
 *
 * このリポジトリは public で、Actions の artifact は GitHub アカウントさえあれば
 * 誰でもダウンロードできる。`deploy-production.yml` と `terraform-drift.yml` は
 * `TF_VAR_cloudflare_origin_header_secret`（Cloud Run 側 Secret Manager
 * `CLOUDFLARE_ORIGIN_HEADER_SECRET` と同一値・rate-limit trust chain の共有鍵）を
 * plan に渡しているため、binary plan を artifact に載せると本番の共有 secret が公開される。
 * 実際に載っていた（2026-07-24〜08-08 の 20 本以上の artifact が未期限で残存）。
 *
 * `deploy-production.yml` の "Verify plan does not leak secret values" step は
 * これを検知**できない**。あの grep が見るのは `terraform show` の text 描画で、
 * sensitive 値はそこでは `(sensitive value)` に伏せられているため、原理的に素通りする。
 * つまり「grep gate があるから安全」という以前の前提が誤りだった。
 *
 * ## 何を見るか
 *
 * `.github/workflows/**` を走査し、workflow ごとに:
 *
 * 1. `run:` の中の `terraform plan ... -out=<name>` から binary plan の**ファイル名を発見する**。
 *    名前をハードコードしないので、`tfplan` を別名に改名しても検査は効く。
 * 2. `actions/upload-artifact` step の `with.path` を全部集める。
 * 3. その path が binary plan を含みうるなら違反とする。
 *
 * glob（`*` を含む）と末尾 `/` のディレクトリ指定は「含みうる」として fail-closed に倒す。
 * upload-artifact の除外構文（`!path`）で当該 plan を明示的に外している場合だけ、
 * その plan については違反としない（allowlist ではなく upload-artifact 自身の意味論）。
 *
 * ## 直し方
 *
 * artifact に載せるのは text 描画だけにする:
 * `terraform show -no-color <plan> > <name>.txt` の出力ファイルを path に指定する。
 * `terraform apply` は同一 job のローカル plan ファイルを読むので、artifact に
 * 含めなくても apply は成立する。
 * glob で落ちた場合は path を実ファイル名まで絞るか、`!<plan>` で明示的に除外する。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");

type Step = Record<string, unknown>;

type ArtifactUpload = {
  readonly stepLabel: string;
  /** `!` を除いた取り込み対象 */
  readonly includes: readonly string[];
  /** `!` 付きで明示的に外されたもの（`!` は除去済み） */
  readonly excludes: readonly string[];
};

type Violation = {
  readonly workflow: string;
  readonly stepLabel: string;
  readonly path: string;
  readonly planFile: string;
  readonly reason: "直接指定" | "glob/ディレクトリ指定で含みうる";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectSteps(document: unknown): Step[] {
  if (!isRecord(document)) return [];
  const jobs = document["jobs"];
  if (!isRecord(jobs)) return [];
  const steps: Step[] = [];
  for (const job of Object.values(jobs)) {
    if (!isRecord(job)) continue;
    const list = job["steps"];
    if (!Array.isArray(list)) continue;
    for (const step of list) if (isRecord(step)) steps.push(step);
  }
  return steps;
}

/** `-out=foo` / `-out foo` / `-out="foo"` のいずれも拾う */
const PLAN_OUT_PATTERN = /-out(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"']+))/g;

/** `terraform plan` が書き出す binary plan の**ファイル名**（ディレクトリ部は落とす） */
function collectPlanFileNames(steps: readonly Step[]): string[] {
  const names = new Set<string>();
  for (const step of steps) {
    const run = step["run"];
    if (typeof run !== "string") continue;
    if (!/\bterraform\s+plan\b/u.test(run)) continue;
    for (const match of run.matchAll(PLAN_OUT_PATTERN)) {
      const raw = match[1] ?? match[2] ?? match[3];
      const base = raw?.split("/").pop();
      if (base) names.add(base);
    }
  }
  return [...names];
}

/** flow 形式で `"!terraform/tfplan"` のように引用されていても同じに扱う */
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

function collectArtifactUploads(steps: readonly Step[]): ArtifactUpload[] {
  const uploads: ArtifactUpload[] = [];
  for (const step of steps) {
    const uses = step["uses"];
    if (typeof uses !== "string" || !uses.startsWith("actions/upload-artifact"))
      continue;
    const withBlock = step["with"];
    const entries = splitPathEntries(
      isRecord(withBlock) ? withBlock["path"] : undefined,
    );
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
    });
  }
  return uploads;
}

function basenameOf(path: string): string {
  return path.replace(/\/+$/u, "").split("/").pop() ?? path;
}

/** glob か、ディレクトリを丸ごと指しているか（= 中身を静的に確定できない） */
function mayExpandToUnknownFiles(path: string): boolean {
  return path.includes("*") || path.endsWith("/");
}

/**
 * workflow 1 本ぶんの判定。fixture からも実 workflow からも同じ関数を通す。
 */
function findBinaryPlanArtifactViolations(
  workflowName: string,
  document: unknown,
): Violation[] {
  const steps = collectSteps(document);
  const planFiles = collectPlanFileNames(steps);
  if (planFiles.length === 0) return [];

  const violations: Violation[] = [];
  for (const upload of collectArtifactUploads(steps)) {
    for (const planFile of planFiles) {
      if (upload.excludes.some((entry) => basenameOf(entry) === planFile))
        continue;
      for (const included of upload.includes) {
        if (basenameOf(included) === planFile) {
          violations.push({
            workflow: workflowName,
            stepLabel: upload.stepLabel,
            path: included,
            planFile,
            reason: "直接指定",
          });
        } else if (mayExpandToUnknownFiles(included)) {
          violations.push({
            workflow: workflowName,
            stepLabel: upload.stepLabel,
            path: included,
            planFile,
            reason: "glob/ディレクトリ指定で含みうる",
          });
        }
      }
    }
  }
  return violations;
}

function formatViolations(violations: readonly Violation[]): string[] {
  return violations.map(
    (violation) =>
      `${violation.workflow} / "${violation.stepLabel}" の path "${violation.path}" が binary plan "${violation.planFile}" を ${violation.reason}`,
  );
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

describe("deploy: Terraform の binary plan を artifact に載せない", () => {
  test("走査対象の workflow が存在する（空振り防止）", () => {
    expect(workflowFiles.length).toBeGreaterThan(4);
  });

  test("terraform plan を binary 保存している workflow を実際に検出できている（空振り防止）", () => {
    const producing = workflows.filter(
      ({ document }) => collectPlanFileNames(collectSteps(document)).length > 0,
    );
    // deploy-production.yml と terraform-drift.yml の 2 本。
    // ここが 0 になったら、YAML 構造か `-out=` の書き方が変わって検査が空振りしている。
    expect(producing.length).toBeGreaterThanOrEqual(2);
  });

  test("upload-artifact step を実際に検出できている（空振り防止）", () => {
    const uploadCount = workflows.reduce(
      (total, { document }) =>
        total + collectArtifactUploads(collectSteps(document)).length,
      0,
    );
    expect(uploadCount).toBeGreaterThan(2);
  });

  test("どの workflow も binary plan を artifact に載せていない", () => {
    const violations = workflows.flatMap(({ fileName, document }) =>
      findBinaryPlanArtifactViolations(fileName, document),
    );
    expect(formatViolations(violations)).toEqual([]);
  });
});

describe("deploy: 判定の見本", () => {
  const withPath = (planOut: string, path: string) =>
    Bun.YAML.parse(`
jobs:
  deploy:
    steps:
      - name: Terraform plan
        run: terraform plan ${planOut}
      - name: Upload plan artifact
        uses: actions/upload-artifact@v7.0.1
        with:
          name: plan
          path: ${path}
`) as unknown;

  test("落ちるべき: binary plan を直接 path に書いている", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath(
        "-out=tfplan",
        "|\n            terraform/tfplan\n            terraform/tfplan.txt",
      ),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("直接指定");
  });

  test("落ちるべき: plan を改名しても検出する（名前をハードコードしていない証明）", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath("-out=custom-name.plan", "terraform/custom-name.plan"),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.planFile).toBe("custom-name.plan");
  });

  test("落ちるべき: glob で binary plan を含みうる", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath("-out=tfplan", "terraform/*"),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("glob/ディレクトリ指定で含みうる");
  });

  test("落ちてはいけない: text 描画だけを載せている", () => {
    expect(
      findBinaryPlanArtifactViolations(
        "fixture.yml",
        withPath("-out=tfplan", "terraform/tfplan.txt"),
      ),
    ).toEqual([]);
  });

  test("落ちてはいけない: glob でも binary plan を明示的に除外している", () => {
    // `path: |` は YAML のリテラルブロックなので、除外は引用符なしで書く
    // （引用符を付けると文字の一部になり、upload-artifact 側でもパスが一致しない）。
    expect(
      findBinaryPlanArtifactViolations(
        "fixture.yml",
        withPath(
          "-out=tfplan",
          "|\n            terraform/*\n            !terraform/tfplan",
        ),
      ),
    ).toEqual([]);
  });

  test("落ちてはいけない: terraform plan を binary 保存していない workflow", () => {
    expect(
      findBinaryPlanArtifactViolations(
        "fixture.yml",
        Bun.YAML.parse(`
jobs:
  build:
    steps:
      - name: Build
        run: bun run build
      - uses: actions/upload-artifact@v7.0.1
        with:
          path: dist/
`) as unknown,
      ),
    ).toEqual([]);
  });
});
