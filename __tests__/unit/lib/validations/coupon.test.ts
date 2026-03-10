import { describe, test, expect } from "bun:test";
import {
  couponCodeSchema,
  couponFormSchema,
  couponCodeInputSchema,
} from "@/shared/lib/validations/coupon";
import { CouponType } from "@/shared/db/enums";

describe("couponCodeSchema", () => {
  test("正常なクーポンコードが検証を通過する", () => {
    const validCodes = ["SAVE20", "SUMMER2024", "ABC123XYZ", "AAAA"];

    for (const code of validCodes) {
      const result = couponCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
    }
  });

  test("クーポンコードが大文字に変換される", () => {
    const result = couponCodeSchema.safeParse("SAVE20");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("SAVE20");
    }
  });

  test("クーポンコードが4文字未満の場合エラーになる", () => {
    const result = couponCodeSchema.safeParse("ABC");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "クーポンコードは4文字以上で入力してください",
      );
    }
  });

  test("クーポンコードが20文字を超える場合エラーになる", () => {
    const result = couponCodeSchema.safeParse("A".repeat(21));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "クーポンコードは20文字以内で入力してください",
      );
    }
  });

  test("クーポンコードに大文字英数字以外が含まれる場合エラーになる", () => {
    const invalidCodes = [
      {
        code: "SAVE-20",
        expectedError: "クーポンコードは大文字英数字のみ使用できます",
      },
      {
        code: "SAVE_20",
        expectedError: "クーポンコードは大文字英数字のみ使用できます",
      },
      {
        code: "SAVE 20",
        expectedError: "クーポンコードは大文字英数字のみ使用できます",
      },
      {
        code: "ABC",
        expectedError: "クーポンコードは4文字以上で入力してください",
      },
      {
        code: "save20",
        expectedError: "クーポンコードは大文字英数字のみ使用できます",
      },
      {
        code: "セール2024",
        expectedError: "クーポンコードは大文字英数字のみ使用できます",
      },
    ];

    for (const { code, expectedError } of invalidCodes) {
      const result = couponCodeSchema.safeParse(code);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(expectedError);
      }
    }
  });
});

describe("couponFormSchema", () => {
  test("正常なパーセント割引クーポンが検証を通過する", () => {
    const validData = {
      code: "SAVE20",
      name: "20%割引クーポン",
      description: "全商品20%オフ",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      minReservationAmount: 1000,
      maxDiscountAmount: 5000,
      validFrom: new Date("2024-01-01"),
      validUntil: new Date("2024-12-31"),
      usageLimit: 100,
      isActive: true,
      canCombineWithDurationDiscount: true,
    };

    const result = couponFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("正常な固定額割引クーポンが検証を通過する", () => {
    const validData = {
      code: "SAVE1000",
      name: "1000円割引クーポン",
      type: CouponType.FIXED_AMOUNT,
      discountValue: 1000,
      validFrom: new Date("2024-01-01"),
      isActive: true,
      canCombineWithDurationDiscount: true,
    };

    const result = couponFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("code が必須である", () => {
    const data = {
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が必須である", () => {
    const data = {
      code: "SAVE20",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("name が空文字列の場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("名称を入力してください");
    }
  });

  test("name が100文字を超える場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "a".repeat(101),
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "名称は100文字以内で入力してください",
      );
    }
  });

  test("description が500文字を超える場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      description: "a".repeat(501),
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "説明は500文字以内で入力してください",
      );
    }
  });

  test("description が空文字列の場合検証を通過する", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      description: "",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("discountValue が必須である", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("discountValue が0以下の場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 0,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "割引値は0より大きい必要があります",
      );
    }
  });

  test("パーセント割引の場合、100%を超えるとエラーになる", () => {
    const data = {
      code: "SAVE150",
      name: "150%割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 150,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find(
        (issue) => issue.path[0] === "discountValue",
      );
      expect(error?.message).toBe("パーセント割引は100%以下で入力してください");
    }
  });

  test("固定額割引の場合、100を超えても検証を通過する", () => {
    const data = {
      code: "SAVE5000",
      name: "5000円割引クーポン",
      type: CouponType.FIXED_AMOUNT,
      discountValue: 5000,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("minReservationAmount が負の数の場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      minReservationAmount: -100,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "最低利用金額は0以上で入力してください",
      );
    }
  });

  test("maxDiscountAmount が0以下の場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      maxDiscountAmount: 0,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "最大割引額は0より大きい必要があります",
      );
    }
  });

  test("validFrom が必須である", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("validUntil が validFrom より前の場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-12-31"),
      validUntil: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      const error = result.error.issues.find(
        (issue) => issue.path[0] === "validUntil",
      );
      expect(error?.message).toBe("有効期限は開始日より後に設定してください");
    }
  });

  test("validUntil が validFrom と同じ日時の場合検証を通過する", () => {
    const sameDate = new Date("2024-06-01");
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: sameDate,
      validUntil: sameDate,
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test("usageLimit が整数でない場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
      usageLimit: 10.5,
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "利用回数上限は整数で入力してください",
      );
    }
  });

  test("usageLimit が0以下の場合エラーになる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
      usageLimit: 0,
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "利用回数上限は1以上で入力してください",
      );
    }
  });

  test("isActive がデフォルトで true になる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isActive).toBe(true);
    }
  });

  test("canCombineWithDurationDiscount がデフォルトで true になる", () => {
    const data = {
      code: "SAVE20",
      name: "割引クーポン",
      type: CouponType.PERCENTAGE,
      discountValue: 20,
      validFrom: new Date("2024-01-01"),
    };

    const result = couponFormSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.canCombineWithDurationDiscount).toBe(true);
    }
  });
});

describe("couponCodeInputSchema", () => {
  test("正常なクーポンコードが検証を通過する", () => {
    const validData = {
      code: "SAVE20",
    };

    const result = couponCodeInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("code が必須である", () => {
    const data = {};

    const result = couponCodeInputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test("code が大文字に変換される（6文字以上）", () => {
    const data = {
      code: "SAVE2024",
    };

    const result = couponCodeInputSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("SAVE2024");
    }
  });
});
