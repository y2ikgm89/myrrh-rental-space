import { describe, test, expect, mock, beforeEach } from "bun:test";

// InquiryStatus 定数（Prisma enum を再現）
const InquiryStatus = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;
type InquiryStatus = (typeof InquiryStatus)[keyof typeof InquiryStatus];

// Prisma モック関数（mock.module より先に定義）
const mockInquiryFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInquiryCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "inquiry-1" }),
);

const mockInquiryUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "inquiry-1" }),
);

const mockInquiryDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "inquiry-1" }),
);

const mockCustomerFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));

const mockCustomerFindFirst = mock<
  (args: Record<string, unknown>) => Promise<{ id: string } | null>
>(() => Promise.resolve(null));

const mockCustomerCreate = mock<
  (args: Record<string, unknown>) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "guest-customer-id" }));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: {
      findUnique: mockInquiryFindUnique,
      create: mockInquiryCreate,
      update: mockInquiryUpdate,
      delete: mockInquiryDelete,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
      findFirst: mockCustomerFindFirst,
      create: mockCustomerCreate,
    },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  InquiryStatus,
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  updateInquiryStatus,
  replyToInquiryCommand,
  deleteInquiry,
  createInquiryCommand,
} from "@/shared/domain/inquiries/commands";

// テストデータ
const INQUIRY_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "660e8400-e29b-41d4-a716-446655440001";
const CUSTOMER_ID = "770e8400-e29b-41d4-a716-446655440001";

const EXISTING_INQUIRY = {
  id: INQUIRY_ID,
  name: "山田太郎",
  email: "yamada@example.com",
  subject: "スペース利用について",
  message: "詳しい料金を教えてください。",
};

const VALID_CREATE_INPUT: {
  name: string;
  companyName: string | null;
  email: string;
  subject: string;
  message: string;
} = {
  name: "田中花子",
  companyName: "株式会社テスト",
  email: "tanaka@example.com",
  subject: "予約について",
  message: "利用可能な日時を教えてください。",
};

describe("inquiries/commands", () => {
  beforeEach(() => {
    mockInquiryFindUnique.mockReset();
    mockInquiryCreate.mockReset();
    mockInquiryUpdate.mockReset();
    mockInquiryDelete.mockReset();
    mockCustomerFindUnique.mockReset();
    mockCustomerFindFirst.mockReset();
    mockCustomerCreate.mockReset();

    // デフォルト: お問い合わせ・顧客は存在しない
    mockInquiryFindUnique.mockResolvedValue(null);
    mockInquiryCreate.mockResolvedValue({ id: INQUIRY_ID });
    mockInquiryUpdate.mockResolvedValue({ id: INQUIRY_ID });
    mockInquiryDelete.mockResolvedValue({ id: INQUIRY_ID });
    mockCustomerFindUnique.mockResolvedValue(null);
    mockCustomerFindFirst.mockResolvedValue(null);
    mockCustomerCreate.mockResolvedValue({ id: "guest-customer-id" });
  });

  // =============================================================================
  // updateInquiryStatus
  // =============================================================================

  describe("updateInquiryStatus", () => {
    describe("正常系", () => {
      test("存在するお問い合わせのステータスを更新できる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({ id: INQUIRY_ID });

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.IN_PROGRESS),
        ).resolves.toBeUndefined();

        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INQUIRY_ID },
            data: { status: InquiryStatus.IN_PROGRESS },
          }),
        );
      });

      test("各ステータス値に更新できる", async () => {
        for (const status of Object.values(InquiryStatus)) {
          mockInquiryFindUnique.mockResolvedValueOnce({ id: INQUIRY_ID });
          mockInquiryUpdate.mockResolvedValueOnce({ id: INQUIRY_ID });

          await expect(
            updateInquiryStatus(INQUIRY_ID, status),
          ).resolves.toBeUndefined();
        }
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.RESOLVED),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "お問い合わせが見つかりません",
        });
      });

      test("NOT_FOUND エラー時に update が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateInquiryStatus(INQUIRY_ID, InquiryStatus.RESOLVED),
        ).rejects.toThrow(DomainError);

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // replyToInquiryCommand
  // =============================================================================

  describe("replyToInquiryCommand", () => {
    describe("正常系", () => {
      test("返信を保存して emailContext を返す", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(EXISTING_INQUIRY);

        const result = await replyToInquiryCommand(
          INQUIRY_ID,
          "詳細についてご案内します。",
          USER_ID,
        );

        expect(result.id).toBe(INQUIRY_ID);
        expect(result.emailContext).toEqual({
          name: "山田太郎",
          email: "yamada@example.com",
          subject: "スペース利用について",
          message: "詳しい料金を教えてください。",
        });
      });

      test("返信保存時に replyMessage と repliedById が設定される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(EXISTING_INQUIRY);

        await replyToInquiryCommand(INQUIRY_ID, "返信内容", USER_ID);

        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INQUIRY_ID },
            data: expect.objectContaining({
              replyMessage: "返信内容",
              repliedById: USER_ID,
              status: InquiryStatus.IN_PROGRESS,
            }),
          }),
        );
      });

      test("返信保存時に repliedAt が設定される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(EXISTING_INQUIRY);

        await replyToInquiryCommand(INQUIRY_ID, "返信内容", USER_ID);

        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              repliedAt: expect.any(Date),
            }),
          }),
        );
      });

      test("ステータスが IN_PROGRESS に変更される", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(EXISTING_INQUIRY);

        await replyToInquiryCommand(INQUIRY_ID, "返信", USER_ID);

        expect(mockInquiryUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: InquiryStatus.IN_PROGRESS,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          replyToInquiryCommand(INQUIRY_ID, "返信", USER_ID),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "お問い合わせが見つかりません",
        });
      });

      test("NOT_FOUND エラー時に update が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(
          replyToInquiryCommand(INQUIRY_ID, "返信", USER_ID),
        ).rejects.toThrow(DomainError);

        expect(mockInquiryUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // deleteInquiry
  // =============================================================================

  describe("deleteInquiry", () => {
    describe("正常系", () => {
      test("存在するお問い合わせを削除できる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({ id: INQUIRY_ID });

        await expect(deleteInquiry(INQUIRY_ID)).resolves.toBeUndefined();

        expect(mockInquiryDelete).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: INQUIRY_ID },
          }),
        );
      });

      test("delete が正しい ID で呼ばれる", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce({ id: INQUIRY_ID });

        await deleteInquiry(INQUIRY_ID);

        expect(mockInquiryDelete).toHaveBeenCalledTimes(1);
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(deleteInquiry(INQUIRY_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "お問い合わせが見つかりません",
        });
      });

      test("NOT_FOUND エラー時に delete が呼ばれない", async () => {
        mockInquiryFindUnique.mockResolvedValueOnce(null);

        await expect(deleteInquiry(INQUIRY_ID)).rejects.toThrow(DomainError);

        expect(mockInquiryDelete).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // createInquiryCommand
  // =============================================================================

  describe("createInquiryCommand", () => {
    describe("正常系", () => {
      test("customerId が明示されている場合はそのまま使用する（3段解決: 第1段）", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: CUSTOMER_ID,
        });

        expect(result.id).toBe(INQUIRY_ID);
        // email によるカスタマー検索はスキップされる
        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: CUSTOMER_ID,
            }),
          }),
        );
      });

      test("customerId が未指定でメール一致の会員顧客が存在しても未リンクゲスト顧客を作成する", async () => {
        mockCustomerFindUnique.mockResolvedValueOnce({ id: CUSTOMER_ID });
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.id).toBe(INQUIRY_ID);
        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              emailCanonical: "tanaka@example.com",
              userId: null,
            }),
          }),
        );
        expect(mockCustomerCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: VALID_CREATE_INPUT.email,
              emailCanonical: "tanaka@example.com",
              userId: null,
            }),
          }),
        );
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: "guest-customer-id",
            }),
          }),
        );
      });

      test("customerId が未指定で同じメールの未リンクゲスト顧客が存在する場合はその ID を使用する", async () => {
        mockCustomerFindFirst.mockResolvedValueOnce({
          id: "guest-existing-id",
        });
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.id).toBe(INQUIRY_ID);
        expect(mockCustomerCreate).not.toHaveBeenCalled();
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: "guest-existing-id",
            }),
          }),
        );
      });

      test("customerId: null が明示されている場合も未リンクゲスト顧客を作成する", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          customerId: null,
        });

        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).toHaveBeenCalledTimes(1);
        expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              customerId: "guest-customer-id",
            }),
          }),
        );
      });

      test("ステータスが NEW で作成される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        await createInquiryCommand(VALID_CREATE_INPUT);

        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: InquiryStatus.NEW,
            }),
          }),
        );
      });

      test("payload に入力フィールドが含まれる", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.payload).toEqual({
          inquiryId: INQUIRY_ID,
          name: "田中花子",
          companyName: "株式会社テスト",
          email: "tanaka@example.com",
          subject: "予約について",
          message: "利用可能な日時を教えてください。",
        });
      });

      test("companyName が空文字の場合は null として保存される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          companyName: "",
        });

        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyName: null,
            }),
          }),
        );
      });

      test("companyName が null の場合も null として保存される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          companyName: null,
        });

        expect(mockInquiryCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyName: null,
            }),
          }),
        );
      });

      test("payload の companyName は入力値をそのまま保持する（空文字でも）", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        const result = await createInquiryCommand({
          ...VALID_CREATE_INPUT,
          companyName: null,
        });

        // payload には元の companyName がそのまま入る
        expect(result.payload.companyName).toBeNull();
      });
    });

    describe("エッジケース", () => {
      test("customerId: undefined は未指定として扱い未リンクゲスト顧客 lookup が実行される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        // customerId を省略することで undefined として扱われる（exactOptionalPropertyTypes 対応）
        await createInquiryCommand({
          ...VALID_CREATE_INPUT,
        });

        expect(mockCustomerFindUnique).not.toHaveBeenCalled();
        expect(mockCustomerFindFirst).toHaveBeenCalledTimes(1);
      });

      test("create が返す id が結果の id に反映される", async () => {
        const generatedId = "generated-uuid-12345";
        mockInquiryCreate.mockResolvedValueOnce({ id: generatedId });

        const result = await createInquiryCommand(VALID_CREATE_INPUT);

        expect(result.id).toBe(generatedId);
        expect(result.payload.inquiryId).toBe(generatedId);
      });

      test("未リンクゲスト顧客 lookup には select で id フィールドが指定される", async () => {
        mockInquiryCreate.mockResolvedValueOnce({ id: INQUIRY_ID });

        await createInquiryCommand(VALID_CREATE_INPUT);

        expect(mockCustomerFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            select: { id: true },
          }),
        );
      });
    });
  });
});
