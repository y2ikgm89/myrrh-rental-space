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

/** Record → FormData（値は文字列または同名 field の配列）。 */
function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) fd.append(k, item);
      continue;
    }
    fd.set(k, value);
  }
  return fd;
}

describe("emailFormSchema（実体）", () => {
  test("有効な返信先 + 通知先 + 確認 ON で success", () => {
    const r = parseWithZod(
      form({
        replyToEmail: "reply@example.com",
        notificationEmailAddresses: ["admin@example.com"],
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

  test("カスタム通知先: 同名 hidden input の複数値を配列として受け取る", () => {
    const result = parseWithZod(
      form({
        notificationEmailAddresses: ["a@example.com", "b@example.com"],
      }),
      { schema: emailFormSchema },
    );
    expect(result.status).toBe("success");
    if (result.status === "success" && result.value) {
      expect(result.value.notificationEmailAddresses).toEqual([
        "a@example.com",
        "b@example.com",
      ]);
    }
  });

  test("カスタム通知先: カンマ区切り単一文字列は error", () => {
    expect(
      parseWithZod(
        form({ notificationEmailAddresses: "a@example.com, b@example.com" }),
        { schema: emailFormSchema },
      ).status,
    ).toBe("error");
  });

  test("カスタム通知先: 不正なアドレスを含むと error（各アドレス検証）", () => {
    expect(
      parseWithZod(
        form({
          notificationEmailAddresses: ["a@example.com", "not-an-email"],
        }),
        { schema: emailFormSchema },
      ).status,
    ).toBe("error");
  });

  test("カスタム通知先: 50件超は error（全て有効メールでも）", () => {
    const tooMany = Array.from(
      { length: 51 },
      (_, index) => `recipient-${index}@example.com`,
    );
    expect(
      parseWithZod(form({ notificationEmailAddresses: tooMany }), {
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

  test("送信元・通知先スタッフがスキーマに含まれる（sendAdminNotificationEmail は撤去済み）", () => {
    const keys = Object.keys(emailFormSchema.shape);
    expect(keys).toContain("senderEmail");
    expect(keys).toContain("senderName");
    expect(keys).toContain("notificationStaffIds");
    expect(keys).not.toContain("sendAdminNotificationEmail");
  });

  test("notificationStaffIds は複数チェックを配列に集約する", () => {
    const fd = new FormData();
    fd.append("notificationStaffIds", "id-1");
    fd.append("notificationStaffIds", "id-2");
    const r = parseWithZod(fd, { schema: emailFormSchema });
    expect(r.status).toBe("success");
    if (r.status === "success" && r.value) {
      expect(r.value.notificationStaffIds).toEqual(["id-1", "id-2"]);
    }
  });

  test("notificationStaffIds 未指定でも success（任意）", () => {
    const r = parseWithZod(new FormData(), { schema: emailFormSchema });
    expect(r.status).toBe("success");
    if (r.status === "success" && r.value) {
      expect(r.value.notificationStaffIds).toEqual([]);
    }
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
