import { describe, expect, test } from "bun:test";
import {
  FAQ_ITEM_TEMPLATE_GROUPS,
  FAQ_ITEM_TEMPLATES,
  resolveFaqItemTemplateById,
} from "@/app/(admin)/admin/(dashboard)/faq/_components/faq-item-templates";

describe("FAQ_ITEM_TEMPLATES", () => {
  test("id はすべて一意", () => {
    const ids = FAQ_ITEM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("group はすべて FAQ_ITEM_TEMPLATE_GROUPS のいずれかに属する", () => {
    for (const template of FAQ_ITEM_TEMPLATES) {
      expect(FAQ_ITEM_TEMPLATE_GROUPS).toContain(template.group);
    }
  });

  test("各グループに最低1件のテンプレートが存在する", () => {
    for (const group of FAQ_ITEM_TEMPLATE_GROUPS) {
      const count = FAQ_ITEM_TEMPLATES.filter((t) => t.group === group).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  test("question は1〜500文字、answer は1〜5000文字に収まる (faqItemFormSchema の制限)", () => {
    for (const template of FAQ_ITEM_TEMPLATES) {
      expect(template.question.length).toBeGreaterThan(0);
      expect(template.question.length).toBeLessThanOrEqual(500);
      expect(template.answer.length).toBeGreaterThan(0);
      expect(template.answer.length).toBeLessThanOrEqual(5000);
    }
  });
});

describe("resolveFaqItemTemplateById", () => {
  test("既知の id を渡すと対応するテンプレートを返す", () => {
    const result = resolveFaqItemTemplateById("cancel-policy");
    expect(result?.question).toBe("予約はいつまでキャンセルできますか？");
  });

  test("未知の id を渡すと undefined を返す", () => {
    expect(resolveFaqItemTemplateById("does-not-exist")).toBeUndefined();
  });
});
