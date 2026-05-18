import { describe, test, expect, mock, beforeEach } from "bun:test";

// Role 定数（@generated/prisma/enums から Prisma enum を再現）
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

const mockUserCount = mock<() => Promise<number>>(() => Promise.resolve(2));

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
      count: mockUserCount,
    },
    $transaction: mockTransaction,
  },
}));

mock.module("@generated/prisma/enums", () => ({
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
const SUPER_ADMIN_ACTOR = { id: ACTOR_USER_ID, role: Role.SUPER_ADMIN };
const ADMIN_ACTOR = { id: ACTOR_USER_ID, role: Role.ADMIN };

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
    mockUserCount.mockReset();
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
    mockUserCount.mockResolvedValue(2);
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

        const result = await createUser(VALID_CREATE_INPUT, SUPER_ADMIN_ACTOR);

        expect(result).toEqual({ id: "new-user-id" });
        expect(mockUserCreate).toHaveBeenCalledTimes(1);
      });

      test("パスワードがハッシュ化されてアカウントが作成される", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);
        mockUserCreate.mockResolvedValueOnce({ id: "user-1" });

        await createUser(VALID_CREATE_INPUT, SUPER_ADMIN_ACTOR);

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

      test("SUPER_ADMIN は全 DashboardRole のユーザーを作成できる", async () => {
        for (const role of [Role.ADMIN, Role.EDITOR, Role.VIEWER] as const) {
          mockUserFindUnique.mockResolvedValueOnce(null);
          mockUserCreate.mockResolvedValueOnce({ id: "user-1" });

          await expect(
            createUser({ ...VALID_CREATE_INPUT, role }, SUPER_ADMIN_ACTOR),
          ).resolves.toEqual({ id: "user-1" });
        }
      });

      test("ADMIN は EDITOR / VIEWER を作成できる", async () => {
        for (const role of [Role.EDITOR, Role.VIEWER] as const) {
          mockUserFindUnique.mockResolvedValueOnce(null);
          mockUserCreate.mockResolvedValueOnce({ id: "user-1" });

          await expect(
            createUser({ ...VALID_CREATE_INPUT, role }, ADMIN_ACTOR),
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

        await expect(
          createUser(VALID_CREATE_INPUT, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に使用されています",
        });

        expect(mockUserCreate).not.toHaveBeenCalled();
      });

      test("ADMIN は ADMIN を作成できない（FORBIDDEN）", async () => {
        await expect(
          createUser({ ...VALID_CREATE_INPUT, role: Role.ADMIN }, ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
          message: "このロールでユーザーを作成する権限がありません",
        });

        expect(mockUserCreate).not.toHaveBeenCalled();
      });

      test("ADMIN は SUPER_ADMIN を作成できない（FORBIDDEN）", async () => {
        await expect(
          createUser(
            { ...VALID_CREATE_INPUT, role: Role.SUPER_ADMIN },
            ADMIN_ACTOR,
          ),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      test("EDITOR はユーザーを作成できない（FORBIDDEN）", async () => {
        await expect(
          createUser(VALID_CREATE_INPUT, {
            id: ACTOR_USER_ID,
            role: Role.EDITOR,
          }),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
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
          updateUser(USER_ID, VALID_UPDATE_INPUT, SUPER_ADMIN_ACTOR),
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
          updateUser(USER_ID, VALID_UPDATE_INPUT, SUPER_ADMIN_ACTOR),
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

        await updateUser(
          USER_ID,
          { ...VALID_UPDATE_INPUT, password: "" },
          SUPER_ADMIN_ACTOR,
        );

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

        await updateUser(
          USER_ID,
          {
            email: "updated@example.com",
            name: "田中次郎",
            role: Role.EDITOR,
          },
          SUPER_ADMIN_ACTOR,
        );

        expect(mockHashPassword).not.toHaveBeenCalled();
      });

      test("credential アカウントがなくパスワードも空の場合はアカウント作成しない", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce(null);

        await updateUser(
          USER_ID,
          { ...VALID_UPDATE_INPUT, password: "" },
          SUPER_ADMIN_ACTOR,
        );

        expect(mockTxAccountCreate).not.toHaveBeenCalled();
      });

      test("同じメールアドレスで自分自身を更新できる（重複チェックが currentId を除外）", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER);
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce(null);

        await updateUser(
          USER_ID,
          {
            email: "user@example.com",
            name: "田中太郎",
            role: Role.ADMIN,
          },
          SUPER_ADMIN_ACTOR,
        );

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
          updateUser(USER_ID, VALID_UPDATE_INPUT, SUPER_ADMIN_ACTOR),
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
          updateUser(USER_ID, VALID_UPDATE_INPUT, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このメールアドレスは既に使用されています",
        });

        expect(mockTransaction).not.toHaveBeenCalled();
      });

      test("ADMIN は別 ADMIN を編集できない（FORBIDDEN）", async () => {
        mockUserFindUnique.mockResolvedValueOnce(EXISTING_USER); // role: ADMIN

        await expect(
          updateUser(USER_ID, VALID_UPDATE_INPUT, ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
          message: "このユーザーを編集する権限がありません",
        });

        expect(mockTransaction).not.toHaveBeenCalled();
      });

      test("ADMIN は SUPER_ADMIN を編集できない（FORBIDDEN）", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.SUPER_ADMIN,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(
          updateUser(USER_ID, VALID_UPDATE_INPUT, ADMIN_ACTOR),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      });

      test("ADMIN は EDITOR を ADMIN に昇格できない（FORBIDDEN）", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.EDITOR,
          _count: { reservations: 0, posts: 0 },
        });
        mockUserFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateUser(
            USER_ID,
            { ...VALID_UPDATE_INPUT, role: Role.ADMIN },
            ADMIN_ACTOR,
          ),
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
          message: "このロールに変更する権限がありません",
        });

        expect(mockTransaction).not.toHaveBeenCalled();
      });

      test("ADMIN は EDITOR を VIEWER に変更できる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.EDITOR,
          _count: { reservations: 0, posts: 0 },
        });
        mockUserFindFirst.mockResolvedValueOnce(null);
        mockTxAccountFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateUser(
            USER_ID,
            { ...VALID_UPDATE_INPUT, role: Role.VIEWER },
            ADMIN_ACTOR,
          ),
        ).resolves.toBeUndefined();
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
          deleteUser(USER_ID, SUPER_ADMIN_ACTOR),
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
          role: Role.EDITOR,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(
          deleteUser(USER_ID, SUPER_ADMIN_ACTOR),
        ).resolves.toBeUndefined();

        expect(mockUserDelete).toHaveBeenCalledTimes(1);
      });
    });

    describe("異常系", () => {
      test("自分自身を削除しようとすると CONFLICT エラーをスローする", async () => {
        await expect(
          deleteUser(USER_ID, { id: USER_ID, role: Role.SUPER_ADMIN }),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "自分自身を削除することはできません",
        });

        // ensureUserExists を呼ぶ前にエラーになるため findUnique は呼ばれない
        expect(mockUserFindUnique).not.toHaveBeenCalled();
        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("存在しないユーザー ID で NOT_FOUND エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);

        await expect(
          deleteUser(USER_ID, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });

        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("予約が紐付いているユーザーは削除できない", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.EDITOR,
          _count: { reservations: 3, posts: 0 },
        });

        await expect(
          deleteUser(USER_ID, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
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

        await expect(
          deleteUser(USER_ID, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "CONFLICT",
        });

        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("ADMIN は別 ADMIN を削除できない（FORBIDDEN）", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.ADMIN,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(deleteUser(USER_ID, ADMIN_ACTOR)).rejects.toMatchObject({
          code: "FORBIDDEN",
          message: "このユーザーを削除する権限がありません",
        });

        expect(mockUserDelete).not.toHaveBeenCalled();
      });

      test("ADMIN は SUPER_ADMIN を削除できない（FORBIDDEN）", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.SUPER_ADMIN,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(deleteUser(USER_ID, ADMIN_ACTOR)).rejects.toMatchObject({
          code: "FORBIDDEN",
        });
      });

      test("ADMIN は EDITOR を削除できる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.EDITOR,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(deleteUser(USER_ID, ADMIN_ACTOR)).resolves.toBeUndefined();

        expect(mockUserDelete).toHaveBeenCalledTimes(1);
      });

      test("エラーメッセージに予約件数・投稿件数が含まれる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.EDITOR,
          _count: { reservations: 2, posts: 5 },
        });

        await expect(
          deleteUser(USER_ID, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
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

        const result = await updateUserRole(
          USER_ID,
          Role.EDITOR,
          SUPER_ADMIN_ACTOR,
        );

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

        await updateUserRole(USER_ID, Role.SUPER_ADMIN, SUPER_ADMIN_ACTOR);

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

        const result = await updateUserRole(
          USER_ID,
          Role.ADMIN,
          SUPER_ADMIN_ACTOR,
        );

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

          const result = await updateUserRole(USER_ID, role, SUPER_ADMIN_ACTOR);

          expect(result.newRole).toBe(role);
        }
      });

      test("SUPER_ADMIN が複数いる場合、SUPER_ADMIN を降格できる", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.SUPER_ADMIN,
          _count: { reservations: 0, posts: 0 },
        });
        mockUserCount.mockResolvedValueOnce(3);

        await expect(
          updateUserRole(USER_ID, Role.ADMIN, SUPER_ADMIN_ACTOR),
        ).resolves.toEqual({
          oldRole: Role.SUPER_ADMIN,
          newRole: Role.ADMIN,
        });
      });
    });

    describe("異常系", () => {
      test("存在しないユーザー ID で NOT_FOUND エラーをスローする", async () => {
        mockUserFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateUserRole(USER_ID, Role.ADMIN, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "ユーザーが見つかりません",
        });

        expect(mockUserUpdate).not.toHaveBeenCalled();
      });

      test("自分自身のロールは変更できない（CONFLICT）", async () => {
        await expect(
          updateUserRole(USER_ID, Role.EDITOR, {
            id: USER_ID,
            role: Role.SUPER_ADMIN,
          }),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "自分自身のロールは変更できません",
        });

        expect(mockUserFindUnique).not.toHaveBeenCalled();
        expect(mockUserUpdate).not.toHaveBeenCalled();
      });

      test("最後の SUPER_ADMIN を降格できない（CONFLICT）", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.SUPER_ADMIN,
          _count: { reservations: 0, posts: 0 },
        });
        mockUserCount.mockResolvedValueOnce(1);

        await expect(
          updateUserRole(USER_ID, Role.ADMIN, SUPER_ADMIN_ACTOR),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "最後のSUPER_ADMINのロールは変更できません",
        });

        expect(mockUserUpdate).not.toHaveBeenCalled();
      });

      test("SUPER_ADMIN → SUPER_ADMIN（同ロール）は count 検証を発火しない", async () => {
        mockUserFindUnique.mockResolvedValueOnce({
          id: USER_ID,
          role: Role.SUPER_ADMIN,
          _count: { reservations: 0, posts: 0 },
        });

        await expect(
          updateUserRole(USER_ID, Role.SUPER_ADMIN, SUPER_ADMIN_ACTOR),
        ).resolves.toEqual({
          oldRole: Role.SUPER_ADMIN,
          newRole: Role.SUPER_ADMIN,
        });

        expect(mockUserCount).not.toHaveBeenCalled();
      });
    });
  });
});
