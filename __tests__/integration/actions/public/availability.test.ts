/**
 * 公開利用可能時間帯・営業時間 Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/availability.ts のテスト
 *
 * モック方針:
 * - checkActionRateLimit: action-helpers をモック（常に成功を返す）
 * - getAvailableTimeSlots: time-slots をモック（DB アクセスなし）
 * - getBusinessHoursSettingsQuery: availability クエリをモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mock(() => Promise.resolve({ success: true })),
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
}));

const mockGetAvailableTimeSlots = mock(() =>
  Promise.resolve([
    { time: "09:00", available: true },
    { time: "10:00", available: false },
    { time: "11:00", available: true },
  ]),
);

mock.module("@/shared/lib/reservation/time-slots", () => ({
  getAvailableTimeSlots: mockGetAvailableTimeSlots,
}));

const mockGetBusinessHoursSettingsQuery = mock<
  () => Promise<{
    monday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
    tuesday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
    wednesday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
    thursday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
    friday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
    saturday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
    sunday: {
      isOpen: boolean;
      slots: { openTime: string; closeTime: string }[];
    };
  } | null>
>(() =>
  Promise.resolve({
    monday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "18:00" }],
    },
    tuesday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "18:00" }],
    },
    wednesday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "18:00" }],
    },
    thursday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "18:00" }],
    },
    friday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "18:00" }],
    },
    saturday: {
      isOpen: false,
      slots: [],
    },
    sunday: {
      isOpen: false,
      slots: [],
    },
  }),
);

mock.module("@/shared/domain/reservations/availability", () => ({
  getBusinessHoursSettingsQuery: mockGetBusinessHoursSettingsQuery,
  getReservationsForDateQuery: mock(() => Promise.resolve([])),
}));

// server-only モック（テスト環境で server-only を無効化）
mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_SPACE_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_DATE = "2025-06-01";

// =============================================================================
// テスト本体
// =============================================================================

describe("fetchAvailableSlots", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockClear();
    mockGetAvailableTimeSlots.mockClear();
    // 成功レスポンスにリセット
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetAvailableTimeSlots.mockImplementation(() =>
      Promise.resolve([
        { time: "09:00", available: true },
        { time: "10:00", available: false },
        { time: "11:00", available: true },
      ]),
    );
  });

  describe("正常系", () => {
    test("有効な spaceId と date で時間枠の配列を返す", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots(VALID_SPACE_ID, VALID_DATE);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    test("getAvailableTimeSlots が spaceId と date を引数に呼ばれる", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      await fetchAvailableSlots(VALID_SPACE_ID, VALID_DATE);

      expect(mockGetAvailableTimeSlots).toHaveBeenCalledTimes(1);
      expect(mockGetAvailableTimeSlots).toHaveBeenCalledWith(
        VALID_SPACE_ID,
        VALID_DATE,
      );
    });

    test("戻り値の時間枠に time と available プロパティが含まれる", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots(VALID_SPACE_ID, VALID_DATE);

      const firstSlot = result[0];
      expect(firstSlot).toBeDefined();
      if (firstSlot) {
        expect(firstSlot).toHaveProperty("time");
        expect(firstSlot).toHaveProperty("available");
      }
    });

    test("利用可能な時間枠がない場合は空配列を返す", async () => {
      mockGetAvailableTimeSlots.mockImplementation(() => Promise.resolve([]));

      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots(VALID_SPACE_ID, VALID_DATE);

      expect(result).toEqual([]);
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時は空配列を返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        }),
      );

      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots(VALID_SPACE_ID, VALID_DATE);

      expect(result).toEqual([]);
    });

    test("レート制限超過時は getAvailableTimeSlots が呼ばれない", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "レート制限超過",
        }),
      );

      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      await fetchAvailableSlots(VALID_SPACE_ID, VALID_DATE);

      expect(mockGetAvailableTimeSlots).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("spaceId が無効な UUID のとき空配列を返す", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots("not-a-uuid", VALID_DATE);

      expect(result).toEqual([]);
    });

    test("spaceId が無効な UUID のとき getAvailableTimeSlots が呼ばれない", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      await fetchAvailableSlots("not-a-uuid", VALID_DATE);

      expect(mockGetAvailableTimeSlots).not.toHaveBeenCalled();
    });

    test("date が YYYY-MM-DD 形式でないとき空配列を返す", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots(VALID_SPACE_ID, "2025/06/01");

      expect(result).toEqual([]);
    });

    test("date が不正な形式のとき getAvailableTimeSlots が呼ばれない", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      await fetchAvailableSlots(VALID_SPACE_ID, "20250601");

      expect(mockGetAvailableTimeSlots).not.toHaveBeenCalled();
    });

    test("spaceId が空文字列のとき空配列を返す", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots("", VALID_DATE);

      expect(result).toEqual([]);
    });

    test("date が空文字列のとき空配列を返す", async () => {
      const { fetchAvailableSlots } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchAvailableSlots(VALID_SPACE_ID, "");

      expect(result).toEqual([]);
    });
  });
});

describe("fetchBusinessHours", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockClear();
    mockGetBusinessHoursSettingsQuery.mockClear();
    // 成功レスポンスにリセット
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetBusinessHoursSettingsQuery.mockImplementation(() =>
      Promise.resolve({
        monday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "18:00" }],
        },
        tuesday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "18:00" }],
        },
        wednesday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "18:00" }],
        },
        thursday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "18:00" }],
        },
        friday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "18:00" }],
        },
        saturday: {
          isOpen: false,
          slots: [],
        },
        sunday: {
          isOpen: false,
          slots: [],
        },
      }),
    );
  });

  describe("正常系", () => {
    test("営業時間設定を返す", async () => {
      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchBusinessHours();

      expect(result).not.toBeNull();
    });

    test("戻り値に曜日ごとの営業時間が含まれる", async () => {
      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchBusinessHours();

      expect(result).toHaveProperty("monday");
      expect(result).toHaveProperty("tuesday");
      expect(result).toHaveProperty("wednesday");
      expect(result).toHaveProperty("thursday");
      expect(result).toHaveProperty("friday");
      expect(result).toHaveProperty("saturday");
      expect(result).toHaveProperty("sunday");
    });

    test("getBusinessHoursSettingsQuery が呼ばれる", async () => {
      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      await fetchBusinessHours();

      expect(mockGetBusinessHoursSettingsQuery).toHaveBeenCalledTimes(1);
    });

    test("設定が null の場合は null を返す", async () => {
      mockGetBusinessHoursSettingsQuery.mockImplementation(() =>
        Promise.resolve(null),
      );

      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchBusinessHours();

      expect(result).toBeNull();
    });

    test("各曜日の isOpen と slots プロパティが含まれる", async () => {
      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchBusinessHours();

      if (result) {
        expect(result.monday).toHaveProperty("isOpen");
        expect(result.monday).toHaveProperty("slots");
        expect(result.saturday).toHaveProperty("isOpen");
        expect(result.saturday).toHaveProperty("slots");
      }
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時は null を返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        }),
      );

      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      const result = await fetchBusinessHours();

      expect(result).toBeNull();
    });

    test("レート制限超過時は getBusinessHoursSettingsQuery が呼ばれない", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "レート制限超過",
        }),
      );

      const { fetchBusinessHours } =
        await import("@/app/(public)/_shared/actions/availability");

      await fetchBusinessHours();

      expect(mockGetBusinessHoursSettingsQuery).not.toHaveBeenCalled();
    });
  });
});
