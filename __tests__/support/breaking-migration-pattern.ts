/**
 * `deploy-production.yml` の破壊的 DDL 検出を、テストから**同じ規則で**再現する。
 *
 * SSoT は workflow に書かれた `grep -Eiq '...'` の正規表現そのもの。ここでコピーを
 * 持つと必ず drift するので、workflow を読んで抽出する。
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
 * workflow の `grep -Eiq '...'` から POSIX ERE を取り出す。
 * grep 呼び出しが移動・引用形が変わったら**黙って通さず throw する**。
 */
export function extractBreakingMigrationPattern(workflow: string): string {
  const match = workflow.match(/grep -Eiq '(?<pattern>[^']+)'/u);
  const pattern = match?.groups?.["pattern"];
  if (!pattern) {
    throw new Error(
      "deploy-production.yml から breaking-migration の grep パターンを抽出できませんでした。" +
        "grep 呼び出しが移動したか引用形が変わっています。",
    );
  }
  return pattern;
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
