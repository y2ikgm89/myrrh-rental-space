import { describe, expect, test } from "bun:test";
import { spaceDescriptionListSnippet } from "@/shared/lib/space-description-list-snippet";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

describe("spaceDescriptionListSnippet", () => {
  test("空文字は空を返す", () => {
    expect(spaceDescriptionListSnippet("")).toBe("");
    expect(spaceDescriptionListSnippet("   ")).toBe("");
  });

  test("Lexical JSON らしい値は固定ラベル", () => {
    expect(spaceDescriptionListSnippet(EMPTY_LEXICAL_EDITOR_STATE_JSON)).toBe(
      "リッチテキスト（説明）",
    );
  });

  test("短文は省略記号なし", () => {
    expect(spaceDescriptionListSnippet("短い", 80)).toBe("短い");
  });

  test("長文は省略", () => {
    const s = "あ".repeat(100);
    expect(spaceDescriptionListSnippet(s, 10)).toBe("ああああああああああ…");
  });

  test("HTML はタグ除去してから短縮", () => {
    expect(spaceDescriptionListSnippet("<p>Hello world</p>", 80)).toBe(
      "Hello world",
    );
  });
});
