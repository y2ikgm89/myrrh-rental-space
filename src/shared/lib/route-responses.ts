import { NextResponse } from "next/server";
import type { ZodError } from "zod";

const FORBIDDEN_MESSAGE_PATTERNS = ["ログイン", "権限"] as const;

export function getRouteErrorStatus(message: string): number {
  return FORBIDDEN_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern))
    ? 403
    : 400;
}

export function jsonError(
  error: string,
  status = 400,
): NextResponse<{ error: string }> {
  return NextResponse.json({ error }, { status });
}

export function jsonSuccess<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function jsonValidationError(
  error: ZodError,
  fallback = "入力内容に誤りがあります",
): NextResponse<{ error: string }> {
  return jsonError(error.issues[0]?.message ?? fallback, 400);
}
