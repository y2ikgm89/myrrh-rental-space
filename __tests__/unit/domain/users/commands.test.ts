import { describe, test, expect, mock, beforeEach } from "bun:test";

// Role 定数（@/shared/db/enums から Prisma enum を再現）
const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  USER: "USER",
  CUSTOMER: "CUSTOMER",
} as const;
type Role = (typeof Role)[keyof typeof Role];

// hashPassword モック（better-auth/crypto）
const mockHashPassword = mock<(password: string) => Promise<string>>(() =>
  Promise.resolve("hashed-password"),
);

mock.module("better-auth/crypto", () => ({
  hashPassword: mockHashPassword,
}));

// トランザクション内で使用する tx オブジェクト
const mockTxUserUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "user-1" }),
);
const mockTxAccountFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockTxAccountUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "account-1" }),
);
const mockTxAccountCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "account-1" }),
);

const mockTx = {
  user: {
    update: mockTxUserUpdate,
  },
  account: {
    findFirst: mockTxAccountFindFirst,
    update: mockTxAccountUpdate,
    create: mockTxAccountCreate,
  },
};

// Prisma モック関数（mock.module より先に定義）
const mockUserFindUnique = mock<
  () => Promise<{
    id: string;
    role: Role;
    _count: { reservations: number; posts: number };
  } | null>
>(() => Promise.resolve(null));

const mockUserFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockUserCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "user-1" }),
);

const mockUserUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "user-1" }),
);

const mockUserDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "user-1" }),
);

const mockTransaction = mock((fn: (tx: typeof mockTx) => Promise<unknown>) =>
  fn(mockTx),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockUserFindUnique,
      findFirst: mockUserFindFirst,
      create: mockUserCreate,
      update: mockUserUpdate,
      delete: mockUserDelete,
    },
    $transaction: mockTransaction,
  },
}));

mock.module("@/shared/db/enums", () => ({
  Role,
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  createUser,
  updateUser,
  deleteUser,
  updateUserRole,
} from "@/shared/domain/users/commands";

// テスト用定数
const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ACTOR_USER_ID = "660e8400-e29b-41d4-a716-446655440001";

const VALID_CREATE_INPUT = {
  email: "user@example.com",
  password: "password123",
  name: "田中太郎",
  role: Role.ADMIN,
} as const;

const VALID_UPDATE_INPUT = {
  email: "updated@example.com",
  name: "田中次郎",
  role: Role.EDITOR,
  password: "newpassword123",
} as const;

const EXISTING_USER = {
  id: USER_ID,
  role: Role.ADMIN,
  _count: { reservations: 0, posts: 0 },
};

describe("users/commands", () => {
  beforeEach(() => {
    mockHashPassword.mockReset();
    mockUserFindUnique.mockReset();
    mockUserFindFirst.mockReset();
    mockUserCreate.mockReset();
    mockUserUpdate.mockReset();
    mockUserDelete.mockReset();
    mockTransaction.mockReset();
    mockTxUserUpdate.mockReset();
    mockTxAccountFindFirst.mockReset();
    mockTxAccountUpdate.mockReset();
    mockTxAccountCreate.mockReset();

    // デフォルト値の設定
    mockHashPassword.mockResolvedValue("hashed-password");
    mockUserFindUnique.mockResolvedValue(null);
    mockUserFindFirst.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "user-1" });
    mockUserUpdate.mockResolvedValue({ id: USER_ID });
    mockUserDelete.mockResolvedValue({ id: USER_ID });
    mockTransaction.mockImplementation(
      (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
    );
    mockTxUserUpdate.mockResolvedValue({ id: USER_ID });
    mockTxAccountFindFirst.mockResolvedValue(null);
    mockTxAccountUpdate.mockResolvedValue({ id: "account-1" });
    mockTxAccountCreate.mockResolvedValue({ id: "account-1" });
  });

  // ===========================================================================
  // createUser
  // ===========================================================================

  describe("createUser", () => {
    describe("正常系", () => {
      test("新規メールアドレスでユーザーを作成できる", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);
        mockUserCreate.mockResolvedValueOnce({ id: "new-user-id" });

        const result = await createUser(VALID_CREATE_INPUT);

        expect(result).toEqual({ id: "new-user-id" });
        expect(mockUserCreate).toHaveBeenCalledTimes(1);
      });

      test("パスワードがハッシュ化されてアカウントが作成される", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);
        mockUserCreate.mockResolvedValueOnce({ id: "user-1" });

        await createUser(VALID_CREATE_INPUT);

        expect(mockHashPassword).toHaveBeenCalledWith("password123");
        expect(mockUserCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              email: "user@example.com",
              name: "田中太郎",
              role: Role.ADMIN,
              accounts: {
                create: {
                  accountId: "user@example.com",
                  providerId: "credential",
                  password: "hashed-password",
                },
              },
            }),
          }),
        );
      });

      test("各 Role で作成できる", async () => {
        for (const role of Object.values(Role)) {
          mockUserFindUnique.mockResolvedValueOnce(null);
          mockUserCreate.mockResolvedValueOnce({ id: "user-1" });

          await expect(
            createUser({ ...VALID_CREATE_INPUT, role }),
          ).resolves.toEqual({ id: "user-1" });
        }
      });
    });

    describe("異常系", () => {
      test("既存のメールアドレスで CONFLICT エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: "existing-id",
          role: "ADMIN" as Role,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(createUser(VALID_CREATE_INPUT)).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に使用されています",
        });

        expect(mockUserCreate).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // updateUser
  // ===========================================================================

  describe("updateUser", () => {
    describe("正常系", () => {
      test("存在するユーザーの情報を更新できる（credential アカウントあり）", async () => {
        // ensureUserExists: ユーザーが存在する
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        // ensureEmailAvailable: 重複なし
        mockUserFindFirst.mockResolvedValueOnce(null);
        // tx 内: credential アカウントが存在する
        mockTxAccountFindFirst.mockResolvedValueOnce({ id: "account-1" });

        await expect(
          updateUser(USER_ID, VALID_UPDATE_INPUT),
        ).resolves.toBeUndefined();

        expect(mockTransaction).toHaveBeenCalledTimes(1);
        expect(mockTxUserUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: USER_ID },
            data: {
              email: "updated@example.com",
              name: "田中次郎",
              role: Role.EDITOR,
            },
          }),
        );
        expect(mockTxAccountUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "account-1" },
            data: expect.objectContaining({
              accountId: "updated@example.com",
              password: "hashed-password",
            }),
          }),
        );
      });

      test("credential アカウントがない場合はアカウントを新規作成する（パスワードあり）", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        // credential アカウントが存在しない
        mockTxAccountFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateUser(USER_ID, VALID_UPDATE_INPUT),
        ).resolves.toBeUndefined();

        expect(mockTxAccountCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              userId: USER_ID,
              accountId: "updated@example.com",
              providerId: "credential",
              password: "hashed-password",
            },
          }),
        );
      });

      test("パスワードが空文字の場合はハッシュ化されない", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce({ id: "account-1" });

        await updateUser(USER_ID, { ...VALID_UPDATE_INPUT, password: "" });

        expect(mockHashPassword).not.toHaveBeenCalled();
        // password フィールドは含まれない（undefined）
        expect(mockTxAccountUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              accountId: "updated@example.com",
            }),
          }),
        );
      });

      test("パスワードが undefined の場合はハッシュ化されない", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce({ id: "account-1" });

        await updateUser(USER_ID, {
          email: "updated@example.com",
          name: "田中次郎",
          role: Role.EDITOR,
        });

        expect(mockHashPassword).not.toHaveBeenCalled();
      });

      test("credential アカウントがなくパスワードも空の場合はアカウント作成しない", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce(null);

        await updateUser(USER_ID, { ...VALID_UPDATE_INPUT, password: "" });

        expect(mockTxAccountCreate).not.toHaveBeenCalled();
      });

      test("同じメールアドレスで自分自身を更新できる（重複チェックが currentId を除外）", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce(null);

        await updateUser(USER_ID, {
          email: "user@example.com",
          name: "田中太郎",
          role: Role.ADMIN,
        });

        expect(mockUserFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              email: "user@example.com",
              NOT: { id: USER_ID },
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しないユーザー ID で NOT_FOUND エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateUser(USER_ID, VALID_UPDATE_INPUT),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });

        expect(mockTransaction).not.toHaveBeenCalled();
      });

      test("他のユーザーが使用中のメールアドレスで CONFLICT エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        // 他のユーザーがそのメールを使用中
        mockUserFindFirst.mockResolvedValueOnce({ id: "other-user" });

        await expect(
          updateUser(USER_ID, VALID_UPDATE_INPUT),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に使用されています",
        });

        expect(mockTransaction).not.toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // deleteUser
  // ===========================================================================

  describe("deleteUser", () => {
    describe("正常系", () => {
      test("存在するユーザーを削除できる", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);

        await expect(
          deleteUser(USER_ID, ACTOR_USER_ID),
        ).resolves.toBeUndefined();

        expect(mockUserDelete).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: USER_ID },
          }),
        );
      });

      test("予約・投稿が0件のユーザーは削除できる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.USER,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(
          deleteUser(USER_ID, ACTOR_USER_ID),
        ).resolves.toBeUndefined();

        expect(mockUserDelete).toHaveBeenCalledTimes(1);
      });
    });

    describe("異常系", () => {
      test("自分自身を削除しようとすると CONFLICT エラーをスローする", async () => {
        // actorUserId と id が同じ
        await expect(deleteUser(USER_ID, USER_ID)).rejects.toMatchObject({
          code: "CONFLICT",
          message: "自分自身を削除することはできません",
        });

        // ensureUserExists を呼ぶ前にエラーになるため findUnique は呼ばれない
        expect(mockUserFindUnique).not.toHaveBeenCalled();
        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("存在しないユーザー ID で NOT_FOUND エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);

        await expect(deleteUser(USER_ID, ACTOR_USER_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });

        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("予約が紐付いているユーザーは削除できない", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.USER,
          _count: { reservations: 3, posts: 0 },
        });

        await expect(deleteUser(USER_ID, ACTOR_USER_ID)).rejects.toMatchObject({
          code: "CONFLICT",
        });

        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("投稿が紐付いているユーザーは削除できない", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.EDITOR,
          _count: { reservations: 0, posts: 2 },
        });

        await expect(deleteUser(USER_ID, ACTOR_USER_ID)).rejects.toMatchObject({
          code: "CONFLICT",
        });

        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("エラーメッセージに予約件数・投稿件数が含まれる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.USER,
          _count: { reservations: 2, posts: 5 },
        });

        await expect(deleteUser(USER_ID, ACTOR_USER_ID)).rejects.toMatchObject({
          code: "CONFLICT",
          message: expect.stringContaining("2"),
        });
      });
    });
  });

  // ===========================================================================
  // updateUserRole
  // ===========================================================================

  describe("updateUserRole", () => {
    describe("正常系", () => {
      test("ユーザーのロールを更新し旧ロールと新ロールを返す", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.ADMIN,
          _count: { reservations: 0, posts: 0 },
        });

        const result = await updateUserRole(USER_ID, Role.EDITOR);

        expect(result).toEqual({
          oldRole: Role.ADMIN,
          newRole: Role.EDITOR,
        });
      });

      test("userUpdate が新しいロールで呼ばれる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.VIEWER,
          _count: { reservations: 0, posts: 0 },
        });

        await updateUserRole(USER_ID, Role.SUPER_ADMIN);

        expect(mockUserUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: USER_ID },
            data: { role: Role.SUPER_ADMIN },
          }),
        );
      });

      test("同じロールへの更新も正常に処理される", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.ADMIN,
          _count: { reservations: 0, posts: 0 },
        });

        const result = await updateUserRole(USER_ID, Role.ADMIN);

        expect(result).toEqual({
          oldRole: Role.ADMIN,
          newRole: Role.ADMIN,
        });
      });

      test("各 Role に更新できる", async () => {
        for (const role of Object.values(Role)) {
          mockUserFindUnique.mockResolvedValueOnce({
            id: USER_ID,
            role: Role.USER,
            _count: { reservations: 0, posts: 0 },
          });
          mockUserUpdate.mockResolvedValueOnce({ id: USER_ID });

          const result = await updateUserRole(USER_ID, role);

          expect(result.newRole).toBe(role);
        }
      });
    });

    describe("異常系", () => {
      test("存在しないユーザー ID で NOT_FOUND エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);

        await expect(updateUserRole(USER_ID, Role.ADMIN)).rejects.toMatchObject(
          {
            code: "NOT_FOUND",
            message: "ユーザーが見つかりません",
          },
        );

        expect(mockUserUpdate).not.toHaveBeenCalled();
      });
    });
  });
});
