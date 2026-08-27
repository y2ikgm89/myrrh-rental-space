import { conformFieldText } from "@/shared/lib/conform/field-text";
/**
 * conform の `field.value` は型が `string | undefined` を宣言していても、
 * **実行時は配列になりうる**。conform が値を live DOM の `new FormData(form)` から
 * 作るため、同じ `name` の要素が 2 つある瞬間に両方拾われる。
 *
 * 旧実装（`fields.couponCode.value?.trim() ?? ""`）はその瞬間に
 * `TypeError: ... .trim is not a function` を投げ、管理画面のエラーバウンダリが
 * ページのセグメントごと差し替わっていた（Issue #2733）。
 */
import { describe, expect, test } from "bun:test";

describe("conformFieldText", () => {
  // **trim しない。** 読みが値を書き換えると制御入力で末尾スペースが打てなくなる。
  test("文字列はそのまま返す", () => {
    expect(conformFieldText("  SAVE10  ")).toBe("  SAVE10  ");
  });

  test("未入力は空文字", () => {
    expect(conformFieldText(undefined)).toBe("");
    expect(conformFieldText(null)).toBe("");
  });

  // #2733 で実際に落ちた形。旧実装はここで throw していた。
  test("配列なら最初の文字列を返す", () => {
    expect(conformFieldText(["  SAVE10  ", "SAVE10"])).toBe("  SAVE10  ");
    expect(conformFieldText(["", "SAVE10"])).toBe("");
  });

  test("文字列を含まない配列は空文字", () => {
    expect(conformFieldText([])).toBe("");
    expect(conformFieldText([new File([], "a.txt")])).toBe("");
  });

  test("文字列でも配列でもない値は空文字", () => {
    expect(conformFieldText(new File([], "a.txt"))).toBe("");
    expect(conformFieldText(42)).toBe("");
  });
});
