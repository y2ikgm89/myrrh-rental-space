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

export async function fetchAdminJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message = isErrorResponse(body)
      ? body.error
      : "データの取得に失敗しました";
    throw new Error(message);
  }

  return body;
}
