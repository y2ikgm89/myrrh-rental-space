import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockCheckPermission = mock();
const mockRenderEditorStateToHtmlLazy = mock();
const mockLoggerError = mock();

mock.module("next/server", () => ({
  NextResponse,
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: (...args: Parameters<typeof mockCheckPermission>) =>
    mockCheckPermission(...args),
}));

mock.module("@/admin/lib/lazy-renderer", () => ({
  renderEditorStateToHtmlLazy: (
    ...args: Parameters<typeof mockRenderEditorStateToHtmlLazy>
  ) => mockRenderEditorStateToHtmlLazy(...args),
}));

mock.module("@/shared/lib/logger", () => ({
  logger: {
    error: (...args: Parameters<typeof mockLoggerError>) =>
      mockLoggerError(...args),
  },
}));

const { POST } = await import("@/app/(admin)/admin/api/preview/html/route");

describe("POST /admin/api/preview/html", () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockRenderEditorStateToHtmlLazy.mockReset();
    mockLoggerError.mockReset();
  });

  test("権限エラーは 403 を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: false,
      error: { success: false, error: "権限がありません" },
    });

    const response = await POST(
      new Request("http://localhost/admin/api/preview/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentJson: '{"root":{"children":[]}}',
          resource: "post",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "post",
      "read",
      expect.any(Headers),
    );
    expect(body).toEqual({ error: "権限がありません" });
  });

  test("不正な JSON は 400 を返す", async () => {
    const response = await POST(
      new Request("http://localhost/admin/api/preview/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(mockCheckPermission).not.toHaveBeenCalled();
    expect(body).toEqual({ error: "JSON が不正です" });
  });

  test("空の contentJson は空 HTML を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });

    const response = await POST(
      new Request("http://localhost/admin/api/preview/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentJson: "", resource: "news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRenderEditorStateToHtmlLazy).not.toHaveBeenCalled();
    expect(body).toEqual({ html: "" });
  });

  test("変換成功時は HTML を返す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });
    mockRenderEditorStateToHtmlLazy.mockResolvedValue("<p>preview</p>");

    const response = await POST(
      new Request("http://localhost/admin/api/preview/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentJson: '{"root":{"children":[]}}',
          resource: "page",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      "page",
      "read",
      expect.any(Headers),
    );
    expect(mockRenderEditorStateToHtmlLazy).toHaveBeenCalledWith(
      '{"root":{"children":[]}}',
    );
    expect(body).toEqual({ html: "<p>preview</p>" });
  });

  test("変換失敗時は 500 を返してログを残す", async () => {
    mockCheckPermission.mockResolvedValue({
      success: true,
      user: { id: "admin-user" },
    });
    mockRenderEditorStateToHtmlLazy.mockRejectedValue(
      new Error("render failed"),
    );

    const response = await POST(
      new Request("http://localhost/admin/api/preview/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentJson: '{"root":{"children":[]}}',
          resource: "post",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockLoggerError).toHaveBeenCalledWith(
      "プレビュー HTML 変換に失敗しました",
      expect.objectContaining({
        error: "render failed",
        resource: "post",
      }),
    );
    expect(body).toEqual({ error: "プレビューの生成に失敗しました" });
  });
});
