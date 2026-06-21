/**
 * E2E テストデータ Factory
 *
 * 並列実行で衝突する可能性のあるフィールド（email / phone）を都度生成する。
 * 静的フィクスチャは `test-data.ts`（seed 由来の admin / urls のみ）。
 *
 * 使用例:
 * ```ts
 * import { inquiryFactory } from "../fixtures";
 * const data = inquiryFactory.build({ subject: "E2E カスタム" });
 * ```
 *
 * 設計原則:
 * - 全 factory は `build(overrides?)` method（部分上書き可）
 * - 一意性が要るフィールドは generator 関数で動的生成
 *
 * 規約 SSoT: `.claude/rules/test-quality/e2e.md`
 */

import { testUsers } from "./test-data";

// ---------------------------------------------------------------------------
// Unique value generators
// ---------------------------------------------------------------------------

let sequenceCounter = 0;

function nextSequence(): string {
  sequenceCounter += 1;
  return `${Date.now()}-${sequenceCounter}`;
}

/** 一意な email アドレス生成（例: e2e-test-1234567890-1@example.com） */
export function uniqueEmail(prefix = "e2e-test"): string {
  return `${prefix}-${nextSequence()}@example.com`;
}

/** 一意な phone 番号生成（フォーマット: 090-XXXX-XXXX） */
export function uniquePhone(): string {
  const rand = Math.floor(10000000 + Math.random() * 90000000).toString();
  return `090-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
}

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
// Admin credentials (seed-driven, static)
// ---------------------------------------------------------------------------

/** Seed の admin user wrapper。`testUsers.admin.email` ＋ seed password。 */
export const adminCredentials = {
  email: testUsers.admin.email,
  password: "admin123",
} as const;
