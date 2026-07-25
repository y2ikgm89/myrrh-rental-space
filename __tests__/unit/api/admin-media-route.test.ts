import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { DomainError } from "@/shared/domain/domain-error";

const mockCheckPermission = mock();
const mockGetMediaListQuery = mock();
const mockUploadMediaCommand = mock();
const mockLogAction = mock(() => Promise.resolve());
const mockFinalizeMediaMutation = mock();
const mockFireAndForget = mock((promise: Promise<unknown>, _opts?: unknown) => {
  void promise;
});

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
  logAction: (...args: Parameters<typeof mockLogAction>) =>
    mockLogAction(...args),
}));

mock.module("@/shared/domain/media/queries", () => ({
  getMediaListQuery: (...args: Parameters<typeof mockGetMediaListQuery>) =>
    mockGetMediaListQuery(...args),
}));

mock.module("@/shared/domain/media/commands", () => ({
  uploadMediaCommand: (...args: Parameters<typeof mockUploadMediaCommand>) =>
    mockUploadMediaCommand(...args),
}));

mock.module("@/shared/domain/media/cache", () => ({
  finalizeMediaMutation: (
    ...args: Parameters<typeof mockFinalizeMediaMutation>
  ) => mockFinalizeMediaMutation(...args),
  revalidateMedia: mock(),
  purgeMediaUrls: mock(),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (...args: Parameters<typeof mockFireAndForget>) =>
    mockFireAndForget(...args),
}));

const { GET, POST } = await import("@/app/(admin)/admin/api/media/route");

describe("admin media route", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetMediaListQuery.mockReset();
    mockUploadMediaCommand.mockReset();
    mockLogAction.mockReset();
    mockFinalizeMediaMutation.mockReset();
    mockFireAndForget.mockReset();
    mockLogAction.mockResolvedValue(undefined);
  });

  test("GET のバリデーションエラーは最初の error だけを返す", async () => {
    // 認証成功後にバリデーションを実行する（セキュア順序）
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });

    const response = await GET(
      new Request("http://localhost/admin/api/media?page=0"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(mockCheckPermission).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ error: "ページ番号は1以上で入力してください" });
  });

  test("GET の権限エラーは { error } で返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "mediaのread権限がありません" },
    });

    const response = await GET(
      new Request("http://localhost/admin/api/media?page=1&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "mediaのread権限がありません" });
  });

  test("POST 成功時は raw payload を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });
    mockUploadMediaCommand.mockResolvedValue({
      id: "media-1",
      url: "https://example.com/media.jpg",
    });

    const formData = new FormData();
    formData.append(
      "file",
      new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    );
    formData.append("usage", "GENERAL");
    formData.append("tags", JSON.stringify(["hero"]));

    const response = await POST(
      new Request("http://localhost/admin/api/media", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      id: "media-1",
      url: "https://example.com/media.jpg",
    });
    expect(mockFinalizeMediaMutation).toHaveBeenCalledWith(["media-1"]);
    expect(mockFireAndForget).toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(
      "admin-user",
      "create",
      "media",
      "media-1",
    );
  });

  test("POST の DomainError CONFLICT は 409 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });
    mockUploadMediaCommand.mockRejectedValue(
      new DomainError("競合しました", "CONFLICT"),
    );

    const formData = new FormData();
    formData.append(
      "file",
      new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    );

    const response = await POST(
      new Request("http://localhost/admin/api/media", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({ error: "競合しました" });
    expect(mockFinalizeMediaMutation).not.toHaveBeenCalled();
  });

  test("POST の権限エラーは { error } で返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "mediaのcreate権限がありません" },
    });

    const response = await POST(
      new Request("http://localhost/admin/api/media", {
        method: "POST",
        body: new FormData(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "mediaのcreate権限がありません" });
  });
});
