/**
 * Next.js API モック
 *
 * - headers()
 * - redirect()
 * - revalidatePath()
 * - revalidateTag()
 */

import { mock } from "bun:test";

// Headers モック
export const mockHeaders = mock(() => new Headers());

// Redirect モック（エラーをスローして処理フローを中断）
export class RedirectError extends Error {
  public url: string;

  constructor(url: string) {
    super(`REDIRECT: ${url}`);
    this.name = "RedirectError";
    this.url = url;
  }
}

export const mockRedirect = mock((url: string): never => {
  throw new RedirectError(url);
});

// Revalidation モック
export const mockRevalidatePath = mock((_path: string): void => {});
export const mockRevalidateTag = mock(
  (_tag: string, _options?: { expire?: number }): void => {},
);

// モックリセット
export function resetNextMocks(): void {
  mockHeaders.mockClear();
  mockRedirect.mockClear();
  mockRevalidatePath.mockClear();
  mockRevalidateTag.mockClear();
}
