/**
 * E2E テストデータ Factory
 *
 * Builder pattern で reusable な test data を生成する。
 * ユニーク性が必要な値（email / phone / slug）は `Date.now()` + random
 * suffix で自動生成し、テスト並列実行時の衝突を回避する。
 *
 * 使用例:
 * ```ts
 * import { reservationFactory, customerFactory } from "../fixtures/factories";
 *
 * const reservation = reservationFactory.build({
 *   purpose: "E2E test",
 *   numberOfPeople: 10,
 * });
 * ```
 *
 * 設計原則:
 * - 全 factory は `build(overrides?)` method を持つ（部分上書き可）
 * - 型安全: Partial<T> で上書き、戻り値は完全な T 型
 * - デフォルト値は valid な値（バリデーション失敗しない）
 * - 一意性が必要なフィールドは generator 関数で動的生成
 */

import { testUsers } from "./test-data";

// ---------------------------------------------------------------------------
// Unique value generators
// ---------------------------------------------------------------------------

let sequenceCounter = 0;

/**
 * テスト実行中に一意なシーケンス番号を生成。
 * Date.now() と組み合わせてさらに並列実行時の衝突を避ける。
 */
function nextSequence(): string {
  sequenceCounter += 1;
  return `${Date.now()}-${sequenceCounter}`;
}

/**
 * 一意な email アドレス生成（例: e2e-test-1234567890-1@example.com）
 */
export function uniqueEmail(prefix = "e2e-test"): string {
  return `${prefix}-${nextSequence()}@example.com`;
}

/**
 * 一意な phone 番号生成（例: 090-1234-5678）
 * フォーマット: 090-XXXX-XXXX （ランダム 8 桁）
 */
export function uniquePhone(): string {
  const rand = Math.floor(10000000 + Math.random() * 90000000).toString();
  return `090-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
}

/**
 * 一意な slug 生成（URL セーフ、kebab-case）
 */
export function uniqueSlug(prefix = "test"): string {
  return `${prefix}-${nextSequence().replace(/-/g, "")}`;
}

// ---------------------------------------------------------------------------
// Reservation factory
// ---------------------------------------------------------------------------

export interface ReservationFactoryInput {
  readonly customerLastName: string;
  readonly customerFirstName: string;
  readonly customerEmail: string;
  readonly customerPhone: string;
  readonly purpose: string;
  readonly numberOfPeople: number;
  readonly notes: string;
  readonly agreedToTerms: boolean;
}

function defaultReservation(): ReservationFactoryInput {
  return {
    customerLastName: "E2Eテスト",
    customerFirstName: "太郎",
    customerEmail: uniqueEmail("e2e-reservation"),
    customerPhone: uniquePhone(),
    purpose: "E2E テスト予約",
    numberOfPeople: 5,
    notes: "自動生成された E2E テスト予約です",
    agreedToTerms: true,
  };
}

export const reservationFactory = {
  build(
    overrides: Partial<ReservationFactoryInput> = {},
  ): ReservationFactoryInput {
    return { ...defaultReservation(), ...overrides };
  },

  /**
   * 無効なデータを生成（バリデーションエラーテスト用）
   */
  buildInvalid(
    overrides: Partial<ReservationFactoryInput> = {},
  ): ReservationFactoryInput {
    return {
      customerLastName: "", // 必須違反
      customerFirstName: "",
      customerEmail: "not-an-email", // 形式違反
      customerPhone: "abc", // 形式違反
      purpose: "",
      numberOfPeople: 0, // 最小値違反
      notes: "",
      agreedToTerms: false, // リテラル違反
      ...overrides,
    };
  },
};

// ---------------------------------------------------------------------------
// Customer factory
// ---------------------------------------------------------------------------

export interface CustomerFactoryInput {
  readonly lastName: string;
  readonly firstName: string;
  readonly email: string;
  readonly phoneNumber: string;
  readonly companyName: string | null;
}

function defaultCustomer(): CustomerFactoryInput {
  return {
    lastName: "顧客テスト",
    firstName: "次郎",
    email: uniqueEmail("e2e-customer"),
    phoneNumber: uniquePhone(),
    companyName: "E2E Test Co., Ltd.",
  };
}

export const customerFactory = {
  build(overrides: Partial<CustomerFactoryInput> = {}): CustomerFactoryInput {
    return { ...defaultCustomer(), ...overrides };
  },
};

// ---------------------------------------------------------------------------
// Inquiry factory
// ---------------------------------------------------------------------------

export interface InquiryFactoryInput {
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly subject: string;
  readonly message: string;
}

function defaultInquiry(): InquiryFactoryInput {
  return {
    name: "問合せテスト太郎",
    email: uniqueEmail("e2e-inquiry"),
    phone: uniquePhone(),
    subject: "E2E テストお問い合わせ",
    message:
      "これは E2E テストで自動生成されたお問い合わせメッセージです。対応不要です。",
  };
}

export const inquiryFactory = {
  build(overrides: Partial<InquiryFactoryInput> = {}): InquiryFactoryInput {
    return { ...defaultInquiry(), ...overrides };
  },
};

// ---------------------------------------------------------------------------
// Space factory（管理画面でのスペース作成フォーム用）
// ---------------------------------------------------------------------------

export interface SpaceFactoryInput {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly capacity: number;
  readonly hourlyPrice: number;
  readonly dailyPrice: number;
}

function defaultSpace(): SpaceFactoryInput {
  const slug = uniqueSlug("e2e-space");
  return {
    name: `E2E テストスペース ${slug}`,
    slug,
    description: "E2E テスト用に自動生成されたスペースです",
    capacity: 10,
    hourlyPrice: 1500,
    dailyPrice: 12000,
  };
}

export const spaceFactory = {
  build(overrides: Partial<SpaceFactoryInput> = {}): SpaceFactoryInput {
    return { ...defaultSpace(), ...overrides };
  },
};

// ---------------------------------------------------------------------------
// Date helpers（予約日時の定番生成）
// ---------------------------------------------------------------------------

/**
 * 明日の日付オブジェクトを取得（予約日選択で未来日必須のため）
 */
export function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

/**
 * N 日後の日付オブジェクトを取得
 */
export function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * 日付の「日」部分のみ取得（カレンダークリック用、例: "15"）
 */
export function getDayNumber(date: Date): number {
  return date.getDate();
}

// ---------------------------------------------------------------------------
// Admin user helpers（既存の testUsers を type-safe に export）
// ---------------------------------------------------------------------------

/**
 * 管理者ログイン情報（seed で作成されたデフォルト admin）
 * testUsers.admin をそのまま公開するラッパー
 */
export const adminCredentials = {
  email: testUsers.admin.email,
  password: "admin123", // seed パスワード
} as const;
