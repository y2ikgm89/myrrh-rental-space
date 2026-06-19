/**
 * mergeRecipients() — スタッフ＋カスタムの結合・重複除去
 */
import { describe, test, expect } from "bun:test";
import { mergeRecipients } from "@/shared/lib/email/recipients";

describe("mergeRecipients()", () => {
  test("スタッフ優先で結合し入力順を保つ", () => {
    expect(mergeRecipients(["a@x.com", "b@x.com"], ["c@x.com"])).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  test("大文字小文字を無視して重複除去（先勝ち・表記は最初のものを保持）", () => {
    expect(
      mergeRecipients(["Staff@X.com"], ["staff@x.com", "c@x.com"]),
    ).toEqual(["Staff@X.com", "c@x.com"]);
  });

  test("空・空白のみの要素は除去し、前後の空白はトリムする", () => {
    expect(mergeRecipients([" a@x.com ", ""], ["  ", "b@x.com"])).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  test("スタッフ内の重複も除去する", () => {
    expect(mergeRecipients(["a@x.com", "a@x.com"], [])).toEqual(["a@x.com"]);
  });

  test("両方空なら空配列", () => {
    expect(mergeRecipients([], [])).toEqual([]);
  });
});
