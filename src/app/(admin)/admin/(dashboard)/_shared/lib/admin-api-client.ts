import { z } from "zod";

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
 * admin API 経路の fetch + JSON parse + Zod 検証 + エラーメッセージ抽出。
 *
 * 戻り値の `T` は schema の output 型と一致する。runtime 検証失敗時は throw する。
 */
export async function fetchAdminJson<T>(
  input: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
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

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `admin API レスポンスの検証に失敗しました: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}
