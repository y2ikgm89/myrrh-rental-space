/**
 * conform の `field.value` に**文字列専用メソッドを直接生やさない**。
 *
 * ## なぜ
 *
 * conform は値を **live DOM の `new FormData(form)`** から作る
 * (`@conform-to/dom/dist/form.js`)。`FormData` は同じ `name` の要素が複数あれば
 * その全部を拾うので、型が
 *
 * ```ts
 * type FormValue<Schema> = Schema extends string | … ? string | undefined : …
 * ```
 *
 * と `string | undefined` を宣言していても、**実行時は配列になりうる**。
 * 型がこの状態を表現していないため、`value?.trim()` は **type-check も lint も
 * 通ったまま**実行時に `TypeError` になる。
 *
 * 実害: `/admin/reservations/new` が
 * `TypeError: couponCode.value?.trim is not a function` で throw し、管理画面の
 * エラーバウンダリがページのセグメントごと差し替わっていた（Issue #2733、
 * main の広域 E2E で 60 run 中 5 回 ≒ 8%）。**サーバーには何も残らない**
 * （`onRequestError` は発火せず digest も付かない）ので、原因の特定に
 * 失敗側 trace の保持とブラウザ例外の添付を先に入れる必要があった。
 *
 * ## 何を見るか
 *
 * `…Fields.<名前>.value` に続く**文字列にしか無いメソッド**の呼び出し。
 * `includes` / `slice` / `at` / `length` のように配列にもあるものは、配列が来ても
 * `TypeError` にならないので対象外（静かに間違うだけで、それはこの gate の射程外）。
 *
 * ## 粗さ（正直に書く）
 *
 * 静的な正規表現なので、`const f = fields.x; f.value.trim()` のように**変数へ
 * 逃がした形は追えない**。受け側の識別子が `…Fields` で終わる形だけを見る。
 * ここを広げたくなったら、それは AST へ移る合図
 * （`.claude/rules/architecture-gates.md`）。
 *
 * ## 直し方
 *
 * `conformFieldText(fields.X.value)` を使う（`src/shared/lib/conform/field-text.ts`）。
 * 文字列以外が来ても空文字へ落とす。空文字と未入力を区別したいなら
 * `field.value` を直接見て自分で narrowing すること。
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import {
  collectSourceFiles,
  stripComments,
} from "../../helpers/architecture-fs";

/**
 * String にあって Array に無いメソッドだけを挙げる。
 * 配列にもあるもの（`includes` / `slice` / `at` / `indexOf` / `concat`）は
 * 配列が来ても throw しないので、この gate の対象にしない。
 */
const STRING_ONLY_METHODS = new Set([
  "charAt",
  "charCodeAt",
  "codePointAt",
  "endsWith",
  "localeCompare",
  "match",
  "matchAll",
  "normalize",
  "padEnd",
  "padStart",
  "repeat",
  "replace",
  "replaceAll",
  "search",
  "split",
  "startsWith",
  "substr",
  "substring",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "trimEnd",
  "trimStart",
]);

const FIELD_VALUE_METHOD_CALL =
  /\b\w*[Ff]ields\.[A-Za-z_$][\w$]*\.value\s*\??\.\s*([A-Za-z_$][\w$]*)\s*\(/gu;

/**
 * 到達層の計測用。**`g` を付けない** — `/g` 付き正規表現の `.test()` は
 * `lastIndex` を持ち越すので、複数ファイルへ順に当てると取りこぼす。
 */
const FIELD_VALUE_READ = /\b\w*[Ff]ields\.[A-Za-z_$][\w$]*\.value\b/u;

/** ソース 1 本の中の違反箇所（見つかった呼び出しそのもの）を返す。 */
function findFieldValueStringMethodCalls(source: string): string[] {
  const stripped = stripComments(source);
  const offenders: string[] = [];

  for (const match of stripped.matchAll(FIELD_VALUE_METHOD_CALL)) {
    const method = match[1];
    if (method !== undefined && STRING_ONLY_METHODS.has(method)) {
      offenders.push(match[0]);
    }
  }

  return offenders;
}

const SRC_DIR = join(process.cwd(), "src");
const sourceFiles = collectSourceFiles(SRC_DIR);

describe("conform field.value に文字列メソッドを直接生やさない", () => {
  test("scans every TS/TSX file under src", () => {
    // 走査が壊れて 0 件になると、以降の gate が空振りで緑になる。
    expect(sourceFiles.length).toBeGreaterThan(2000);
  });

  test("reaches the files that actually read a conform field value", () => {
    // 走査規模とは別の層。判定式に届く候補が 0 件でも上の下限は満たせてしまう。
    const reads = sourceFiles.filter((file) =>
      FIELD_VALUE_READ.test(stripComments(readFileSync(file, "utf8"))),
    );

    expect(reads.length).toBeGreaterThan(10);
  });

  test("never calls a string-only method on field.value", () => {
    const offenders = sourceFiles.flatMap((file) => {
      const found = findFieldValueStringMethodCalls(readFileSync(file, "utf8"));
      const relative = file
        .slice(process.cwd().length + 1)
        .replaceAll("\\", "/");
      return found.map((call) => `${relative} :: ${call}`);
    });

    expect(offenders).toEqual([]);
  });

  test("rejects the shape that actually shipped", () => {
    // #2733 で本番に出ていた形。
    expect(
      findFieldValueStringMethodCalls(
        `const couponCode = fields.couponCode.value?.trim() ?? "";`,
      ),
    ).toEqual([`fields.couponCode.value?.trim(`]);

    // getFieldset() で作った子 fields も同じ危険がある。
    expect(
      findFieldValueStringMethodCalls(
        `const email = customerFields.email.value.toLowerCase();`,
      ),
    ).toEqual([`customerFields.email.value.toLowerCase(`]);
  });

  test("leaves the shapes that cannot throw alone", () => {
    expect(
      findFieldValueStringMethodCalls(
        `const couponCode = conformFieldText(fields.couponCode.value);`,
      ),
    ).toEqual([]);

    // 配列 field は map してよい（配列にもあるメソッド）。
    expect(
      findFieldValueStringMethodCalls(`fields.gallery.value.map(toUrl)`),
    ).toEqual([]);

    // DOM の event value は常に文字列。
    expect(
      findFieldValueStringMethodCalls(`const raw = event.target.value.trim();`),
    ).toEqual([]);

    // コメントに書いた「以前はこうだった」で自分に引っかからない。
    expect(
      findFieldValueStringMethodCalls(
        `// 旧: fields.couponCode.value?.trim() ?? ""\nconst x = 1;`,
      ),
    ).toEqual([]);
  });
});
