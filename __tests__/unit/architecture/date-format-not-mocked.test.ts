/**
 * `@/shared/lib/date-format` を `mock.module` で差し替えないことの gate。
 *
 * ## なぜ禁止できるのか
 *
 * この module は**時計を一切読まない**。全 export が引数の純関数か定数なので、
 * stub すべき非決定性が無い。だから mock は利得ゼロで、代償だけがある。
 *
 * **前提そのものをここで検査する**（下の「時計を読まない」テスト）。誰かが
 * `new Date()` を足したら禁止の根拠が崩れるので、gate が黙って続くのではなく
 * その時点で落ちて判断をやり直させる。
 *
 * ## 代償 1: 日付ずれを構造的に隠す
 *
 * 実測: `build-list-where.test.ts` は `formatJstDateString` を
 * `d.toISOString().slice(0, 10)` と**UTC で**再実装していた。本番は JST 固定
 * （絶対規約 #10）。つまりそのテストは、JST/UTC 取り違え —— CX-5「日付が 1 日
 * ずれる」そのもの —— を検出できない状態だった。
 *
 * `event-registration-table.test.ts` も `` `fmt:${value}` `` というセンチネルに
 * 差し替えており、時差について何も主張していなかった。実 formatter に戻したら
 * `UTC 01:30 → JST 10:30` を assert できるようになった（テストが強くなった）。
 *
 * ## 代償 2: 無関係なテストを巻き添えにする
 *
 * `mock.module` は Bun 公式仕様で**完全置換**（部分モックの API は無い。公式が
 * 挙げる部分差し替えは `spyOn(namespace, "export")`）。列挙しなかった export は
 * **そのプロセスの全 importer から消える**。
 *
 * 実測: PR #2001 が `serialize.ts`（ハブ module）で `toDateString` の UTC を JST へ
 * 直したところ、`date-format` を部分モックしていた admin コンポーネントの
 * テスト 3 本が `Export named 'formatJstDateString' not found` で落ちた。
 * 修正内容とは無関係で、import グラフが伸びただけ。
 *
 * 以前の対処は「足りない export を mock に書き足す」だった（`MS_PER_DAY` が
 * その痕跡）。それは import グラフ全体に追随する手作業の一覧で、
 * **必ず drift する**。6 箇所すべて mock を削除して解消した。
 *
 * ## 時刻に依存する値を固定したいときは
 *
 * **止めるのは時計であって formatter ではない。** `setSystemTime`（`bun:test`）で
 * 固定し、`afterAll` で `setSystemTime()` に戻す。
 *
 * formatter を差し替えて固定すると、上の 2 つの代償を引き受けたうえに、
 * **本当に時計を読んでいるのは呼び出し側**だという事実が隠れる。実測:
 * `receipts/serial.ts` の `getJstYear()` は `formatJstDateString(new Date())` で
 * 現在年を採る。formatter mock がそれを間接的に固定していたので、mock を外した
 * 時点で「2027 年に入ったら落ちる」テストになった（レビュー指摘、PR #2004）。
 * `serial.test.ts` は now を JST 2026-07-27 に固定して解決している。
 *
 * ## この gate が見るもの / 見ないもの
 *
 * **見る**: `date-format` の `mock.module` が 0 件であること。そして全
 * `mock.module` の対象が**静的に先頭まで確定する**こと（確定しないと、禁止 module を
 * 指していないことを確かめられず走査を素通りできる）。リテラルである必要は無い —
 * タブ群を `` `${DIR}/${tab}` `` でループ mock する箇所が実在し、同一ファイルの
 * const を辿れば先頭は確定する。
 *
 * **見ない**: 他 module の mock。完全置換が正しい相手（prisma / next/cache 等）が
 * 大半で、「常に spread せよ」は誤り。ここで禁止できるのは、**時計を読まない
 * ことを機械検査できる**この module だけ。
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
  ScriptKind,
  ScriptTarget,
  createSourceFile,
  forEachChild,
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
  isStringLiteralLike,
  isTemplateExpression,
  isVariableDeclaration,
  type Expression,
  type Node,
} from "typescript";

const ROOT = process.cwd();
const FORBIDDEN = "@/shared/lib/date-format";
const DATE_FORMAT_FILE = join(ROOT, "src", "shared", "lib", "date-format.ts");

interface MockSite {
  readonly file: string;
  readonly specifier: string | null;
}

function testFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z", "__tests__"], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split(String.fromCharCode(0))
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"));
}

/**
 * 1 ファイルの `mock.module(...)` 呼び出し。
 *
 * 第 1 引数は文字列リテラルとは限らない（タブ群をループで mock する箇所が実在し、
 * `` `${DIR}/${tab}` `` の形になっている）。そこで**先頭が確定するか**だけを見る:
 * 同一ファイル内の const 文字列を辿って静的な接頭辞が取れれば、その接頭辞で
 * 禁止 module かどうかを判定できる。取れなければ `null`（＝走査を素通りしうる）。
 */
function mockSites(file: string, source: string): MockSite[] {
  const parsed = createSourceFile(
    file,
    source,
    ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS,
  );

  const constants = new Map<string, string>();
  const collect = (node: Node): void => {
    if (
      isVariableDeclaration(node) &&
      isIdentifier(node.name) &&
      node.initializer !== undefined &&
      isStringLiteralLike(node.initializer)
    ) {
      constants.set(node.name.text, node.initializer.text);
    }
    forEachChild(node, collect);
  };
  collect(parsed);

  /** 静的に確定する接頭辞。取れなければ null。 */
  const staticPrefix = (target: Expression): string | null => {
    if (isStringLiteralLike(target)) return target.text;
    if (isTemplateExpression(target)) {
      let prefix = target.head.text;
      if (prefix.length > 0) return prefix;
      // 先頭が `${IDENT}` なら、同一ファイルの const を辿る。
      const first = target.templateSpans[0];
      if (first !== undefined && isIdentifier(first.expression)) {
        const resolved = constants.get(first.expression.text);
        if (resolved !== undefined) {
          prefix = resolved + first.literal.text;
          return prefix;
        }
      }
    }
    return null;
  };

  const out: MockSite[] = [];
  const visit = (node: Node): void => {
    if (
      isCallExpression(node) &&
      isPropertyAccessExpression(node.expression) &&
      isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "mock" &&
      node.expression.name.text === "module"
    ) {
      const target = node.arguments[0];
      out.push({
        file,
        specifier: target === undefined ? null : staticPrefix(target),
      });
    }
    forEachChild(node, visit);
  };
  forEachChild(parsed, visit);
  return out;
}

function allMockSites(): MockSite[] {
  return testFiles().flatMap((file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    // `mock.module` を含まないファイルは parse しない（結果は変わらない）。
    if (!source.includes("mock.module")) return [];
    return mockSites(file, source);
  });
}

const SITES = allMockSites();

describe("date-format は mock しない", () => {
  test("gate が空振りしていない（前提の自己検査）", () => {
    // 走査が壊れると以降が全部 vacuous に通る。
    expect(SITES.length).toBeGreaterThan(1000);
    expect(SITES.some((site) => site.specifier === "@/shared/db/prisma")).toBe(
      true,
    );

    // 検出できることを見本で固定する。
    const fixture = mockSites(
      "fixture.ts",
      `mock.module("${FORBIDDEN}", () => ({ formatJstDateString: () => "x" }));`,
    );
    expect(fixture.map((site) => site.specifier)).toEqual([FORBIDDEN]);
  });

  test("date-format は時計を読まない（禁止の根拠）", () => {
    // 根拠が崩れたらここで落ちる。gate を残したまま理由だけ古くなるのを防ぐ。
    const source = readFileSync(DATE_FORMAT_FILE, "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gmu,
      "",
    );
    const clockReads = [
      ...source.matchAll(/\b(new Date\(\s*\)|Date\.now\(\))/gu),
    ].map((match) => match[0]);

    expect({
      clockReads,
      hint:
        clockReads.length > 0
          ? "date-format が現在時刻を読み始めた。テストから制御する必要が出るので、この gate の前提（stub すべき非決定性が無い）が崩れる。時計を引数で受け取る形へ戻すか、この gate の是非を再検討する"
          : "",
    }).toEqual({ clockReads: [], hint: "" });
  });

  test("mock.module の対象は全件、静的に先頭が確定する", () => {
    // 先頭すら確定しないと、下の走査を素通りできてしまう。
    // リテラルである必要は無い（タブ群のループ mock が実在する）。確定さえすればよい。
    const unresolved = SITES.filter((site) => site.specifier === null).map(
      (site) =>
        `${site.file}: mock.module の対象が静的に決まらない。` +
        `禁止 module を指していないことを確かめられないので、リテラルか、` +
        `同一ファイルの const を先頭に置いた形にする`,
    );

    expect(unresolved).toEqual([]);
  });

  test("date-format を mock しているテストが無い", () => {
    const offenders = [
      ...new Set(
        SITES.filter((site) => site.specifier === FORBIDDEN).map(
          (site) => site.file,
        ),
      ),
    ].map(
      (file) =>
        `${file}: date-format は時計を読まない純関数の集まりなので mock は不要。` +
        `差し替えると JST/UTC の取り違えを隠し、export を足すたび無関係なテストが` +
        `「Export named ... not found」で落ちる。実 formatter を使い、固定したい値は入力で固定する`,
    );

    expect(offenders).toEqual([]);
  });
});
