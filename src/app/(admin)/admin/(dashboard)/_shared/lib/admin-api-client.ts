import type { z } from "zod";

type ErrorResponse = {
  error?: string;
};

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  );
}

/**
 * admin API 経路の fetch + JSON parse + エラーメッセージ抽出をまとめる helper。
 *
 * ## 型安全性の契約 (TS-1 audit finding)
 *
 * - **`schema` 省略時**: `response.json()` の `unknown` を `T` に widening するだけで
 *   runtime 検証は無い。呼び出し側の型注釈は「期待するレスポンス shape の記述」に
 *   すぎず、実際の payload が異なっても TypeScript は検出できない。**新規呼び出しは
 *   極力 schema を渡し、runtime 検証を通すこと。**
 * - **`schema` 指定時**: `schema.safeParse(body)` を通し、失敗時は throw する。
 *   戻り値の `T` は Zod schema の output 型と一致するため、runtime と型の乖離が
 *   構造的に排除される。
 *
 * 既存 caller は annotation form (`fetchAdminJson<T>(url)`) のままでも動作する
 * (backward compatible)。段階的に schema を追加していく前提。
 */
export async function fetchAdminJson<T>(
  input: string,
  init?: RequestInit,
  schema?: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : "データの取得に失敗しました";
    throw new Error(message);
  }

  if (schema) {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new Error(
        `admin API レスポンスの検証に失敗しました: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  return body as T;
}
