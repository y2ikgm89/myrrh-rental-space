/**
 * `truncateFilename` の検証。
 *
 * 守る不変条件は 2 つ:
 *   1. 戻り値のコードポイント数が `maxLength` を超えない
 *      （PostgreSQL の `varchar(n)` は文字数で数える）
 *   2. サロゲートペアを途中で割らない
 *      （孤立サロゲートは不正な UTF-8 になり、結局 DB に弾かれる）
 *
 * 2 が本命。素の `String.prototype.slice` で書くとここだけが落ちる。
 */

import { describe, expect, test } from "bun:test";

import {
  INQUIRY_ATTACHMENT_FILENAME_MAX_LENGTH,
  truncateFilename,
} from "@/shared/lib/r2/filename";

/** PostgreSQL の varchar が数えるのと同じ単位（コードポイント数）。 */
function charCount(value: string): number {
  return [...value].length;
}

/** 対を失ったサロゲート（不正な UTF-8 になる）が残っていないか。 */
function hasLoneSurrogate(value: string): boolean {
  return /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
    value,
  );
}

describe("truncateFilename", () => {
  test("上限以内の名前はそのまま返す", () => {
    expect(truncateFilename("report.pdf", 255)).toBe("report.pdf");
  });

  test("上限ちょうどは切らない", () => {
    const name = `${"a".repeat(246)}.pdf`;
    expect(charCount(name)).toBe(250);
    expect(truncateFilename(name, 250)).toBe(name);
  });

  test("超過分を切り、拡張子は残す", () => {
    const name = `${"a".repeat(400)}.pdf`;
    const result = truncateFilename(name, 255);

    expect(charCount(result)).toBe(255);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  test("先頭のドットは拡張子扱いしない", () => {
    // `.gitignore` のような名前で「拡張子 = 全体」と誤認すると全部消える
    const name = `.${"b".repeat(50)}`;
    const result = truncateFilename(name, 10);

    expect(charCount(result)).toBe(10);
    expect(result.startsWith(".bbb")).toBe(true);
  });

  test("拡張子だけで枠を超えるときは先頭から詰める", () => {
    const name = `x.${"y".repeat(40)}`;
    const result = truncateFilename(name, 10);

    expect(charCount(result)).toBe(10);
    expect(result.startsWith("x.")).toBe(true);
  });

  test("サロゲートペアを割らない（拡張子なし）", () => {
    // 絵文字はコードポイント 1・UTF-16 コードユニット 2。素の slice はここで割れる。
    const name = "😀".repeat(300);
    const result = truncateFilename(name, 255);

    expect(charCount(result)).toBe(255);
    expect(hasLoneSurrogate(result)).toBe(false);
    expect([...result].every((c) => c === "😀")).toBe(true);
  });

  test("サロゲートペアを割らない（拡張子あり）", () => {
    // 拡張子ありは別の分岐を通る。最初に書いたテストは拡張子なしだけを見ており、
    // 素の `slice` に退化させても緑のままだった（実測）ので両方を固定する。
    const name = `${"😀".repeat(300)}.pdf`;
    const result = truncateFilename(name, 255);

    expect(charCount(result)).toBe(255);
    expect(hasLoneSurrogate(result)).toBe(false);
    expect(result.endsWith(".pdf")).toBe(true);
    expect([...result].slice(0, -4).every((c) => c === "😀")).toBe(true);
  });

  test("絵文字を含む名前でも文字数で数える", () => {
    // UTF-16 長は 2 倍あるが、varchar が見るのはコードポイント数
    const name = "😀".repeat(200);
    expect(name.length).toBe(400);
    expect(truncateFilename(name, 255)).toBe(name);
  });

  test("maxLength が 0 以下なら空文字", () => {
    expect(truncateFilename("a.pdf", 0)).toBe("");
    expect(truncateFilename("a.pdf", -1)).toBe("");
  });

  test("お問い合わせ添付の上限は列と同じ 255", () => {
    expect(INQUIRY_ATTACHMENT_FILENAME_MAX_LENGTH).toBe(255);
  });
});
