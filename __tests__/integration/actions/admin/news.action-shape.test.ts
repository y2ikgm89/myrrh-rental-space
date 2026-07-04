/**
 * News Server Action - action shape & schema integration tests
 *
 * scope: input validation, executeAdminMutationResult options, and domain
 * command argument propagation. Auth/RBAC/cache side effects are mocked.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockCreateNewsCommand = mock<
  (input: unknown) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "news-id-1", slug: "news-slug-1" }));
const mockUpdateNewsSettingsCommand = mock<
  (id: string, input: unknown) => Promise<{ oldSlug: string; slug: string }>
>(() => Promise.resolve({ oldSlug: "old", slug: "new" }));
const mockUpdateNewsBodyCommand = mock<
  (id: string, input: unknown) => Promise<{ oldSlug: string; slug: string }>
>(() => Promise.resolve({ oldSlug: "s", slug: "s" }));
const mockDeleteNewsCommand = mock<(id: string) => Promise<{ slug: string }>>(
  () => Promise.resolve({ slug: "deleted" }),
);
const mockPublishNewsCommand = mock<(id: string) => Promise<{ slug: string }>>(
  () => Promise.resolve({ slug: "published" }),
);
const mockUnpublishNewsCommand = mock<
  (id: string) => Promise<{ slug: string }>
>(() => Promise.resolve({ slug: "unpublished" }));

mock.module("@/shared/domain/news/commands", () => ({
  createNews: mockCreateNewsCommand,
  updateNewsSettings: mockUpdateNewsSettingsCommand,
  updateNewsBody: mockUpdateNewsBodyCommand,
  deleteNews: mockDeleteNewsCommand,
  publishNews: mockPublishNewsCommand,
  unpublishNews: mockUnpublishNewsCommand,
}));

mock.module(
  "@/admin/components/editor/lexical/preview/derive-content-html.server",
  () => ({
    deriveLexicalContentHtmlFromJson: mock(() => "<p>derived</p>"),
  }),
);

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareDetailUrls: mock(async () => {}),
}));

mock.module("@/shared/lib/cache", () => ({
  invalidateSiteWideCache: mock(() => {}),
  purgeMarketingHomeTag: mock(() => {}),
  firePurgeAsync: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
  resolveAuditResourceId?: (data: T) => string | undefined;
};

const mockExecuteAdminMutationResult = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin-user", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));

const { createNews, updateNewsSettings } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/news");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_LEXICAL_JSON =
  '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

const VALID_CREATE_INPUT = {
  slug: "test-news",
  title: "テストお知らせ",
  contentJson: VALID_LEXICAL_JSON,
};

describe("createNews (action shape)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockCreateNewsCommand.mockClear();
  });

  test("バリデーション失敗時は executeAdminMutationResult を呼ばない", async () => {
    const result = await createNews({
      ...VALID_CREATE_INPUT,
      slug: "Invalid-Slug",
    });

    expect(isMutationError(result)).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("作成時のレイアウトと SEO/OGP 設定を domain command へ渡す", async () => {
    await createNews({
      ...VALID_CREATE_INPUT,
      contentWidth: "CUSTOM",
      contentWidthCustom: 960,
      metaDescription: "概要",
      metaKeywords: "news,topic",
      ogpTitle: "OGP",
      ogpDescription: "OGP 概要",
      ogpImageUrl: "https://example.com/ogp.jpg",
    });

    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "news", action: "create" }),
    );
    expect(mockCreateNewsCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHtml: "<p>derived</p>",
        contentWidth: "CUSTOM",
        contentWidthCustom: 960,
        metaDescription: "概要",
        metaKeywords: "news,topic",
        ogpTitle: "OGP",
        ogpDescription: "OGP 概要",
        ogpImageUrl: "https://example.com/ogp.jpg",
      }),
    );
  });
});

describe("updateNewsSettings (action shape)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockUpdateNewsSettingsCommand.mockClear();
  });

  test("正常系: resource=news, action=update, resourceId=id で wrapper 呼出し", async () => {
    await updateNewsSettings(VALID_UUID, {
      slug: "new-slug",
      title: "更新後タイトル",
      isPublished: true,
      publishedAt: "2026-01-02T03:04",
    });

    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "news",
        action: "update",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdateNewsSettingsCommand).toHaveBeenCalledWith(
      VALID_UUID,
      expect.objectContaining({
        isPublished: true,
        publishedAt: expect.any(Date),
      }),
    );

    const [, payload] = mockUpdateNewsSettingsCommand.mock.calls[0] ?? [];
    expect((payload as { publishedAt: Date }).publishedAt.toISOString()).toBe(
      "2026-01-01T18:04:00.000Z",
    );
  });
});
