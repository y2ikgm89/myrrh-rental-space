import { describe, test, expect, mock, beforeEach } from "bun:test";

const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  USER: "USER",
  CUSTOMER: "CUSTOMER",
} as const;
type Role = (typeof Role)[keyof typeof Role];

const AuditAction = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  PUBLISH: "PUBLISH",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
} as const;

// -----------------------------------------------------------------------------
// Prisma モック関数（mock.module より先に定義）
// -----------------------------------------------------------------------------

const mockInquiryFindUnique = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInquiryUpdate = mock<
  (args: {
    where: { id: string };
    data: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "inquiry-1" }));

const mockUserFindUnique = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInternalNoteFindUnique = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInternalNoteCreate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({}));

const mockInternalNoteDelete = mock<
  (args: { where: { id: string } }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({}));

const mockInquiryTagFindMany = mock<
  (args: unknown) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

const mockInquiryTagFindFirst = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInquiryTagFindUnique = mock<
  (args: unknown) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInquiryTagCreate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "tag-created" }));

const mockInquiryTagUpdate = mock<
  (args: unknown) => Promise<Record<string, unknown>>
>(() => Promise.resolve({}));

const mockInquiryTagDelete = mock<
  (args: unknown) => Promise<Record<string, unknown>>
>(() => Promise.resolve({}));

const mockTagOnInquiryDeleteMany = mock<
  (args: unknown) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockTagOnInquiryCreateMany = mock<
  (args: unknown) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockCreateAuditLogRecord = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(undefined));

const prismaInquiry = {
  findUnique: mockInquiryFindUnique,
  update: mockInquiryUpdate,
};
const prismaUser = { findUnique: mockUserFindUnique };
const prismaInternalNote = {
  findUnique: mockInternalNoteFindUnique,
  create: mockInternalNoteCreate,
  delete: mockInternalNoteDelete,
};
const prismaInquiryTag = {
  findMany: mockInquiryTagFindMany,
  findFirst: mockInquiryTagFindFirst,
  findUnique: mockInquiryTagFindUnique,
  create: mockInquiryTagCreate,
  update: mockInquiryTagUpdate,
  delete: mockInquiryTagDelete,
};
const prismaTagOnInquiry = {
  deleteMany: mockTagOnInquiryDeleteMany,
  createMany: mockTagOnInquiryCreateMany,
};

// -----------------------------------------------------------------------------
// モジュールモック（import より前に配置）
// -----------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: prismaInquiry,
    user: prismaUser,
    inquiryInternalNote: prismaInternalNote,
    inquiryTag: prismaInquiryTag,
    inquiryTagOnInquiry: prismaTagOnInquiry,
    $transaction: <T>(
      fn: (tx: {
        inquiryTagOnInquiry: typeof prismaTagOnInquiry;
      }) => Promise<T>,
    ) => fn({ inquiryTagOnInquiry: prismaTagOnInquiry }),
  },
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));

const actualEnums = await import("@generated/prisma/enums");
mock.module("@generated/prisma/enums", () => ({
  ...actualEnums,
  Role,
  AuditAction,
}));

// -----------------------------------------------------------------------------
// Target import
// -----------------------------------------------------------------------------

const { DomainError } = await import("@/shared/domain/domain-error");
const {
  assignInquiryCommand,
  updateInquirySlaCommand,
  createInquiryInternalNoteCommand,
  deleteInquiryInternalNoteCommand,
  setInquiryTagsCommand,
  createInquiryTagCommand,
  updateInquiryTagCommand,
  deleteInquiryTagCommand,
} = await import("@/shared/domain/inquiries/ops-commands");

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const INQUIRY_ID = "550e8400-e29b-41d4-a716-446655440001";
const USER_ID = "660e8400-e29b-41d4-a716-446655440001";
const OTHER_USER_ID = "660e8400-e29b-41d4-a716-446655440002";
const ADMIN_ID = "660e8400-e29b-41d4-a716-446655440003";
const TAG_ID_1 = "770e8400-e29b-41d4-a716-446655440001";
const TAG_ID_2 = "770e8400-e29b-41d4-a716-446655440002";
const NOTE_ID = "880e8400-e29b-41d4-a716-446655440001";

const ACTIVE_INQUIRY = { id: INQUIRY_ID, deletedAt: null, assigneeId: null };
const DELETED_INQUIRY = {
  id: INQUIRY_ID,
  deletedAt: new Date("2099-01-01T00:00:00Z"),
  assigneeId: null,
};

describe("inquiries/ops-commands", () => {
  beforeEach(() => {
    mockInquiryFindUnique.mockReset().mockResolvedValue(ACTIVE_INQUIRY);
    mockInquiryUpdate.mockReset().mockResolvedValue({ id: INQUIRY_ID });
    mockUserFindUnique.mockReset().mockResolvedValue(null);
    mockInternalNoteFindUnique.mockReset().mockResolvedValue(null);
    mockInternalNoteCreate.mockReset().mockResolvedValue({});
    mockInternalNoteDelete.mockReset().mockResolvedValue({});
    mockInquiryTagFindMany.mockReset().mockResolvedValue([]);
    mockInquiryTagFindFirst.mockReset().mockResolvedValue(null);
    mockInquiryTagFindUnique.mockReset().mockResolvedValue(null);
    mockInquiryTagCreate.mockReset().mockResolvedValue({ id: "tag-created" });
    mockInquiryTagUpdate.mockReset().mockResolvedValue({});
    mockInquiryTagDelete.mockReset().mockResolvedValue({});
    mockTagOnInquiryDeleteMany.mockReset().mockResolvedValue({ count: 0 });
    mockTagOnInquiryCreateMany.mockReset().mockResolvedValue({ count: 0 });
    mockCreateAuditLogRecord.mockReset().mockResolvedValue(undefined);
  });

  // ===========================================================================
  // assignInquiryCommand
  // ===========================================================================

  describe("assignInquiryCommand", () => {
    test("ADMIN ロールの担当者を set し、AuditLog に before/after を記録する", async () => {
      mockUserFindUnique.mockResolvedValueOnce({ role: Role.ADMIN });

      const result = await assignInquiryCommand(INQUIRY_ID, ADMIN_ID, USER_ID);

      expect(result).toEqual({ id: INQUIRY_ID, assigneeId: ADMIN_ID });
      expect(mockInquiryUpdate).toHaveBeenCalledWith({
        where: { id: INQUIRY_ID },
        data: { assigneeId: ADMIN_ID },
      });
      expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          resource: "inquiry.assignee",
          resourceId: INQUIRY_ID,
          oldValue: { assigneeId: null },
          newValue: { assigneeId: ADMIN_ID },
        }),
      );
    });

    test("assigneeId: null で担当解除できる", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        ...ACTIVE_INQUIRY,
        assigneeId: ADMIN_ID,
      });

      const result = await assignInquiryCommand(INQUIRY_ID, null, USER_ID);

      expect(result).toEqual({ id: INQUIRY_ID, assigneeId: null });
      expect(mockInquiryUpdate).toHaveBeenCalledWith({
        where: { id: INQUIRY_ID },
        data: { assigneeId: null },
      });
      expect(mockUserFindUnique).not.toHaveBeenCalled();
    });

    test("同一 assigneeId は no-op (update / AuditLog を呼ばない)", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        ...ACTIVE_INQUIRY,
        assigneeId: ADMIN_ID,
      });

      await assignInquiryCommand(INQUIRY_ID, ADMIN_ID, USER_ID);

      expect(mockInquiryUpdate).not.toHaveBeenCalled();
      expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    });

    test("EDITOR ロールへの割当は NOT_FOUND (inquiry:update 権限なし)", async () => {
      mockUserFindUnique.mockResolvedValueOnce({ role: Role.EDITOR });

      await expect(
        assignInquiryCommand(INQUIRY_ID, OTHER_USER_ID, USER_ID),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockInquiryUpdate).not.toHaveBeenCalled();
    });

    test("存在しない担当者候補は NOT_FOUND", async () => {
      mockUserFindUnique.mockResolvedValueOnce(null);

      await expect(
        assignInquiryCommand(INQUIRY_ID, OTHER_USER_ID, USER_ID),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("soft-deleted な Inquiry は NOT_FOUND", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(DELETED_INQUIRY);

      await expect(
        assignInquiryCommand(INQUIRY_ID, ADMIN_ID, USER_ID),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockInquiryUpdate).not.toHaveBeenCalled();
    });

    test("存在しない Inquiry は NOT_FOUND", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(null);

      await expect(
        assignInquiryCommand(INQUIRY_ID, ADMIN_ID, USER_ID),
      ).rejects.toThrow(DomainError);
    });
  });

  // ===========================================================================
  // updateInquirySlaCommand
  // ===========================================================================

  describe("updateInquirySlaCommand", () => {
    test("SLA 期限を新規設定できる", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        ...ACTIVE_INQUIRY,
        slaExpiresAt: null,
      });
      const sla = new Date("2099-06-01T00:00:00Z");

      const result = await updateInquirySlaCommand(INQUIRY_ID, sla);

      expect(result).toEqual({ id: INQUIRY_ID, slaExpiresAt: sla });
      expect(mockInquiryUpdate).toHaveBeenCalledWith({
        where: { id: INQUIRY_ID },
        data: { slaExpiresAt: sla },
      });
    });

    test("null を渡すと SLA をクリアする", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        ...ACTIVE_INQUIRY,
        slaExpiresAt: new Date("2099-06-01T00:00:00Z"),
      });

      await updateInquirySlaCommand(INQUIRY_ID, null);

      expect(mockInquiryUpdate).toHaveBeenCalledWith({
        where: { id: INQUIRY_ID },
        data: { slaExpiresAt: null },
      });
    });

    test("同一日時は no-op で update を呼ばない", async () => {
      const sla = new Date("2099-06-01T00:00:00Z");
      mockInquiryFindUnique.mockResolvedValueOnce({
        ...ACTIVE_INQUIRY,
        slaExpiresAt: sla,
      });

      await updateInquirySlaCommand(INQUIRY_ID, new Date(sla.getTime()));

      expect(mockInquiryUpdate).not.toHaveBeenCalled();
    });

    test("soft-deleted な Inquiry は NOT_FOUND", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(DELETED_INQUIRY);

      await expect(
        updateInquirySlaCommand(INQUIRY_ID, new Date()),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ===========================================================================
  // createInquiryInternalNoteCommand / deleteInquiryInternalNoteCommand
  // ===========================================================================

  describe("createInquiryInternalNoteCommand", () => {
    test("メモを作成し authorName を含めて返す", async () => {
      mockInternalNoteCreate.mockResolvedValueOnce({
        id: NOTE_ID,
        body: "社内メモ",
        authorId: USER_ID,
        author: { name: "スタッフ太郎" },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      });

      const result = await createInquiryInternalNoteCommand(
        INQUIRY_ID,
        USER_ID,
        "社内メモ",
      );

      expect(result.authorName).toBe("スタッフ太郎");
      expect(mockInternalNoteCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { inquiryId: INQUIRY_ID, authorId: USER_ID, body: "社内メモ" },
        }),
      );
    });

    test("soft-deleted な Inquiry は NOT_FOUND で create を呼ばない", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(DELETED_INQUIRY);

      await expect(
        createInquiryInternalNoteCommand(INQUIRY_ID, USER_ID, "メモ"),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockInternalNoteCreate).not.toHaveBeenCalled();
    });
  });

  describe("deleteInquiryInternalNoteCommand", () => {
    test("投稿者本人は削除できる", async () => {
      mockInternalNoteFindUnique.mockResolvedValueOnce({
        id: NOTE_ID,
        authorId: USER_ID,
      });

      const result = await deleteInquiryInternalNoteCommand(
        NOTE_ID,
        USER_ID,
        Role.VIEWER,
      );

      expect(result).toEqual({ id: NOTE_ID });
      expect(mockInternalNoteDelete).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
      });
    });

    test("ADMIN は他人のメモも削除できる", async () => {
      mockInternalNoteFindUnique.mockResolvedValueOnce({
        id: NOTE_ID,
        authorId: OTHER_USER_ID,
      });

      await deleteInquiryInternalNoteCommand(NOTE_ID, ADMIN_ID, Role.ADMIN);

      expect(mockInternalNoteDelete).toHaveBeenCalledTimes(1);
    });

    test("投稿者本人でも ADMIN でもない場合は FORBIDDEN", async () => {
      mockInternalNoteFindUnique.mockResolvedValueOnce({
        id: NOTE_ID,
        authorId: OTHER_USER_ID,
      });

      await expect(
        deleteInquiryInternalNoteCommand(NOTE_ID, USER_ID, Role.EDITOR),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockInternalNoteDelete).not.toHaveBeenCalled();
    });

    test("存在しないメモは NOT_FOUND", async () => {
      mockInternalNoteFindUnique.mockResolvedValueOnce(null);

      await expect(
        deleteInquiryInternalNoteCommand(NOTE_ID, USER_ID, Role.ADMIN),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ===========================================================================
  // setInquiryTagsCommand
  // ===========================================================================

  describe("setInquiryTagsCommand", () => {
    test("タグ ID 配列で全置換する (deleteMany → createMany)", async () => {
      mockInquiryTagFindMany.mockResolvedValueOnce([
        { id: TAG_ID_1 },
        { id: TAG_ID_2 },
      ]);

      const result = await setInquiryTagsCommand(INQUIRY_ID, [
        TAG_ID_1,
        TAG_ID_2,
      ]);

      expect(result.tagIds).toEqual([TAG_ID_1, TAG_ID_2]);
      expect(mockTagOnInquiryDeleteMany).toHaveBeenCalledWith({
        where: { inquiryId: INQUIRY_ID },
      });
      expect(mockTagOnInquiryCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { inquiryId: INQUIRY_ID, tagId: TAG_ID_1 },
            { inquiryId: INQUIRY_ID, tagId: TAG_ID_2 },
          ],
        }),
      );
    });

    test("空配列を渡すと全解除し createMany は呼ばない", async () => {
      await setInquiryTagsCommand(INQUIRY_ID, []);

      expect(mockTagOnInquiryDeleteMany).toHaveBeenCalledWith({
        where: { inquiryId: INQUIRY_ID },
      });
      expect(mockTagOnInquiryCreateMany).not.toHaveBeenCalled();
    });

    test("重複 tagId は dedupe される", async () => {
      mockInquiryTagFindMany.mockResolvedValueOnce([{ id: TAG_ID_1 }]);

      const result = await setInquiryTagsCommand(INQUIRY_ID, [
        TAG_ID_1,
        TAG_ID_1,
      ]);

      expect(result.tagIds).toEqual([TAG_ID_1]);
    });

    test("存在しないタグ ID が含まれる場合は NOT_FOUND で transaction を呼ばない", async () => {
      mockInquiryTagFindMany.mockResolvedValueOnce([{ id: TAG_ID_1 }]);

      await expect(
        setInquiryTagsCommand(INQUIRY_ID, [TAG_ID_1, TAG_ID_2]),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockTagOnInquiryDeleteMany).not.toHaveBeenCalled();
    });

    test("soft-deleted な Inquiry は NOT_FOUND", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(DELETED_INQUIRY);

      await expect(
        setInquiryTagsCommand(INQUIRY_ID, [TAG_ID_1]),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  // ===========================================================================
  // タグマスタ CRUD
  // ===========================================================================

  describe("createInquiryTagCommand", () => {
    test("未使用の名前でタグを作成する", async () => {
      const result = await createInquiryTagCommand({
        name: "至急",
        color: "#ff0000",
      });

      expect(result).toEqual({ id: "tag-created" });
      expect(mockInquiryTagCreate).toHaveBeenCalledWith({
        data: { name: "至急", color: "#ff0000" },
      });
    });

    test("既存の名前は CONFLICT", async () => {
      mockInquiryTagFindFirst.mockResolvedValueOnce({ id: TAG_ID_1 });

      await expect(
        createInquiryTagCommand({ name: "至急", color: null }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockInquiryTagCreate).not.toHaveBeenCalled();
    });
  });

  describe("updateInquiryTagCommand", () => {
    test("存在するタグを更新する", async () => {
      mockInquiryTagFindUnique.mockResolvedValueOnce({ id: TAG_ID_1 });

      const result = await updateInquiryTagCommand(TAG_ID_1, {
        name: "重要",
        color: null,
      });

      expect(result).toEqual({ id: TAG_ID_1 });
      expect(mockInquiryTagUpdate).toHaveBeenCalledWith({
        where: { id: TAG_ID_1 },
        data: { name: "重要", color: null },
      });
    });

    test("存在しないタグは NOT_FOUND", async () => {
      mockInquiryTagFindUnique.mockResolvedValueOnce(null);

      await expect(
        updateInquiryTagCommand(TAG_ID_1, { name: "重要", color: null }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    test("他タグと名前が重複する場合は CONFLICT", async () => {
      mockInquiryTagFindUnique.mockResolvedValueOnce({ id: TAG_ID_1 });
      mockInquiryTagFindFirst.mockResolvedValueOnce({ id: TAG_ID_2 });

      await expect(
        updateInquiryTagCommand(TAG_ID_1, { name: "重要", color: null }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockInquiryTagUpdate).not.toHaveBeenCalled();
    });
  });

  describe("deleteInquiryTagCommand", () => {
    test("未使用のタグを削除できる", async () => {
      mockInquiryTagFindUnique.mockResolvedValueOnce({
        id: TAG_ID_1,
        _count: { inquiries: 0 },
      });

      const result = await deleteInquiryTagCommand(TAG_ID_1);

      expect(result).toEqual({ id: TAG_ID_1 });
      expect(mockInquiryTagDelete).toHaveBeenCalledWith({
        where: { id: TAG_ID_1 },
      });
    });

    test("使用中のタグは CONFLICT で delete を呼ばない", async () => {
      mockInquiryTagFindUnique.mockResolvedValueOnce({
        id: TAG_ID_1,
        _count: { inquiries: 3 },
      });

      await expect(deleteInquiryTagCommand(TAG_ID_1)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(mockInquiryTagDelete).not.toHaveBeenCalled();
    });

    test("存在しないタグは NOT_FOUND", async () => {
      mockInquiryTagFindUnique.mockResolvedValueOnce(null);

      await expect(deleteInquiryTagCommand(TAG_ID_1)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
