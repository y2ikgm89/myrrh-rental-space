/**
 * カスタムアサーション
 *
 * - MutationResult型のアサーション
 * - よく使うパターンの簡潔化
 */

import { expect } from "bun:test";
import type {
  MutationResult,
  MutationError,
} from "@/shared/lib/mutation-result";
import { isMutationError } from "@/shared/lib/mutation-result";

/**
 * MutationResultが成功（エラーでない）ことを検証
 */
export function expectSuccess<T>(
  result: MutationResult<T>,
): asserts result is T {
  if (isMutationError(result)) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
}

/**
 * MutationResultがエラーであることを検証
 */
export function expectError<T>(
  result: MutationResult<T>,
): asserts result is MutationError {
  expect(isMutationError(result)).toBe(true);
  if (!isMutationError(result)) {
    throw new Error("Expected error but got success");
  }
}

/**
 * MutationResultが特定のエラーメッセージで失敗することを検証
 */
export function expectErrorWithMessage<T>(
  result: MutationResult<T>,
  errorMessage: string,
): void {
  expectError(result);
  expect(result.error).toContain(errorMessage);
}

/**
 * MutationResultが成功し、データを含むことを検証
 */
export function expectSuccessWithData<T>(
  result: MutationResult<T>,
  assertion: (data: T) => void,
): void {
  expectSuccess(result);
  assertion(result);
}

/**
 * MutationResultがフィールドエラーを含むことを検証
 */
export function expectFieldErrors<T>(
  result: MutationResult<T>,
  field: string,
): void {
  expectError(result);
  expect(result.fieldErrors).toBeDefined();
  expect(result.fieldErrors?.[field]).toBeDefined();
  expect(result.fieldErrors?.[field]?.length).toBeGreaterThan(0);
}
