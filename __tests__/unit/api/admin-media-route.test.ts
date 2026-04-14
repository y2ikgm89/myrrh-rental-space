import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockGetMediaListQuery = mock();
const mockUploadMediaCommand = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/shared/domain/media/queries", () => ({
  getMediaListQuery: (...args: Parameters<typeof mockGetMediaListQuery>) =>
    mockGetMediaListQuery(...args),
}));

mock.module("@/shared/domain/media/commands", () => ({
  uploadMediaCommand: (...args: Parameters<typeof mockUploadMediaCommand>) =>
    mockUploadMediaCommand(...args),
}));

const { GET, POST } = await import("@/app/(admin)/admin/api/media/route");

describe("admin media route", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockGetMediaListQuery.mockReset();
    mockUploadMediaCommand.mockReset();
  });

  test("GET のバリデーションエラーは最初の error だけを返す", async () => {
    // 認証成功後にバリデーションを実行する（セキュア順序 → gotchas.md §セキュリティ）
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
