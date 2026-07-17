import { describe, expect, test } from "bun:test";
import {
  RESERVATION_SERIES_FREQ,
  RESERVATION_SERIES_FREQ_VALUES,
  ReservationSeriesFreq,
  TERMS_SCOPE,
  TERMS_SCOPE_VALUES,
} from "@/shared/lib/validations/enums/prisma-types";

describe("RESERVATION_SERIES_FREQ", () => {
  test("3 値を持つ (DAILY / WEEKLY / MONTHLY)", () => {
    expect(RESERVATION_SERIES_FREQ_VALUES).toEqual([
      "DAILY",
      "WEEKLY",
      "MONTHLY",
    ]);
  });

  test("const object と VALUES が一致", () => {
    expect(Object.values(RESERVATION_SERIES_FREQ)).toEqual(
      RESERVATION_SERIES_FREQ_VALUES,
    );
  });

  test("raw Prisma ReservationSeriesFreq (@generated/prisma/enums) と値が一致 (gateway re-export)", () => {
    expect(ReservationSeriesFreq.DAILY).toBe(RESERVATION_SERIES_FREQ.DAILY);
    expect(Object.values(ReservationSeriesFreq)).toEqual(
      RESERVATION_SERIES_FREQ_VALUES,
    );
  });
});

describe("TERMS_SCOPE.RESERVATION_SERIES", () => {
  test("Phase B.2 で追加された値を持つ", () => {
    expect(TERMS_SCOPE.RESERVATION_SERIES).toBe("RESERVATION_SERIES");
    expect(TERMS_SCOPE_VALUES).toContain("RESERVATION_SERIES");
  });
});
