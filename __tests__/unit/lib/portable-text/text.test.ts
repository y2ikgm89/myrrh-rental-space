import { describe, expect, test } from "bun:test";
import {
  createSpan,
  createInlineIcon,
  createBlock,
} from "@/shared/lib/portable-text/factory";
import {
  spansToPlainText,
  blocksToPlainText,
} from "@/shared/lib/portable-text/text";

describe("spansToPlainText", () => {
  test("text span の text を join、icon は無視", () => {
    const result = spansToPlainText([
      createSpan("Hello "),
      createInlineIcon("IconHeart"),
      createSpan(" World"),
    ]);
    expect(result).toBe("Hello  World");
  });

  test("空配列は空文字列", () => {
    expect(spansToPlainText([])).toBe("");
  });

  test("icon のみは空文字列", () => {
    expect(spansToPlainText([createInlineIcon("IconStar")])).toBe("");
  });
});

describe("blocksToPlainText", () => {
  test("block を改行で連結", () => {
    const result = blocksToPlainText([
      createBlock([createSpan("Line 1")]),
      createBlock([createSpan("Line 2")]),
    ]);
    expect(result).toBe("Line 1\nLine 2");
  });

  test("空 blocks は空文字列", () => {
    expect(blocksToPlainText([])).toBe("");
  });

  test("空 children を持つ block は空行", () => {
    const result = blocksToPlainText([
      createBlock([createSpan("A")]),
      createBlock([]),
      createBlock([createSpan("B")]),
    ]);
    expect(result).toBe("A\n\nB");
  });
});
