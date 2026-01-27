/**
 * @deprecated このファイルは削除予定です。
 * 代わりに @/shared/lib/reservation を使用してください。
 *
 * git rm src/app/\(public\)/_shared/lib/reservation-utils.ts
 */

// Re-export for backward compatibility during transition
export {
  checkReservationOverlap,
  type OverlapCheckParams,
  type OverlapCheckResult,
} from '@/shared/lib/reservation'
