import { describe, test, expect } from "bun:test";
import {
  newCustomerSchema,
  adminReservationSchema,
} from "@/admin/lib/validations/admin-reservation";
import { ReservationStatus } from "@/shared/db/enums";

describe("newCustomerSchema", () => {
  const validCustomerData = {
    lastName: "山田",
    firstName: "太郎",
    email: "yamada@example.com",
    phoneNumber: "090-1234-5678",
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = newCustomerSchema.safeParse(validCustomerData);
    expect(result.success).toBe(true);
  });

  test("姓が空の場合にエラー", () => {
    const invalidData = { ...validCustomerData, lastName: "" };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("姓を入力してください");
    }
  });

  test("名が空の場合にエラー", () => {
    const invalidData = { ...validCustomerData, firstName: "" };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("名を入力してください");
    }
  });

  test("メールアドレスが空の場合にエラー", () => {
    const invalidData = { ...validCustomerData, email: "" };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "メールアドレスを入力してください",
      );
    }
  });

  test("無効なメールアドレスの場合にエラー", () => {
    const invalidData = { ...validCustomerData, email: "invalid-email" };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("有効なメールアドレス");
    }
  });

  test("姓の最大長を超える場合にエラー", () => {
    const invalidData = { ...validCustomerData, lastName: "あ".repeat(51) };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("名の最大長を超える場合にエラー", () => {
    const invalidData = { ...validCustomerData, firstName: "あ".repeat(51) };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("電話番号の最大長を超える場合にエラー", () => {
    const invalidData = { ...validCustomerData, phoneNumber: "0".repeat(21) };
    const result = newCustomerSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("20文字以内");
    }
  });

  test("電話番号に空文字列を許可", () => {
    const validData = { ...validCustomerData, phoneNumber: "" };
    const result = newCustomerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("電話番号はオプショナル", () => {
    const validData = { ...validCustomerData };
    delete (validData as Record<string, unknown>)["phoneNumber"];
    const result = newCustomerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe("adminReservationSchema", () => {
  const validReservationData = {
    spaceId: "123e4567-e89b-12d3-a456-426614174000",
    date: "2026-03-01",
    startTime: "10:00",
    endTime: "12:00",
    customerId: "123e4567-e89b-12d3-a456-426614174001",
    status: ReservationStatus.CONFIRMED,
    sendEmail: true,
  };

  test("有効なデータでバリデーションに成功する", () => {
    const result = adminReservationSchema.safeParse(validReservationData);
    expect(result.success).toBe(true);
  });

  test("スペースIDが無効な場合にエラー", () => {
    const invalidData = { ...validReservationData, spaceId: "invalid-uuid" };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "スペースを選択してください",
      );
    }
  });

  test("日付形式が無効な場合にエラー", () => {
    const invalidData = { ...validReservationData, date: "2026/03/01" };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "日付の形式が正しくありません",
      );
    }
  });

  test("時間形式が無効な場合にエラー（開始時間）", () => {
    const invalidData = { ...validReservationData, startTime: "10時00分" };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "時間の形式が正しくありません",
      );
    }
  });

  test("時間形式が無効な場合にエラー（終了時間）", () => {
    const invalidData = { ...validReservationData, endTime: "12:00:00" };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("時間形式が24時間を超える場合にエラー", () => {
    const invalidData = { ...validReservationData, startTime: "25:00" };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("顧客IDと顧客データの両方がない場合にエラー", () => {
    const invalidData = { ...validReservationData };
    delete (invalidData as Record<string, unknown>)["customerId"];
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("顧客を選択するか");
    }
  });

  test("顧客IDの代わりに顧客データを指定できる", () => {
    const validData = {
      ...validReservationData,
      customerData: {
        lastName: "山田",
        firstName: "太郎",
        email: "yamada@example.com",
      },
    };
    delete (validData as Record<string, unknown>)["customerId"];
    const result = adminReservationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("終了時間が開始時間より前の場合にエラー", () => {
    const invalidData = {
      ...validReservationData,
      startTime: "14:00",
      endTime: "12:00",
    };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("終了時間は開始時間より後"),
        ),
      ).toBe(true);
    }
  });

  test("終了時間と開始時間が同じ場合にエラー", () => {
    const invalidData = {
      ...validReservationData,
      startTime: "10:00",
      endTime: "10:00",
    };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("予約時間が1時間未満の場合にエラー", () => {
    const invalidData = {
      ...validReservationData,
      startTime: "10:00",
      endTime: "10:30",
    };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("最低1時間以上"),
        ),
      ).toBe(true);
    }
  });

  test("予約時間がちょうど1時間の場合に成功", () => {
    const validData = {
      ...validReservationData,
      startTime: "10:00",
      endTime: "11:00",
    };
    const result = adminReservationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("料金に負の値を設定した場合にエラー", () => {
    const invalidData = { ...validReservationData, totalPrice: -100 };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("0以上");
    }
  });

  test("割引額に負の値を設定した場合にエラー", () => {
    const invalidData = { ...validReservationData, manualDiscountAmount: -100 };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("0以上");
    }
  });

  test("メモの最大長を超える場合にエラー", () => {
    const invalidData = { ...validReservationData, notes: "あ".repeat(1001) };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("1000文字以内");
    }
  });

  test("割引理由の最大長を超える場合にエラー", () => {
    const invalidData = {
      ...validReservationData,
      manualDiscountReason: "あ".repeat(201),
    };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("200文字以内");
    }
  });

  test("クーポンコードの最大長を超える場合にエラー", () => {
    const invalidData = { ...validReservationData, couponCode: "A".repeat(21) };
    const result = adminReservationSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("statusフィールドはデフォルトでCONFIRMED", () => {
    const data = { ...validReservationData };
    delete (data as Record<string, unknown>)["status"];
    const result = adminReservationSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe(ReservationStatus.CONFIRMED);
    }
  });

  test("sendEmailフィールドはデフォルトでtrue", () => {
    const data = { ...validReservationData };
    delete (data as Record<string, unknown>)["sendEmail"];
    const result = adminReservationSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sendEmail).toBe(true);
    }
  });

  test("作成時は PENDING / CONFIRMED のみ許可", () => {
    const allowed = [ReservationStatus.PENDING, ReservationStatus.CONFIRMED];
    allowed.forEach((status) => {
      const data = { ...validReservationData, status };
      const result = adminReservationSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  test("作成時に終端ステータスを拒否", () => {
    const terminal = [
      ReservationStatus.COMPLETED,
      ReservationStatus.CANCELLED,
      ReservationStatus.NO_SHOW,
    ];
    terminal.forEach((status) => {
      const data = { ...validReservationData, status };
      const result = adminReservationSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  test("オプショナルフィールドに空文字列を許可", () => {
    const validData = {
      ...validReservationData,
      couponCode: "",
      manualDiscountReason: "",
    };
    const result = adminReservationSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});
