import { describe, expect, test } from "bun:test";
import {
  buttonLabelSchema,
  createIconToken,
  createTextToken,
  emptyLabel,
  isTextToken,
  isIconToken,
  labelToPlainText,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";

describe("buttonLabelSchema", () => {
  test("safeParse({}) は空配列にフォールバックする（field defaults 契約）", () => {
    const r = buttonLabelSchema.safeParse(undefined);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual([]);
  });

  test("text token のみの配列を受け入れる", () => {
    const tokens: ButtonLabelToken[] = [createTextToken("詳しく見る")];
    const r = buttonLabelSchema.safeParse(tokens);
    expect(r.success).toBe(true);
  });

  test("icon token と text token の混在配列を受け入れる", () => {
    const tokens: ButtonLabelToken[] = [
      createTextToken("詳しく "),
      createIconToken("IconArrowRight"),
      createTextToken(" 見る"),
    ];
    const r = buttonLabelSchema.safeParse(tokens);
    expect(r.success).toBe(true);
  });

  test("不明な type の token は reject", () => {
    const r = buttonLabelSchema.safeParse([
      { _key: "k1", type: "emoji", value: "🎉" },
    ]);
    expect(r.success).toBe(false);
  });

  test("_key 欠落の token は reject", () => {
    const r = buttonLabelSchema.safeParse([{ type: "text", value: "no _key" }]);
    expect(r.success).toBe(false);
  });

  test("text token の value は max 200 chars", () => {
    const tokens = [{ _key: "k1", type: "text", value: "x".repeat(201) }];
    const r = buttonLabelSchema.safeParse(tokens);
    expect(r.success).toBe(false);
  });

  test("icon token の name は curation icon 名前形式（IconXxx）", () => {
    const ok = buttonLabelSchema.safeParse([createIconToken("IconArrowRight")]);
    expect(ok.success).toBe(true);
    const ng = buttonLabelSchema.safeParse([
      { _key: "k1", type: "icon", name: "" },
    ]);
    expect(ng.success).toBe(false);
  });

  test("プレーン文字列としてのフラット化（labelToPlainText）", () => {
    const tokens: ButtonLabelToken[] = [
      createTextToken("詳しく "),
      createIconToken("IconArrowRight"),
      createTextToken(" 見る"),
    ];
    expect(labelToPlainText(tokens)).toBe("詳しく  見る");
  });

  test("type guard isTextToken / isIconToken", () => {
    const t: ButtonLabelToken = createTextToken("x");
    const i: ButtonLabelToken = createIconToken("IconX");
    expect(isTextToken(t)).toBe(true);
    expect(isTextToken(i)).toBe(false);
    expect(isIconToken(i)).toBe(true);
    expect(isIconToken(t)).toBe(false);
  });

  test("emptyLabel() は空配列を返す", () => {
    expect(emptyLabel()).toEqual([]);
  });

  test("createTextToken / createIconToken は一意な _key を生成", () => {
    const t1 = createTextToken("a");
    const t2 = createTextToken("a");
    expect(t1._key).not.toBe(t2._key);
    const i1 = createIconToken("IconA");
    const i2 = createIconToken("IconA");
    expect(i1._key).not.toBe(i2._key);
  });
});
