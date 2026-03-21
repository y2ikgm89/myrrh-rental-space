import { describe, expect, test } from "bun:test";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

describe("formatSpaceLineAddress", () => {
  test("補足なしは拠点住所のみ", () => {
    expect(formatSpaceLineAddress("東京都渋谷区", null)).toBe("東京都渋谷区");
    expect(formatSpaceLineAddress("東京都渋谷区", "")).toBe("東京都渋谷区");
    expect(formatSpaceLineAddress("東京都渋谷区", "   ")).toBe("東京都渋谷区");
  });

  test("補足があるときは空白区切りで結合", () => {
    expect(formatSpaceLineAddress("東京都渋谷区", "3F")).toBe(
      "東京都渋谷区 3F",
    );
  });
});
