import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  getRouteErrorStatus,
  jsonError,
  jsonSuccess,
  jsonValidationError,
} from "@/shared/lib/route-responses";

describe("route-responses", () => {
  test("未ログインメッセージは 401 に変換する (docs/api-conventions.md)", () => {
    expect(getRouteErrorStatus("ログインが必要です")).toBe(401);
  });

  test("権限不足メッセージは 403 に変換する (docs/api-conventions.md)", () => {
    expect(getRouteErrorStatus("管理者権限が必要です")).toBe(403);
    expect(getRouteErrorStatus("spaceのcreate権限がありません")).toBe(403);
    expect(getRouteErrorStatus("このリソースへのアクセス権がありません")).toBe(
      403,
    );
  });

  test("一般エラーは 400 に変換する", () => {
    expect(getRouteErrorStatus("slug が不正です")).toBe(400);
  });

  test("jsonError は { error } 形式で返す", async () => {
    const response = jsonError("bad request", 422);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "bad request" });
  });

  test("jsonSuccess はデータをそのまま 200 で返す", async () => {
    const data = { id: "1", name: "test" };
    const response = jsonSuccess(data);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
  });

  test("jsonSuccess はカスタムステータスを指定できる", async () => {
    const response = jsonSuccess({ created: true }, 201);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: true });
  });

  test("jsonValidationError は最初の issue を返す", async () => {
    const schema = z.object({
      name: z.string().min(1, { error: "名前は必須です" }),
      email: z.string().email({ error: "メールアドレスが不正です" }),
    });
    const result = schema.safeParse({ name: "", email: "invalid" });
    if (result.success) {
      throw new Error("Should have failed");
    }

    const response = jsonValidationError(result.error);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "名前は必須です" });
  });
});
