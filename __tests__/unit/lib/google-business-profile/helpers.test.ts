import { describe, test, expect } from "bun:test";
import {
  buildBusinessHoursPayload,
  buildGbpFieldMask,
  buildLocationPayload,
  formatGbpError,
} from "@/shared/lib/google-business-profile/helpers";

describe("buildGbpFieldMask", () => {
  test("基本フィールドが常時含まれる（latlng なし）", () => {
    const payload = {
      title: "Test",
      storefrontAddress: {
        postalCode: undefined,
        regionCode: "JP" as const,
        locality: undefined,
        addressLines: [] as readonly string[],
      },
      phoneNumbers: { primaryPhone: undefined },
      regularHours: undefined,
      websiteUri: undefined,
      latlng: undefined,
    };
    const mask = buildGbpFieldMask(payload);
    expect(mask.split(",")).toEqual([
      "title",
      "storefrontAddress",
      "phoneNumbers.primaryPhone",
      "regularHours",
      "websiteUri",
    ]);
  });

  test("latlng が存在する場合は fields に追加される", () => {
    const payload = {
      title: "Test",
      storefrontAddress: {
        postalCode: undefined,
        regionCode: "JP" as const,
        locality: undefined,
        addressLines: [] as readonly string[],
      },
      phoneNumbers: { primaryPhone: undefined },
      regularHours: undefined,
      websiteUri: undefined,
      latlng: { latitude: 35.0, longitude: 139.0 },
    };
    const mask = buildGbpFieldMask(payload);
    expect(mask.split(",")).toContain("latlng");
    expect(mask.split(",")).toHaveLength(6);
  });
});

describe("buildBusinessHoursPayload", () => {
  test("正常な JSON は TimePeriod 配列に変換される", () => {
    const json = {
      monday: { open: "09:00", close: "18:00" },
      tuesday: { open: "09:00", close: "18:00" },
    };
    const result = buildBusinessHoursPayload(json);
    expect(result).toEqual({
      periods: [
        {
          openDay: "MONDAY",
          openTime: { hours: 9, minutes: 0 },
          closeDay: "MONDAY",
          closeTime: { hours: 18, minutes: 0 },
        },
        {
          openDay: "TUESDAY",
          openTime: { hours: 9, minutes: 0 },
          closeDay: "TUESDAY",
          closeTime: { hours: 18, minutes: 0 },
        },
      ],
    });
  });

  test("曜日順は日曜起点（GBP 仕様）", () => {
    const json = {
      saturday: { open: "10:00", close: "20:00" },
      sunday: { open: "10:00", close: "20:00" },
      monday: { open: "10:00", close: "20:00" },
    };
    const result = buildBusinessHoursPayload(json);
    const days = result?.periods.map((p) => p.openDay);
    expect(days).toEqual(["SUNDAY", "MONDAY", "SATURDAY"]);
  });

  test("null は undefined を返す", () => {
    expect(buildBusinessHoursPayload(null)).toBeUndefined();
  });

  test("undefined は undefined を返す", () => {
    expect(buildBusinessHoursPayload(undefined)).toBeUndefined();
  });

  test("空オブジェクトは undefined を返す", () => {
    expect(buildBusinessHoursPayload({})).toBeUndefined();
  });

  test("非オブジェクト（文字列・数値）は undefined を返す", () => {
    expect(buildBusinessHoursPayload("invalid")).toBeUndefined();
    expect(buildBusinessHoursPayload(123)).toBeUndefined();
  });

  test("closed: true の曜日はスキップされる", () => {
    const json = {
      monday: { open: "09:00", close: "18:00" },
      sunday: { closed: true },
    };
    const result = buildBusinessHoursPayload(json);
    expect(result?.periods).toHaveLength(1);
    expect(result?.periods[0]?.openDay).toBe("MONDAY");
  });

  test("不正な時刻フォーマットはスキップされる", () => {
    const json = {
      monday: { open: "9:00", close: "18:00" },
      tuesday: { open: "invalid", close: "18:00" },
      wednesday: { open: "25:00", close: "18:00" },
      thursday: { open: "09:60", close: "18:00" },
      friday: { open: "09:00", close: "18:00" },
    };
    const result = buildBusinessHoursPayload(json);
    expect(result?.periods.map((p) => p.openDay)).toEqual(["MONDAY", "FRIDAY"]);
  });

  test("open / close が欠落している曜日はスキップされる", () => {
    const json = {
      monday: { open: "09:00" },
      tuesday: { close: "18:00" },
      wednesday: {},
    };
    expect(buildBusinessHoursPayload(json)).toBeUndefined();
  });

  test("全曜日が closed: true なら undefined", () => {
    const json = {
      monday: { closed: true },
      sunday: { closed: true },
    };
    expect(buildBusinessHoursPayload(json)).toBeUndefined();
  });
});

describe("buildLocationPayload", () => {
  test("完全な Location は全フィールドを含む payload を返す", () => {
    const result = buildLocationPayload({
      name: "テスト店舗",
      postalCode: "150-0001",
      city: "渋谷区",
      streetAddress: "神宮前1-2-3",
      buildingName: "サンプルビル4F",
      phoneNumber: "03-1234-5678",
      businessHours: {
        monday: { open: "09:00", close: "18:00" },
      },
      latitude: 35.6717,
      longitude: 139.7044,
      websiteUri: "https://example.com",
    });

    expect(result).toEqual({
      title: "テスト店舗",
      storefrontAddress: {
        postalCode: "150-0001",
        regionCode: "JP",
        locality: "渋谷区",
        addressLines: ["神宮前1-2-3", "サンプルビル4F"],
      },
      phoneNumbers: { primaryPhone: "03-1234-5678" },
      regularHours: {
        periods: [
          {
            openDay: "MONDAY",
            openTime: { hours: 9, minutes: 0 },
            closeDay: "MONDAY",
            closeTime: { hours: 18, minutes: 0 },
          },
        ],
      },
      websiteUri: "https://example.com",
      latlng: { latitude: 35.6717, longitude: 139.7044 },
    });
  });

  test("buildingName が null なら addressLines に streetAddress のみ", () => {
    const result = buildLocationPayload({
      name: "Test",
      postalCode: "150-0001",
      city: "渋谷区",
      streetAddress: "神宮前1-2-3",
      buildingName: null,
      phoneNumber: null,
      businessHours: null,
      latitude: null,
      longitude: null,
    });
    expect(result.storefrontAddress.addressLines).toEqual(["神宮前1-2-3"]);
  });

  test("latitude のみで longitude が欠落していたら latlng は undefined", () => {
    const result = buildLocationPayload({
      name: "Test",
      postalCode: null,
      city: null,
      streetAddress: null,
      buildingName: null,
      phoneNumber: null,
      businessHours: null,
      latitude: 35.0,
      longitude: null,
    });
    expect(result.latlng).toBeUndefined();
  });

  test("nullable フィールドは undefined になる", () => {
    const result = buildLocationPayload({
      name: "Test",
      postalCode: null,
      city: null,
      streetAddress: null,
      buildingName: null,
      phoneNumber: null,
      businessHours: null,
      latitude: null,
      longitude: null,
    });
    expect(result.storefrontAddress.postalCode).toBeUndefined();
    expect(result.storefrontAddress.locality).toBeUndefined();
    expect(result.storefrontAddress.addressLines).toEqual([]);
    expect(result.phoneNumbers.primaryPhone).toBeUndefined();
    expect(result.regularHours).toBeUndefined();
    expect(result.websiteUri).toBeUndefined();
    expect(result.latlng).toBeUndefined();
  });

  test("regionCode は常に JP", () => {
    const result = buildLocationPayload({
      name: "Test",
      postalCode: null,
      city: null,
      streetAddress: null,
      buildingName: null,
      phoneNumber: null,
      businessHours: null,
      latitude: null,
      longitude: null,
    });
    expect(result.storefrontAddress.regionCode).toBe("JP");
  });
});

describe("formatGbpError", () => {
  test("Error はメッセージを返す", () => {
    expect(formatGbpError(new Error("API failed"))).toBe("API failed");
  });

  test("200 文字超のメッセージは truncate + '...' を付加", () => {
    const longMessage = "a".repeat(250);
    const result = formatGbpError(new Error(longMessage));
    expect(result.length).toBe(203); // 200 + "..."
    expect(result.endsWith("...")).toBe(true);
    expect(result.startsWith("a".repeat(200))).toBe(true);
  });

  test("ちょうど 200 文字のメッセージは truncate されない", () => {
    const message = "a".repeat(200);
    expect(formatGbpError(new Error(message))).toBe(message);
  });

  test("非 Error は 'Unknown GBP API error' を返す", () => {
    expect(formatGbpError("string error")).toBe("Unknown GBP API error");
    expect(formatGbpError({ code: 500 })).toBe("Unknown GBP API error");
    expect(formatGbpError(null)).toBe("Unknown GBP API error");
    expect(formatGbpError(undefined)).toBe("Unknown GBP API error");
    expect(formatGbpError(123)).toBe("Unknown GBP API error");
  });

  test("Error のサブクラスもメッセージ抽出に対応", () => {
    class CustomError extends Error {}
    expect(formatGbpError(new CustomError("custom"))).toBe("custom");
  });
});
