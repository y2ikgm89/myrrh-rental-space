/**
 * Google Calendar 設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/google-calendar.ts のテスト
 *
 * `googleCalendarConnectionTestSchema` は接続テスト（`testGoogleCalendarConnectionAction`）が
 * object 入力で `safeParse` する LIVE スキーマ。設定保存フォーム（conform 経路）の検証は
 * `googleCalendarFormSchema` 側で、空欄/OFF 保存の回帰は
 * `__tests__/unit/forms/settings-form-empty-optional.test.ts` がカバーする。
 */

import { describe, expect, test } from "bun:test";
import { googleCalendarConnectionTestSchema } from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas";

const validServiceAccountJson = JSON.stringify({
  type: "service_account",
  project_id: "test-project",
  client_email: "service-account@test-project.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
});

describe("Google Calendar Settings Admin Action Integration", () => {
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
