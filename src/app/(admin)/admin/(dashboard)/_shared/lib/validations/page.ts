/**
 * ページバリデーション
 *
 * 共有バリデーションからre-export
 * admin固有のロジックはここに追加可能
 */

export * from '@/shared/lib/validations/page'

/**
 * Server Actionレスポンス型
 * @deprecated ActionResult を使用してください
 */
export type PageActionResult =
  | { success: true; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }
