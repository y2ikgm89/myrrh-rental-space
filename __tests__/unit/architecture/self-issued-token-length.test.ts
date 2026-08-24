/**
 * 自前で発行する base64url トークンは、ログ redaction の閾値を超える長さにする。
 *
 * ## なぜ
 *
 * 監査 A-94: SwitchBot webhook の path token は `randomBytes(24)` = **32 文字**で、
 * `redaction.ts` の `HIGH_ENTROPY_MIN_LENGTH`（40）を下回っていた。
 * それなのに `redactUrlSegment` の docstring は
 * 「40+ base64url 連（waitlist offer token, **SwitchBot pathToken** 等）」と
 * カバー済みを主張していた。閾値と発行長という **2 つの数値の関係**が、
 * 散文でしか結ばれていなかった。
 *
 * この token は URL パスに載り、SwitchBot は署名検証を提供しないので事実上唯一の
 * 共有シークレット。`onRequestError` 経由で Cloud Logging の
 * `httpRequest.requestUrl` に平文で残りうる。
 *
 * 閾値の側を下げる選択肢は取れない — UUID 以外の正当な識別子まで
 * `[REDACTED]` になり triage ができなくなる。**発行長を上げる**のが正しい向き。
 *
 * ## 何を見るか
 *
 * `src/**` の `randomBytes(X).toString("base64url")` を集め、X（数値リテラル、
 * または同一ファイル内の `const X = <number>`）から base64url 長を計算して、
 * `HIGH_ENTROPY_MIN_LENGTH` を超えることを見る。
 *
 * 走査できないもの（他ファイルから import した定数、動的な値）は**未解決として
 * 報告する**。黙って除外すると「調べたけど無かった」と「調べられなかった」が
 * 区別できなくなる。
 *
 * ## 直し方
 *
 * 発行バイト数を増やす。32 bytes（= 43 文字）がこのリポジトリの既定。
 * `hex` は 2 文字/byte なので 20 bytes 以上なら閾値を超えるが、
 * base64url に揃えるほうが既存と一貫する。
 */

import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, test } from "bun:test";

import { collectSourceFiles } from "../../helpers/architecture-fs";
import { HIGH_ENTROPY_MIN_LENGTH } from "@/shared/lib/errors/redaction";

const ROOT = process.cwd();

/** base64url は padding を落とすので、`ceil(bytes * 4 / 3)` 文字になる。 */
export function base64UrlLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

type Generator = {
  readonly file: string;
  readonly argument: string;
  readonly bytes: number | null;
};

/** `randomBytes(X).toString("base64url")` の X を拾う。 */
export function collectBase64UrlGenerators(source: string): Generator[] {
  const call =
    /randomBytes\(\s*([A-Za-z0-9_]+)\s*\)\s*(?:\.toString\(\s*\n?\s*"base64url"|\s*\n\s*\.toString\(\s*\n?\s*"base64url")/gu;

  return [...source.matchAll(call)].map((match) => {
    const argument = match[1] ?? "";
    if (/^\d+$/u.test(argument)) {
      return { file: "", argument, bytes: Number(argument) };
    }
    const declaration = new RegExp(
      String.raw`const\s+${argument}\s*(?::\s*number\s*)?=\s*(\d+)`,
      "u",
    ).exec(source);
    return {
      file: "",
      argument,
      bytes: declaration?.[1] === undefined ? null : Number(declaration[1]),
    };
  });
}

describe("自前発行トークンの長さは redaction 閾値を超える（A-94）", () => {
  const generators: Generator[] = collectSourceFiles(`${ROOT}/src`).flatMap(
    (path) => {
      const source = readFileSync(path, "utf8");
      if (!source.includes("randomBytes(")) return [];
      const rel = relative(ROOT, path).replaceAll("\\", "/");
      return collectBase64UrlGenerators(source).map((generator) => ({
        ...generator,
        file: rel,
      }));
    },
  );

  test("走査が空振りしていない", () => {
    // email 変更 / 顧客統合 / SwitchBot webhook の 3 本。減ったら前提が変わっている。
    expect(generators.length).toBeGreaterThan(2);
  });

  test("バイト数が全て静的に解決できている", () => {
    // 解決できないものを黙って飛ばすと、下の assert が素通りする。
    expect(
      generators
        .filter((g) => g.bytes === null)
        .map((g) => `${g.file}: ${g.argument}`),
    ).toEqual([]);
  });

  test("全ての発行長が HIGH_ENTROPY_MIN_LENGTH を超える", () => {
    const tooShort = generators
      .filter((g) => g.bytes !== null)
      .filter((g) => base64UrlLength(g.bytes ?? 0) <= HIGH_ENTROPY_MIN_LENGTH)
      .map(
        (g) =>
          `${g.file}: randomBytes(${g.argument}) は ${String(
            base64UrlLength(g.bytes ?? 0),
          )} 文字で、redaction 閾値 ${String(HIGH_ENTROPY_MIN_LENGTH)} を超えない`,
      );

    expect(tooShort).toEqual([]);
  });

  test("判定が新旧を区別する（見本）", () => {
    // 旧 SwitchBot: 24 bytes = 32 文字 → 閾値未満。これが A-94 そのもの。
    expect(base64UrlLength(24)).toBe(32);
    expect(base64UrlLength(24)).toBeLessThan(HIGH_ENTROPY_MIN_LENGTH);

    // 現行: 32 bytes = 43 文字 → 閾値超え。
    expect(base64UrlLength(32)).toBe(43);
    expect(base64UrlLength(32)).toBeGreaterThan(HIGH_ENTROPY_MIN_LENGTH);

    // 数値リテラル・ローカル定数のどちらでも拾える。
    expect(
      collectBase64UrlGenerators(
        `const x = randomBytes(24).toString("base64url");`,
      ),
    ).toEqual([{ file: "", argument: "24", bytes: 24 }]);
    expect(
      collectBase64UrlGenerators(
        `const TOKEN_BYTES = 32;\nconst x = randomBytes(TOKEN_BYTES).toString("base64url");`,
      ),
    ).toEqual([{ file: "", argument: "TOKEN_BYTES", bytes: 32 }]);

    // 解決できない形は null で報告する（黙って除外しない）。
    expect(
      collectBase64UrlGenerators(
        `const x = randomBytes(IMPORTED_BYTES).toString("base64url");`,
      ),
    ).toEqual([{ file: "", argument: "IMPORTED_BYTES", bytes: null }]);

    // base64url でない用途（AES の IV 等）は対象外。
    expect(
      collectBase64UrlGenerators(`const iv = randomBytes(IV_LENGTH);`),
    ).toEqual([]);
  });
});
