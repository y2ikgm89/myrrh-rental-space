import { describe, test, expect } from "bun:test";
import { formatSerializedDate } from "@/shared/lib/serialize";

// =============================================================================
// formatSerializedDate の TZ 非依存性
// （サーバ UTC / クライアント JST のハイドレーション不整合 React #418/#425 回帰ガード）
//
// formatSerializedDate は timeZone を固定しないとランタイムのローカル TZ で整形され、
// サーバ (Cloud Run = UTC) とクライアント (ブラウザ = JST) で日付が食い違う。
// reservation-card.tsx 等の client component が render でこれを呼ぶと #418/#425。
//
// 日跨ぎする UTC 入力 (20:00Z = 翌日 05:00 JST) で JST 固定出力を pin する。
// CI / 本番は UTC のため、timeZone 固定が外れるとこのブロックが落ちる。
// =============================================================================

describe("formatSerializedDate — TZ 非依存性（#418 ハイドレーション回帰）", () => {
  // UTC 2026-06-01 20:00 → JST 2026-06-02（日跨ぎ）
  const CROSS_DAY_UTC = "2026-06-01T20:00:00.000Z";

  test("デフォルト options で JST カレンダー日付に整形する（UTC 当日に退行しない）", () => {
    expect(formatSerializedDate(CROSS_DAY_UTC)).toBe("2026年6月2日");
  });

  test("Date オブジェクト入力でも JST 固定", () => {
    expect(formatSerializedDate(new Date(CROSS_DAY_UTC))).toBe("2026年6月2日");
  });

  test("options 指定時も timeZone は JST に固定される（時刻つき）", () => {
    const result = formatSerializedDate(CROSS_DAY_UTC, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(result).toContain("2026年6月2日");
    expect(result).toContain("05:00");
  });

  test("null / undefined / 不正値はフォールバック", () => {
    expect(formatSerializedDate(null)).toBe("");
    expect(formatSerializedDate(undefined)).toBe("");
    expect(formatSerializedDate("invalid")).toBe("");
  });
});
