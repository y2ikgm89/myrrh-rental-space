/**
 * **lefthook の job が本当に動くこと。「あるのに何もしていない」を検出する。**
 *
 * ## なぜ
 *
 * `terraform-fmt` job は `glob` に `**` を挟んだ形（`terraform` の下に `**` を
 * 置いて `.tf` を拾うつもりの書き方）で登録されていたが、**1 件も拾っていなかった**。
 *
 * lefthook の matcher は**パス区切りを知らない**。`*` は `/` をまたぐ一方、
 * `**` の直後に書いた `/` は**リテラルとして残る**。よってその glob は
 * 「terraform の下にもう 1 階層ある .tf」にしか当たらず、リポジトリの .tf は
 * 全部 `terraform` 直下なので対象が恒久的に 0 件だった。lefthook は毎回
 * `(skip) no files for inspection` と出すが、誰も読まない。
 * **hook があるのに何もしていない**が一番危ない形で、CI の
 * `terraform fmt -check` が落ちて初めて気づく。
 *
 * さらに glob を直すと、今度は job が落ちた。lefthook は `run` を
 * `sh -c "<script>"` とダブルクォートで包むので、スクリプト中のダブルクォートが
 * そこで引数を切り `syntax error: unexpected end of file` になる。これは
 * `commit-msg` を `scripts/check-commit-msg.sh` へ切り出したときと同じ罠で、
 * lefthook.yml のコメントに散文で書いてあったのに再発した。
 * **同じ間違いが 2 回**なので機械強制へ移す。
 *
 * ## 何を見るか
 *
 * 1. 各 job の `glob` が **job 単位で** tracked file に 1 件以上当たること
 * 2. 直書きの `run` にダブルクォートが無いこと
 *
 * 1 を pattern 単位にはしない。`eslint-fix` の `*.js` / `*.jsx` / `*.cjs` は
 * 現在 tracked 0 件だが、これは linter の拡張子リストとして正しい形
 * （足した瞬間に拾われる）。job の glob が**全部**空振りしていたら、
 * その job は対象を失っている ＝ 死んでいる。
 *
 * ## この gate の matcher の限界
 *
 * lefthook 相当の意味論（区切り文字なし ＝ `*` も `**` も「任意の文字列」）を
 * 正規表現へ写しているが、解釈するのは `*` / `?` / `{a,b}` だけ。
 * `[...]` などの他のメタ文字を使う glob を lefthook.yml に足したら、
 * ここも一緒に直す（今は使っていない）。
 *
 * ## 直し方
 *
 * - 0 件になった glob → `**` を使わず `*` で書く（`*` が `/` をまたぐ）。
 *   それでも 0 件なら、その job は対象を失っているので glob か job を直す。
 * - `run` にクォートが要る → `scripts/*.sh` へ切り出して
 *   `bash scripts/<name>.sh {staged_files}` の形で呼ぶ。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();
const LEFTHOOK_PATH = join(ROOT, "lefthook.yml");

type LefthookJob = { readonly name: string; readonly globs: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `{a,b}` を展開する（入れ子は使っていないので 1 段だけ）。 */
export function expandBraces(pattern: string): string[] {
  const match = /\{([^{}]*)\}/u.exec(pattern);
  if (!match) return [pattern];
  return (match[1] ?? "")
    .split(",")
    .flatMap((choice) =>
      expandBraces(
        pattern.slice(0, match.index) +
          choice +
          pattern.slice(match.index + match[0].length),
      ),
    );
}

/**
 * lefthook の glob 意味論を正規表現へ写す。
 *
 * lefthook は区切り文字を設定せずに glob をコンパイルするので、`*` も `**` も
 * 「任意の文字列（`/` を含む）」。連続する `*` は 1 つにまとめて構わない。
 */
export function lefthookGlobToRegExp(pattern: string): RegExp {
  let source = "";
  for (const char of pattern) {
    if (char === "*") {
      // `**` は `.*.*` と同義。冗長なので直前が `.*` なら足さない。
      if (!source.endsWith(".*")) source += ".*";
      continue;
    }
    if (char === "?") {
      source += ".";
      continue;
    }
    source += char.replace(/[\\^$.|+()[\]{}]/u, (meta) => `\\${meta}`);
  }
  return new RegExp(`^${source}$`, "u");
}

/** パターンに当たる tracked file があるか。 */
export function matchesAny(pattern: string, files: readonly string[]): boolean {
  const matchers = expandBraces(pattern).map(lefthookGlobToRegExp);
  return files.some((file) => matchers.some((matcher) => matcher.test(file)));
}

function readJobs(): { jobs: LefthookJob[]; runScripts: string[] } {
  const document: unknown = Bun.YAML.parse(readFileSync(LEFTHOOK_PATH, "utf8"));
  const jobs: LefthookJob[] = [];
  const runScripts: string[] = [];
  if (!isRecord(document)) return { jobs, runScripts };

  for (const hook of Object.values(document)) {
    if (!isRecord(hook)) continue;
    const hookJobs = hook["jobs"];
    if (!Array.isArray(hookJobs)) continue;

    for (const job of hookJobs) {
      if (!isRecord(job)) continue;
      const name = typeof job["name"] === "string" ? job["name"] : "(no name)";
      const glob = job["glob"];
      const globs =
        typeof glob === "string"
          ? [glob]
          : Array.isArray(glob)
            ? glob.filter((entry): entry is string => typeof entry === "string")
            : [];
      if (globs.length > 0) jobs.push({ name, globs });
      if (typeof job["run"] === "string") runScripts.push(job["run"]);
    }
  }

  return { jobs, runScripts };
}

describe("lefthook の job は空振りしない", () => {
  const tracked = trackedTextFiles(ROOT);
  const { jobs, runScripts } = readJobs();

  test("走査対象が空でない（0 件と「違反なし」を分ける）", () => {
    expect(tracked.length).toBeGreaterThan(1000);
    expect(jobs.length).toBeGreaterThan(2);
    expect(runScripts.length).toBeGreaterThan(5);
  });

  test("glob を持つ job は tracked file に 1 件以上当たる", () => {
    expect(
      jobs
        .filter(
          ({ globs }) => !globs.some((pattern) => matchesAny(pattern, tracked)),
        )
        .map(({ name, globs }) => `${name}: ${globs.join(", ")} が全部 0 件`),
    ).toEqual([]);
  });

  test("直書きの run にダブルクォートが無い", () => {
    // lefthook が `sh -c "<script>"` で包むため、中のクォートが引数を切る。
    expect(runScripts.filter((script) => script.includes('"'))).toEqual([]);
  });
});

describe("突合ロジックが差分を検出する（見本）", () => {
  // 実際に踏んだ形そのもの。合成のパスではなく、当時のツリーの形を使う。
  const flatTree = ["terraform/monitoring.tf", "terraform/variables.tf"];
  const nestedTree = ["terraform/modules/network/main.tf"];

  test("落ちるべき形: `**` の直後の `/` がリテラルとして残る", () => {
    const broken = `terraform/${"**"}/*.tf`;
    expect(matchesAny(broken, flatTree)).toBe(false);
    // 入れ子にだけ当たる。だから「書いた本人のローカルでは動く」ことがある。
    expect(matchesAny(broken, nestedTree)).toBe(true);
  });

  test("落ちてはいけない形: `*` は `/` をまたぐので平置きも入れ子も当たる", () => {
    expect(matchesAny("terraform/*.tf", flatTree)).toBe(true);
    expect(matchesAny("terraform/*.tf", nestedTree)).toBe(true);
    // 拡張子だけの形（eslint-fix / prettier-fix が使っている）も入れ子に当たる。
    expect(matchesAny("*.ts", ["src/shared/db/prisma.ts"])).toBe(true);
    expect(matchesAny("*.{ts,tsx}", ["src/app/page.tsx"])).toBe(true);
    // 当たらないものは当たらない（`.*` が何でも通すわけではない）。
    expect(matchesAny("*.ts", ["src/app/page.tsx"])).toBe(false);
  });

  test("落ちるべき形: run にダブルクォートがある", () => {
    const scripts = ['echo "hello"', "bash scripts/check-commit-msg.sh {1}"];
    expect(scripts.filter((script) => script.includes('"'))).toEqual([
      'echo "hello"',
    ]);
  });
});
