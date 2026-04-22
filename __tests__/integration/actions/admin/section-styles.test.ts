/**
 * Section Styles Server Action integration tests (Phase B.5-1).
 *
 * Tests schema validation + action-level plumbing. The Server Action wraps
 * domain commands via executeAdminMutationResult which is mocked to return
 * the data directly (MutationResult<T> = T | MutationError, not { data: T }).
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Schema reproduction (inline — must stay in sync with
// src/shared/lib/validations/section-style.ts per test-quality.md §統合テストのインライン Zod スキーマ)
// ---------------------------------------------------------------------------

const spacingStepValues = ["none", "sm", "md", "lg", "xl"] as const;
const spacingSchema = z.object({
  paddingTop: z.enum(spacingStepValues),
  paddingBottom: z.enum(spacingStepValues),
});

const backgroundSchema = z.object({
  type: z.enum(["default", "surface", "muted", "image", "gradient"]),
  value: z.string().optional(),
  overlayOpacity: z.number().min(0).max(100),
  imageUrl: z.string().optional(),
});

const containerSchema = z.object({
  maxWidth: z.enum(["sm", "md", "editorial", "lg", "xl", "full"]),
});

const typographySchema = z.object({
  titleSize: z.enum(["sm", "md", "lg", "xl"]),
  titleColor: z.string().optional(),
  textColor: z.string().optional(),
  textAlign: z.enum(["left", "center", "right"]),
});

const animationSchema = z.object({
  preset: z.enum(["none", "fade", "slide-up", "scale"]),
});

const payloadSchema = z.object({
  spacing: spacingSchema,
  background: backgroundSchema,
  container: containerSchema,
  typography: typographySchema,
  animation: animationSchema,
  customClass: z.string().max(200).optional(),
});

const createSectionStyleInputSchema = z.object({
  name: z.string().min(1).max(100),
  scope: z.enum(["global", "page", "section"]),
  applicableTypes: z.array(z.string()).default([]),
  payload: payloadSchema,
  parentId: z.string().optional(),
});

const VALID_PAYLOAD = {
  spacing: { paddingTop: "md" as const, paddingBottom: "md" as const },
  background: { type: "default" as const, overlayOpacity: 0 },
  container: { maxWidth: "xl" as const },
  typography: { titleSize: "md" as const, textAlign: "left" as const },
  animation: { preset: "fade" as const },
};

const VALID_CREATE_INPUT = {
  name: "Editorial - Standard",
  scope: "section" as const,
  applicableTypes: ["hero"],
  payload: VALID_PAYLOAD,
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateCommand = mock<
  (input: unknown, actor: unknown) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "style-1" }));
const mockUpdateCommand = mock<
  (id: string, input: unknown, actor: unknown) => Promise<void>
>(() => Promise.resolve());
const mockDeleteCommand = mock<
  (id: string, actor: unknown) => Promise<{ affectedCount: number }>
>(() => Promise.resolve({ affectedCount: 0 }));
const mockDeriveCommand = mock<
  (baseId: string, input: unknown, actor: unknown) => Promise<{ id: string }>
>(() => Promise.resolve({ id: "style-derived" }));

const mockExecuteAdminMutationResult = mock<
  (opts: {
    resource: string;
    action: string;
    resourceId?: string;
    execute: (user: { id: string; role: string }) => Promise<unknown>;
    afterSuccess?: (data: unknown) => void | Promise<void>;
    resolveAuditResourceId?: (data: unknown) => string | undefined;
  }) => Promise<unknown>
>(async (opts) => {
  const data = await opts.execute({ id: "user-1", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));
mock.module("@/shared/domain/section-styles/commands", () => ({
  createSectionStyle: mockCreateCommand,
  updateSectionStyle: mockUpdateCommand,
  deleteSectionStyle: mockDeleteCommand,
  deriveSectionStyle: mockDeriveCommand,
}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

// Import under test (after mocks)
import {
  createSectionStyleAction,
  deleteSectionStyleAction,
  deriveSectionStyleAction,
  updateSectionStyleAction,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/section-styles/mutations";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SectionStyle Server Actions", () => {
  beforeEach(() => {
    mockCreateCommand.mockClear();
    mockUpdateCommand.mockClear();
    mockDeleteCommand.mockClear();
    mockDeriveCommand.mockClear();
    mockExecuteAdminMutationResult.mockClear();
  });

  describe("createSectionStyleAction", () => {
    test("valid input → createSectionStyle command 呼び出し", async () => {
      const result = await createSectionStyleAction(VALID_CREATE_INPUT);
      expect(mockCreateCommand).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ id: "style-1" });
    });

    test("name 空文字 → validation エラー（command 呼び出しなし）", async () => {
      const result = await createSectionStyleAction({
        ...VALID_CREATE_INPUT,
        name: "",
      });
      expect(mockCreateCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    test("scope invalid → validation エラー", async () => {
      const result = await createSectionStyleAction({
        ...VALID_CREATE_INPUT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scope: "invalid" as any,
      });
      expect(mockCreateCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    test("schema レベルで全フィールドが有効", () => {
      const parsed =
        createSectionStyleInputSchema.safeParse(VALID_CREATE_INPUT);
      expect(parsed.success).toBe(true);
    });
  });

  describe("updateSectionStyleAction", () => {
    test("valid payload 部分更新 → updateSectionStyle command 呼び出し", async () => {
      const result = await updateSectionStyleAction("style-1", {
        name: "Renamed",
      });
      expect(mockUpdateCommand).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    test("id 空文字 → validation エラー", async () => {
      const result = await updateSectionStyleAction("", { name: "x" });
      expect(mockUpdateCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    test("name 長すぎ → validation エラー", async () => {
      const result = await updateSectionStyleAction("style-1", {
        name: "a".repeat(101),
      });
      expect(mockUpdateCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });
  });

  describe("deleteSectionStyleAction", () => {
    test("valid id → deleteSectionStyle command 呼び出し", async () => {
      const result = await deleteSectionStyleAction("style-1");
      expect(mockDeleteCommand).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ affectedCount: 0 });
    });

    test("id 空文字 → validation エラー", async () => {
      const result = await deleteSectionStyleAction("");
      expect(mockDeleteCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    test("affectedCount を返す", async () => {
      mockDeleteCommand.mockResolvedValueOnce({ affectedCount: 3 });
      const result = await deleteSectionStyleAction("style-2");
      expect(result).toMatchObject({ affectedCount: 3 });
    });
  });

  describe("deriveSectionStyleAction", () => {
    test("valid input → deriveSectionStyle command 呼び出し", async () => {
      const result = await deriveSectionStyleAction("parent-1", {
        name: "Child style",
      });
      expect(mockDeriveCommand).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ id: "style-derived" });
    });

    test("baseId 空文字 → validation エラー", async () => {
      const result = await deriveSectionStyleAction("", { name: "x" });
      expect(mockDeriveCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });

    test("name 空文字 → validation エラー", async () => {
      const result = await deriveSectionStyleAction("parent-1", { name: "" });
      expect(mockDeriveCommand).toHaveBeenCalledTimes(0);
      expect(result).toMatchObject({ error: expect.any(String) });
    });
  });
});
