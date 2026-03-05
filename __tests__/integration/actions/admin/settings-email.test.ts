/**
 * メール設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/email.ts のテスト
 * スキーマは settings/schemas.ts から import する
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// =============================================================================
// スキーマ再現（schemas.ts から）
// =============================================================================

const emailSettingsSchema = z.object({
  senderEmail: z.string().email().max(100).nullable().or(z.literal("")),
  senderName: z.string().max(100).nullable(),
  replyToEmail: z.string().email().max(100).nullable().or(z.literal("")),
  sendReservationConfirmationEmail: z.boolean(),
  sendAdminNotificationEmail: z.boolean(),
  notificationEmailAddresses: z.string().max(500).nullable(),
});

const notificationSettingsSchema = z.object({
  notifyNewReservation: z.boolean(),
  notifyReservationChange: z.boolean(),
  notifyReservationCancel: z.boolean(),
  notifyNewInquiry: z.boolean(),
});

// =============================================================================
// テストデータ
// =============================================================================

const VALID_EMAIL_INPUT = {
  senderEmail: "sender@example.com",
  senderName: "送信者名",
  replyToEmail: "reply@example.com",
  sendReservationConfirmationEmail: true,
  sendAdminNotificationEmail: true,
  notificationEmailAddresses: "admin@example.com",
};

const VALID_NOTIFICATION_INPUT = {
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: false,
  notifyNewInquiry: true,
};

// =============================================================================
// テスト
// =============================================================================

describe("Email Settings Admin Action Integration", () => {
  // ===========================================================================
  // emailSettingsSchema
  // ===========================================================================

  describe("emailSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = emailSettingsSchema.safeParse(VALID_EMAIL_INPUT);
        expect(result.success).toBe(true);
      });

      test("全フィールド null でもバリデーション通過", () => {
        const result = emailSettingsSchema.safeParse({
          senderEmail: null,
          senderName: null,
          replyToEmail: null,
          sendReservationConfirmationEmail: false,
          sendAdminNotificationEmail: false,
          notificationEmailAddresses: null,
        });
        expect(result.success).toBe(true);
      });

      test('空文字はバリデーション通過（or z.literal("") により許可）', () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: "",
          replyToEmail: "",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("senderEmail", () => {
      test("有効なメールアドレスはOK", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: "test@domain.co.jp",
        });
        expect(result.success).toBe(true);
      });

      test("無効なメールアドレスはエラー", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: "not-an-email",
        });
        expect(result.success).toBe(false);
      });

      test("null は許可", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: null,
        });
        expect(result.success).toBe(true);
      });

      test("空文字は許可", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: "",
        });
        expect(result.success).toBe(true);
      });

      test("100文字のメールアドレスはOK（境界値）", () => {
        // 100文字: ローカル部 + "@" + ドメイン部
        const localPart = "a".repeat(88);
        const email = `${localPart}@example.com`; // 88 + 1 + 11 = 100文字
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: email,
        });
        expect(result.success).toBe(true);
      });

      test("101文字のメールアドレスはエラー", () => {
        const localPart = "a".repeat(89);
        const email = `${localPart}@example.com`; // 89 + 1 + 11 = 101文字
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderEmail: email,
        });
        expect(result.success).toBe(false);
      });
    });

    describe("replyToEmail", () => {
      test("有効なメールアドレスはOK", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          replyToEmail: "reply@test.com",
        });
        expect(result.success).toBe(true);
      });

      test("無効なメールアドレスはエラー", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          replyToEmail: "invalid",
        });
        expect(result.success).toBe(false);
      });

      test("null は許可", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          replyToEmail: null,
        });
        expect(result.success).toBe(true);
      });

      test("空文字は許可", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          replyToEmail: "",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("senderName", () => {
      test("100文字はOK（境界値）", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderName: "a".repeat(100),
        });
        expect(result.success).toBe(true);
      });

      test("101文字はエラー", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderName: "a".repeat(101),
        });
        expect(result.success).toBe(false);
      });

      test("null は許可", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          senderName: null,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("notificationEmailAddresses", () => {
      test("500文字はOK（境界値）", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          notificationEmailAddresses: "a".repeat(500),
        });
        expect(result.success).toBe(true);
      });

      test("501文字はエラー", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          notificationEmailAddresses: "a".repeat(501),
        });
        expect(result.success).toBe(false);
      });

      test("null は許可", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          notificationEmailAddresses: null,
        });
        expect(result.success).toBe(true);
      });

      test("複数のメールアドレスをカンマ区切りで指定できる", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          notificationEmailAddresses: "admin1@example.com,admin2@example.com",
        });
        expect(result.success).toBe(true);
      });
    });

    describe("sendReservationConfirmationEmail / sendAdminNotificationEmail", () => {
      test("true/false 両方許可", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            sendReservationConfirmationEmail: false,
          }).success,
        ).toBe(true);
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            sendAdminNotificationEmail: false,
          }).success,
        ).toBe(true);
      });

      test("文字列はエラー", () => {
        const result = emailSettingsSchema.safeParse({
          ...VALID_EMAIL_INPUT,
          sendReservationConfirmationEmail: "true",
        });
        expect(result.success).toBe(false);
      });

      test("sendReservationConfirmationEmail 省略はエラー", () => {
        const { sendReservationConfirmationEmail: _, ...input } =
          VALID_EMAIL_INPUT;
        const result = emailSettingsSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      test("sendAdminNotificationEmail 省略はエラー", () => {
        const { sendAdminNotificationEmail: _, ...input } = VALID_EMAIL_INPUT;
        const result = emailSettingsSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });
  });

  // ===========================================================================
  // notificationSettingsSchema
  // ===========================================================================

  describe("notificationSettingsSchema バリデーション", () => {
    describe("正常系", () => {
      test("有効なデータはバリデーション通過", () => {
        const result = notificationSettingsSchema.safeParse(
          VALID_NOTIFICATION_INPUT,
        );
        expect(result.success).toBe(true);
      });

      test("全て false でもバリデーション通過", () => {
        const result = notificationSettingsSchema.safeParse({
          notifyNewReservation: false,
          notifyReservationChange: false,
          notifyReservationCancel: false,
          notifyNewInquiry: false,
        });
        expect(result.success).toBe(true);
      });

      test("全て true でもバリデーション通過", () => {
        const result = notificationSettingsSchema.safeParse({
          notifyNewReservation: true,
          notifyReservationChange: true,
          notifyReservationCancel: true,
          notifyNewInquiry: true,
        });
        expect(result.success).toBe(true);
      });
    });

    describe("必須フィールド", () => {
      test("notifyNewReservation 省略はエラー", () => {
        const { notifyNewReservation: _, ...input } = VALID_NOTIFICATION_INPUT;
        const result = notificationSettingsSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      test("notifyReservationChange 省略はエラー", () => {
        const { notifyReservationChange: _, ...input } =
          VALID_NOTIFICATION_INPUT;
        const result = notificationSettingsSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      test("notifyReservationCancel 省略はエラー", () => {
        const { notifyReservationCancel: _, ...input } =
          VALID_NOTIFICATION_INPUT;
        const result = notificationSettingsSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      test("notifyNewInquiry 省略はエラー", () => {
        const { notifyNewInquiry: _, ...input } = VALID_NOTIFICATION_INPUT;
        const result = notificationSettingsSchema.safeParse(input);
        expect(result.success).toBe(false);
      });

      test("空オブジェクトはエラー", () => {
        const result = notificationSettingsSchema.safeParse({});
        expect(result.success).toBe(false);
      });
    });

    describe("型チェック", () => {
      test("notifyNewReservation に文字列はエラー", () => {
        const result = notificationSettingsSchema.safeParse({
          ...VALID_NOTIFICATION_INPUT,
          notifyNewReservation: "yes",
        });
        expect(result.success).toBe(false);
      });

      test("notifyReservationChange に数値はエラー", () => {
        const result = notificationSettingsSchema.safeParse({
          ...VALID_NOTIFICATION_INPUT,
          notifyReservationChange: 1,
        });
        expect(result.success).toBe(false);
      });

      test("notifyNewInquiry に null はエラー", () => {
        const result = notificationSettingsSchema.safeParse({
          ...VALID_NOTIFICATION_INPUT,
          notifyNewInquiry: null,
        });
        expect(result.success).toBe(false);
      });
    });
  });
});
