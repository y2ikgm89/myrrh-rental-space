/**
 * カスタムアサーション
 *
 * - ActionResult型のアサーション
 * - よく使うパターンの簡潔化
 */

import { expect } from 'bun:test'
import type {
  ActionResult,
  ActionSuccess,
  ActionFailure,
} from '@/admin/types/server-actions'

/**
 * ActionResultが成功であることを検証
 */
export function expectSuccess<T>(
  result: ActionResult<T>
): asserts result is ActionSuccess<T> {
  expect(result.success).toBe(true)
  if (!result.success) {
    throw new Error(`Expected success but got failure: ${result.error}`)
  }
}

/**
 * ActionResultが失敗であることを検証
 */
export function expectFailure<T>(
  result: ActionResult<T>
): asserts result is ActionFailure {
  expect(result.success).toBe(false)
  if (result.success) {
    throw new Error('Expected failure but got success')
  }
}

/**
 * ActionResultが特定のエラーメッセージで失敗することを検証
 */
export function expectFailureWithError<T>(
  result: ActionResult<T>,
  errorMessage: string
): void {
  expectFailure(result)
  expect(result.error).toContain(errorMessage)
}

/**
 * ActionResultが成功し、データを含むことを検証
 */
export function expectSuccessWithData<T>(
  result: ActionResult<T>,
  assertion: (data: T) => void
): void {
  expectSuccess(result)
  if ('data' in result && result.data !== undefined) {
    // TS 6.0: 条件型を含むジェネリック型へのナロウイングは推論できないため unknown 経由でキャスト
    assertion(result.data as unknown as T)
  } else {
    throw new Error('Expected result to have data')
  }
}

/**
 * ActionResultが成功し、特定のメッセージを含むことを検証
 */
export function expectSuccessWithMessage<T>(
  result: ActionResult<T>,
  message: string
): void {
  expectSuccess(result)
  expect(result.message).toContain(message)
}

/**
 * ActionResultがフィールドエラーを含むことを検証
 */
export function expectFieldErrors<T>(
  result: ActionResult<T>,
  field: string
): void {
  expectFailure(result)
  expect(result.fieldErrors).toBeDefined()
  expect(result.fieldErrors?.[field]).toBeDefined()
  expect(result.fieldErrors?.[field]?.length).toBeGreaterThan(0)
}
