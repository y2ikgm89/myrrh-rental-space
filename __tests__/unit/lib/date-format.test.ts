import { describe, test, expect } from "bun:test";
import {
  formatDate,
  formatDateShort,
  formatDateTimeShort,
  formatDateTimeFull,
  formatDateTimeLocalInJst,
  parseDateTimeLocalAsJst,
} from "@/shared/lib/date-format";

// テスト用の固定日時（タイムゾーン影響を受けにくい日中の時刻）
const TEST_DATE = new Date("2024-01-15T10:30:00.000Z");
const TEST_DATE_STR = "2024-01-15T10:30:00.000Z";

// =============================================================================
// formatDate
// =============================================================================

describe("formatDate", () => {
  describe("正常系", () => {
    test("Date オブジェクトを日本語長形式にフォーマットする", () => {
      const result = formatDate(TEST_DATE);
      expect(result).toMatch(/2024年\d+月\d+日/);
    });

    test("ISO 文字列を日本語長形式にフォーマットする", () => {
      const result = formatDate(TEST_DATE_STR);
      expect(result).toMatch(/2024年\d+月\d+日/);
    });

    test("includeTime=true で時刻を含む形式にフォーマットする", () => {
      const result = formatDate(TEST_DATE, true);
      expect(result).toMatch(/2024年\d+月\d+日/);
      expect(result).toMatch(/\d+:\d+/);
    });

    test("includeTime=false（デフォルト）は時刻を含まない", () => {
      const result = formatDate(TEST_DATE, false);
      expect(result).toMatch(/2024年\d+月\d+日/);
      // 時刻表記のコロンが含まれないことを確認
      expect(result).not.toMatch(/\d{2}:\d{2}/);
    });

    test("月が long 形式（例: 1月）で出力される", () => {
      const result = formatDate(new Date("2024-03-05T00:00:00.000Z"));
      expect(result).toMatch(/3月/);
    });

    test("年境界（12月31日）を正しくフォーマットする", () => {
      const date = new Date("2023-12-31T12:00:00.000Z");
      const result = formatDate(date);
      expect(result).toMatch(/2023年/);
      expect(result).toMatch(/12月/);
    });

    test("うるう年（2月29日）を正しくフォーマットする", () => {
      const date = new Date("2024-02-29T12:00:00.000Z");
      const result = formatDate(date);
      expect(result).toMatch(/2024年/);
      expect(result).toMatch(/2月/);
    });
  });

  describe("異常系・エッジケース", () => {
    test("null を渡すと空文字列を返す", () => {
      expect(formatDate(null)).toBe("");
    });

    test("undefined を渡すと空文字列を返す", () => {
      expect(formatDate(undefined)).toBe("");
    });

    test("空文字列を渡すと空文字列を返す", () => {
      expect(formatDate("")).toBe("");
    });
  });
});

// =============================================================================
// formatDateShort
// =============================================================================

describe("formatDateShort", () => {
  describe("正常系", () => {
    test("Date オブジェクトを YYYY/MM/DD 形式にフォーマットする", () => {
      const result = formatDateShort(TEST_DATE);
      expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    });

    test("ISO 文字列を YYYY/MM/DD 形式にフォーマットする", () => {
      const result = formatDateShort(TEST_DATE_STR);
      expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    });

    test("年が正しく出力される", () => {
      const result = formatDateShort(TEST_DATE);
      expect(result).toMatch(/^2024\//);
    });

    test("月が2桁ゼロ埋めで出力される（1月 → 01）", () => {
      const date = new Date("2024-01-05T12:00:00.000Z");
      const result = formatDateShort(date);
      expect(result).toMatch(/\/01\//);
    });

    test("日が2桁ゼロ埋めで出力される（5日 → 05）", () => {
      const date = new Date("2024-03-05T12:00:00.000Z");
      const result = formatDateShort(date);
      expect(result).toMatch(/\/05$/);
    });

    test("年境界（12月31日）を正しくフォーマットする", () => {
      const date = new Date("2023-12-31T12:00:00.000Z");
      const result = formatDateShort(date);
      expect(result).toMatch(/^2023\/12\/31$/);
    });

    test("うるう年（2月29日）を正しくフォーマットする", () => {
      const date = new Date("2024-02-29T12:00:00.000Z");
      const result = formatDateShort(date);
      expect(result).toMatch(/^2024\/02\/29$/);
    });
  });

  describe("異常系・エッジケース", () => {
    test("null を渡すと '-' を返す", () => {
      expect(formatDateShort(null)).toBe("-");
    });

    test("undefined を渡すと '-' を返す", () => {
      expect(formatDateShort(undefined)).toBe("-");
    });

    test("空文字列を渡すと '-' を返す", () => {
      expect(formatDateShort("")).toBe("-");
    });
  });
});

// =============================================================================
// formatDateTimeShort
// =============================================================================

describe("formatDateTimeShort", () => {
  describe("正常系", () => {
    test("Date オブジェクトを YYYY/MM/DD HH:mm 形式にフォーマットする", () => {
      const result = formatDateTimeShort(TEST_DATE);
      expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}$/);
    });

    test("ISO 文字列を YYYY/MM/DD HH:mm 形式にフォーマットする", () => {
      const result = formatDateTimeShort(TEST_DATE_STR);
      expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2}\s\d{2}:\d{2}$/);
    });

    test("年が正しく出力される", () => {
      const result = formatDateTimeShort(TEST_DATE);
      expect(result).toMatch(/^2024\//);
    });

    test("時刻が 2 桁ゼロ埋めで出力される", () => {
      // 00:00 UTC などを使うと時刻が 00 になることを確認
      const date = new Date("2024-06-01T00:00:00.000Z");
      const result = formatDateTimeShort(date);
      expect(result).toMatch(/\d{2}:\d{2}$/);
    });

    test("分が 2 桁ゼロ埋めで出力される", () => {
      const date = new Date("2024-06-01T12:05:00.000Z");
      const result = formatDateTimeShort(date);
      expect(result).toMatch(/:\d{2}$/);
    });

    test("時刻情報を含む（時刻なしの formatDateShort と異なる）", () => {
      const shortResult = formatDateShort(TEST_DATE);
      const shortTimeResult = formatDateTimeShort(TEST_DATE);
      expect(shortTimeResult.length).toBeGreaterThan(shortResult.length);
    });
  });

  describe("異常系・エッジケース", () => {
    test("null を渡すと '-' を返す", () => {
      expect(formatDateTimeShort(null)).toBe("-");
    });

    test("undefined を渡すと '-' を返す", () => {
      expect(formatDateTimeShort(undefined)).toBe("-");
    });

    test("空文字列を渡すと '-' を返す", () => {
      expect(formatDateTimeShort("")).toBe("-");
    });
  });
});

// =============================================================================
// formatDateTimeFull
// =============================================================================

describe("formatDateTimeFull", () => {
  describe("正常系", () => {
    test("Date オブジェクトを曜日付き YYYY/MM/DD(曜) HH:mm 形式にフォーマットする", () => {
      const result = formatDateTimeFull(TEST_DATE);
      // 曜日の短縮形（月・火・水・木・金・土・日）が含まれる
      expect(result).toMatch(/\(.\)/);
      expect(result).toMatch(/\d{4}\/\d{2}\/\d{2}/);
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    test("ISO 文字列を曜日付き形式にフォーマットする", () => {
      const result = formatDateTimeFull(TEST_DATE_STR);
      expect(result).toMatch(/\(.\)/);
    });

    test("曜日が括弧内の短縮形で出力される", () => {
      // 2024-01-15 は月曜日
      const monday = new Date("2024-01-15T12:00:00.000Z");
      const result = formatDateTimeFull(monday);
      // ロケール依存のため括弧内に何らかの文字があることを確認
      expect(result).toMatch(/\(.\)/);
    });

    test("土曜日を正しくフォーマットする", () => {
      // 2024-01-20 は土曜日
      const saturday = new Date("2024-01-20T12:00:00.000Z");
      const result = formatDateTimeFull(saturday);
      expect(result).toMatch(/\(.\)/);
    });

    test("日曜日を正しくフォーマットする", () => {
      // 2024-01-21 は日曜日
      const sunday = new Date("2024-01-21T12:00:00.000Z");
      const result = formatDateTimeFull(sunday);
      expect(result).toMatch(/\(.\)/);
    });

    test("時刻と曜日が両方含まれる（formatDateShort より長い出力）", () => {
      const shortResult = formatDateShort(TEST_DATE);
      const fullResult = formatDateTimeFull(TEST_DATE);
      expect(fullResult.length).toBeGreaterThan(shortResult.length);
    });
  });

  describe("異常系・エッジケース", () => {
    test("null を渡すと '-' を返す", () => {
      expect(formatDateTimeFull(null)).toBe("-");
    });

    test("undefined を渡すと '-' を返す", () => {
      expect(formatDateTimeFull(undefined)).toBe("-");
    });

    test("空文字列を渡すと '-' を返す", () => {
      expect(formatDateTimeFull("")).toBe("-");
    });
  });
});

// =============================================================================
// 共通：各関数の入力型統一テスト
// =============================================================================

describe("各関数の入力型統一テスト", () => {
  describe("Date オブジェクトと ISO 文字列で同等の出力になる", () => {
    const dateObj = new Date("2024-06-15T09:00:00.000Z");
    const dateStr = "2024-06-15T09:00:00.000Z";

    test("formatDate: Date と文字列で同じ出力", () => {
      expect(formatDate(dateObj)).toBe(formatDate(dateStr));
    });

    test("formatDateShort: Date と文字列で同じ出力", () => {
      expect(formatDateShort(dateObj)).toBe(formatDateShort(dateStr));
    });

    test("formatDateTimeShort: Date と文字列で同じ出力", () => {
      expect(formatDateTimeShort(dateObj)).toBe(formatDateTimeShort(dateStr));
    });

    test("formatDateTimeFull: Date と文字列で同じ出力", () => {
      expect(formatDateTimeFull(dateObj)).toBe(formatDateTimeFull(dateStr));
    });
  });

  describe("フォールバック値の一貫性", () => {
    test("formatDate の null/undefined フォールバックは空文字列", () => {
      expect(formatDate(null)).toBe("");
      expect(formatDate(undefined)).toBe("");
    });

    test("formatDateShort の null/undefined フォールバックは '-'", () => {
      expect(formatDateShort(null)).toBe("-");
      expect(formatDateShort(undefined)).toBe("-");
    });

    test("formatDateTimeShort の null/undefined フォールバックは '-'", () => {
      expect(formatDateTimeShort(null)).toBe("-");
      expect(formatDateTimeShort(undefined)).toBe("-");
    });

    test("formatDateTimeFull の null/undefined フォールバックは '-'", () => {
      expect(formatDateTimeFull(null)).toBe("-");
      expect(formatDateTimeFull(undefined)).toBe("-");
    });
  });
});

// =============================================================================
// formatDateTimeLocalInJst / parseDateTimeLocalAsJst（JST 固定 round-trip）
// =============================================================================

describe("formatDateTimeLocalInJst", () => {
  test("UTC midnight (00:00 UTC) は JST 09:00 として整形される", () => {
    const utc = new Date("2026-05-03T00:00:00.000Z");
    expect(formatDateTimeLocalInJst(utc)).toBe("2026-05-03T09:00");
  });

  test("UTC 15:00 は翌日 JST 00:00 として整形される（日跨ぎ）", () => {
    const utc = new Date("2026-05-02T15:00:00.000Z");
    expect(formatDateTimeLocalInJst(utc)).toBe("2026-05-03T00:00");
  });

  test("ISO 文字列入力もサポート", () => {
    expect(formatDateTimeLocalInJst("2026-05-03T03:30:00.000Z")).toBe(
      "2026-05-03T12:30",
    );
  });

  test("年末日（UTC 12/31 16:00 → JST 1/1 01:00）でも正しく桁ゼロ詰め", () => {
    const utc = new Date("2025-12-31T16:00:00.000Z");
    expect(formatDateTimeLocalInJst(utc)).toBe("2026-01-01T01:00");
  });
});

describe("parseDateTimeLocalAsJst", () => {
  test('"YYYY-MM-DDTHH:mm" を JST として parse して UTC Date を返す', () => {
    // JST 12:00 = UTC 03:00
    const date = parseDateTimeLocalAsJst("2026-05-03T12:00");
    expect(date.toISOString()).toBe("2026-05-03T03:00:00.000Z");
  });

  test('秒付き "YYYY-MM-DDTHH:mm:ss" もサポート', () => {
    const date = parseDateTimeLocalAsJst("2026-05-03T12:00:30");
    expect(date.toISOString()).toBe("2026-05-03T03:00:30.000Z");
  });

  test("JST 00:00（深夜）は前日 UTC 15:00 になる（日跨ぎ）", () => {
    const date = parseDateTimeLocalAsJst("2026-05-03T00:00");
    expect(date.toISOString()).toBe("2026-05-02T15:00:00.000Z");
  });

  test("不正な形式は Invalid Date を返す", () => {
    expect(Number.isNaN(parseDateTimeLocalAsJst("2026/05/03").getTime())).toBe(
      true,
    );
    expect(Number.isNaN(parseDateTimeLocalAsJst("invalid").getTime())).toBe(
      true,
    );
    expect(Number.isNaN(parseDateTimeLocalAsJst("").getTime())).toBe(true);
  });
});

describe("format ↔ parse round-trip（JST 同値性）", () => {
  test("parse → format で同じ datetime-local 文字列に戻る", () => {
    const local = "2026-05-03T12:00";
    const utc = parseDateTimeLocalAsJst(local);
    expect(formatDateTimeLocalInJst(utc)).toBe(local);
  });

  test("format → parse で同じ UTC instant に戻る", () => {
    const utc = new Date("2026-05-03T03:00:00.000Z");
    const local = formatDateTimeLocalInJst(utc);
    const restored = parseDateTimeLocalAsJst(local);
    expect(restored.toISOString()).toBe(utc.toISOString());
  });
});
