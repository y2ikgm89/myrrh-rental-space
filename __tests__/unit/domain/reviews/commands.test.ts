import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック（import より前に定義）
const mockReservationFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSpaceReviewCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "review-1", spaceId: "space-1" }),
);
const mockSpaceReviewFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSpaceReviewUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "review-1" }),
);
const mockSpaceReviewDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "review-1" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: mockReservationFindUnique,
    },
    spaceReview: {
      create: mockSpaceReviewCreate,
      findUnique: mockSpaceReviewFindUnique,
      update: mockSpaceReviewUpdate,
      delete: mockSpaceReviewDelete,
    },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  ReservationStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
  },
}));

import {
  createReviewCommand,
  toggleReviewPublishedCommand,
  deleteReviewCommand,
  replyToReviewCommand,
  deleteReviewReplyCommand,
} from "@/shared/domain/reviews/commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const CUSTOMER_ID = "customer-1";
const RESERVATION_ID = "reservation-1";
const SPACE_ID = "space-1";
const REVIEW_ID = "review-1";

const VALID_CREATE_INPUT = {
  customerId: CUSTOMER_ID,
  reservationId: RESERVATION_ID,
  rating: 5,
  title: "素晴らしいスペースでした",
  comment: "また利用したいです",
};

const COMPLETED_RESERVATION = {
  id: RESERVATION_ID,
  customerId: CUSTOMER_ID,
  spaceId: SPACE_ID,
  status: "COMPLETED",
  space: { reviewsEnabled: true },
  review: null,
};

describe("createReviewCommand", () => {
  beforeEach(() => {
    mockReservationFindUnique.mockReset();
    mockSpaceReviewCreate.mockReset();
    mockReservationFindUnique.mockResolvedValue(null);
    mockSpaceReviewCreate.mockResolvedValue({
      id: REVIEW_ID,
      spaceId: SPACE_ID,
    });
  });

  describe("正常系", () => {
    test("完了済み予約に対してレビューを作成できる", async () => {
      mockReservationFindUnique.mockResolvedValue(COMPLETED_RESERVATION);

      const result = await createReviewCommand(VALID_CREATE_INPUT);

      expect(result).toEqual({ id: REVIEW_ID, spaceId: SPACE_ID });
      expect(mockSpaceReviewCreate).toHaveBeenCalledTimes(1);
    });

    test("title と comment が null でもレビューを作成できる", async () => {
      mockReservationFindUnique.mockResolvedValue(COMPLETED_RESERVATION);
      mockSpaceReviewCreate.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await createReviewCommand({
        ...VALID_CREATE_INPUT,
        title: null,
        comment: null,
      });

      expect(result).toEqual({ id: REVIEW_ID, spaceId: SPACE_ID });
    });

    test("title と comment が空文字の場合も null として作成できる", async () => {
      mockReservationFindUnique.mockResolvedValue(COMPLETED_RESERVATION);

      await createReviewCommand({
        ...VALID_CREATE_INPUT,
        title: "",
        comment: "",
      });

      expect(mockSpaceReviewCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: null,
            comment: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("予約が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue(null);

      await expect(createReviewCommand(VALID_CREATE_INPUT)).rejects.toThrow(
        DomainError,
      );
      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "予約が見つかりません",
      });
    });

    test("他の顧客の予約に対してレビューを投稿しようとすると UNAUTHORIZED エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        customerId: "other-customer",
      });

      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "この予約にレビューを投稿する権限がありません",
      });
    });

    test("完了していない予約（PENDING）には VALIDATION エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        status: "PENDING",
      });

      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "完了済みの予約のみレビューを投稿できます",
      });
    });

    test("完了していない予約（CONFIRMED）には VALIDATION エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        status: "CONFIRMED",
      });

      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "VALIDATION",
      });
    });

    test("完了していない予約（CANCELLED）には VALIDATION エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        status: "CANCELLED",
      });

      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "VALIDATION",
      });
    });

    test("スペースの reviewsEnabled が false の場合は VALIDATION エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        space: { reviewsEnabled: false },
      });

      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "このスペースではレビュー投稿が無効化されています",
      });
    });

    test("reviewsEnabled が false の場合は spaceReview.create が呼ばれない", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        space: { reviewsEnabled: false },
      });

      await expect(createReviewCommand(VALID_CREATE_INPUT)).rejects.toThrow(
        DomainError,
      );

      expect(mockSpaceReviewCreate).not.toHaveBeenCalled();
    });

    test("既にレビューが存在する予約には CONFLICT エラーをスローする", async () => {
      mockReservationFindUnique.mockResolvedValue({
        ...COMPLETED_RESERVATION,
        review: { id: "existing-review" },
      });

      await expect(
        createReviewCommand(VALID_CREATE_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "この予約には既にレビューが投稿されています",
      });
    });
  });
});

describe("toggleReviewPublishedCommand", () => {
  beforeEach(() => {
    mockSpaceReviewFindUnique.mockReset();
    mockSpaceReviewUpdate.mockReset();
    mockSpaceReviewFindUnique.mockResolvedValue(null);
    mockSpaceReviewUpdate.mockResolvedValue({ id: REVIEW_ID });
  });

  describe("正常系", () => {
    test("レビューを公開状態に切り替えると spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await toggleReviewPublishedCommand(REVIEW_ID, true);

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewUpdate).toHaveBeenCalledTimes(1);
    });

    test("レビューを非公開状態に切り替えると spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await toggleReviewPublishedCommand(REVIEW_ID, false);

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPublished: false },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("レビューが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        toggleReviewPublishedCommand("non-existent", true),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "レビューが見つかりません",
      });
    });

    test("存在しないレビューでは update が呼ばれない", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        toggleReviewPublishedCommand("non-existent", true),
      ).rejects.toThrow(DomainError);

      expect(mockSpaceReviewUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("deleteReviewCommand", () => {
  beforeEach(() => {
    mockSpaceReviewFindUnique.mockReset();
    mockSpaceReviewDelete.mockReset();
    mockSpaceReviewFindUnique.mockResolvedValue(null);
    mockSpaceReviewDelete.mockResolvedValue({ id: REVIEW_ID });
  });

  describe("正常系", () => {
    test("レビューを削除すると spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await deleteReviewCommand(REVIEW_ID);

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewDelete).toHaveBeenCalledTimes(1);
    });

    test("delete が正しいレビュー ID で呼ばれる", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      await deleteReviewCommand(REVIEW_ID);

      expect(mockSpaceReviewDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("レビューが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(deleteReviewCommand("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "レビューが見つかりません",
      });
    });

    test("存在しないレビューでは delete が呼ばれない", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(deleteReviewCommand("non-existent")).rejects.toThrow(
        DomainError,
      );

      expect(mockSpaceReviewDelete).not.toHaveBeenCalled();
    });
  });
});

const ADMIN_USER_ID = "admin-user-1";

describe("replyToReviewCommand", () => {
  beforeEach(() => {
    mockSpaceReviewFindUnique.mockReset();
    mockSpaceReviewUpdate.mockReset();
    mockSpaceReviewFindUnique.mockResolvedValue(null);
    mockSpaceReviewUpdate.mockResolvedValue({ id: REVIEW_ID });
  });

  describe("正常系", () => {
    test("返信本文・repliedAt・repliedById を保存して spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await replyToReviewCommand({
        reviewId: REVIEW_ID,
        replyBody: "ご利用ありがとうございました。",
        adminUserId: ADMIN_USER_ID,
      });

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewUpdate).toHaveBeenCalledTimes(1);
      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: expect.objectContaining({
            replyBody: "ご利用ありがとうございました。",
            repliedById: ADMIN_USER_ID,
            repliedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("既存の返信がある場合は上書き更新する（編集フロー）", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      await replyToReviewCommand({
        reviewId: REVIEW_ID,
        replyBody: "更新された返信",
        adminUserId: ADMIN_USER_ID,
      });

      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ replyBody: "更新された返信" }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("レビューが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        replyToReviewCommand({
          reviewId: "non-existent",
          replyBody: "返信",
          adminUserId: ADMIN_USER_ID,
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "レビューが見つかりません",
      });
    });

    test("存在しないレビューでは update が呼ばれない", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        replyToReviewCommand({
          reviewId: "non-existent",
          replyBody: "返信",
          adminUserId: ADMIN_USER_ID,
        }),
      ).rejects.toThrow(DomainError);

      expect(mockSpaceReviewUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("deleteReviewReplyCommand", () => {
  beforeEach(() => {
    mockSpaceReviewFindUnique.mockReset();
    mockSpaceReviewUpdate.mockReset();
    mockSpaceReviewFindUnique.mockResolvedValue(null);
    mockSpaceReviewUpdate.mockResolvedValue({ id: REVIEW_ID });
  });

  describe("正常系", () => {
    test("replyBody / repliedAt / repliedById を null にクリアして spaceId を返す", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue({
        id: REVIEW_ID,
        spaceId: SPACE_ID,
      });

      const result = await deleteReviewReplyCommand(REVIEW_ID);

      expect(result).toEqual({ spaceId: SPACE_ID });
      expect(mockSpaceReviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REVIEW_ID },
          data: {
            replyBody: null,
            repliedAt: null,
            repliedById: null,
          },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("レビューが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceReviewFindUnique.mockResolvedValue(null);

      await expect(
        deleteReviewReplyCommand("non-existent"),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "レビューが見つかりません",
      });
    });
  });
});
