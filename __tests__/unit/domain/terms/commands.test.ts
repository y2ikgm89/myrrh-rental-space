import { describe, test, expect, mock, beforeEach } from "bun:test";

// TermsStatus 定数（@/shared/db/enums から Prisma enum を再現）
const TermsStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
type TermsStatus = (typeof TermsStatus)[keyof typeof TermsStatus];

// Prisma モック関数（mock.module より先に定義）
const mockTermsFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockTermsFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockTermsCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "terms-1" }),
);

const mockTermsUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "terms-1" }),
);

const mockTermsDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "terms-1" }),
);

const mockSpaceCount = mock<() => Promise<number>>(() => Promise.resolve(0));

const mockTermsVersionFindUnique = mock<
  () => Promise<{
    id?: string;
    status?: TermsStatus;
    termsId?: string;
    isCurrentVersion?: boolean;
    version?: number;
  } | null>
>(() => Promise.resolve(null));

const mockTermsVersionFindFirst = mock<
  () => Promise<{ id: string; version?: number } | null>
>(() => Promise.resolve(null));

const mockTermsVersionCreate = mock<
  () => Promise<{ id: string; version: number }>
>(() => Promise.resolve({ id: "version-1", version: 1 }));

const mockTermsVersionUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "version-1" }),
);

const mockTermsVersionUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

const mockTermsVersionDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "version-1" }),
);

// $transaction モック
const mockTransaction = mock<
  <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>
>((fn) => fn(mockTx));

const mockTxTermsCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "terms-1" }),
);
const mockTxTermsVersionCreate = mock<
  () => Promise<{ id: string; version: number }>
>(() => Promise.resolve({ id: "version-1", version: 1 }));
const mockTxTermsVersionUpdateMany = mock<() => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 1 }),
);
const mockTxTermsVersionUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "version-1" }),
);

const mockTx = {
  terms: {
    create: mockTxTermsCreate,
  },
  termsVersion: {
    create: mockTxTermsVersionCreate,
    updateMany: mockTxTermsVersionUpdateMany,
    update: mockTxTermsVersionUpdate,
  },
};

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    terms: {
      findUnique: mockTermsFindUnique,
      findFirst: mockTermsFindFirst,
      create: mockTermsCreate,
      update: mockTermsUpdate,
      delete: mockTermsDelete,
    },
    space: {
      count: mockSpaceCount,
    },
    termsVersion: {
      findUnique: mockTermsVersionFindUnique,
      findFirst: mockTermsVersionFindFirst,
      create: mockTermsVersionCreate,
      update: mockTermsVersionUpdate,
      updateMany: mockTermsVersionUpdateMany,
      delete: mockTermsVersionDelete,
    },
    $transaction: mockTransaction,
  },
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  createTerms,
  createTermsWithVersion,
  updateTerms,
  deleteTerms,
  toggleTermsActive,
  createTermsVersion,
  updateTermsVersion,
  publishTermsVersion,
  archiveTermsVersion,
  deleteTermsVersion,
} from "@/shared/domain/terms/commands";

// テストデータ
const TERMS_ID = "550e8400-e29b-41d4-a716-446655440001";
const VERSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID = "550e8400-e29b-41d4-a716-446655440003";
const TERMS_ID2 = "550e8400-e29b-41d4-a716-446655440004";

const VALID_TERMS_INPUT = {
  type: "CUSTOM" as const,
  title: "利用規約",
  slug: "terms-of-service",
  isActive: true,
} satisfies Parameters<typeof createTerms>[0];

// null を含まない有効な Lexical EditorState JSON（isPrismaInputJsonValue は null を拒否する）
const VALID_CONTENT_JSON = JSON.stringify({
  root: {
    children: [],
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

describe("terms/commands", () => {
  beforeEach(() => {
    mockTermsFindUnique.mockReset();
    mockTermsFindFirst.mockReset();
    mockTermsCreate.mockReset();
    mockTermsUpdate.mockReset();
    mockTermsDelete.mockReset();
    mockSpaceCount.mockReset();
    mockTermsVersionFindUnique.mockReset();
    mockTermsVersionFindFirst.mockReset();
    mockTermsVersionCreate.mockReset();
    mockTermsVersionUpdate.mockReset();
    mockTermsVersionUpdateMany.mockReset();
    mockTermsVersionDelete.mockReset();
    mockTxTermsCreate.mockReset();
    mockTxTermsVersionCreate.mockReset();
    mockTxTermsVersionUpdateMany.mockReset();
    mockTxTermsVersionUpdate.mockReset();

    // デフォルト: 重複なし・規約が存在しない
    mockTermsFindUnique.mockResolvedValue(null);
    mockTermsFindFirst.mockResolvedValue(null);
    mockTermsCreate.mockResolvedValue({ id: TERMS_ID });
    mockTermsUpdate.mockResolvedValue({ id: TERMS_ID });
    mockTermsDelete.mockResolvedValue({ id: TERMS_ID });
    mockSpaceCount.mockResolvedValue(0);
    mockTermsVersionFindUnique.mockResolvedValue(null);
    mockTermsVersionFindFirst.mockResolvedValue(null);
    mockTermsVersionCreate.mockResolvedValue({ id: VERSION_ID, version: 1 });
    mockTermsVersionUpdate.mockResolvedValue({ id: VERSION_ID });
    mockTermsVersionUpdateMany.mockResolvedValue({ count: 1 });
    mockTermsVersionDelete.mockResolvedValue({ id: VERSION_ID });
    mockTxTermsCreate.mockResolvedValue({ id: TERMS_ID });
    mockTxTermsVersionCreate.mockResolvedValue({ id: VERSION_ID, version: 1 });
    mockTxTermsVersionUpdateMany.mockResolvedValue({ count: 1 });
    mockTxTermsVersionUpdate.mockResolvedValue({ id: VERSION_ID });
  });

  // =============================================================================
  // createTerms
  // =============================================================================

  describe("createTerms", () => {
    describe("正常系", () => {
      test("スラッグが重複しない場合に規約を作成して ID を返す", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);
        mockTermsCreate.mockResolvedValueOnce({ id: "new-terms-id" });

        const result = await createTerms(VALID_TERMS_INPUT);

        expect(result).toEqual({ id: "new-terms-id" });
        expect(mockTermsCreate).toHaveBeenCalledTimes(1);
      });

      test("create が正しいデータで呼ばれる", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);
        mockTermsCreate.mockResolvedValueOnce({ id: TERMS_ID });

        await createTerms(VALID_TERMS_INPUT);

        expect(mockTermsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              title: "利用規約",
              slug: "terms-of-service",
              isActive: true,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("スラッグが重複している場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID2 });

        await expect(createTerms(VALID_TERMS_INPUT)).rejects.toMatchObject({
          name: "DomainError",
          message: "このスラッグは既に使用されています",
          code: "CONFLICT",
        });
      });

      test("スラッグ重複時に create が呼ばれない", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID2 });

        await expect(createTerms(VALID_TERMS_INPUT)).rejects.toThrow(
          DomainError,
        );
        expect(mockTermsCreate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // createTermsWithVersion
  // =============================================================================

  describe("createTermsWithVersion", () => {
    const VALID_WITH_VERSION_INPUT = {
      ...VALID_TERMS_INPUT,
      contentJson: VALID_CONTENT_JSON,
      contentHtml: "<p>テスト規約本文</p>",
    };

    describe("正常系", () => {
      test("規約と初回バージョンを同時に作成して ID を返す", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);
        mockTxTermsCreate.mockResolvedValueOnce({ id: TERMS_ID });
        mockTxTermsVersionCreate.mockResolvedValueOnce({
          id: VERSION_ID,
          version: 1,
        });

        const result = await createTermsWithVersion(
          VALID_WITH_VERSION_INPUT,
          USER_ID,
        );

        expect(result).toEqual({ id: TERMS_ID, versionId: VERSION_ID });
      });

      test("バージョンが DRAFT ステータスで作成される", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);
        mockTxTermsCreate.mockResolvedValueOnce({ id: TERMS_ID });
        mockTxTermsVersionCreate.mockResolvedValueOnce({
          id: VERSION_ID,
          version: 1,
        });

        await createTermsWithVersion(VALID_WITH_VERSION_INPUT, USER_ID);

        expect(mockTxTermsVersionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              version: 1,
              status: TermsStatus.DRAFT,
              createdBy: USER_ID,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("スラッグが重複している場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID2 });

        await expect(
          createTermsWithVersion(VALID_WITH_VERSION_INPUT, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          code: "CONFLICT",
        });
      });

      test("contentJson が不正な JSON の場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);

        const invalidInput = {
          ...VALID_WITH_VERSION_INPUT,
          contentJson: "不正なJSON{",
        };

        await expect(
          createTermsWithVersion(invalidInput, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "コンテンツJSONが不正です",
          code: "VALIDATION",
        });
      });
    });
  });

  // =============================================================================
  // updateTerms
  // =============================================================================

  describe("updateTerms", () => {
    describe("正常系", () => {
      test("規約が存在する場合に更新が成功する", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });

        await expect(
          updateTerms(TERMS_ID, { title: "新しい利用規約" }),
        ).resolves.toBeUndefined();

        expect(mockTermsUpdate).toHaveBeenCalledTimes(1);
      });

      test("slug を変更する場合に重複チェックが行われる", async () => {
        // 1回目: 規約の存在チェック
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        // 2回目: スラッグ重複チェック（currentId を除外）
        mockTermsFindFirst.mockResolvedValueOnce(null);

        await updateTerms(TERMS_ID, { slug: "new-slug" });

        // findFirst が slug 重複チェックで呼ばれる
        expect(mockTermsFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              slug: "new-slug",
              id: { not: TERMS_ID },
            }),
          }),
        );
      });

      test("slug を変更しない場合は重複チェックが行われない", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });

        await updateTerms(TERMS_ID, { title: "タイトル変更のみ" });

        expect(mockTermsFindFirst).not.toHaveBeenCalled();
      });
    });

    describe("異常系", () => {
      test("規約が存在しない場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateTerms(TERMS_ID, { title: "更新" }),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "規約が見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("新しいスラッグが他の規約と重複する場合に DomainError をスローする", async () => {
        // 1回目: 規約の存在チェック（存在する）
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        // 2回目: スラッグ重複チェック（他の規約が使用中）
        mockTermsFindFirst.mockResolvedValueOnce({ id: TERMS_ID2 });

        await expect(
          updateTerms(TERMS_ID, { slug: "used-slug" }),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "このスラッグは既に使用されています",
          code: "CONFLICT",
        });
      });
    });
  });

  // =============================================================================
  // deleteTerms
  // =============================================================================

  describe("deleteTerms", () => {
    describe("正常系", () => {
      test("使用されていない規約を削除できる", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockSpaceCount.mockResolvedValueOnce(0);

        await expect(deleteTerms(TERMS_ID)).resolves.toBeUndefined();
        expect(mockTermsDelete).toHaveBeenCalledWith({
          where: { id: TERMS_ID },
        });
      });
    });

    describe("異常系", () => {
      test("規約が存在しない場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);
        mockSpaceCount.mockResolvedValueOnce(0);

        await expect(deleteTerms(TERMS_ID)).rejects.toMatchObject({
          name: "DomainError",
          message: "規約が見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("スペースで使用中の規約は削除できない", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockSpaceCount.mockResolvedValueOnce(3);

        await expect(deleteTerms(TERMS_ID)).rejects.toMatchObject({
          name: "DomainError",
          code: "CONFLICT",
        });
      });

      test("スペースで使用中の場合のエラーメッセージに件数が含まれる", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockSpaceCount.mockResolvedValueOnce(5);

        await expect(deleteTerms(TERMS_ID)).rejects.toMatchObject({
          message: expect.stringContaining("5"),
        });
      });
    });
  });

  // =============================================================================
  // toggleTermsActive
  // =============================================================================

  describe("toggleTermsActive", () => {
    describe("正常系", () => {
      test("規約が存在する場合に isActive を true に設定できる", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });

        await expect(
          toggleTermsActive(TERMS_ID, true),
        ).resolves.toBeUndefined();

        expect(mockTermsUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: TERMS_ID },
            data: { isActive: true },
          }),
        );
      });

      test("規約が存在する場合に isActive を false に設定できる", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });

        await expect(
          toggleTermsActive(TERMS_ID, false),
        ).resolves.toBeUndefined();

        expect(mockTermsUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { isActive: false },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("規約が存在しない場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);

        await expect(toggleTermsActive(TERMS_ID, true)).rejects.toMatchObject({
          name: "DomainError",
          message: "規約が見つかりません",
          code: "NOT_FOUND",
        });
      });
    });
  });

  // =============================================================================
  // createTermsVersion
  // =============================================================================

  describe("createTermsVersion", () => {
    const VALID_VERSION_INPUT = {
      termsId: TERMS_ID,
      contentJson: VALID_CONTENT_JSON,
      contentHtml: "<p>規約本文</p>",
    };

    describe("正常系", () => {
      test("既存バージョンがある場合は version+1 でバージョンを作成する", async () => {
        // terms 存在、下書きなし、最新バージョン=2
        mockTermsVersionFindFirst
          .mockResolvedValueOnce(null) // 下書きなし（existingDraft）
          .mockResolvedValueOnce({ id: "v2", version: 2 }); // 最新バージョン
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockTermsVersionCreate.mockResolvedValueOnce({
          id: VERSION_ID,
          version: 3,
        });

        const result = await createTermsVersion(VALID_VERSION_INPUT, USER_ID);

        expect(result).toEqual({ id: VERSION_ID, version: 3 });
      });

      test("バージョンが存在しない場合は version=1 で作成する", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockTermsVersionFindFirst
          .mockResolvedValueOnce(null) // 下書きなし
          .mockResolvedValueOnce(null); // 最新バージョンなし
        mockTermsVersionCreate.mockResolvedValueOnce({
          id: VERSION_ID,
          version: 1,
        });

        const result = await createTermsVersion(VALID_VERSION_INPUT, USER_ID);

        expect(result.version).toBe(1);
      });

      test("DRAFT ステータスでバージョンが作成される", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockTermsVersionFindFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);
        mockTermsVersionCreate.mockResolvedValueOnce({
          id: VERSION_ID,
          version: 1,
        });

        await createTermsVersion(VALID_VERSION_INPUT, USER_ID);

        expect(mockTermsVersionCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: TermsStatus.DRAFT,
              createdBy: USER_ID,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("規約が存在しない場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce(null);
        mockTermsVersionFindFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);

        await expect(
          createTermsVersion(VALID_VERSION_INPUT, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "規約が見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("下書きが既に存在する場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockTermsVersionFindFirst
          .mockResolvedValueOnce({ id: "existing-draft" }) // 下書きあり
          .mockResolvedValueOnce(null);

        await expect(
          createTermsVersion(VALID_VERSION_INPUT, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "下書きが既に存在します。先に公開または削除してください。",
          code: "CONFLICT",
        });
      });

      test("contentJson が不正な JSON の場合に DomainError をスローする", async () => {
        mockTermsFindUnique.mockResolvedValueOnce({ id: TERMS_ID });
        mockTermsVersionFindFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null);

        const invalidInput = {
          ...VALID_VERSION_INPUT,
          contentJson: "{invalid",
        };

        await expect(
          createTermsVersion(invalidInput, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          code: "VALIDATION",
        });
      });
    });
  });

  // =============================================================================
  // updateTermsVersion
  // =============================================================================

  describe("updateTermsVersion", () => {
    const VALID_UPDATE_VERSION_INPUT = {
      contentJson: VALID_CONTENT_JSON,
      contentHtml: "<p>更新後の規約本文</p>",
    };

    describe("正常系", () => {
      test("DRAFT バージョンを更新できる", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.DRAFT,
        });

        await expect(
          updateTermsVersion(VERSION_ID, VALID_UPDATE_VERSION_INPUT),
        ).resolves.toBeUndefined();

        expect(mockTermsVersionUpdate).toHaveBeenCalledTimes(1);
      });

      test("update が contentHtml を含むデータで呼ばれる", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.DRAFT,
        });

        await updateTermsVersion(VERSION_ID, VALID_UPDATE_VERSION_INPUT);

        expect(mockTermsVersionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: VERSION_ID },
            data: expect.objectContaining({
              contentHtml: "<p>更新後の規約本文</p>",
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("バージョンが存在しない場合に DomainError をスローする", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateTermsVersion(VERSION_ID, VALID_UPDATE_VERSION_INPUT),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "バージョンが見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("PUBLISHED バージョンは編集できない", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.PUBLISHED,
        });

        await expect(
          updateTermsVersion(VERSION_ID, VALID_UPDATE_VERSION_INPUT),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "公開済みのバージョンは編集できません",
          code: "CONFLICT",
        });
      });

      test("ARCHIVED バージョンは編集できない", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.ARCHIVED,
        });

        await expect(
          updateTermsVersion(VERSION_ID, VALID_UPDATE_VERSION_INPUT),
        ).rejects.toMatchObject({
          name: "DomainError",
          code: "CONFLICT",
        });
      });

      test("contentJson が不正な JSON の場合に DomainError をスローする", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.DRAFT,
        });

        await expect(
          updateTermsVersion(VERSION_ID, {
            contentJson: "bad json{",
            contentHtml: "<p>test</p>",
          }),
        ).rejects.toMatchObject({
          name: "DomainError",
          code: "VALIDATION",
        });
      });
    });
  });

  // =============================================================================
  // publishTermsVersion
  // =============================================================================

  describe("publishTermsVersion", () => {
    describe("正常系", () => {
      test("DRAFT バージョンを公開できる", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          termsId: TERMS_ID,
          status: TermsStatus.DRAFT,
        });

        await expect(
          publishTermsVersion(VERSION_ID, USER_ID),
        ).resolves.toBeUndefined();
      });

      test("公開時に既存の現行バージョンを非現行に更新する", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          termsId: TERMS_ID,
          status: TermsStatus.DRAFT,
        });

        await publishTermsVersion(VERSION_ID, USER_ID);

        expect(mockTxTermsVersionUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              termsId: TERMS_ID,
              isCurrentVersion: true,
            }),
            data: { isCurrentVersion: false },
          }),
        );
      });

      test("公開バージョンに PUBLISHED ステータスと isCurrentVersion=true が設定される", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          termsId: TERMS_ID,
          status: TermsStatus.DRAFT,
        });

        await publishTermsVersion(VERSION_ID, USER_ID);

        expect(mockTxTermsVersionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: VERSION_ID },
            data: expect.objectContaining({
              status: TermsStatus.PUBLISHED,
              isCurrentVersion: true,
              publishedBy: USER_ID,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("バージョンが存在しない場合に DomainError をスローする", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce(null);

        await expect(
          publishTermsVersion(VERSION_ID, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "バージョンが見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("既に公開済みのバージョンは再公開できない", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          termsId: TERMS_ID,
          status: TermsStatus.PUBLISHED,
        });

        await expect(
          publishTermsVersion(VERSION_ID, USER_ID),
        ).rejects.toMatchObject({
          name: "DomainError",
          message: "このバージョンは既に公開されています",
          code: "CONFLICT",
        });
      });
    });
  });

  // =============================================================================
  // archiveTermsVersion
  // =============================================================================

  describe("archiveTermsVersion", () => {
    describe("正常系", () => {
      test("現行バージョンでない場合はアーカイブできる", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          isCurrentVersion: false,
        });

        await expect(archiveTermsVersion(VERSION_ID)).resolves.toBeUndefined();

        expect(mockTermsVersionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: VERSION_ID },
            data: { status: TermsStatus.ARCHIVED },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("バージョンが存在しない場合に DomainError をスローする", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce(null);

        await expect(archiveTermsVersion(VERSION_ID)).rejects.toMatchObject({
          name: "DomainError",
          message: "バージョンが見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("現行バージョンはアーカイブできない", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          isCurrentVersion: true,
        });

        await expect(archiveTermsVersion(VERSION_ID)).rejects.toMatchObject({
          name: "DomainError",
          message: "現在有効なバージョンはアーカイブできません",
          code: "CONFLICT",
        });
      });
    });
  });

  // =============================================================================
  // deleteTermsVersion
  // =============================================================================

  describe("deleteTermsVersion", () => {
    describe("正常系", () => {
      test("DRAFT バージョンを削除できる", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.DRAFT,
        });

        await expect(deleteTermsVersion(VERSION_ID)).resolves.toBeUndefined();

        expect(mockTermsVersionDelete).toHaveBeenCalledWith({
          where: { id: VERSION_ID },
        });
      });
    });

    describe("異常系", () => {
      test("バージョンが存在しない場合に DomainError をスローする", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce(null);

        await expect(deleteTermsVersion(VERSION_ID)).rejects.toMatchObject({
          name: "DomainError",
          message: "バージョンが見つかりません",
          code: "NOT_FOUND",
        });
      });

      test("PUBLISHED バージョンは削除できない", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.PUBLISHED,
        });

        await expect(deleteTermsVersion(VERSION_ID)).rejects.toMatchObject({
          name: "DomainError",
          message: "公開済みまたはアーカイブ済みのバージョンは削除できません",
          code: "CONFLICT",
        });
      });

      test("ARCHIVED バージョンは削除できない", async () => {
        mockTermsVersionFindUnique.mockResolvedValueOnce({
          status: TermsStatus.ARCHIVED,
        });

        await expect(deleteTermsVersion(VERSION_ID)).rejects.toMatchObject({
          name: "DomainError",
          code: "CONFLICT",
        });
      });
    });
  });
});
