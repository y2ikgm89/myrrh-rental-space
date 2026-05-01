/**
 * 予約テストデータ
 */

import { ReservationStatus, CustomerStatus } from "@generated/prisma/enums";

export interface TestSpace {
  id: string;
  name: string;
  description: string;
  addressDetail: string | null;
  locationId: string;
  capacity: number;
  area: number;
  hourlyPrice: number;
  dailyPrice: number | null;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  businessHours: unknown;
  isPublished: boolean;
  publishedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestCustomer {
  id: string;
  lastName: string;
  firstName: string;
  email: string;
  phoneNumber: string;
  address: string | null;
  status: CustomerStatus;
  notes: string | null;
  totalReservations: number;
  totalSpent: number;
  lastReservationAt: Date | null;
  firstReservationAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestReservation {
  id: string;
  spaceId: string;
  userId: string | null;
  customerId: string;
  startTime: Date;
  endTime: Date;
  status: ReservationStatus;
  totalPrice: number;
  notes: string | null;
  termsAgreedAt: Date | null;
  googleCalendarEventId: string | null;
  googleCalendarOAuthEventId: string | null;
  calendarSyncedAt: Date | null;
  calendarSyncError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const TEST_SPACE: TestSpace = {
  id: "space-1",
  name: "テストスペースA",
  description: "テスト用のスペース",
  addressDetail: "3F",
  locationId: "33333333-3333-4333-8333-333333333333",
  capacity: 10,
  area: 50.0,
  hourlyPrice: 1000,
  dailyPrice: 8000,
  mainImageUrl: "/test-image.jpg",
  imageUrls: [],
  facilities: ["WiFi", "プロジェクター"],
  businessHours: null,
  isPublished: true,
  publishedAt: new Date("2024-01-01"),
  isActive: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const UNPUBLISHED_SPACE: TestSpace = {
  ...TEST_SPACE,
  id: "space-unpublished",
  name: "非公開スペース",
  isPublished: false,
  publishedAt: null,
};

export const TEST_CUSTOMER: TestCustomer = {
  id: "customer-1",
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
  address: "東京都渋谷区",
  status: CustomerStatus.NEW,
  notes: null,
  totalReservations: 0,
  totalSpent: 0,
  lastReservationAt: null,
  firstReservationAt: null,
  isActive: true,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

export const CONFIRMED_RESERVATION: TestReservation = {
  id: "reservation-1",
  spaceId: TEST_SPACE.id,
  userId: "admin-id",
  customerId: TEST_CUSTOMER.id,
  startTime: new Date("2024-02-01T10:00:00"),
  endTime: new Date("2024-02-01T12:00:00"),
  status: ReservationStatus.CONFIRMED,
  totalPrice: 2000,
  notes: null,
  termsAgreedAt: new Date("2024-01-15"),
  googleCalendarEventId: null,
  googleCalendarOAuthEventId: null,
  calendarSyncedAt: null,
  calendarSyncError: null,
  createdAt: new Date("2024-01-15"),
  updatedAt: new Date("2024-01-15"),
};

export const PENDING_RESERVATION: TestReservation = {
  ...CONFIRMED_RESERVATION,
  id: "reservation-2",
  status: ReservationStatus.PENDING,
  startTime: new Date("2024-02-01T14:00:00"),
  endTime: new Date("2024-02-01T16:00:00"),
};

export const CANCELLED_RESERVATION: TestReservation = {
  ...CONFIRMED_RESERVATION,
  id: "reservation-3",
  status: ReservationStatus.CANCELLED,
  startTime: new Date("2024-02-01T18:00:00"),
  endTime: new Date("2024-02-01T20:00:00"),
};

/**
 * 重複チェック用のテストケース
 *
 * 半開区間 [start, end) での重複判定をテスト
 */
export const OVERLAP_TEST_CASES = [
  {
    name: "完全重複",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    shouldOverlap: true,
  },
  {
    name: "部分重複（開始時刻が重複）",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T11:00:00"),
      end: new Date("2024-02-01T13:00:00"),
    },
    shouldOverlap: true,
  },
  {
    name: "部分重複（終了時刻が重複）",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T09:00:00"),
      end: new Date("2024-02-01T11:00:00"),
    },
    shouldOverlap: true,
  },
  {
    name: "包含（新規が既存を包む）",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T09:00:00"),
      end: new Date("2024-02-01T13:00:00"),
    },
    shouldOverlap: true,
  },
  {
    name: "包含（既存が新規を包む）",
    existing: {
      start: new Date("2024-02-01T09:00:00"),
      end: new Date("2024-02-01T13:00:00"),
    },
    new: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    shouldOverlap: true,
  },
  {
    name: "隣接（重複なし）- 既存の終了 = 新規の開始",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T12:00:00"),
      end: new Date("2024-02-01T14:00:00"),
    },
    shouldOverlap: false,
  },
  {
    name: "隣接（重複なし）- 新規の終了 = 既存の開始",
    existing: {
      start: new Date("2024-02-01T12:00:00"),
      end: new Date("2024-02-01T14:00:00"),
    },
    new: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    shouldOverlap: false,
  },
  {
    name: "完全に離れている（前）",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T08:00:00"),
      end: new Date("2024-02-01T09:00:00"),
    },
    shouldOverlap: false,
  },
  {
    name: "完全に離れている（後）",
    existing: {
      start: new Date("2024-02-01T10:00:00"),
      end: new Date("2024-02-01T12:00:00"),
    },
    new: {
      start: new Date("2024-02-01T14:00:00"),
      end: new Date("2024-02-01T16:00:00"),
    },
    shouldOverlap: false,
  },
] as const;

/**
 * 有効な予約入力データ
 */
export const VALID_RESERVATION_INPUT = {
  spaceId: "550e8400-e29b-41d4-a716-446655440000",
  date: "2099-12-01", // 未来の日付
  startTime: "10:00",
  endTime: "12:00",
  lastName: "山田",
  firstName: "太郎",
  email: "yamada@example.com",
  phoneNumber: "090-1234-5678",
  notes: "テスト予約",
};

/**
 * 規約同意付き予約入力データ
 */
export const VALID_RESERVATION_WITH_TERMS_INPUT = {
  ...VALID_RESERVATION_INPUT,
  agreedToTerms: true,
};
