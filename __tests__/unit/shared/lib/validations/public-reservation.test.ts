import { describe, test, expect } from "bun:test";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";

describe("publicReservationSchema", () => {
  const validInput = {
    locationId: "00000000-0000-4000-a000-000000000001",
    spaceId: "550e8400-e29b-41d4-a716-446655440000",
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "13:00",
    numberOfGuests: 10,
    lastName: "山田",
    firstName: "太郎",
    email: "test@example.com",
    phoneNumber: "03-1234-5678",
    notes: "",
    agreeToTerms: true,
  };

  test("valid input passes", () => {
    const result = publicReservationSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  test("rejects missing spaceId", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      spaceId: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid date format", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      date: "2026/04/01",
    });
    expect(result.success).toBe(false);
  });

  test("rejects agreeToTerms=false", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      agreeToTerms: false,
    });
    expect(result.success).toBe(false);
  });

  test("rejects endTime before startTime", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      startTime: "17:00",
      endTime: "13:00",
    });
    expect(result.success).toBe(false);
  });

  test("phoneNumber is optional", () => {
    const result = publicReservationSchema.safeParse({
      ...validInput,
      phoneNumber: "",
    });
    expect(result.success).toBe(true);
  });
});
