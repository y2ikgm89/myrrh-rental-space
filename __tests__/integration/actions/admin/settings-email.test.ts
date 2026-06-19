/**
 * メール・通知設定フォームスキーマ（実体）のバリデーションテスト
 *
 * 本物の emailFormSchema / notificationFormSchema を import し、conform の
 * parseWithZod + FormData 経由で検証する（インライン再宣言しない）。
 * 「全項目空欄 / 全 Switch OFF でも success」の網羅は
 * __tests__/unit/forms/settings-form-empty-optional.test.ts が SSoT。
 * ここはフィールド単位の形式・境界・switch 既定値・スキーマ構成を固定する。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  emailFormSchema,
  notificationFormSchema,
} from "@/admin/actions/settings/schemas/form-schemas-email-notification";

/** Record → FormData（値は全て文字列。空欄 / OFF は "" を渡す）。 */
function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("emailFormSchema（実体）", () => {
  test("有効な返信先 + 通知先 + 確認 ON で success", () => {
    const r = parseWithZod(
      form({
        replyToEmail: "reply@example.com",
        notificationEmailAddresses: "admin@example.com",
        sendReservationConfirmationEmail: "on",
      }),
      { schema: emailFormSchema },
    );
    expect(r.status).toBe("success");
  });

  test("全項目空欄でも success（任意項目 + switchBoolean 既定 false）", () => {
    const r = parseWithZod(
      form({
        replyToEmail: "",
        notificationEmailAddresses: "",
        sendReservationConfirmationEmail: "",
      }),
      { schema: emailFormSchema },
    );
    expect(r.status).toBe("success");
    if (r.status === "success" && r.value) {
      expect(r.value.sendReservationConfirmationEmail).toBe(false);
    }
  });

  test("不正な返信先メールは error", () => {
    const r = parseWithZod(form({ replyToEmail: "not-an-email" }), {
      schema: emailFormSchema,
    });
    expect(r.status).toBe("error");
  });

  test("返信先 100 文字は success / 101 文字は error（境界）", () => {
    const at100 = `${"a".repeat(88)}@example.com`; // 88 + 1 + 11 = 100
    const at101 = `${"a".repeat(89)}@example.com`; // 89 + 1 + 11 = 101
    expect(
      parseWithZod(form({ replyToEmail: at100 }), { schema: emailFormSchema })
        .status,
    ).toBe("success");
    expect(
      parseWithZod(form({ replyToEmail: at101 }), { schema: emailFormSchema })
        .status,
    ).toBe("error");
  });

  test("通知先 500 文字は success / 501 文字は error（境界）", () => {
    expect(
      parseWithZod(form({ notificationEmailAddresses: "a".repeat(500) }), {
        schema: emailFormSchema,
      }).status,
    ).toBe("success");
    expect(
      parseWithZod(form({ notificationEmailAddresses: "a".repeat(501) }), {
        schema: emailFormSchema,
      }).status,
    ).toBe("error");
  });

  test("送信元メール: 有効は success / 不正は error / 100文字境界", () => {
    expect(
      parseWithZod(form({ senderEmail: "noreply@example.com" }), {
        schema: emailFormSchema,
      }).status,
    ).toBe("success");
    expect(
      parseWithZod(form({ senderEmail: "not-an-email" }), {
        schema: emailFormSchema,
      }).status,
    ).toBe("error");
    const at100 = `${"a".repeat(88)}@example.com`; // 100
    const at101 = `${"a".repeat(89)}@example.com`; // 101
    expect(
      parseWithZod(form({ senderEmail: at100 }), { schema: emailFormSchema })
        .status,
    ).toBe("success");
    expect(
      parseWithZod(form({ senderEmail: at101 }), { schema: emailFormSchema })
        .status,
    ).toBe("error");
  });

  test("送信元フィールドはスキーマに含まれる（sendAdminNotificationEmail は撤去済み）", () => {
    const keys = Object.keys(emailFormSchema.shape);
    expect(keys).toContain("senderEmail");
    expect(keys).toContain("senderName");
    expect(keys).not.toContain("sendAdminNotificationEmail");
  });
});

describe("notificationFormSchema（実体）", () => {
  test("全 Switch OFF（空）でも success かつ既定 false が入る", () => {
    const r = parseWithZod(
      form({
        notifyNewReservation: "",
        notifyReservationChange: "",
        notifyReservationCancel: "",
        notifyNewInquiry: "",
        notifyEventRegistration: "",
        notifyEventCancellation: "",
      }),
      { schema: notificationFormSchema },
    );
    expect(r.status).toBe("success");
    if (r.status === "success" && r.value) {
      expect(r.value.notifyNewReservation).toBe(false);
      expect(r.value.notifyNewInquiry).toBe(false);
      expect(r.value.notifyEventRegistration).toBe(false);
      expect(r.value.notifyEventCancellation).toBe(false);
    }
  });

  test("イベント通知トグルがスキーマに含まれる", () => {
    const keys = Object.keys(notificationFormSchema.shape);
    expect(keys).toContain("notifyEventRegistration");
    expect(keys).toContain("notifyEventCancellation");
  });
});
