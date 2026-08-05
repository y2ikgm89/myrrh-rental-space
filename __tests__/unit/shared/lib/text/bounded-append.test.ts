/**
 * `bounded-append` の境界。**「詰めた結果が上限ちょうどに収まる」ことを実測する。**
 *
 * ここが 1 文字ずれると、上限いっぱいの値で 22001 が出る — つまり
 * 「タイトルが長いイベントだけ複製できない」という形で本番に出る。
 */

import { describe, expect, test } from "bun:test";

import {
  appendSlugWithinLimit,
  appendWithinLimit,
  truncateSlug,
} from "@/shared/lib/text/bounded-append";

describe("appendWithinLimit", () => {
  test("収まるときはそのまま連結する", () => {
    expect(appendWithinLimit("abc", "-x", 10)).toBe("abc-x");
  });

  test("上限ちょうどでも切らない", () => {
    expect(appendWithinLimit("abcde", "-x", 7)).toBe("abcde-x");
  });

  test("1 文字超えたら元の値の末尾を詰める", () => {
    const result = appendWithinLimit("abcdef", "-x", 7);
    expect({ result, length: result.length }).toEqual({
      result: "abcde-x",
      length: 7,
    });
  });

  test("実際に踏んだ形: 200 文字 + 「（コピー）」が 200 に収まる", () => {
    const result = appendWithinLimit("あ".repeat(200), "（コピー）", 200);
    expect(result.length).toBe(200);
    expect(result.endsWith("（コピー）")).toBe(true);
  });

  test("接尾辞だけで上限を超えるなら落とす（定数のずれを黙って飲まない）", () => {
    expect(() => appendWithinLimit("a", "-----", 3)).toThrow();
  });
});

describe("appendSlugWithinLimit / truncateSlug", () => {
  test("詰めた末尾のハイフンを落とす", () => {
    // "abc-" で切れると "abc--copy" になり slug の regex とも噛み合わない
    expect(appendSlugWithinLimit("abc-def", "-copy", 9)).toBe("abc-copy");
  });

  test("実際に踏んだ形: 100 文字 slug + `-copy` が 96 に収まる", () => {
    const result = appendSlugWithinLimit("a".repeat(100), "-copy", 96);
    expect(result.length).toBe(96);
    expect(result.endsWith("-copy")).toBe(true);
  });

  test("truncateSlug は収まるときに何もしない", () => {
    expect(truncateSlug("abc", 10)).toBe("abc");
  });

  test("truncateSlug は末尾ハイフンを残さない", () => {
    expect(truncateSlug("abc-def", 4)).toBe("abc");
  });
});
