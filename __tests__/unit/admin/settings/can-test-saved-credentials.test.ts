import { describe, expect, test } from "bun:test";
import {
  canTestGoogleCalendarConnection,
  canTestGoogleMapsConnection,
  canTestResendConnection,
  canTestSwitchBotConnection,
  canTestTurnstileConnection,
} from "@/app/(admin)/admin/(dashboard)/settings/_components/sections/can-test-saved-credentials";

describe("canTestResendConnection", () => {
  test("保存済み API キーがあるときだけ true", () => {
    expect(canTestResendConnection("re_****abcd")).toBe(true);
    expect(canTestResendConnection(null)).toBe(false);
  });
});

describe("canTestTurnstileConnection", () => {
  test("Site Key と Secret Key の両方が保存済みのときだけ true", () => {
    expect(canTestTurnstileConnection("0xSITE", "0x****secret")).toBe(true);
    expect(canTestTurnstileConnection("0xSITE", null)).toBe(false);
    expect(canTestTurnstileConnection(null, "0x****secret")).toBe(false);
  });
});

describe("canTestGoogleMapsConnection", () => {
  test("保存済み API キーがあるときだけ true", () => {
    expect(canTestGoogleMapsConnection("AIza****abcd")).toBe(true);
    expect(canTestGoogleMapsConnection(null)).toBe(false);
  });
});

describe("canTestSwitchBotConnection", () => {
  test("token と secret の両方が保存済みのときだけ true", () => {
    expect(canTestSwitchBotConnection("tok****en", "sec****ret")).toBe(true);
    expect(canTestSwitchBotConnection("tok****en", null)).toBe(false);
    expect(canTestSwitchBotConnection(null, "sec****ret")).toBe(false);
  });
});

describe("canTestGoogleCalendarConnection", () => {
  test("サービスアカウントとカレンダー ID の両方が保存済みのときだけ true", () => {
    expect(
      canTestGoogleCalendarConnection(true, "cal@group.calendar.google.com"),
    ).toBe(true);
    expect(canTestGoogleCalendarConnection(true, null)).toBe(false);
    expect(
      canTestGoogleCalendarConnection(false, "cal@group.calendar.google.com"),
    ).toBe(false);
  });
});
