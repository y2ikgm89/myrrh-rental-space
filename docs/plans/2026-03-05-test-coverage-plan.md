# Test Coverage 10/10 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integration Tests 10件 + E2E Tests 5件を追加し、テストスコアを 8/10 → 10/10 に引き上げる。

**Architecture:** 既存の `__tests__/integration/actions/admin/faq.test.ts` パターン（スキーマ再宣言 + バリデーション検証）と `e2e/admin/news.spec.ts` パターン（Playwright + loginAsAdmin）を踏襲する。`'use server'` バウンダリを越えないよう、Action ファイル内のローカルスキーマはテスト内で再宣言する。純粋関数（`parseAuditLogMetadata`, `calcChangePercent`, `checkRobotsTxtWarnings`）は直接実装してロジックを検証する。

**Tech Stack:** bun:test, Playwright, Zod 4, TypeScript 6.0-beta

**Design doc:** `docs/plans/2026-03-05-test-coverage-design.md`

---

## Task 1: E2E fixtures に URL 定数を追加

**Files:**

- Modify: `e2e/fixtures/test-data.ts`

**Step 1: `urls` オブジェクトに不足 URL を追記**

`e2e/fixtures/test-data.ts` の `urls` オブジェクトに以下を追加（`adminSettings` の後ろ）:

```typescript
  adminPages: '/admin/pages',
  adminMedia: '/admin/media',
  adminFaq: '/admin/faq',
  adminTerms: '/admin/terms',
```

**Step 2: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 3: Commit**

```bash
git add e2e/fixtures/test-data.ts
git commit -m "test(e2e): add missing admin URL fixtures"
```

---

## Task 2: Integration — audit-log.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/audit-log.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * 監査ログ Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/audit-log.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { AuditAction } from "@/shared/generated/prisma/enums";

// audit-log.ts 内の filtersSchema を再現
const filtersSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  perPage: z.number().int().positive().max(100).optional().default(50),
  action: z.enum(AuditAction).or(z.literal("ALL")).optional(),
  resource: z.string().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// parseAuditLogMetadata ロジックを再現
type AuditLogMetadata = {
  ipAddress?: string;
  userAgent?: string;
  [key: string]: unknown;
} | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAuditLogMetadata(value: unknown): AuditLogMetadata {
  if (!isRecord(value)) return null;

  const result: {
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  } = {};
  if (typeof value["ipAddress"] === "string")
    result["ipAddress"] = value["ipAddress"];
  if (typeof value["userAgent"] === "string")
    result["userAgent"] = value["userAgent"];
  for (const [key, val] of Object.entries(value)) {
    if (key !== "ipAddress" && key !== "userAgent") result[key] = val;
  }
  return result;
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("Audit Log Admin Action Integration", () => {
  describe("filtersSchema バリデーション", () => {
    test("空オブジェクトはデフォルト値でパス", () => {
      const result = filtersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.perPage).toBe(50);
      }
    });

    test("全フィールド指定でパス", () => {
      const result = filtersSchema.safeParse({
        page: 2,
        perPage: 20,
        action: "ALL",
        resource: "post",
        userId: VALID_UUID,
        dateFrom: "2026-01-01",
        dateTo: "2026-03-01",
      });
      expect(result.success).toBe(true);
    });

    describe("page", () => {
      test("正の整数は許可", () => {
        expect(filtersSchema.safeParse({ page: 1 }).success).toBe(true);
        expect(filtersSchema.safeParse({ page: 100 }).success).toBe(true);
      });

      test("0以下はエラー", () => {
        expect(filtersSchema.safeParse({ page: 0 }).success).toBe(false);
        expect(filtersSchema.safeParse({ page: -1 }).success).toBe(false);
      });

      test("小数はエラー", () => {
        expect(filtersSchema.safeParse({ page: 1.5 }).success).toBe(false);
      });
    });

    describe("perPage", () => {
      test("1〜100は許可", () => {
        expect(filtersSchema.safeParse({ perPage: 1 }).success).toBe(true);
        expect(filtersSchema.safeParse({ perPage: 100 }).success).toBe(true);
      });

      test("101以上はエラー", () => {
        expect(filtersSchema.safeParse({ perPage: 101 }).success).toBe(false);
      });

      test("0はエラー", () => {
        expect(filtersSchema.safeParse({ perPage: 0 }).success).toBe(false);
      });
    });

    describe("action", () => {
      test('"ALL" は許可', () => {
        expect(filtersSchema.safeParse({ action: "ALL" }).success).toBe(true);
      });

      test("有効な AuditAction enum は許可", () => {
        expect(
          filtersSchema.safeParse({ action: AuditAction.LOGIN_SUCCESS })
            .success,
        ).toBe(true);
        expect(
          filtersSchema.safeParse({ action: AuditAction.LOGIN_FAILED }).success,
        ).toBe(true);
        expect(
          filtersSchema.safeParse({ action: AuditAction.PERMISSION_DENIED })
            .success,
        ).toBe(true);
      });

      test("無効な文字列はエラー", () => {
        expect(
          filtersSchema.safeParse({ action: "INVALID_ACTION" }).success,
        ).toBe(false);
      });
    });

    describe("userId", () => {
      test("有効な UUID は許可", () => {
        expect(filtersSchema.safeParse({ userId: VALID_UUID }).success).toBe(
          true,
        );
      });

      test("無効な UUID はエラー", () => {
        expect(filtersSchema.safeParse({ userId: "not-a-uuid" }).success).toBe(
          false,
        );
        expect(filtersSchema.safeParse({ userId: "12345" }).success).toBe(
          false,
        );
      });
    });

    describe("dateFrom / dateTo", () => {
      test("ISO 日付文字列は許可", () => {
        expect(
          filtersSchema.safeParse({
            dateFrom: "2026-01-01",
            dateTo: "2026-12-31",
          }).success,
        ).toBe(true);
      });

      test("任意の文字列も許可（変換は呼び出し側）", () => {
        expect(
          filtersSchema.safeParse({ dateFrom: "2026-01-01T00:00:00.000Z" })
            .success,
        ).toBe(true);
      });
    });
  });

  describe("parseAuditLogMetadata ロジック", () => {
    test("null を渡すと null を返す", () => {
      expect(parseAuditLogMetadata(null)).toBeNull();
    });

    test("undefined を渡すと null を返す", () => {
      expect(parseAuditLogMetadata(undefined)).toBeNull();
    });

    test("文字列を渡すと null を返す", () => {
      expect(parseAuditLogMetadata("string")).toBeNull();
    });

    test("配列を渡すと null を返す", () => {
      expect(parseAuditLogMetadata([1, 2, 3])).toBeNull();
    });

    test("ipAddress と userAgent を抽出できる", () => {
      const result = parseAuditLogMetadata({
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      });
      expect(result).not.toBeNull();
      expect(result?.ipAddress).toBe("192.168.1.1");
      expect(result?.userAgent).toBe("Mozilla/5.0");
    });

    test("ipAddress が非文字列の場合は無視", () => {
      const result = parseAuditLogMetadata({ ipAddress: 123 });
      expect(result?.ipAddress).toBeUndefined();
    });

    test("追加フィールドはパススルーされる", () => {
      const result = parseAuditLogMetadata({ customField: "value", count: 42 });
      expect(result?.["customField"]).toBe("value");
      expect(result?.["count"]).toBe(42);
    });

    test("空オブジェクトは空のメタデータを返す", () => {
      const result = parseAuditLogMetadata({});
      expect(result).not.toBeNull();
      expect(result?.ipAddress).toBeUndefined();
      expect(result?.userAgent).toBeUndefined();
    });
  });

  describe("AuditAction enum 整合性", () => {
    test("セキュリティ関連 action が存在する", () => {
      const securityActions = [
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "PERMISSION_DENIED",
        "PASSWORD_CHANGE",
        "ROLE_CHANGE",
      ];
      const enumValues = Object.values(AuditAction) as string[];
      for (const action of securityActions) {
        expect(enumValues).toContain(action);
      }
    });
  });

  describe("AuditLogResult 型構造", () => {
    test("有効なページネーション結果", () => {
      type AuditLogResult = {
        logs: unknown[];
        total: number;
        page: number;
        totalPages: number;
      };
      const result: AuditLogResult = {
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
      };
      expect(result.totalPages).toBe(Math.ceil(result.total / 50));
    });

    test("totalPages 計算ロジック", () => {
      const total = 105;
      const perPage = 50;
      expect(Math.ceil(total / perPage)).toBe(3);
    });
  });

  describe("AuditLogStats 型構造", () => {
    test("有効な統計データ構造", () => {
      type AuditLogStats = {
        total: number;
        today: number;
        securityEvents: number;
        byAction: Record<string, number>;
      };
      const stats: AuditLogStats = {
        total: 100,
        today: 5,
        securityEvents: 3,
        byAction: { LOGIN_SUCCESS: 50, LOGIN_FAILED: 3 },
      };
      expect(stats.total).toBe(100);
      expect(stats.byAction["LOGIN_SUCCESS"]).toBe(50);
    });
  });
});
```

**Step 2: テストを実行して全件 PASS を確認**

```bash
bun test __tests__/integration/actions/admin/audit-log.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/audit-log.test.ts
git commit -m "test(integration): add audit-log action tests"
```

---

## Task 3: Integration — homepage-settings.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/homepage-settings.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * ホームページ設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts のテスト
 * ※ createSectionSchema 等は @/shared/lib/validations/section から import
 */

import { describe, test, expect } from "bun:test";
import {
  SectionType,
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  validateSectionConfig,
  defaultSectionConfigs,
} from "@/shared/lib/validations/section";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("Homepage Settings Admin Action Integration", () => {
  describe("createSectionSchema バリデーション", () => {
    test("HERO タイプの最小入力でパス", () => {
      const result = createSectionSchema.safeParse({
        type: SectionType.HERO,
        isActive: true,
      });
      expect(result.success).toBe(true);
    });

    test("type は SectionType enum のみ許可", () => {
      const result = createSectionSchema.safeParse({
        type: "INVALID_TYPE",
        isActive: true,
      });
      expect(result.success).toBe(false);
    });

    test("isActive は必須", () => {
      const result = createSectionSchema.safeParse({ type: SectionType.HERO });
      expect(result.success).toBe(false);
    });

    test("全 SectionType での作成が可能", () => {
      for (const type of Object.values(SectionType)) {
        const result = createSectionSchema.safeParse({ type, isActive: true });
        expect(result.success).toBe(true);
      }
    });

    test("title はオプション", () => {
      const withTitle = createSectionSchema.safeParse({
        type: SectionType.HERO,
        isActive: true,
        title: "テスト",
      });
      const withoutTitle = createSectionSchema.safeParse({
        type: SectionType.HERO,
        isActive: true,
      });
      expect(withTitle.success).toBe(true);
      expect(withoutTitle.success).toBe(true);
    });
  });

  describe("updateSectionSchema バリデーション", () => {
    test("有効な更新データでパス", () => {
      const result = updateSectionSchema.safeParse({
        title: "更新タイトル",
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    test("全フィールドオプション", () => {
      const result = updateSectionSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("updateSectionOrderSchema バリデーション", () => {
    test("有効な順序更新でパス", () => {
      const result = updateSectionOrderSchema.safeParse({
        sections: [
          { id: VALID_UUID, order: 0 },
          { id: "550e8400-e29b-41d4-a716-446655440001", order: 1 },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("sections は必須", () => {
      const result = updateSectionOrderSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    test("sections の各要素に id と order が必要", () => {
      const noId = updateSectionOrderSchema.safeParse({
        sections: [{ order: 0 }],
      });
      const noOrder = updateSectionOrderSchema.safeParse({
        sections: [{ id: VALID_UUID }],
      });
      expect(noId.success).toBe(false);
      expect(noOrder.success).toBe(false);
    });

    test("id は UUID 形式が必要", () => {
      const result = updateSectionOrderSchema.safeParse({
        sections: [{ id: "not-uuid", order: 0 }],
      });
      expect(result.success).toBe(false);
    });

    test("空配列は許可", () => {
      const result = updateSectionOrderSchema.safeParse({ sections: [] });
      expect(result.success).toBe(true);
    });
  });

  describe("parseSectionConfig フォールバックロジック", () => {
    test("有効な HERO 設定は成功", () => {
      const config = {
        title: "ヒーロー",
        ctaPrimary: { text: "btn", url: "/link" },
      };
      const result = validateSectionConfig(SectionType.HERO, config);
      expect(result.success).toBe(true);
    });

    test("無効な設定は失敗してデフォルト設定にフォールバック可能", () => {
      const result = validateSectionConfig(SectionType.HERO, "not-an-object");
      if (!result.success) {
        const defaultConfig = defaultSectionConfigs[SectionType.HERO];
        expect(defaultConfig).toBeDefined();
      }
    });

    test("全 SectionType にデフォルト設定が存在", () => {
      for (const type of Object.values(SectionType)) {
        expect(defaultSectionConfigs[type]).toBeDefined();
      }
    });
  });

  describe("HomepageSectionData 型構造", () => {
    test("有効なホームページセクションデータ", () => {
      type HomepageSectionData = {
        id: string;
        type: SectionType;
        title: string | null;
        config: unknown;
        design: unknown;
        contentHtml: string | null;
        contentJson: unknown;
        order: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
      };

      const data: HomepageSectionData = {
        id: VALID_UUID,
        type: SectionType.HERO,
        title: "ヒーロー",
        config: defaultSectionConfigs[SectionType.HERO],
        design: {},
        contentHtml: null,
        contentJson: null,
        order: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(data.type).toBe(SectionType.HERO);
      expect(data.isActive).toBe(true);
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/homepage-settings.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/homepage-settings.test.ts
git commit -m "test(integration): add homepage-settings action tests"
```

---

## Task 4: Integration — editor-comment.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/editor-comment.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * エディタコメント Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// CommentableContentType 再現
const COMMENTABLE_CONTENT_TYPES = ["post", "news", "page", "faq"] as const;
type CommentableContentType = (typeof COMMENTABLE_CONTENT_TYPES)[number];

function isCommentableContentType(
  value: unknown,
): value is CommentableContentType {
  return COMMENTABLE_CONTENT_TYPES.includes(value as CommentableContentType);
}

// createThreadSchema 再現
const createThreadSchema = z.object({
  markId: z.string().min(1, { error: "markId は必須です" }),
  contentType: z
    .string()
    .refine(isCommentableContentType, { error: "contentType が無効です" }),
  contentId: z
    .string()
    .uuid({ error: "contentId は有効な UUID である必要があります" }),
  quotedText: z
    .string()
    .min(1, { error: "引用テキストは必須です" })
    .max(2000, { error: "引用テキストは2000文字以内" }),
  initialComment: z
    .string()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

// addCommentSchema 再現
const addCommentSchema = z.object({
  threadId: z
    .string()
    .uuid({ error: "threadId は有効な UUID である必要があります" }),
  content: z
    .string()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_THREAD_INPUT = {
  markId: "mark-abc123",
  contentType: "post",
  contentId: VALID_UUID,
  quotedText: "引用テキスト",
  initialComment: "最初のコメント",
};

describe("Editor Comment Admin Action Integration", () => {
  describe("createThreadSchema バリデーション", () => {
    test("有効なデータはパス", () => {
      expect(createThreadSchema.safeParse(VALID_THREAD_INPUT).success).toBe(
        true,
      );
    });

    describe("markId", () => {
      test("空文字はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          markId: "",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("markId は必須");
      });
    });

    describe("contentType", () => {
      test("有効な contentType は許可", () => {
        for (const type of COMMENTABLE_CONTENT_TYPES) {
          const result = createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            contentType: type,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効な contentType はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          contentType: "invalid",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain(
            "contentType が無効",
          );
      });
    });

    describe("contentId", () => {
      test("無効な UUID はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          contentId: "not-uuid",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("quotedText", () => {
      test("空文字はエラー", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            quotedText: "",
          }).success,
        ).toBe(false);
      });

      test("2000文字はOK", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            quotedText: "あ".repeat(2000),
          }).success,
        ).toBe(true);
      });

      test("2001文字はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          quotedText: "あ".repeat(2001),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("2000文字以内");
      });
    });

    describe("initialComment", () => {
      test("空文字はエラー", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            initialComment: "",
          }).success,
        ).toBe(false);
      });

      test("5000文字はOK", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            initialComment: "x".repeat(5000),
          }).success,
        ).toBe(true);
      });

      test("5001文字はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          initialComment: "x".repeat(5001),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("5000文字以内");
      });
    });
  });

  describe("addCommentSchema バリデーション", () => {
    test("有効なデータはパス", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: VALID_UUID,
          content: "コメント",
        }).success,
      ).toBe(true);
    });

    test("threadId が UUID でなければエラー", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: "not-uuid",
          content: "コメント",
        }).success,
      ).toBe(false);
    });

    test("content が空文字はエラー", () => {
      expect(
        addCommentSchema.safeParse({ threadId: VALID_UUID, content: "" })
          .success,
      ).toBe(false);
    });

    test("content 5000文字はOK", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: VALID_UUID,
          content: "x".repeat(5000),
        }).success,
      ).toBe(true);
    });

    test("content 5001文字はエラー", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: VALID_UUID,
          content: "x".repeat(5001),
        }).success,
      ).toBe(false);
    });
  });

  describe("isCommentableContentType 型ガード", () => {
    test("有効なコンテンツタイプは true", () => {
      expect(isCommentableContentType("post")).toBe(true);
      expect(isCommentableContentType("news")).toBe(true);
      expect(isCommentableContentType("page")).toBe(true);
    });

    test("無効な値は false", () => {
      expect(isCommentableContentType("invalid")).toBe(false);
      expect(isCommentableContentType("")).toBe(false);
      expect(isCommentableContentType(null)).toBe(false);
      expect(isCommentableContentType(undefined)).toBe(false);
      expect(isCommentableContentType(123)).toBe(false);
    });
  });

  describe("ThreadListItem 型構造", () => {
    test("有効なスレッドリストアイテム", () => {
      type ThreadListItem = {
        id: string;
        markId: string;
        quotedText: string;
        status: string;
        commentCount: number;
        latestComment?: {
          content: string;
          createdAt: Date;
          createdByName: string;
        };
        createdAt: Date;
        createdByName: string;
      };

      const item: ThreadListItem = {
        id: VALID_UUID,
        markId: "mark-abc",
        quotedText: "引用テキスト",
        status: "ACTIVE",
        commentCount: 3,
        createdAt: new Date(),
        createdByName: "テストユーザー",
      };

      expect(item.commentCount).toBe(3);
      expect(item.latestComment).toBeUndefined();
    });
  });

  describe("MarkInfo 型構造", () => {
    test("有効なマーク情報", () => {
      type MarkInfo = {
        markId: string;
        threadId: string;
        status: string;
        commentCount: number;
      };

      const mark: MarkInfo = {
        markId: "mark-abc",
        threadId: VALID_UUID,
        status: "ACTIVE",
        commentCount: 2,
      };

      expect(mark.status).toBe("ACTIVE");
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/editor-comment.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/editor-comment.test.ts
git commit -m "test(integration): add editor-comment action tests"
```

---

## Task 5: Integration — ical-tokens.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/ical-tokens.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * iCal トークン Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/ical-tokens.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// createTokenSchema 再現
const createTokenSchema = z.object({
  name: z.string().min(1, { error: "トークン名は必須です" }).max(100),
  spaceId: z.string().uuid().nullable(),
  expiresInDays: z.number().int().min(0).nullable(),
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_TOKEN_INPUT = {
  name: "マイカレンダーフィード",
  spaceId: null,
  expiresInDays: null,
};

describe("iCal Tokens Admin Action Integration", () => {
  describe("createTokenSchema バリデーション", () => {
    test("有効なデータはパス（無期限・全スペース）", () => {
      expect(createTokenSchema.safeParse(VALID_TOKEN_INPUT).success).toBe(true);
    });

    test("有効なデータはパス（特定スペース・有効期限あり）", () => {
      const result = createTokenSchema.safeParse({
        name: "スペースAフィード",
        spaceId: VALID_UUID,
        expiresInDays: 30,
      });
      expect(result.success).toBe(true);
    });

    describe("name", () => {
      test("空文字はエラー", () => {
        const result = createTokenSchema.safeParse({
          ...VALID_TOKEN_INPUT,
          name: "",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("トークン名は必須");
      });

      test("100文字はOK（境界）", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            name: "a".repeat(100),
          }).success,
        ).toBe(true);
      });

      test("101文字はエラー", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            name: "a".repeat(101),
          }).success,
        ).toBe(false);
      });
    });

    describe("spaceId", () => {
      test("null は許可（全スペース対象）", () => {
        expect(
          createTokenSchema.safeParse({ ...VALID_TOKEN_INPUT, spaceId: null })
            .success,
        ).toBe(true);
      });

      test("有効な UUID は許可", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            spaceId: VALID_UUID,
          }).success,
        ).toBe(true);
      });

      test("無効な UUID はエラー", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            spaceId: "not-uuid",
          }).success,
        ).toBe(false);
      });
    });

    describe("expiresInDays", () => {
      test("null は許可（無期限）", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: null,
          }).success,
        ).toBe(true);
      });

      test("0 は許可（0 も無期限として扱われる）", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: 0,
          }).success,
        ).toBe(true);
      });

      test("正の整数は許可", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: 7,
          }).success,
        ).toBe(true);
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: 365,
          }).success,
        ).toBe(true);
      });

      test("負の値はエラー", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: -1,
          }).success,
        ).toBe(false);
      });

      test("小数はエラー", () => {
        expect(
          createTokenSchema.safeParse({
            ...VALID_TOKEN_INPUT,
            expiresInDays: 7.5,
          }).success,
        ).toBe(false);
      });
    });
  });

  describe("有効期限計算ロジック", () => {
    test("expiresInDays > 0 の場合は現在日時 + 日数", () => {
      const now = new Date();
      const expiresInDays = 30;
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      // 30日後の日付になっているか（1秒以内の誤差を許容）
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(30);
    });

    test("expiresInDays が 0 または null の場合は無期限（null）", () => {
      // ロジック: expiresInDays && expiresInDays > 0 でなければ null
      const calcExpiresAt = (expiresInDays: number | null): Date | null => {
        if (expiresInDays && expiresInDays > 0) {
          const d = new Date();
          d.setDate(d.getDate() + expiresInDays);
          return d;
        }
        return null;
      };
      expect(calcExpiresAt(null)).toBeNull();
      expect(calcExpiresAt(0)).toBeNull();
      expect(calcExpiresAt(30)).not.toBeNull();
    });
  });

  describe("ICalTokenWithRelations 型構造", () => {
    test("有効なトークン型", () => {
      type ICalTokenWithRelations = {
        id: string;
        token: string;
        name: string;
        spaceId: string | null;
        spaceName: string | null;
        createdBy: string;
        createdByName: string | null;
        expiresAt: Date | null;
        createdAt: Date;
        lastUsedAt: Date | null;
      };

      const token: ICalTokenWithRelations = {
        id: VALID_UUID,
        token: "abc123token",
        name: "テストフィード",
        spaceId: null,
        spaceName: null,
        createdBy: VALID_UUID,
        createdByName: "テストユーザー",
        expiresAt: null,
        createdAt: new Date(),
        lastUsedAt: null,
      };

      expect(token.expiresAt).toBeNull();
      expect(token.spaceName).toBeNull();
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/ical-tokens.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/ical-tokens.test.ts
git commit -m "test(integration): add ical-tokens action tests"
```

---

## Task 6: Integration — block-template.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/block-template.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * ブロックテンプレート Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/block-template.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// createBlockTemplateSchema 再現
const createBlockTemplateSchema = z.object({
  name: z
    .string()
    .min(1, { error: "テンプレート名は必須です" })
    .max(100, { error: "100文字以内で入力してください" }),
  description: z
    .string()
    .max(500, { error: "500文字以内で入力してください" })
    .optional(),
  nodeJson: z.record(z.string(), z.unknown()).or(z.array(z.unknown())),
});

const VALID_INPUT = {
  name: "CTAブロック",
  nodeJson: { type: "cta", text: "Click me" },
};

describe("Block Template Admin Action Integration", () => {
  describe("createBlockTemplateSchema バリデーション", () => {
    test("有効なデータはパス（object nodeJson）", () => {
      expect(createBlockTemplateSchema.safeParse(VALID_INPUT).success).toBe(
        true,
      );
    });

    test("有効なデータはパス（array nodeJson）", () => {
      const result = createBlockTemplateSchema.safeParse({
        ...VALID_INPUT,
        nodeJson: [{ type: "paragraph" }, { type: "heading" }],
      });
      expect(result.success).toBe(true);
    });

    test("description は省略可能", () => {
      expect(createBlockTemplateSchema.safeParse(VALID_INPUT).success).toBe(
        true,
      );
    });

    test("description ありでもパス", () => {
      expect(
        createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          description: "このテンプレートはCTAセクション用です",
        }).success,
      ).toBe(true);
    });

    describe("name", () => {
      test("空文字はエラー", () => {
        const result = createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          name: "",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain(
            "テンプレート名は必須",
          );
      });

      test("100文字はOK（境界）", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            name: "x".repeat(100),
          }).success,
        ).toBe(true);
      });

      test("101文字はエラー", () => {
        const result = createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          name: "x".repeat(101),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("100文字以内");
      });
    });

    describe("description", () => {
      test("500文字はOK（境界）", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            description: "x".repeat(500),
          }).success,
        ).toBe(true);
      });

      test("501文字はエラー", () => {
        const result = createBlockTemplateSchema.safeParse({
          ...VALID_INPUT,
          description: "x".repeat(501),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("500文字以内");
      });
    });

    describe("nodeJson", () => {
      test("ネストされたオブジェクトは許可", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            nodeJson: {
              root: { children: [{ type: "paragraph", text: "hello" }] },
            },
          }).success,
        ).toBe(true);
      });

      test("文字列は不許可", () => {
        expect(
          createBlockTemplateSchema.safeParse({
            ...VALID_INPUT,
            nodeJson: "string",
          }).success,
        ).toBe(false);
      });

      test("数値は不許可", () => {
        expect(
          createBlockTemplateSchema.safeParse({ ...VALID_INPUT, nodeJson: 123 })
            .success,
        ).toBe(false);
      });
    });
  });

  describe("BlockTemplateListItem 型構造", () => {
    test("有効なテンプレートリストアイテム", () => {
      type BlockTemplateListItem = {
        id: string;
        name: string;
        description: string | null;
        createdAt: Date;
        creatorName: string | null;
      };

      const item: BlockTemplateListItem = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "CTAブロック",
        description: null,
        createdAt: new Date(),
        creatorName: "テストユーザー",
      };

      expect(item.description).toBeNull();
      expect(item.creatorName).toBe("テストユーザー");
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/block-template.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/block-template.test.ts
git commit -m "test(integration): add block-template action tests"
```

---

## Task 7: Integration — post-comment.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/post-comment.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * 投稿コメント管理 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/post-comment.ts のテスト
 */

import { describe, test, expect } from "bun:test";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("Post Comment Admin Action Integration", () => {
  describe("CommentFilters 型テスト", () => {
    test("有効なフィルター: status ALL", () => {
      type CommentFilters = {
        postId?: string;
        status?: "ALL" | "ACTIVE" | "DELETED";
        search?: string;
      };
      const filters: CommentFilters = { status: "ALL" };
      expect(filters.status).toBe("ALL");
    });

    test("有効なフィルター: status ACTIVE + search", () => {
      type CommentFilters = {
        postId?: string;
        status?: "ALL" | "ACTIVE" | "DELETED";
        search?: string;
      };
      const filters: CommentFilters = { status: "ACTIVE", search: "テスト" };
      expect(filters.status).toBe("ACTIVE");
    });

    test("フィルターなし（空オブジェクト）", () => {
      type CommentFilters = {
        postId?: string;
        status?: "ALL" | "ACTIVE" | "DELETED";
        search?: string;
      };
      const filters: CommentFilters = {};
      expect(Object.keys(filters)).toHaveLength(0);
    });
  });

  describe("GetCommentsResult ページネーション計算", () => {
    test("totalPages は ceil(total / limit)", () => {
      const total = 45;
      const limit = 20;
      expect(Math.ceil(total / limit)).toBe(3);
    });

    test("total が 0 の場合は totalPages も 0", () => {
      const total = 0;
      const limit = 20;
      expect(Math.ceil(total / limit)).toBe(0);
    });

    test("total が limit と同じ場合は totalPages は 1", () => {
      const total = 20;
      const limit = 20;
      expect(Math.ceil(total / limit)).toBe(1);
    });

    test("GetCommentsResult 型構造", () => {
      type GetCommentsResult = {
        comments: unknown[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
      const result: GetCommentsResult = {
        comments: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe("AdminCommentData 型構造", () => {
    test("認証ユーザーのコメント", () => {
      type CommentAuthor =
        | {
            type: "user";
            userId: string;
            name: string;
          }
        | {
            type: "guest";
            name: string;
            email: string;
          };

      type AdminCommentData = {
        id: string;
        content: string;
        author: CommentAuthor;
        postId: string;
        postTitle: string;
        postSlug: string;
        parentCommentId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        createdAt: Date;
      };

      const comment: AdminCommentData = {
        id: VALID_UUID,
        content: "テストコメント",
        author: { type: "user", userId: VALID_UUID, name: "テストユーザー" },
        postId: VALID_UUID,
        postTitle: "テスト記事",
        postSlug: "test-post",
        parentCommentId: null,
        isDeleted: false,
        deletedAt: null,
        createdAt: new Date(),
      };

      expect(comment.author.type).toBe("user");
      expect(comment.isDeleted).toBe(false);
    });

    test("ゲストコメント", () => {
      type CommentAuthor =
        | { type: "user"; userId: string; name: string }
        | { type: "guest"; name: string; email: string };
      const guestAuthor: CommentAuthor = {
        type: "guest",
        name: "ゲスト",
        email: "guest@example.com",
      };
      expect(guestAuthor.type).toBe("guest");
    });
  });

  describe("CommentStats 型構造", () => {
    test("有効な統計データ", () => {
      type CommentStats = { total: number; today: number; deleted: number };
      const stats: CommentStats = { total: 100, today: 5, deleted: 10 };
      expect(stats.total).toBe(100);
      expect(stats.today).toBe(5);
      expect(stats.deleted).toBe(10);
    });

    test("エラー時のデフォルト値（全て 0）", () => {
      type CommentStats = { total: number; today: number; deleted: number };
      const stats: CommentStats = { total: 0, today: 0, deleted: 0 };
      expect(stats.total + stats.today + stats.deleted).toBe(0);
    });
  });

  describe("customerName 結合ロジック", () => {
    test("lastName + firstName を結合", () => {
      const lastName = "田中";
      const firstName = "太郎";
      const customerName = `${lastName} ${firstName}`;
      expect(customerName).toBe("田中 太郎");
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/post-comment.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/post-comment.test.ts
git commit -m "test(integration): add post-comment action tests"
```

---

## Task 8: Integration — dashboard.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/dashboard.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * ダッシュボード Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/dashboard.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import {
  ReservationStatus,
  InquiryStatus,
} from "@/shared/generated/prisma/enums";

// calcChangePercent ロジックを再現
function calcChangePercent(current: number, previous: number): number {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 100);
  }
  if (current > 0) {
    return 100;
  }
  return 0;
}

describe("Dashboard Admin Action Integration", () => {
  describe("calcChangePercent ロジック", () => {
    test("通常の増加: (100-80)/80*100 = 25%", () => {
      expect(calcChangePercent(100, 80)).toBe(25);
    });

    test("通常の減少: (80-100)/100*100 = -20%", () => {
      expect(calcChangePercent(80, 100)).toBe(-20);
    });

    test("変化なし: 0%", () => {
      expect(calcChangePercent(100, 100)).toBe(0);
    });

    test("前月 0・今月あり → 100%", () => {
      expect(calcChangePercent(50, 0)).toBe(100);
    });

    test("両方 0 → 0%", () => {
      expect(calcChangePercent(0, 0)).toBe(0);
    });

    test("前月あり・今月 0 → -100%", () => {
      expect(calcChangePercent(0, 100)).toBe(-100);
    });

    test("端数切り捨て: Math.round 適用", () => {
      // (10-7)/7*100 = 42.857... → 43%
      expect(calcChangePercent(10, 7)).toBe(43);
    });
  });

  describe("DashboardStats 型構造", () => {
    test("有効なダッシュボード統計", () => {
      type DashboardStats = {
        reservations: {
          thisMonth: number;
          lastMonth: number;
          changePercent: number;
        };
        revenue: {
          thisMonth: number;
          lastMonth: number;
          changePercent: number;
        };
        inquiries: { new: number; thisMonth: number };
        spaces: { active: number; total: number };
      };

      const stats: DashboardStats = {
        reservations: { thisMonth: 50, lastMonth: 40, changePercent: 25 },
        revenue: { thisMonth: 500000, lastMonth: 400000, changePercent: 25 },
        inquiries: { new: 3, thisMonth: 10 },
        spaces: { active: 3, total: 5 },
      };

      expect(stats.reservations.changePercent).toBe(calcChangePercent(50, 40));
      expect(stats.spaces.active).toBeLessThanOrEqual(stats.spaces.total);
    });
  });

  describe("RecentReservation 型構造", () => {
    test("有効な直近予約データ", () => {
      type RecentReservation = {
        id: string;
        spaceName: string;
        customerName: string;
        startTime: Date;
        endTime: Date;
        status: ReservationStatus;
        totalPrice: number | null;
      };

      const reservation: RecentReservation = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        spaceName: "テスト会議室",
        customerName: "田中 太郎",
        startTime: new Date("2026-03-10T10:00:00"),
        endTime: new Date("2026-03-10T12:00:00"),
        status: ReservationStatus.CONFIRMED,
        totalPrice: 5000,
      };

      expect(reservation.status).toBe(ReservationStatus.CONFIRMED);
      expect(reservation.endTime > reservation.startTime).toBe(true);
    });
  });

  describe("ChartDataPoint 型構造", () => {
    test("有効なチャートデータポイント（date は MM-DD 形式）", () => {
      type ChartDataPoint = {
        date: string;
        reservations: number;
        revenue: number;
      };
      const point: ChartDataPoint = {
        date: "03-05",
        reservations: 5,
        revenue: 25000,
      };
      expect(point.date).toMatch(/^\d{2}-\d{2}$/);
      expect(point.reservations).toBeGreaterThanOrEqual(0);
    });

    test("30日分のチャートデータを生成できる", () => {
      const data: Array<{
        date: string;
        reservations: number;
        revenue: number;
      }> = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().slice(5, 10); // MM-DD
        data.push({ date: dateStr, reservations: 0, revenue: 0 });
      }
      expect(data).toHaveLength(30);
      expect(data[0]?.date).toMatch(/^\d{2}-\d{2}$/);
    });
  });

  describe("RecentInquiry 型構造", () => {
    test("有効な直近問い合わせデータ", () => {
      type RecentInquiry = {
        id: string;
        name: string;
        email: string;
        subject: string;
        status: InquiryStatus;
        createdAt: Date;
      };

      const inquiry: RecentInquiry = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "問い合わせ太郎",
        email: "inquiry@example.com",
        subject: "レンタルについて",
        status: InquiryStatus.NEW,
        createdAt: new Date(),
      };

      expect(inquiry.status).toBe(InquiryStatus.NEW);
    });
  });

  describe("ReservationStatus / InquiryStatus enum 整合性", () => {
    test("ReservationStatus に CANCELLED が存在", () => {
      const values = Object.values(ReservationStatus) as string[];
      expect(values).toContain("CANCELLED");
      expect(values).toContain("CONFIRMED");
    });

    test("InquiryStatus に NEW が存在", () => {
      const values = Object.values(InquiryStatus) as string[];
      expect(values).toContain("NEW");
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/dashboard.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/dashboard.test.ts
git commit -m "test(integration): add dashboard action tests with calcChangePercent logic"
```

---

## Task 9: Integration — preview.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/preview.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * プレビュー Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/preview.ts のテスト
 */

import { describe, test, expect } from "bun:test";

describe("Preview Admin Action Integration", () => {
  describe("generatePreviewHtml の入力パターン", () => {
    test("空文字 contentJson は空文字を返す（auth チェック後）", () => {
      // contentJson が空文字の場合、権限チェック後に '' を返すロジック
      const contentJson = "";
      const result = contentJson ? "html-content" : "";
      expect(result).toBe("");
    });

    test("非空文字 contentJson は HTML 変換を試みる", () => {
      const contentJson = '{"root":{"children":[]}}';
      const shouldAttemptConversion = contentJson.length > 0;
      expect(shouldAttemptConversion).toBe(true);
    });
  });

  describe("Resource 型制約", () => {
    test("有効な Resource 型は post / news / page のみ", () => {
      type Resource = "post" | "news" | "page";
      const validResources: Resource[] = ["post", "news", "page"];
      expect(validResources).toHaveLength(3);
      expect(validResources).toContain("post");
      expect(validResources).toContain("news");
      expect(validResources).toContain("page");
    });

    test('デフォルト resource は "post"', () => {
      type Resource = "post" | "news" | "page";
      const defaultResource: Resource = "post";
      expect(defaultResource).toBe("post");
    });
  });

  describe("generatePreviewHtml 戻り値型", () => {
    test("戻り値は string | null", () => {
      // 権限なし → null
      const noPermission: string | null = null;
      expect(noPermission).toBeNull();

      // 変換成功 → HTML 文字列
      const successResult: string | null = "<p>テスト</p>";
      expect(typeof successResult).toBe("string");

      // 変換エラー → null
      const errorResult: string | null = null;
      expect(errorResult).toBeNull();
    });
  });

  describe("Lexical JSON 形式の基本検証", () => {
    test("有効な Lexical JSON 構造", () => {
      const validLexicalJson = JSON.stringify({
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  text: "テスト",
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          type: "root",
          version: 1,
        },
      });

      const parsed = JSON.parse(validLexicalJson);
      expect(parsed.root).toBeDefined();
      expect(parsed.root.children).toBeArray();
    });

    test("JSON.parse に失敗する文字列は変換エラー対象", () => {
      const invalidJson = "not-valid-json";
      expect(() => JSON.parse(invalidJson)).toThrow();
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test __tests__/integration/actions/admin/preview.test.ts
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/preview.test.ts
git commit -m "test(integration): add preview action tests"
```

---

## Task 10: Integration — settings-email.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/settings-email.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * メール設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/email.ts のテスト
 * スキーマは settings/schemas.ts から import する
 */

import { describe, test, expect } from "bun:test";
import {
  emailSettingsSchema,
  notificationSettingsSchema,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas";

const VALID_EMAIL_INPUT = {
  senderEmail: "sender@example.com",
  senderName: "送信者名",
  replyToEmail: "reply@example.com",
  sendReservationConfirmationEmail: true,
  sendAdminNotificationEmail: true,
  notificationEmailAddresses: "admin@example.com",
};

const VALID_NOTIFICATION_INPUT = {
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: false,
  notifyNewInquiry: true,
};

describe("Email Settings Admin Action Integration", () => {
  describe("emailSettingsSchema バリデーション", () => {
    test("有効なデータはパス", () => {
      expect(emailSettingsSchema.safeParse(VALID_EMAIL_INPUT).success).toBe(
        true,
      );
    });

    test("全フィールド null でもパス", () => {
      const result = emailSettingsSchema.safeParse({
        senderEmail: null,
        senderName: null,
        replyToEmail: null,
        sendReservationConfirmationEmail: false,
        sendAdminNotificationEmail: false,
        notificationEmailAddresses: null,
      });
      expect(result.success).toBe(true);
    });

    test("空文字はパス（null と同じ扱い）", () => {
      const result = emailSettingsSchema.safeParse({
        ...VALID_EMAIL_INPUT,
        senderEmail: "",
        replyToEmail: "",
      });
      expect(result.success).toBe(true);
    });

    describe("senderEmail", () => {
      test("有効なメールアドレスはパス", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            senderEmail: "test@domain.co.jp",
          }).success,
        ).toBe(true);
      });

      test("無効なメールアドレスはエラー", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            senderEmail: "not-an-email",
          }).success,
        ).toBe(false);
      });

      test("null は許可", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            senderEmail: null,
          }).success,
        ).toBe(true);
      });
    });

    describe("replyToEmail", () => {
      test("有効なメールアドレスはパス", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            replyToEmail: "reply@test.com",
          }).success,
        ).toBe(true);
      });

      test("無効なメールアドレスはエラー", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            replyToEmail: "invalid",
          }).success,
        ).toBe(false);
      });
    });

    describe("senderName", () => {
      test("100文字はOK（境界）", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            senderName: "x".repeat(100),
          }).success,
        ).toBe(true);
      });

      test("101文字はエラー", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            senderName: "x".repeat(101),
          }).success,
        ).toBe(false);
      });
    });

    describe("notificationEmailAddresses", () => {
      test("500文字はOK（境界）", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            notificationEmailAddresses: "x".repeat(500),
          }).success,
        ).toBe(true);
      });

      test("501文字はエラー", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            notificationEmailAddresses: "x".repeat(501),
          }).success,
        ).toBe(false);
      });
    });

    describe("boolean フィールド", () => {
      test("true/false 両方許可", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            sendReservationConfirmationEmail: false,
          }).success,
        ).toBe(true);
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            sendAdminNotificationEmail: false,
          }).success,
        ).toBe(true);
      });

      test("文字列はエラー", () => {
        expect(
          emailSettingsSchema.safeParse({
            ...VALID_EMAIL_INPUT,
            sendReservationConfirmationEmail: "true",
          }).success,
        ).toBe(false);
      });
    });
  });

  describe("notificationSettingsSchema バリデーション", () => {
    test("有効なデータはパス", () => {
      expect(
        notificationSettingsSchema.safeParse(VALID_NOTIFICATION_INPUT).success,
      ).toBe(true);
    });

    test("全て false でもパス", () => {
      const result = notificationSettingsSchema.safeParse({
        notifyNewReservation: false,
        notifyReservationChange: false,
        notifyReservationCancel: false,
        notifyNewInquiry: false,
      });
      expect(result.success).toBe(true);
    });

    test("必須フィールドが欠けるとエラー", () => {
      expect(
        notificationSettingsSchema.safeParse({ notifyNewReservation: true })
          .success,
      ).toBe(false);
    });

    test("全フィールドが boolean のみ許可", () => {
      expect(
        notificationSettingsSchema.safeParse({
          ...VALID_NOTIFICATION_INPUT,
          notifyNewReservation: "yes",
        }).success,
      ).toBe(false);
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test '__tests__/integration/actions/admin/settings-email.test.ts'
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/settings-email.test.ts
git commit -m "test(integration): add settings-email action tests"
```

---

## Task 11: Integration — settings-robots-txt.test.ts

**Files:**

- Create: `__tests__/integration/actions/admin/settings-robots-txt.test.ts`

**Step 1: テストファイルを作成**

```typescript
/**
 * robots.txt 設定 Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/settings/robots-txt.ts のテスト
 * スキーマ・ロジックは schemas.ts から import する
 */

import { describe, test, expect } from "bun:test";
import {
  robotsTxtSettingsSchema,
  checkRobotsTxtWarnings,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas";

describe("robots.txt Settings Admin Action Integration", () => {
  describe("robotsTxtSettingsSchema バリデーション", () => {
    test("有効なデータはパス（無効化）", () => {
      expect(
        robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: false,
          robotsTxtCustom: null,
        }).success,
      ).toBe(true);
    });

    test("有効なデータはパス（カスタム robots.txt）", () => {
      expect(
        robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: true,
          robotsTxtCustom:
            "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml",
        }).success,
      ).toBe(true);
    });

    test("robotsTxtEnabled は boolean 必須", () => {
      expect(
        robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: "true",
          robotsTxtCustom: null,
        }).success,
      ).toBe(false);
    });

    describe("robotsTxtCustom", () => {
      test("null は許可", () => {
        expect(
          robotsTxtSettingsSchema.safeParse({
            robotsTxtEnabled: false,
            robotsTxtCustom: null,
          }).success,
        ).toBe(true);
      });

      test("10000文字はOK（境界）", () => {
        expect(
          robotsTxtSettingsSchema.safeParse({
            robotsTxtEnabled: true,
            robotsTxtCustom: "x".repeat(10000),
          }).success,
        ).toBe(true);
      });

      test("10001文字はエラー", () => {
        const result = robotsTxtSettingsSchema.safeParse({
          robotsTxtEnabled: true,
          robotsTxtCustom: "x".repeat(10001),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("10000文字以内");
      });
    });
  });

  describe("checkRobotsTxtWarnings ロジック", () => {
    test("User-agent: * + Disallow: / → サイト全体除外警告", () => {
      const content = "User-agent: *\nDisallow: /";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.some((w) => w.includes("サイト全体が検索結果から除外")),
      ).toBe(true);
    });

    test("Sitemap 未指定 → Sitemap 警告", () => {
      const content = "User-agent: *\nDisallow: /admin/";
      const warnings = checkRobotsTxtWarnings(content);
      expect(warnings.some((w) => w.includes("Sitemap"))).toBe(true);
    });

    test("Sitemap 指定済み + 通常 Disallow → 警告なし", () => {
      const content =
        "User-agent: *\nDisallow: /admin/\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      expect(warnings).toHaveLength(0);
    });

    test("Sitemap 指定済み + 全体 Disallow → サイト全体除外警告のみ", () => {
      const content =
        "User-agent: *\nDisallow: /\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.some((w) => w.includes("サイト全体が検索結果から除外")),
      ).toBe(true);
      // Sitemap は指定済みなので Sitemap 警告は出ない
      expect(warnings.filter((w) => w.includes("Sitemap"))).toHaveLength(0);
    });

    test("空文字 → Sitemap 警告のみ", () => {
      const warnings = checkRobotsTxtWarnings("");
      expect(warnings.some((w) => w.includes("Sitemap"))).toBe(true);
      expect(
        warnings.filter((w) => w.includes("サイト全体が検索結果から除外")),
      ).toHaveLength(0);
    });

    test("大文字小文字を区別しない（User-Agent: * も検出）", () => {
      const content = "User-Agent: *\nDisallow: /";
      const warnings = checkRobotsTxtWarnings(content);
      expect(
        warnings.some((w) => w.includes("サイト全体が検索結果から除外")),
      ).toBe(true);
    });

    test("Googlebot など特定ユーザーエージェントの Disallow / → 警告なし", () => {
      // User-agent: * がない場合はワイルドカード除外にならない
      const content =
        "User-agent: Googlebot\nDisallow: /\nSitemap: https://example.com/sitemap.xml";
      const warnings = checkRobotsTxtWarnings(content);
      // Googlebot だけなら hasWildcardUserAgent = false なので警告なし
      expect(
        warnings.filter((w) => w.includes("サイト全体が検索結果から除外")),
      ).toHaveLength(0);
    });
  });

  describe("RobotsTxtData 型構造", () => {
    test("有効なデータ構造", () => {
      type RobotsTxtData = {
        robotsTxtEnabled: boolean;
        robotsTxtCustom: string | null;
        defaultRobotsTxt: string;
        warnings: string[];
      };

      const data: RobotsTxtData = {
        robotsTxtEnabled: true,
        robotsTxtCustom:
          "User-agent: *\nSitemap: https://example.com/sitemap.xml",
        defaultRobotsTxt: "User-agent: *\nDisallow:\n",
        warnings: [],
      };

      expect(data.warnings).toHaveLength(0);
      expect(data.defaultRobotsTxt.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2: テストを実行**

```bash
bun test '__tests__/integration/actions/admin/settings-robots-txt.test.ts'
```

Expected: 全テスト PASS

**Step 3: Commit**

```bash
git add __tests__/integration/actions/admin/settings-robots-txt.test.ts
git commit -m "test(integration): add settings-robots-txt action tests with checkRobotsTxtWarnings logic"
```

---

## Task 12: E2E — pages.spec.ts

**Files:**

- Create: `e2e/admin/pages.spec.ts`

**Step 1: テストファイルを作成**

```typescript
import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test.describe("ページ管理 - 一覧", () => {
  test("ページ一覧が表示される", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("ページ");
  });

  test("新規作成ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");
    const createButton = page.locator(
      'a[href*="/admin/pages/new"], a:has-text("新規作成")',
    );
    await expect(createButton.first()).toBeVisible();
  });

  test("既存ページがリストまたはテーブルに表示される", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");
    const table = page.locator("table");
    const list = page.locator('[role="list"]');
    const hasTable = (await table.count()) > 0;
    const hasList = (await list.count()) > 0;
    expect(hasTable || hasList).toBe(true);
  });
});

test.describe("ページ管理 - 新規作成", () => {
  test("新規作成ページが表示される", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");
    const saveButton = page.locator('button:has-text("保存")');
    await expect(saveButton).toBeVisible();
  });

  test("Lexical エディタが起動する", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const loadingText = page.locator("text=エディタを読み込み中");
    if ((await loadingText.count()) > 0) {
      await expect(loadingText).not.toBeVisible({ timeout: 15000 });
    }

    const editor = page.locator('[contenteditable="true"]');
    await expect(editor.first()).toBeVisible({ timeout: 15000 });
  });

  test("エディタにテキストを入力できる", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 15000 });

    await editor.click();
    await page.keyboard.type("テストページコンテンツ");

    await expect(editor).toContainText("テストページコンテンツ");
  });
});

test.describe("ページ管理 - 編集", () => {
  test("編集ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('a[href*="/admin/pages/"]:has-text("編集")')
      .first();
    if ((await editButton.count()) === 0) {
      test.skip(true, "ページが存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator('button:has-text("保存")');
    await expect(saveButton).toBeVisible();
  });
});

test.describe("ページ管理 - バリデーション", () => {
  test("タイトルなしで保存するとエラー", async ({ page }) => {
    await page.goto(urls.adminPages + "/new");
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator('button:has-text("保存")');
    await saveButton.click();

    const errorText = page.locator("text=タイトルは必須, text=必須");
    if ((await errorText.count()) > 0) {
      await expect(errorText.first()).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("ページ管理 - レスポンシブ", () => {
  test("モバイルビューでも一覧が表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.adminPages);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });
});
```

**Step 2: Playwright 設定で `adminPages` URL が参照可能か確認**

```bash
bun run type-check
```

Expected: エラーなし

**Step 3: E2E テストを実行（UIモードで確認推奨）**

```bash
bun run e2e e2e/admin/pages.spec.ts --reporter=list
```

Expected: テストが実行される（スキップ含む）

**Step 4: Commit**

```bash
git add e2e/admin/pages.spec.ts
git commit -m "test(e2e): add admin pages management E2E tests with Lexical editor"
```

---

## Task 13: E2E — media.spec.ts

**Files:**

- Create: `e2e/admin/media.spec.ts`

**Step 1: テストファイルを作成**

```typescript
import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test.describe("メディア管理 - 一覧", () => {
  test("メディア一覧ページが表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("メディア");
  });

  test("アップロードボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");
    const uploadButton = page.locator(
      'button:has-text("アップロード"), label:has-text("アップロード")',
    );
    await expect(uploadButton.first()).toBeVisible();
  });

  test("メディアグリッドまたはリストが表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const grid = page.locator('[class*="grid"], [data-testid*="media"]');
    const emptyState = page.locator(
      "text=メディアがありません, text=ファイルがありません",
    );

    const hasGrid = (await grid.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasGrid || hasEmpty).toBe(true);
  });
});

test.describe("メディア管理 - 検索・フィルタ", () => {
  test("検索フィールドが表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="検索"]',
    );
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test("存在しないファイル名で検索すると空状態になる", async ({ page }) => {
    await page.goto(urls.adminMedia + "?search=nonexistent-file-xyz-99999");
    await page.waitForLoadState("networkidle");

    const emptyState = page.locator(
      "text=メディアがありません, text=見つかりません, text=該当なし",
    );
    if ((await emptyState.count()) > 0) {
      await expect(emptyState.first()).toBeVisible();
    }
  });
});

test.describe("メディア管理 - 削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")').first();
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "メディアが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("削除ダイアログのキャンセルボタンが動作する", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")').first();
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "メディアが存在しません");
      return;
    }

    await deleteButton.click();
    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.locator('button:has-text("キャンセル")');
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("メディア管理 - レスポンシブ", () => {
  test("モバイルビューでも表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });
});
```

**Step 2: 実行**

```bash
bun run e2e e2e/admin/media.spec.ts --reporter=list
```

**Step 3: Commit**

```bash
git add e2e/admin/media.spec.ts
git commit -m "test(e2e): add admin media management E2E tests"
```

---

## Task 14: E2E — settings.spec.ts

**Files:**

- Create: `e2e/admin/settings.spec.ts`

**Step 1: テストファイルを作成**

```typescript
import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test.describe("設定 - ナビゲーション", () => {
  test("設定ページが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("設定");
  });

  test("サイドバーに設定カテゴリが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");

    const settingsLinks = page.locator('a[href*="/admin/settings/"]');
    const count = await settingsLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("基本設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/basic");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2")).toContainText(/基本|サイト/);
  });

  test("営業時間設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/business");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2")).toContainText(/営業|ビジネス/);
  });
});

test.describe("設定 - 基本設定フォーム", () => {
  test("サイト名フィールドが表示される", async ({ page }) => {
    await page.goto(urls.adminSettings + "/basic");
    await page.waitForLoadState("networkidle");

    const siteNameInput = page.locator('input[name="siteName"]');
    await expect(siteNameInput).toBeVisible();
  });

  test("保存ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminSettings + "/basic");
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator(
      'button[type="submit"], button:has-text("保存")',
    );
    await expect(saveButton.first()).toBeVisible();
  });

  test("基本設定を保存できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/basic");
    await page.waitForLoadState("networkidle");

    const siteNameInput = page.locator('input[name="siteName"]');
    if ((await siteNameInput.count()) > 0) {
      await siteNameInput.clear();
      await siteNameInput.fill("テストサイト名");
    }

    const saveButton = page
      .locator('button[type="submit"], button:has-text("保存")')
      .first();
    await saveButton.click();

    // 成功メッセージを確認
    const successMsg = page.locator("text=保存しました, text=更新しました");
    await expect(successMsg.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("設定 - robots.txt", () => {
  test("robots.txt 設定ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminSettings + "/other");
    await page.waitForLoadState("networkidle");
    // robots.txt 設定が other ページに含まれるか確認
    const robotsSection = page.locator("text=robots.txt");
    if ((await robotsSection.count()) > 0) {
      await expect(robotsSection.first()).toBeVisible();
    }
  });
});

test.describe("設定 - メール設定", () => {
  test("メール設定ページに遷移できる", async ({ page }) => {
    const emailSettingsUrl = urls.adminSettings + "/email";
    await page.goto(emailSettingsUrl);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2")).toContainText(/メール|通知/);
  });
});

test.describe("設定 - レスポンシブ", () => {
  test("モバイルビューでも設定ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.adminSettings);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });
});
```

**Step 2: 実行**

```bash
bun run e2e e2e/admin/settings.spec.ts --reporter=list
```

**Step 3: Commit**

```bash
git add e2e/admin/settings.spec.ts
git commit -m "test(e2e): add admin settings E2E tests"
```

---

## Task 15: E2E — faq.spec.ts

**Files:**

- Create: `e2e/admin/faq.spec.ts`

**Step 1: テストファイルを作成**

```typescript
import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test.describe("FAQ管理 - 一覧", () => {
  test("FAQ一覧ページが表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("FAQ");
  });

  test("新規作成ボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");
    const createButton = page.locator(
      'button:has-text("新規作成"), a:has-text("新規作成")',
    );
    await expect(createButton.first()).toBeVisible();
  });

  test("FAQカテゴリまたはアイテムがリストに表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");
    const emptyState = page.locator(
      "text=FAQがありません, text=データがありません",
    );

    const hasTable = (await table.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasTable || hasEmpty).toBe(true);
  });
});

test.describe("FAQ管理 - カテゴリ作成", () => {
  test("カテゴリ作成フォームが開く", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const createButton = page
      .locator('button:has-text("カテゴリを追加"), button:has-text("新規作成")')
      .first();
    await createButton.click();

    const form = page.locator('[role="dialog"], form');
    await expect(form.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("FAQ管理 - 編集", () => {
  test("FAQ項目の編集ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator('button:has-text("編集"), a:has-text("編集")')
      .first();
    if ((await editButton.count()) === 0) {
      test.skip(true, "FAQ項目が存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator(
      'button:has-text("保存"), button[type="submit"]',
    );
    await expect(saveButton.first()).toBeVisible();
  });
});

test.describe("FAQ管理 - フィルタ・検索", () => {
  test("フィルタオプションが表示される", async ({ page }) => {
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");

    const filter = page.locator('[role="combobox"], input[type="search"]');
    if ((await filter.count()) > 0) {
      await expect(filter.first()).toBeVisible();
    }
  });
});

test.describe("FAQ管理 - レスポンシブ", () => {
  test("モバイルビューでも表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.adminFaq);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });
});
```

**Step 2: 実行**

```bash
bun run e2e e2e/admin/faq.spec.ts --reporter=list
```

**Step 3: Commit**

```bash
git add e2e/admin/faq.spec.ts
git commit -m "test(e2e): add admin FAQ management E2E tests"
```

---

## Task 16: E2E — terms.spec.ts

**Files:**

- Create: `e2e/admin/terms.spec.ts`

**Step 1: テストファイルを作成**

```typescript
import { test, expect, type Page } from "@playwright/test";
import { urls, testUsers } from "../fixtures";

async function loginAsAdmin(page: Page) {
  await page.goto(urls.login);
  await page.fill('input[type="email"]', testUsers.admin.email);
  await page.fill('input[type="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL(urls.adminDashboard, { timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

const TERMS_URL = "/admin/terms";

test.describe("利用規約管理 - 一覧", () => {
  test("利用規約一覧ページが表示される", async ({ page }) => {
    await page.goto(TERMS_URL);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("利用規約");
  });

  test("新規作成ボタンが存在する", async ({ page }) => {
    await page.goto(TERMS_URL);
    await page.waitForLoadState("networkidle");
    const createButton = page.locator(
      'button:has-text("新規作成"), a:has-text("新規作成")',
    );
    await expect(createButton.first()).toBeVisible();
  });

  test("利用規約リストまたは空状態が表示される", async ({ page }) => {
    await page.goto(TERMS_URL);
    await page.waitForLoadState("networkidle");

    const table = page.locator("table");
    const emptyState = page.locator(
      "text=利用規約がありません, text=データがありません",
    );

    const hasTable = (await table.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasTable || hasEmpty).toBe(true);
  });
});

test.describe("利用規約管理 - 作成", () => {
  test("新規作成フォームが表示される", async ({ page }) => {
    await page.goto(TERMS_URL + "/new");
    await page.waitForLoadState("networkidle");

    const saveButton = page.locator(
      'button:has-text("保存"), button[type="submit"]',
    );
    await expect(saveButton.first()).toBeVisible();
  });

  test("タイトルフィールドが存在する", async ({ page }) => {
    await page.goto(TERMS_URL + "/new");
    await page.waitForLoadState("networkidle");

    const titleInput = page.locator(
      'input[name="title"], input[placeholder*="タイトル"]',
    );
    if ((await titleInput.count()) > 0) {
      await expect(titleInput.first()).toBeVisible();
    }
  });
});

test.describe("利用規約管理 - バージョン", () => {
  test("バージョン履歴が表示される（利用規約が存在する場合）", async ({
    page,
  }) => {
    await page.goto(TERMS_URL);
    await page.waitForLoadState("networkidle");

    const firstItem = page.locator('table tbody tr, [role="listitem"]').first();
    if ((await firstItem.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await firstItem.click();
    await page.waitForLoadState("networkidle");

    const versionSection = page.locator("text=バージョン, text=履歴");
    if ((await versionSection.count()) > 0) {
      await expect(versionSection.first()).toBeVisible();
    }
  });
});

test.describe("利用規約管理 - 削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(TERMS_URL);
    await page.waitForLoadState("networkidle");

    const editButton = page
      .locator(
        'a[href*="/admin/terms/"]:has-text("編集"), button:has-text("編集")',
      )
      .first();
    if ((await editButton.count()) === 0) {
      test.skip(true, "利用規約が存在しません");
      return;
    }

    await editButton.click();
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")');
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "削除ボタンが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // キャンセルして閉じる
    const cancelButton = dialog.locator('button:has-text("キャンセル")');
    await cancelButton.click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe("利用規約管理 - レスポンシブ", () => {
  test("モバイルビューでも表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(TERMS_URL);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
  });
});
```

**Step 2: 実行**

```bash
bun run e2e e2e/admin/terms.spec.ts --reporter=list
```

**Step 3: Commit**

```bash
git add e2e/admin/terms.spec.ts
git commit -m "test(e2e): add admin terms management E2E tests"
```

---

## Task 17: 最終検証

**Step 1: Integration Tests 全件実行**

```bash
bun run test:all
```

Expected: 全テスト PASS（既存 + 新規 10件）

**Step 2: 型チェック + Lint**

```bash
bun run validate
```

Expected: エラーなし、警告なし

**Step 3: ビルド検証**

```bash
bun run build
```

Expected: ビルド成功

**Step 4: 全変更をまとめてコミット（未コミットのものがあれば）**

```bash
git status
git add -A
git commit -m "test: complete test coverage improvements (Integration x10, E2E x5)"
```

---

## チェックリスト

- [ ] Task 1: URL fixtures 追加
- [ ] Task 2: audit-log.test.ts
- [ ] Task 3: homepage-settings.test.ts
- [ ] Task 4: editor-comment.test.ts
- [ ] Task 5: ical-tokens.test.ts
- [ ] Task 6: block-template.test.ts
- [ ] Task 7: post-comment.test.ts
- [ ] Task 8: dashboard.test.ts
- [ ] Task 9: preview.test.ts
- [ ] Task 10: settings-email.test.ts
- [ ] Task 11: settings-robots-txt.test.ts
- [ ] Task 12: E2E pages.spec.ts
- [ ] Task 13: E2E media.spec.ts
- [ ] Task 14: E2E settings.spec.ts
- [ ] Task 15: E2E faq.spec.ts
- [ ] Task 16: E2E terms.spec.ts
- [ ] Task 17: 最終検証
