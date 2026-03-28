import { describe, test, expect } from "bun:test";
import {
  toKatakana,
  isHiraganaOnly,
  isKanaOnly,
} from "@/admin/hooks/use-kana-input";

describe("toKatakana", () => {
  test("ひらがなをカタカナに変換する", () => {
    expect(toKatakana("やまだ")).toBe("ヤマダ");
  });

  test("既にカタカナの文字はそのまま", () => {
    expect(toKatakana("ヤマダ")).toBe("ヤマダ");
  });

  test("混在文字列のひらがな部分のみ変換", () => {
    expect(toKatakana("やまだtaro")).toBe("ヤマダtaro");
  });

  test("空文字列", () => {
    expect(toKatakana("")).toBe("");
  });

  test("漢字はそのまま", () => {
    expect(toKatakana("山田")).toBe("山田");
  });

  test("ひらがな全範囲（ぁ〜ゖ）", () => {
    expect(toKatakana("ぁあぃいぅう")).toBe("ァアィイゥウ");
  });
});

describe("isHiraganaOnly", () => {
  test("ひらがなのみ → true", () => {
    expect(isHiraganaOnly("やまだたろう")).toBe(true);
  });

  test("カタカナ含む → false", () => {
    expect(isHiraganaOnly("やまダ")).toBe(false);
  });

  test("漢字含む → false", () => {
    expect(isHiraganaOnly("山田")).toBe(false);
  });

  test("空文字列 → true", () => {
    expect(isHiraganaOnly("")).toBe(true);
  });

  test("長音記号（ー）は許可", () => {
    expect(isHiraganaOnly("おーい")).toBe(true);
  });

  test("英数字含む → false", () => {
    expect(isHiraganaOnly("あa")).toBe(false);
  });
});

describe("isKanaOnly", () => {
  test("ひらがなのみ → true", () => {
    expect(isKanaOnly("やまだ")).toBe(true);
  });

  test("カタカナのみ → true", () => {
    expect(isKanaOnly("ヤマダ")).toBe(true);
  });

  test("ひらがな＋カタカナ混在 → true", () => {
    expect(isKanaOnly("やまダ")).toBe(true);
  });

  test("漢字含む → false", () => {
    expect(isKanaOnly("山田")).toBe(false);
  });

  test("中黒（・）は許可", () => {
    expect(isKanaOnly("ヤマダ・タロウ")).toBe(true);
  });

  test("長音記号（ー）は許可", () => {
    expect(isKanaOnly("ヤマダー")).toBe(true);
  });
});
