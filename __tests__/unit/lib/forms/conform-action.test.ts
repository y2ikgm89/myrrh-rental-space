import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";

const testSchema = z.object({
  email: z.email({ error: "メールアドレスが不正です" }),
  name: z
    .string()
    .min(1, { error: "名前を入力してください" })
    .max(100, { error: "名前は 100 文字以内で入力してください" }),
});

function makeFormData(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("executeConformMutation", () => {
  describe("validation 失敗時", () => {
    test("invalid email + 空 name で field-level errors を含む submission.reply() を返す", async () => {
      const formData = makeFormData({ email: "not-an-email", name: "" });
      const result = await executeConformMutation(
        formData,
        testSchema,
        async () => ({ ok: true }),
      );

      expect(result.status).toBe("error");
      expect(result.error?.["email"]).toEqual(["メールアドレスが不正です"]);
      // Conform は空文字を undefined に自動 coerce するため `name` field は required violation を返す
      expect(result.error?.["name"]).toBeDefined();
      expect(result.error?.["name"]?.length).toBeGreaterThan(0);
    });

    test("validation 失敗時は handler を呼ばない", async () => {
      let handlerCalled = false;
      await executeConformMutation(
        makeFormData({ email: "bad", name: "" }),
        testSchema,
        async () => {
          handlerCalled = true;
          return { ok: true };
        },
      );

      expect(handlerCalled).toBe(false);
    });
  });

  describe("validation 成功 + handler 成功時", () => {
    test("handler に parse 済み値を渡す", async () => {
      const received: z.infer<typeof testSchema>[] = [];
      await executeConformMutation(
        makeFormData({ email: "a@example.com", name: "Alice" }),
        testSchema,
        async (input) => {
          received.push(input);
          return { ok: true };
        },
      );

      expect(received).toEqual([{ email: "a@example.com", name: "Alice" }]);
    });

    test("resetForm: true で initialValue を null にした submission.reply() を返す", async () => {
      const result = await executeConformMutation(
        makeFormData({ email: "a@example.com", name: "Alice" }),
        testSchema,
        async () => ({ ok: true }),
      );

      // Conform 公式仕様: resetForm: true の reply は `{ initialValue: null }` のみを返し、
      // status は undefined になる (intent: "reset" は submit intent ではないため)。
      // client 側で initialValue === null を form reset の signal として扱う。
      expect(result.initialValue).toBeNull();
      expect(result.status).toBeUndefined();
    });
  });

  describe("validation 成功 + handler 失敗時", () => {
    test("formErrors に handler error を含む submission.reply() を返す", async () => {
      const result = await executeConformMutation(
        makeFormData({ email: "a@example.com", name: "Alice" }),
        testSchema,
        async () => ({ ok: false, error: "DB 書き込みに失敗しました" }),
      );

      expect(result.status).toBe("error");
      expect(result.error?.[""]).toEqual(["DB 書き込みに失敗しました"]);
    });

    test("initialValue にユーザー入力値を保持する（再入力不要にする）", async () => {
      const result = await executeConformMutation(
        makeFormData({ email: "a@example.com", name: "Alice" }),
        testSchema,
        async () => ({ ok: false, error: "保存に失敗しました" }),
      );

      expect(result.initialValue).toEqual({
        email: "a@example.com",
        name: "Alice",
      });
    });
  });
});
