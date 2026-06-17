import { describe, test, expect } from "bun:test";
import {
  formatDate,
  formatDateShort,
  formatDateTimeShort,
  formatDateTimeFull,
  formatDateTimeLocalInJst,
  parseDateTimeLocalAsJst,
  parseJstDateOnly,
  formatJstDateOnly,
  formatJstDateString,
  calculateDurationHours,
  formatTimeShort,
  formatDateWithWeekday,
  formatMonthDayTime,
  formatYearMonth,
  formatDayWithWeekday,
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

// =============================================================================
// parseJstDateOnly / formatJstDateOnly（@db.Date 列の JST 深夜保持 round-trip）
// =============================================================================

describe("parseJstDateOnly", () => {
  describe("正常系", () => {
    test('"YYYY-MM-DD" を UTC 深夜 Date に変換する', () => {
      const date = parseJstDateOnly("2026-12-29");
      expect(date.toISOString()).toBe("2026-12-29T00:00:00.000Z");
    });

    test("月末日（3月31日）を正しく変換する", () => {
      expect(parseJstDateOnly("2026-03-31").toISOString()).toBe(
        "2026-03-31T00:00:00.000Z",
      );
    });

    test("うるう年の2月29日を正しく変換する", () => {
      expect(parseJstDateOnly("2028-02-29").toISOString()).toBe(
        "2028-02-29T00:00:00.000Z",
      );
    });

    test("年始（1月1日）を正しく変換する", () => {
      expect(parseJstDateOnly("2026-01-01").toISOString()).toBe(
        "2026-01-01T00:00:00.000Z",
      );
    });
  });

  describe("異常系・エッジケース", () => {
    test("スラッシュ区切りは Invalid Date を返す", () => {
      expect(Number.isNaN(parseJstDateOnly("2026/12/29").getTime())).toBe(true);
    });

    test("時刻付き文字列は Invalid Date を返す（日付のみ専用）", () => {
      expect(
        Number.isNaN(parseJstDateOnly("2026-12-29T00:00:00").getTime()),
      ).toBe(true);
    });

    test("ゼロ埋めされていない月日は Invalid Date を返す", () => {
      expect(Number.isNaN(parseJstDateOnly("2026-1-1").getTime())).toBe(true);
    });

    test("空文字列は Invalid Date を返す", () => {
      expect(Number.isNaN(parseJstDateOnly("").getTime())).toBe(true);
    });
  });
});

describe("formatJstDateOnly", () => {
  test("UTC 深夜 Date を YYYY-MM-DD に戻す", () => {
    const date = new Date("2026-12-29T00:00:00.000Z");
    expect(formatJstDateOnly(date)).toBe("2026-12-29");
  });

  test("ISO 文字列入力もサポート", () => {
    expect(formatJstDateOnly("2026-03-31T00:00:00.000Z")).toBe("2026-03-31");
  });

  test("parseJstDateOnly との round-trip で同値に戻る", () => {
    const original = "2026-12-29";
    expect(formatJstDateOnly(parseJstDateOnly(original))).toBe(original);
  });

  test("うるう年 round-trip", () => {
    expect(formatJstDateOnly(parseJstDateOnly("2028-02-29"))).toBe(
      "2028-02-29",
    );
  });
});

// =============================================================================
// formatJstDateString（任意 datetime → JST カレンダー日付 machine 形式）
// =============================================================================

describe("formatJstDateString", () => {
  test("UTC 00:00 は JST 09:00 で同日扱い", () => {
    expect(formatJstDateString(new Date("2026-05-30T00:00:00.000Z"))).toBe(
      "2026-05-30",
    );
  });

  test("UTC 夜間は JST で翌日になる（日跨ぎ）", () => {
    // UTC 20:00 → JST 翌日 05:00
    expect(formatJstDateString(new Date("2026-05-30T20:00:00.000Z"))).toBe(
      "2026-05-31",
    );
  });

  test("年跨ぎ（UTC 12/31 15:00 → JST 1/1 00:00）", () => {
    expect(formatJstDateString(new Date("2025-12-31T15:00:00.000Z"))).toBe(
      "2026-01-01",
    );
  });

  test("ISO 文字列入力もサポート", () => {
    expect(formatJstDateString("2026-05-30T00:00:00.000Z")).toBe("2026-05-30");
  });

  test("formatJstDateOnly との差異: 夜間 UTC datetime は JST 日跨ぎで 1 日ずれる", () => {
    // formatJstDateOnly は UTC 日付を slice、formatJstDateString は JST 変換
    const dt = new Date("2026-05-30T20:00:00.000Z");
    expect(formatJstDateOnly(dt)).toBe("2026-05-30");
    expect(formatJstDateString(dt)).toBe("2026-05-31");
  });
});

// =============================================================================
// calculateDurationHours（予約時間差分の SSoT）
// =============================================================================

describe("calculateDurationHours", () => {
  test("2 時間差を 2 として返す", () => {
    const start = new Date("2026-05-30T10:00:00.000Z");
    const end = new Date("2026-05-30T12:00:00.000Z");
    expect(calculateDurationHours(start, end)).toBe(2);
  });

  test("30 分差を 0.5 として返す（小数を含む）", () => {
    const start = new Date("2026-05-30T10:00:00.000Z");
    const end = new Date("2026-05-30T10:30:00.000Z");
    expect(calculateDurationHours(start, end)).toBe(0.5);
  });

  test("同一時刻は 0 を返す", () => {
    const t = new Date("2026-05-30T10:00:00.000Z");
    expect(calculateDurationHours(t, t)).toBe(0);
  });

  test("日跨ぎ（前日 23:00 → 翌日 01:00）は 2 時間", () => {
    const start = new Date("2026-05-30T23:00:00.000Z");
    const end = new Date("2026-05-31T01:00:00.000Z");
    expect(calculateDurationHours(start, end)).toBe(2);
  });

  test("end が start より前なら負の値を返す", () => {
    const start = new Date("2026-05-30T12:00:00.000Z");
    const end = new Date("2026-05-30T10:00:00.000Z");
    expect(calculateDurationHours(start, end)).toBe(-2);
  });
});

// =============================================================================
// 表示用 JST フォーマット helper
// （formatTimeShort / formatDateWithWeekday / formatMonthDayTime /
//   formatYearMonth / formatDayWithWeekday）
// =============================================================================

describe("formatTimeShort", () => {
  test("UTC 01:00 を JST 10:00 として整形する（tz 非依存）", () => {
    expect(formatTimeShort(new Date("2026-06-01T01:00:00.000Z"))).toBe("10:00");
  });

  test("ISO 文字列入力もサポート", () => {
    expect(formatTimeShort("2026-06-01T01:00:00.000Z")).toBe("10:00");
  });

  test("UTC 夜間は JST 翌日の時刻として整形する（日跨ぎ）", () => {
    // UTC 16:00 → JST 翌日 01:00
    expect(formatTimeShort(new Date("2026-06-01T16:00:00.000Z"))).toBe("01:00");
  });

  test("午後は 24 時間表記で出力する", () => {
    // UTC 05:00 → JST 14:00
    expect(formatTimeShort(new Date("2026-06-01T05:00:00.000Z"))).toBe("14:00");
  });
});

describe("formatDateWithWeekday", () => {
  test("JST の曜日付き日付に整形する", () => {
    expect(formatDateWithWeekday(new Date("2026-06-01T01:00:00.000Z"))).toBe(
      "2026年6月1日(月)",
    );
  });

  test("UTC 夜間は JST 翌日の曜日として整形する（日跨ぎ）", () => {
    // UTC 6/1 16:00 → JST 6/2(火)
    expect(formatDateWithWeekday(new Date("2026-06-01T16:00:00.000Z"))).toBe(
      "2026年6月2日(火)",
    );
  });

  test("ISO 文字列入力もサポート", () => {
    expect(formatDateWithWeekday("2026-06-01T01:00:00.000Z")).toBe(
      "2026年6月1日(月)",
    );
  });
});

describe("formatMonthDayTime", () => {
  test("JST の MM/dd HH:mm（年なし）に整形する", () => {
    expect(formatMonthDayTime(new Date("2026-06-01T01:00:00.000Z"))).toBe(
      "06/01 10:00",
    );
  });

  test("UTC 夜間は JST 翌日の月日時刻として整形する（日跨ぎ）", () => {
    expect(formatMonthDayTime(new Date("2026-06-01T16:00:00.000Z"))).toBe(
      "06/02 01:00",
    );
  });

  test("月日が 2 桁ゼロ埋め", () => {
    // UTC 1/4 23:00 → JST 1/5 08:00
    expect(formatMonthDayTime(new Date("2026-01-04T23:00:00.000Z"))).toBe(
      "01/05 08:00",
    );
  });
});

describe("formatYearMonth", () => {
  test("JST の YYYY年M月 に整形する", () => {
    expect(formatYearMonth(new Date("2026-06-01T01:00:00.000Z"))).toBe(
      "2026年6月",
    );
  });

  test("UTC 月末夜間は JST 翌月になる（月跨ぎ）", () => {
    // UTC 5/31 20:00 → JST 6/1 05:00
    expect(formatYearMonth(new Date("2026-05-31T20:00:00.000Z"))).toBe(
      "2026年6月",
    );
  });
});

describe("formatDayWithWeekday", () => {
  test("JST の曜日付き日に整形する", () => {
    expect(formatDayWithWeekday(new Date("2026-06-01T01:00:00.000Z"))).toBe(
      "1日(月)",
    );
  });

  test("UTC 夜間は JST 翌日になる（日跨ぎ）", () => {
    expect(formatDayWithWeekday(new Date("2026-06-01T16:00:00.000Z"))).toBe(
      "2日(火)",
    );
  });
});

// =============================================================================
// 表示フォーマットの TZ 非依存性（サーバ UTC / クライアント JST のハイドレーション
// 不整合 React #418 回帰ガード）
//
// formatDate / formatDateShort / formatDateTimeShort / formatDateTimeFull は
// timeZone を固定しないとランタイムのローカル TZ で整形され、サーバ (Cloud Run = UTC)
// とクライアント (ブラウザ = JST) で異なるテキストになる。client component で
// createdAt / updatedAt 等を描画するとハイドレーション不整合 (#418) を起こし、
// その配下の Link / button のクリックが無反応になる。
//
// 日跨ぎする UTC 入力 (20:00Z = 翌日 05:00 JST) で JST 固定出力を pin する。
// CI / 本番は UTC のため、timeZone 固定が外れるとこのブロックが落ちる。
// =============================================================================

describe("表示フォーマットの TZ 非依存性（#418 ハイドレーション回帰）", () => {
  // UTC 2026-06-01 20:00 → JST 2026-06-02 05:00（火曜）
  const CROSS_DAY_UTC = new Date("2026-06-01T20:00:00.000Z");

  test("formatDate は JST カレンダー日付で整形する（UTC 当日に退行しない）", () => {
    expect(formatDate(CROSS_DAY_UTC)).toContain("2026年6月2日");
  });

  test("formatDateShort は JST 日付 YYYY/MM/DD で整形する", () => {
    expect(formatDateShort(CROSS_DAY_UTC)).toBe("2026/06/02");
  });

  test("formatDateTimeShort は JST 日時で整形する", () => {
    expect(formatDateTimeShort(CROSS_DAY_UTC)).toMatch(/^2026\/06\/02\s05:00$/);
  });

  test("formatDateTimeFull は JST 日付・曜日で整形する（火曜）", () => {
    const result = formatDateTimeFull(CROSS_DAY_UTC);
    expect(result).toContain("2026/06/02");
    expect(result).toContain("火");
  });
});
