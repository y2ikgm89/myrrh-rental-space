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
 * 1. `run:` の中の `terraform plan ... -out=<name>` と、その step に効く
 *    `working-directory`（step 直書き → job の `defaults.run` → workflow の
 *    `defaults.run` の順で解決。`${{ env.X }}` は workflow 直下の `env:` で解決）から、
 *    binary plan の**リポジトリ相対パスを組み立てる**。名前も置き場所もハードコード
 *    しないので、改名しても移動しても検査は効く。
 * 2. `actions/upload-artifact` step の `with.path` を全部集める。
 * 3. その path が plan のパスを**包含するか**で違反を判定する。
 *
 * ファイル名の一致で判定してはいけない。`actions/upload-artifact` の `path` は
 * 「ファイル / ディレクトリ / ワイルドカード」で、**ディレクトリ指定に末尾スラッシュは
 * 要らない**（`path: terraform` と書けば配下が再帰的に上がる）。`./` はリポジトリ全体。
 *
 * 除外（`!path`）も同じ包含判定を通す。basename 比較にすると `!backup/tfplan` のような
 * 無関係な除外が `terraform/tfplan` を守っているように見えてしまう。glob は接頭辞では
 * なく `Bun.Glob` で**実際に一致するか**を見る（`!terraform/*.txt` は `terraform/tfplan`
 * を除外しない）。upload-artifact 本体の glob 実装（`@actions/glob`）とは別実装なので
 * 完全な等価ではないが、この gate が扱う範囲（単純な `*` / `**`）では一致する。
 *
 * ## 直し方
 *
 * artifact に載せるのは text 描画だけにする:
 * `terraform show -no-color <plan> > <name>.txt` の出力ファイルを path に指定する。
 * `terraform apply` は同一 job のローカル plan ファイルを読むので、artifact に
 * 含めなくても apply は成立する。
 * ディレクトリや glob で落ちた場合は path を実ファイルまで絞るか、
 * `!<plan のパス>` で明示的に除外する。
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

type StepContext = {
  readonly step: Step;
  /** job / workflow の `defaults.run.working-directory`（step 側が優先） */
  readonly defaultWorkingDirectory: string | null;
};

/** `defaults.run.working-directory` を読む（workflow / job どちらの階層も同じ形） */
function readDefaultWorkingDirectory(container: unknown): string | null {
  if (!isRecord(container)) return null;
  const defaults = container["defaults"];
  if (!isRecord(defaults)) return null;
  const run = defaults["run"];
  if (!isRecord(run)) return null;
  const workingDirectory = run["working-directory"];
  return typeof workingDirectory === "string" ? workingDirectory : null;
}

/**
 * step を、その step に効く working-directory の既定値とセットで集める。
 *
 * `working-directory` は step に直接書く以外に、job / workflow の
 * `defaults.run.working-directory` でも与えられる。job 側へ移されたときに
 * plan の置き場所を見失わないよう、ここで解決しておく。
 * https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_iddefaultsrunworking-directory
 */
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

/** `-out=foo` / `-out foo` / `-out="foo"` のいずれも拾う */
const PLAN_OUT_PATTERN = /-out(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s"']+))/g;

/** リポジトリ全体を指す正規形（`.` / `./` / `/` / 空）。 */
const REPO_ROOT = ".";

/**
 * 先頭・末尾の `/` を落とし、`./` を畳む。
 * リポジトリ全体を指す綴りは `REPO_ROOT` に寄せる。空文字に潰すと
 * 「何も指していない」と区別できず、`path: ./`（= 全部上がる）を見逃す。
 */
function normalizePath(path: string): string {
  const stripped = path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/u, "")
    .replace(/^\/+|\/+$/gu, "");
  return stripped === "" || stripped === "." ? REPO_ROOT : stripped;
}

/**
 * `${{ env.FOO }}` を workflow 直下の `env:` で解決する。
 * `terraform-drift.yml` の `working-directory: ${{ env.TF_WORKING_DIR }}` がこれ。
 * 解決できない式はそのまま返す（後段が「不明」として fail-closed に倒す）。
 */
function resolveExpressions(
  value: string,
  workflowEnv: Record<string, string>,
): string {
  return value.replace(
    /\$\{\{\s*env\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/gu,
    (whole, name: string) => workflowEnv[name] ?? whole,
  );
}

function readWorkflowEnv(document: unknown): Record<string, string> {
  if (!isRecord(document)) return {};
  const env = document["env"];
  if (!isRecord(env)) return {};
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") resolved[key] = value;
  }
  return resolved;
}

/**
 * `terraform plan` が書き出す binary plan の**リポジトリ相対パス**。
 *
 * ファイル名だけでは足りない。`path: terraform` のようにディレクトリを丸ごと
 * 指定されたとき、それが plan を含むかどうかは plan の置き場所（step の
 * `working-directory`）を知らないと判定できないため。
 */
function collectPlanPaths(
  contexts: readonly StepContext[],
  workflowEnv: Record<string, string>,
): string[] {
  const paths = new Set<string>();
  for (const { step, defaultWorkingDirectory } of contexts) {
    const run = step["run"];
    if (typeof run !== "string") continue;
    if (!/\bterraform\s+plan\b/u.test(run)) continue;
    const stepWorkingDirectory = step["working-directory"];
    const rawWorkingDirectory =
      typeof stepWorkingDirectory === "string"
        ? stepWorkingDirectory
        : defaultWorkingDirectory;
    const baseDir = rawWorkingDirectory
      ? normalizePath(resolveExpressions(rawWorkingDirectory, workflowEnv))
      : REPO_ROOT;
    for (const match of run.matchAll(PLAN_OUT_PATTERN)) {
      const raw = match[1] ?? match[2] ?? match[3];
      if (!raw) continue;
      const relative = normalizePath(raw);
      if (relative === REPO_ROOT) continue;
      paths.add(baseDir === REPO_ROOT ? relative : `${baseDir}/${relative}`);
    }
  }
  return [...paths];
}

/**
 * upload-artifact の path 1 件が、その plan ファイルを取り込むか。
 *
 * `actions/upload-artifact` の `path` は「ファイル / ディレクトリ / ワイルドカード」で、
 * **ディレクトリ指定に末尾スラッシュは要らない**（`terraform` と書けば再帰的に上がる）。
 * したがって「末尾が `/` か」で判定してはいけない。plan の実パスとの包含関係で見る。
 */
function pathCoversPlan(entry: string, planPath: string): boolean {
  const normalized = normalizePath(entry);
  // リポジトリ全体（`path: ./` など）は当然 plan も含む
  if (normalized === REPO_ROOT) return true;
  if (normalized === planPath) return true;
  // ディレクトリ指定（末尾スラッシュの有無を問わない）
  if (planPath.startsWith(`${normalized}/`)) return true;
  // glob は**実際に一致するか**で見る。`*` より前の接頭辞だけで判定すると
  // `!terraform/*.txt` のような限定的な除外が plan を除外しているように見えてしまう。
  if (normalized.includes("*")) return new Bun.Glob(normalized).match(planPath);
  return false;
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

function collectArtifactUploads(
  contexts: readonly StepContext[],
): ArtifactUpload[] {
  const uploads: ArtifactUpload[] = [];
  for (const { step } of contexts) {
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

/**
 * workflow 1 本ぶんの判定。fixture からも実 workflow からも同じ関数を通す。
 */
function findBinaryPlanArtifactViolations(
  workflowName: string,
  document: unknown,
): Violation[] {
  const contexts = collectStepContexts(document);
  const planPaths = collectPlanPaths(contexts, readWorkflowEnv(document));
  if (planPaths.length === 0) return [];

  const violations: Violation[] = [];
  for (const upload of collectArtifactUploads(contexts)) {
    for (const planPath of planPaths) {
      // 除外もパスで突き合わせる。basename 比較にすると `!backup/tfplan` のような
      // 無関係な除外が `terraform/tfplan` を守っているように見えてしまう。
      if (upload.excludes.some((entry) => pathCoversPlan(entry, planPath)))
        continue;
      for (const included of upload.includes) {
        if (!pathCoversPlan(included, planPath)) continue;
        violations.push({
          workflow: workflowName,
          stepLabel: upload.stepLabel,
          path: included,
          planFile: planPath,
          reason:
            normalizePath(included) === planPath
              ? "直接指定"
              : "glob/ディレクトリ指定で含みうる",
        });
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
      ({ document }) =>
        collectPlanPaths(
          collectStepContexts(document),
          readWorkflowEnv(document),
        ).length > 0,
    );
    // deploy-production.yml と terraform-drift.yml の 2 本。
    // ここが 0 になったら、YAML 構造か `-out=` の書き方が変わって検査が空振りしている。
    expect(producing.length).toBeGreaterThanOrEqual(2);
  });

  test("upload-artifact step を実際に検出できている（空振り防止）", () => {
    const uploadCount = workflows.reduce(
      (total, { document }) =>
        total + collectArtifactUploads(collectStepContexts(document)).length,
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
        working-directory: terraform
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
    expect(violations[0]?.planFile).toBe("terraform/custom-name.plan");
  });

  test("落ちるべき: glob で binary plan を含みうる", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath("-out=tfplan", "terraform/*"),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("glob/ディレクトリ指定で含みうる");
  });

  test("落ちるべき: 末尾スラッシュ無しのディレクトリ指定（upload-artifact は再帰的に上げる）", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath("-out=tfplan", "terraform"),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe("glob/ディレクトリ指定で含みうる");
  });

  test("落ちるべき: リポジトリ全体を指す `./`（配下が全部上がる）", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath("-out=tfplan", "./"),
    );
    expect(violations).toHaveLength(1);
  });

  test("落ちるべき: 除外の glob が plan に一致しない（`!terraform/*.txt`）", () => {
    // `*` より前の接頭辞だけで見ると「除外済み」と誤判定し、include を全部 skip する。
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath(
        "-out=tfplan",
        "|\n            terraform/*\n            !terraform/*.txt",
      ),
    );
    expect(violations).toHaveLength(1);
  });

  test("落ちるべき: working-directory が job の defaults にある", () => {
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      Bun.YAML.parse(`
jobs:
  deploy:
    defaults:
      run:
        working-directory: terraform
    steps:
      - name: Terraform plan
        run: terraform plan -out=tfplan
      - name: Upload plan artifact
        uses: actions/upload-artifact@v7.0.1
        with:
          name: plan
          path: terraform/tfplan
`) as unknown,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.planFile).toBe("terraform/tfplan");
  });

  test("落ちてはいけない: glob が plan に一致しない（`terraform/*.txt` だけ）", () => {
    expect(
      findBinaryPlanArtifactViolations(
        "fixture.yml",
        withPath("-out=tfplan", "terraform/*.txt"),
      ),
    ).toEqual([]);
  });

  test("落ちるべき: 除外が別ディレクトリの同名ファイルを指しているだけ", () => {
    // `!backup/tfplan` は `terraform/tfplan` を除外しない。basename で突き合わせると
    // 守られているように見えてしまう。
    const violations = findBinaryPlanArtifactViolations(
      "fixture.yml",
      withPath(
        "-out=tfplan",
        "|\n            terraform/*\n            !backup/tfplan",
      ),
    );
    expect(violations).toHaveLength(1);
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
