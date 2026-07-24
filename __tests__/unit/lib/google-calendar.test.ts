/**
 * Google Calendar ユーティリティテスト
 *
 * ヘルパー関数のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { isValidCalendarId } from "@/shared/lib/google-calendar";

describe("google-calendar helpers", () => {
  describe("isValidCalendarId", () => {
    test('"primary"は有効なカレンダーID', () => {
      expect(isValidCalendarId("primary")).toBe(true);
    });

    test("メールアドレス形式は有効なカレンダーID", () => {
      expect(isValidCalendarId("calendar@example.com")).toBe(true);
      expect(isValidCalendarId("test.calendar@group.calendar.google.com")).toBe(
        true,
      );
      expect(isValidCalendarId("abc123@calendar.google.com")).toBe(true);
    });

    test("不正な形式は無効なカレンダーID", () => {
      expect(isValidCalendarId("")).toBe(false);
      expect(isValidCalendarId("invalid")).toBe(false);
      expect(isValidCalendarId("no-at-sign")).toBe(false);
      expect(isValidCalendarId("@missing-local")).toBe(false);
      expect(isValidCalendarId("missing-domain@")).toBe(false);
    });

    test("空白を含むIDは無効", () => {
      expect(isValidCalendarId("test @example.com")).toBe(false);
      expect(isValidCalendarId(" test@example.com")).toBe(false);
    });
  });
});
