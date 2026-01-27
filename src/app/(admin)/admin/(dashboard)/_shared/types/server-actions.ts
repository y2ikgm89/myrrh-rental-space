/**
 * Server Actions 共通型定義（Admin拡張版）
 *
 * 型定義のみをエクスポート
 * HOFは @/admin/lib/server-action-helpers から直接インポートすること
 */

import type { AuditUser } from '@/admin/lib/audit'

// Re-export types from shared
export {
  type ActionSuccess,
  type ActionFailure,
  type ActionResult,
  createSuccess,
  createFailure,
  isActionSuccess,
  isActionFailure,
} from '@/shared/types/server-actions'

// Re-export AuditUser type
export type { AuditUser }
