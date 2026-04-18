/**
 * Google Calendar 設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts のテスト
 * スキーマは settings/schemas.ts から import する
 */

import { describe, expect, test } from "bun:test";
import {
  googleCalendarConnectionTestSchema,
  googleCalendarSettingsSchema,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas";

const validServiceAccountJson = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  client_email: "service-account@test-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

describe("Google Calendar Settings Admin Action Integration", () => {
  describe("googleCalendarSettingsSchema バリデーション", () => {
    test("有効な service account JSON を許可する", () => {
      const result = googleCalendarSettingsSchema.safeParse({
        googleCalendarEnabled: true,
        googleCalendarId: "calendar@example.com",
        serviceAccountJson: validServiceAccountJson,
        icalAttachmentEnabled: true,
        addToCalendarLinksEnabled: true,
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(result.success).toBe(true);
    });

    test("service account JSON が null でも許可する", () => {
      const result = googleCalendarSettingsSchema.safeParse({
        googleCalendarEnabled: false,
        googleCalendarId: null,
        serviceAccountJson: null,
        icalAttachmentEnabled: false,
        addToCalendarLinksEnabled: false,
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(result.success).toBe(true);
    });

    test("不完全な service account JSON は拒否する", () => {
      const result = googleCalendarSettingsSchema.safeParse({
        googleCalendarEnabled: true,
        googleCalendarId: "calendar@example.com",
        serviceAccountJson: JSON.stringify({
          type: "service_account",
          client_email: "service-account@test-project.iam.gserviceaccount.com",
        }),
        icalAttachmentEnabled: true,
        addToCalendarLinksEnabled: true,
        googleCalendarMeetEnabled: false,
        googleCalendarReminderMinutes: null,
      });

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Should have failed");
      }
      expect(result.error.issues[0]?.message).toBe(
        "サービスアカウントJSONの形式が無効です",
      );
    });
  });

  describe("googleCalendarConnectionTestSchema バリデーション", () => {
    test("接続テストでも完全な service account JSON を要求する", () => {
      const result = googleCalendarConnectionTestSchema.safeParse({
        serviceAccountJson: validServiceAccountJson,
        calendarId: "primary",
      });

      expect(result.success).toBe(true);
    });

    test("接続テストで不正な service account JSON は拒否する", () => {
      const result = googleCalendarConnectionTestSchema.safeParse({
        serviceAccountJson: "{",
        calendarId: "primary",
      });

      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("Should have failed");
      }
      expect(result.error.issues[0]?.message).toBe(
        "サービスアカウントJSONの形式が無効です",
      );
    });
  });
});
