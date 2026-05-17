import { describe, test, expect } from "bun:test";
import {
  createReservationFormSchema,
  updateReservationFormSchema,
} from "@/app/(admin)/admin/(dashboard)/reservations/_components/reservation-form-schema";
import { ReservationStatus } from "@generated/prisma/enums";

const VALID_CUSTOMER_DATA = {
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
};

const VALID_EXISTING_CUSTOMER_INPUT = {
  mode: "existing",
  customerId: "123e4567-e89b-12d3-a456-426614174001",
  spaceId: "123e4567-e89b-12d3-a456-426614174000",
  date: "2026-03-01",
  startTime: "10:00",
  endTime: "12:00",
  status: ReservationStatus.CONFIRMED,
  sendEmail: true,
} as const;

const VALID_NEW_CUSTOMER_INPUT = {
  mode: "new",
  customerData: VALID_CUSTOMER_DATA,
  spaceId: "123e4567-e89b-12d3-a456-426614174000",
  date: "2026-03-01",
  startTime: "10:00",
  endTime: "12:00",
  status: ReservationStatus.CONFIRMED,
  sendEmail: true,
} as const;

describe("createReservationFormSchema", () => {
  describe("正常系", () => {
    test("既存顧客モードで有効なデータはバリデーション成功", () => {
      const result = createReservationFormSchema.safeParse(
        VALID_EXISTING_CUSTOMER_INPUT,
      );
      expect(result.success).toBe(true);
    });

    test("新規顧客モードで有効なデータはバリデーション成功", () => {
      const result = createReservationFormSchema.safeParse(
        VALID_NEW_CUSTOMER_INPUT,
      );
      expect(result.success).toBe(true);
    });

    test("オプショナルフィールドに空文字列を許可", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        couponCode: "",
        notes: "",
      });
      expect(result.success).toBe(true);
    });

    test("予約時間がちょうど1時間の場合に成功", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        startTime: "10:00",
        endTime: "11:00",
      });
      expect(result.success).toBe(true);
    });

    test("作成時は PENDING / CONFIRMED のみ許可", () => {
      for (const status of [
        ReservationStatus.PENDING,
        ReservationStatus.CONFIRMED,
      ]) {
        const result = createReservationFormSchema.safeParse({
          ...VALID_EXISTING_CUSTOMER_INPUT,
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    test("phoneNumber と companyName はオプショナル", () => {
      const customerData = {
        lastName: "山田",
        firstName: "太郎",
        email: "yamada@example.com",
      };
      const result = createReservationFormSchema.safeParse({
        ...VALID_NEW_CUSTOMER_INPUT,
        customerData,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("スペースIDが無効", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        spaceId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
    });

    test("日付形式が無効", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        date: "2026/03/01",
      });
      expect(result.success).toBe(false);
    });

    test("開始時間の形式が無効", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        startTime: "10時00分",
      });
      expect(result.success).toBe(false);
    });

    test("終了時間が24時間を超える", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        endTime: "25:00",
      });
      expect(result.success).toBe(false);
    });

    test("既存モードで customerId が空", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        customerId: "",
      });
      expect(result.success).toBe(false);
    });

    test("既存モードで customerId が不正な UUID", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        customerId: "invalid-uuid",
      });
      expect(result.success).toBe(false);
    });

    test("新規モードで customerData が欠落", () => {
      const result = createReservationFormSchema.safeParse({
        mode: "new",
        spaceId: VALID_EXISTING_CUSTOMER_INPUT.spaceId,
        date: VALID_EXISTING_CUSTOMER_INPUT.date,
        startTime: VALID_EXISTING_CUSTOMER_INPUT.startTime,
        endTime: VALID_EXISTING_CUSTOMER_INPUT.endTime,
        status: ReservationStatus.CONFIRMED,
        sendEmail: true,
      });
      expect(result.success).toBe(false);
    });

    test("新規モードで姓が空", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_NEW_CUSTOMER_INPUT,
        customerData: { ...VALID_CUSTOMER_DATA, lastName: "" },
      });
      expect(result.success).toBe(false);
    });

    test("新規モードで無効なメールアドレス", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_NEW_CUSTOMER_INPUT,
        customerData: { ...VALID_CUSTOMER_DATA, email: "invalid-email" },
      });
      expect(result.success).toBe(false);
    });

    test("終了時間が開始時間より前", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        startTime: "14:00",
        endTime: "12:00",
      });
      expect(result.success).toBe(false);
    });

    test("終了時間と開始時間が同じ", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        startTime: "10:00",
        endTime: "10:00",
      });
      expect(result.success).toBe(false);
    });

    test("予約時間が1時間未満", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        startTime: "10:00",
        endTime: "10:30",
      });
      expect(result.success).toBe(false);
    });

    test("料金に負の値", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        totalPrice: -100,
      });
      expect(result.success).toBe(false);
    });

    test("メモが1000文字超", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        notes: "あ".repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    test("クーポンコードが20文字超", () => {
      const result = createReservationFormSchema.safeParse({
        ...VALID_EXISTING_CUSTOMER_INPUT,
        couponCode: "A".repeat(21),
      });
      expect(result.success).toBe(false);
    });

    test("作成時に終端ステータスを拒否", () => {
      for (const status of [
        ReservationStatus.COMPLETED,
        ReservationStatus.CANCELLED,
        ReservationStatus.NO_SHOW,
      ]) {
        const result = createReservationFormSchema.safeParse({
          ...VALID_EXISTING_CUSTOMER_INPUT,
          status,
        });
        expect(result.success).toBe(false);
      }
    });
  });
});

describe("updateReservationFormSchema", () => {
  const VALID_UPDATE_INPUT = {
    spaceId: "123e4567-e89b-12d3-a456-426614174000",
    date: "2026-03-01",
    startTime: "10:00",
    endTime: "12:00",
    customerId: "123e4567-e89b-12d3-a456-426614174001",
    status: ReservationStatus.CONFIRMED,
    sendNotificationEmail: false,
  };

  describe("正常系", () => {
    test("有効なデータはバリデーション成功", () => {
      const result = updateReservationFormSchema.safeParse(VALID_UPDATE_INPUT);
      expect(result.success).toBe(true);
    });

    test("全 ReservationStatus を許可（更新時は終端状態も指定可能）", () => {
      for (const status of Object.values(ReservationStatus)) {
        const result = updateReservationFormSchema.safeParse({
          ...VALID_UPDATE_INPUT,
          status,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("異常系", () => {
    test("customerId が空でエラー", () => {
      const result = updateReservationFormSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        customerId: "",
      });
      expect(result.success).toBe(false);
    });

    test("終了時間 < 開始時間でエラー", () => {
      const result = updateReservationFormSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        startTime: "14:00",
        endTime: "12:00",
      });
      expect(result.success).toBe(false);
    });

    test("予約時間が1時間未満でエラー", () => {
      const result = updateReservationFormSchema.safeParse({
        ...VALID_UPDATE_INPUT,
        startTime: "10:00",
        endTime: "10:30",
      });
      expect(result.success).toBe(false);
    });
  });
});
