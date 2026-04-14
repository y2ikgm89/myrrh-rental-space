import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";

/**
 * 管理者通知のリンク先 URL を解決する。
 *
 * - 個別リソース紐づけ通知: `resourceType` + `resourceId` からルートを組み立て
 * - サマリー通知（`FAQ_STALE` 等）: `type` を見て該当フィルター付きの一覧ページへ
 */
export function getNotificationResourceHref(
  type: string,
  resourceType: string | null,
  resourceId: string | null,
): string | null {
  // サマリー通知は resourceId を持たず type 単独でルーティング
  if (type === NOTIFICATION_TYPE.FAQ_STALE) {
    return "/admin/faq?quickFilter=stale";
  }

  if (!resourceType || !resourceId) return null;
  const routes: Record<string, string> = {
    reservation: `/admin/reservations/${resourceId}`,
    inquiry: `/admin/inquiries/${resourceId}`,
    review: `/admin/spaces?tab=reviews`,
    event: `/admin/events/${resourceId}/edit`,
  };
  return routes[resourceType] ?? null;
}
