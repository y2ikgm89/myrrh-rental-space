/**
 * `deploy-production.yml` の破壊的 DDL 検出を、テストから**同じ規則で**再現する。
 *
 * SSoT は workflow に書かれた `grep -Ei '...' > /dev/null` の正規表現そのもの。
 * ここでコピーを持つと必ず drift するので、workflow を読んで抽出する。
 *
 * **workflow を読む知識はこの module にだけ置く。** 以前は
 * `breaking-migration-detection.test.ts` が同じ抽出を独自に持っており、
 * 片方だけ直したときにもう片方が throw して初めて重複に気づいた。
 *
 * この module を共有しているテスト:
 *   - `breaking-migration-detection.test.ts` — fixture で発動/非発動を固定する
 *   - `migration-squawk-ignore-is-breaking.test.ts` — squawk を免除した migration が
 *     本当に計画ダウンタイム付きになることを確かめる
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readDeployWorkflow(): string {
  return readFileSync(
    join(process.cwd(), ".github", "workflows", "deploy-production.yml"),
    "utf8",
  );
}

/**
 * workflow の `grep -Ei '...' > /dev/null` から POSIX ERE を取り出す。
 * grep 呼び出しが移動・引用形が変わったら**黙って通さず throw する**。
 *
 * **`-q` を含まない形に固定していることに意味がある。** workflow の step は
 * `set -euo pipefail` 下にあり、`-q` は最初のマッチで grep を終わらせる。
 * 上流の `tr` が閉じたパイプへ書き込むと SIGPIPE（rc=141）で死に、pipefail が
 * それをパイプライン全体の status に昇格させるので、`if` は**マッチしたのに
 * 「不一致」と評価する** = 破壊的 migration が計画ダウンタイム無しで本番に出る。
 * `-q` へ戻すとここで抽出が失敗して落ちる。
 */
export function extractBreakingMigrationPattern(workflow: string): string {
  const match = workflow.match(/grep -Ei '(?<pattern>[^']+)' > \/dev\/null/u);
  const pattern = match?.groups?.["pattern"];
  if (!pattern) {
    throw new Error(
      "deploy-production.yml から breaking-migration の grep パターンを抽出できませんでした。" +
        "grep 呼び出しが移動したか引用形が変わっています。" +
        "`grep -q` へ戻した場合は pipefail × SIGPIPE で fail-open するので戻さない。",
    );
  }
  return pattern;
}

/** Linux のパイプバッファ既定値。これを超えた残余が SIGPIPE を引き起こす。 */
export const PIPE_BUFFER_BYTES = 65_536;

/**
 * workflow の検出パイプラインを **原文のまま** 抜き出す。
 *
 * 下の `posixEreToJsRegExp` 経由の判定は、正規表現の当たり外れは見られるが
 * **シェルの都合で判定が反転する失敗**を原理的に再現できない。実際に起きたのが
 * それで、`grep -q` による SIGPIPE で `if` が反転していた間、翻訳側の fixture は
 * 全部緑のままだった。書き写した複製ではなく実走査と同じ 1 本の文字列を
 * 評価するために、ここでは workflow の綴りをそのまま取り出す。
 */
export function extractDetectionPipeline(workflow: string): string {
  const match = workflow.match(
    /if (?<pipeline>sed 's\/--\.\*\$\/\/' "\$\{migration_file\}"[\s\S]*?> \/dev\/null); then/u,
  );
  const pipeline = match?.groups?.["pipeline"];
  if (!pipeline) {
    throw new Error(
      "deploy-production.yml から破壊的 migration の検出パイプラインを抽出できませんでした。" +
        "パイプラインの綴りを変えたなら、この抽出も追随させる（黙って抽出を諦めると gate が空回りする）。",
    );
  }
  return pipeline;
}

/**
 * workflow のパイプラインを実 bash で走らせ、breaking mode に入るかを返す。
 *
 * SQL は stdin 経由で渡して bash 側の `mktemp` に書く。パスを引数で渡すと
 * MSYS のパス変換が挟まって Windows ローカルだけ壊れる。
 */
export function runWorkflowDetection(sql: string, pipeline: string): string {
  const bash = Bun.which("bash");
  if (!bash) {
    throw new Error(
      "bash が見つからないため workflow の検出パイプラインを実行できません。" +
        "この検査は silent skip させない（GitHub Actions の ubuntu runner にも " +
        "ローカルの MINGW64 にも bash はある）。",
    );
  }

  const script = [
    "set -euo pipefail",
    'migration_file="$(mktemp)"',
    "trap 'rm -f \"${migration_file}\"' EXIT",
    'cat > "${migration_file}"',
    `if ${pipeline}; then`,
    "  printf BREAKING",
    "else",
    "  printf SAFE",
    "fi",
  ].join("\n");

  const result = Bun.spawnSync({
    cmd: [bash, "-c", script],
    stdin: new TextEncoder().encode(sql),
  });

  const stdout = new TextDecoder().decode(result.stdout).trim();
  if (result.exitCode !== 0 || (stdout !== "BREAKING" && stdout !== "SAFE")) {
    throw new Error(
      `検出パイプラインの実行に失敗しました (exit ${String(result.exitCode)}): ` +
        `stdout=${stdout} stderr=${new TextDecoder().decode(result.stderr).trim()}`,
    );
  }
  return stdout;
}

/**
 * POSIX ERE を JavaScript の RegExp へ移す。使っているのは `[[:space:]]` だけ。
 * 他のクラスを workflow 側で使い始めたらここも足す。
 */
export function posixEreToJsRegExp(pattern: string): RegExp {
  return new RegExp(pattern.replaceAll("[[:space:]]", "\\s"), "i");
}

/**
 * workflow の前処理と同じ正規化: コメント除去 → 改行を空白へ → `;` で分割。
 *
 * grep は**行単位**で照合するので、折り返された 1 文はどの行にも一致せず素通りする。
 * 逆に `;` で割らないと隣接する 2 文が `.*` で橋渡しされて誤検知になる。
 */
export function normalizeMigrationSql(sql: string): string[] {
  return sql.replace(/--.*$/gmu, "").replaceAll("\n", " ").split(";");
}

/** 正規化後のどれか 1 文が破壊的パターンに一致するか。 */
export function detectsBreaking(sql: string, breakingRegex: RegExp): boolean {
  return normalizeMigrationSql(sql).some((statement) =>
    breakingRegex.test(statement),
  );
}

/** workflow を読んで、そのまま使える判定関数を返す。 */
export function loadBreakingMigrationDetector(): {
  readonly pattern: string;
  readonly regex: RegExp;
  readonly detects: (sql: string) => boolean;
} {
  const pattern = extractBreakingMigrationPattern(readDeployWorkflow());
  const regex = posixEreToJsRegExp(pattern);
  return {
    pattern,
    regex,
    detects: (sql: string) => detectsBreaking(sql, regex),
  };
}
