import { describe, expect, test } from "bun:test";
import {
  buttonLabelSchema,
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
    const tokens: ButtonLabelToken[] = [{ type: "text", value: "詳しく見る" }];
    const r = buttonLabelSchema.safeParse(tokens);
    expect(r.success).toBe(true);
  });

  test("icon token と text token の混在配列を受け入れる", () => {
    const tokens: ButtonLabelToken[] = [
      { type: "text", value: "詳しく " },
      { type: "icon", name: "IconArrowRight" },
      { type: "text", value: " 見る" },
    ];
    const r = buttonLabelSchema.safeParse(tokens);
    expect(r.success).toBe(true);
  });

  test("不明な type の token は reject", () => {
    const r = buttonLabelSchema.safeParse([{ type: "emoji", value: "🎉" }]);
    expect(r.success).toBe(false);
  });

  test("text token の value は max 200 chars", () => {
    const tokens = [{ type: "text", value: "x".repeat(201) }];
    const r = buttonLabelSchema.safeParse(tokens);
    expect(r.success).toBe(false);
  });

  test("icon token の name は curation icon 名前形式（IconXxx）", () => {
    const ok = buttonLabelSchema.safeParse([
      { type: "icon", name: "IconArrowRight" },
    ]);
    expect(ok.success).toBe(true);
    const ng = buttonLabelSchema.safeParse([{ type: "icon", name: "" }]);
    expect(ng.success).toBe(false);
  });

  test("プレーン文字列としてのフラット化（labelToPlainText）", () => {
    const tokens: ButtonLabelToken[] = [
      { type: "text", value: "詳しく " },
      { type: "icon", name: "IconArrowRight" },
      { type: "text", value: " 見る" },
    ];
    expect(labelToPlainText(tokens)).toBe("詳しく  見る");
  });

  test("type guard isTextToken / isIconToken", () => {
    const t: ButtonLabelToken = { type: "text", value: "x" };
    const i: ButtonLabelToken = { type: "icon", name: "IconX" };
    expect(isTextToken(t)).toBe(true);
    expect(isTextToken(i)).toBe(false);
    expect(isIconToken(i)).toBe(true);
    expect(isIconToken(t)).toBe(false);
  });

  test("emptyLabel() は空配列を返す", () => {
    expect(emptyLabel()).toEqual([]);
  });
});
