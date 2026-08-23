/**
 * **`fireAndForget` に `Promise.allSettled` の結果を直接渡さない。**
 *
 * ## なぜ
 *
 * 監査 A-77: `fireAndForget` は `promise.catch(...)` でだけログを出す
 * （`shared/lib/async-utils.ts`）。ところが `Promise.allSettled` は**決して reject しない**。
 * この 2 つを組み合わせると `.catch` は到達不能になり、
 * **`operation` に書いた名前のログ行はどんな障害でも出力されない**。
 *
 * 実測では `event/bulk.ts` の 3 箇所がこの形で、
 * `syncEventOutbound` の前段クエリ（`getEventSlotsForCalendarSync` の
 * try/catch 無し `prisma.event.findFirst`）が全件 reject しても、
 * Google カレンダーが 1 件も同期されないまま無記録で終わっていた。
 *
 * 「宣言した operation 名のログが原理的に出ない」は、書いた人には気づけない。
 * 呼び出し側のコードは正しく見えるし、テストも通る。だから形で落とす。
 *
 * ## 何を見るか
 *
 * `src/**` で `fireAndForget(` の第 1 引数に `Promise.allSettled(` が現れる形。
 *
 * ## 直し方
 *
 * 個別の reject を拾うのは `settleAllWithLogging` の仕事。
 * `fireAndForget(settleAllWithLogging(...).then(() => undefined), { operation })` と
 * 二段にすると、個別失敗は `operationPrefix[i]` で残り、`after()` による完了追跡も残る。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  collectSourceFiles,
  stripComments,
} from "../../helpers/architecture-fs";

const SRC_ROOT = join(process.cwd(), "src");
const ROOT = process.cwd();

/**
 * `fireAndForget(` の第 1 引数に `Promise.allSettled(` が来る形。
 *
 * 括弧の対応は数えない。`fireAndForget(` の直後から次の `, {`（options の開始）までを
 * 第 1 引数とみなす粗い検査で、`settleAllWithLogging(...)` を挟む正しい形は通る。
 */
function findSwallowedAllSettled(source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  let index = code.indexOf("fireAndForget(");
  while (index >= 0) {
    const rest = code.slice(index, index + 400);
    const optionsAt = rest.indexOf(", {");
    const firstArgument = optionsAt < 0 ? rest : rest.slice(0, optionsAt);
    if (firstArgument.includes("Promise.allSettled(")) {
      found.push(firstArgument.replace(/\s+/gu, " ").slice(0, 120));
    }
    index = code.indexOf("fireAndForget(", index + 1);
  }
  return found;
}

describe("fireAndForget は allSettled を飲み込まない（A-77）", () => {
  test("走査が空振りしていない", () => {
    const files = collectSourceFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(2000);
    // `fireAndForget` の呼び出しが実在すること。0 件ならこの gate は素通りする。
    const callers = files.filter((file) =>
      readFileSync(file, "utf8").includes("fireAndForget("),
    );
    expect(callers.length).toBeGreaterThan(3);
  });

  test("src に allSettled 直渡しが無い", () => {
    const offenders = collectSourceFiles(SRC_ROOT).flatMap((file) =>
      findSwallowedAllSettled(readFileSync(file, "utf8")).map(
        (snippet) =>
          `${file.replace(ROOT, "").replaceAll("\\", "/")}: ${snippet}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  test("判定が差分を検出する（見本）", () => {
    // 落ちるべき形（A-77 の元の形）
    const swallowed = `fireAndForget(
      Promise.allSettled(ids.map((id) => sync(id))).then(() => undefined),
      { operation: "syncEventOutbound.bulk" },
    );`;
    expect(findSwallowedAllSettled(swallowed)).toHaveLength(1);

    // 落ちてはいけない形: settleAllWithLogging を挟む
    const logged = `fireAndForget(
      settleAllWithLogging(ids.map((id) => sync(id)), {
        operationPrefix: "syncEventOutbound.bulk",
      }).then(() => undefined),
      { operation: "syncEventOutbound.bulk" },
    );`;
    expect(findSwallowedAllSettled(logged)).toEqual([]);

    // 落ちてはいけない形: 単一 promise
    expect(
      findSwallowedAllSettled(`fireAndForget(send(id), { operation: "x" });`),
    ).toEqual([]);

    // コメントの中の言及は拾わない
    expect(
      findSwallowedAllSettled(
        `// fireAndForget( Promise.allSettled( ... ) は禁止\nfireAndForget(send(id), { operation: "x" });`,
      ),
    ).toEqual([]);
  });
});
