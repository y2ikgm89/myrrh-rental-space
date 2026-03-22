import { describe, test, expect } from "bun:test";
import {
  customerFormSchema,
  updateCustomerStatusSchema,
  updateCustomerNotesSchema,
} from "@/shared/lib/validations/customer";
import { CustomerStatus } from "@/shared/db/enums";

describe("customerFormSchema", () => {
  test("有効なデータでバリデーションに成功する", () => {
    const validData = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: "ヤマダ",
      firstNameKana: "タロウ",
      email: "yamada@example.com",
      phoneNumber: "090-1234-5678",
      address: "東京都渋谷区1-2-3",
      notes: "VIP顧客",
    };

    const result = customerFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("必須フィールド（姓）が空の場合にエラー", () => {
    const invalidData = {
      lastName: "",
      firstName: "太郎",
      email: "test@example.com",
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("姓は必須です");
    }
  });

  test("必須フィールド（名）が空の場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "",
      email: "test@example.com",
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("名は必須です");
    }
  });

  test("無効なメールアドレスの場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "太郎",
      email: "invalid-email",
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("有効なメールアドレス");
    }
  });

  test("姓の最大長を超える場合にエラー", () => {
    const invalidData = {
      lastName: "あ".repeat(51),
      firstName: "太郎",
      email: "test@example.com",
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("名の最大長を超える場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "あ".repeat(51),
      email: "test@example.com",
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("セイ・メイの最大長を超える場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: "ア".repeat(51),
      email: "test@example.com",
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("50文字以内");
    }
  });

  test("電話番号の最大長を超える場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "太郎",
      email: "test@example.com",
      phoneNumber: "0".repeat(21),
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("20文字以内");
    }
  });

  test("住所の最大長を超える場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "太郎",
      email: "test@example.com",
      address: "あ".repeat(501),
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("500文字以内");
    }
  });

  test("メモの最大長を超える場合にエラー", () => {
    const invalidData = {
      lastName: "山田",
      firstName: "太郎",
      email: "test@example.com",
      notes: "あ".repeat(2001),
    };

    const result = customerFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("2000文字以内");
    }
  });

  test("オプショナルフィールドは空文字列を許可", () => {
    const validData = {
      lastName: "山田",
      firstName: "太郎",
      lastNameKana: "",
      firstNameKana: "",
      email: "test@example.com",
      phoneNumber: "",
      address: "",
      notes: "",
    };

    const result = customerFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("オプショナルフィールドは省略可能", () => {
    const validData = {
      lastName: "山田",
      firstName: "太郎",
      email: "test@example.com",
    };

    const result = customerFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });
});

describe("updateCustomerStatusSchema", () => {
  test("有効なデータでバリデーションに成功する", () => {
    const validData = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: CustomerStatus.REGULAR,
    };

    const result = updateCustomerStatusSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("無効なUUIDの場合にエラー", () => {
    const invalidData = {
      id: "invalid-uuid",
      status: CustomerStatus.REGULAR,
    };

    const result = updateCustomerStatusSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("無効なステータスの場合にエラー", () => {
    const invalidData = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      status: "INVALID_STATUS",
    };

    const result = updateCustomerStatusSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("すべてのステータス値を許可", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const statuses = [
      CustomerStatus.NEW,
      CustomerStatus.REGULAR,
      CustomerStatus.VIP,
      CustomerStatus.INACTIVE,
      CustomerStatus.BLACKLIST,
    ];

    statuses.forEach((status) => {
      const result = updateCustomerStatusSchema.safeParse({ id, status });
      expect(result.success).toBe(true);
    });
  });
});

describe("updateCustomerNotesSchema", () => {
  test("有効なデータでバリデーションに成功する", () => {
    const validData = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      notes: "VIP顧客、特別対応が必要",
    };

    const result = updateCustomerNotesSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("メモがnullでもバリデーションに成功する", () => {
    const validData = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      notes: null,
    };

    const result = updateCustomerNotesSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("メモの最大長を超える場合にエラー", () => {
    const invalidData = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      notes: "あ".repeat(2001),
    };

    const result = updateCustomerNotesSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  test("無効なUUIDの場合にエラー", () => {
    const invalidData = {
      id: "invalid-uuid",
      notes: "test",
    };

    const result = updateCustomerNotesSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
