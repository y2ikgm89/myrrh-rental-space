import { describe, test, expect } from "bun:test";
import { customerReservationEditSchema } from "@/shared/lib/validations/customer-reservation";

describe("customerReservationEditSchema", () => {
  // 過去日 refine（JST 今日以降のみ許可）を満たす far-future の固定日。
  const validData = {
    reservationId: "550e8400-e29b-41d4-a716-446655440000",
    spaceId: "550e8400-e29b-41d4-a716-446655440001",
    date: "2099-12-31",
    startTime: "10:00",
    endTime: "12:00",
    numberOfGuests: 3,
  };

  test("有効なデータで success", () => {
    const result = customerReservationEditSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("過去の日付で failure", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validData,
      date: "2000-01-01",
    });
    expect(result.success).toBe(false);
  });

  test("spaceId 欠如で failure", () => {
    const { spaceId, ...data } = validData;
    const result = customerReservationEditSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("date フォーマット不正で failure", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validData,
      date: "2026/04/01",
    });
    expect(result.success).toBe(false);
  });

  test("startTime >= endTime で failure", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validData,
      startTime: "14:00",
      endTime: "12:00",
    });
    expect(result.success).toBe(false);
  });

  test("numberOfGuests 0以下で failure", () => {
    const result = customerReservationEditSchema.safeParse({
      ...validData,
      numberOfGuests: 0,
    });
    expect(result.success).toBe(false);
  });
});
