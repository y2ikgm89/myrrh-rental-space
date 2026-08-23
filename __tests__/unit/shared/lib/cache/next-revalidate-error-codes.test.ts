/**
 * `invalidate-timing.ts` が分岐に使う Next の `__NEXT_ERROR_CODE` を、
 * インストールされている Next 本体に対して固定する。
 *
 * ## なぜ
 *
 * 監査 A-62 の修正で、文脈の判定を message の部分一致から error code に変えた。
 * code は Next の内部 API で、公式の型にも docs にも出てこない。
 * **版が上がって値が変われば、分岐は黙って「その他」に落ちる**（= 旧実装と同じ壊れ方）。
 *
 * 文言照合に戻すのは解決にならない（文言のほうが変わりやすい）。ここで版に対して
 * 実測で固定し、Next を上げたときに気づける形にする。
 *
 * ## 何を見るか
 *
 * - `E872`: リクエスト文脈の外で `updateTag` を呼ぶと**実際に**この code で throw する。
 *   `workStore` が無い状態は Route Handler と同じ分岐（`revalidate.js` の
 *   `if (!workStore || workStore.page.endsWith('/route'))`）。
 * - `E7`: render フェーズ用。unit テストからは踏めないので、Next 同梱の実装を読んで
 *   「during render」の throw にこの code が付いていることを確認する。
 *
 * ## 直し方
 *
 * ここが落ちたら Next 側で code が変わっている。`invalidate-timing.ts` の
 * 2 定数を新しい値に合わせる（分岐の構造は変えなくてよい）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { updateTag } from "next/cache";

const REVALIDATE_IMPL = join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "server",
  "web",
  "spec-extension",
  "revalidate.js",
);

function errorCodeOf(error: unknown): unknown {
  return error instanceof Error
    ? Reflect.get(error, "__NEXT_ERROR_CODE")
    : undefined;
}

describe("Next の revalidate error code（A-62 の分岐が依存する）", () => {
  test("リクエスト文脈の外の updateTag は E872 で throw する", () => {
    let thrown: unknown;
    try {
      updateTag("gate-probe");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(errorCodeOf(thrown)).toBe("E872");
    // 文言照合では拾えないことの証拠（旧実装が取りこぼしていた形）。
    expect((thrown as Error).message).not.toContain(
      "during render which is unsupported",
    );
  });

  test("render フェーズの throw は E7 が付いている", () => {
    const source = readFileSync(REVALIDATE_IMPL, "utf8");
    const at = source.indexOf("during render which is unsupported");
    expect(at).toBeGreaterThan(0);

    // throw と同じ式に続く `__NEXT_ERROR_CODE` の値を読む。
    const tail = source.slice(at, at + 600);
    expect(tail).toContain('"__NEXT_ERROR_CODE"');
    expect(/value:\s*"E7"/u.test(tail)).toBe(true);
  });
});
