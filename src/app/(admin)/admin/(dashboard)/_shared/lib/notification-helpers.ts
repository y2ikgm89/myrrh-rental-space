import type { Route } from "next";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { toAppRoute } from "@/shared/lib/typed-routes";

/**
 * 管理者通知のリンク先 URL を解決する。
 *
 * - 個別リソース紐づけ通知: `resourceType` + `resourceId` からルートを組み立て
 * - サマリー通知（`FAQ_STALE` / 顧客フラグ / セキュリティ等）: `type` 単独で一覧へ
 */
export function getNotificationResourceHref(
  type: string,
  resourceType: string | null,
  resourceId: string | null,
): Route | null {
  if (type === NOTIFICATION_TYPE.FAQ_STALE) {
    return "/admin/faq";
  }
  if (
    type === NOTIFICATION_TYPE.CUSTOMER_RISK_FLAGGED ||
    type === NOTIFICATION_TYPE.CUSTOMER_DUPLICATE_FLAGGED
  ) {
    // flaggedOnly は顧客一覧のフィルタ（nuqs）。typed Route は path のみ保証。
    return toAppRoute("/admin/customers?flaggedOnly=true");
  }
  if (
    type === NOTIFICATION_TYPE.SECURITY_LOGIN_FAILED_SPIKE ||
    type === NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED ||
    type === NOTIFICATION_TYPE.SECURITY_ROLE_CHANGE ||
    type === NOTIFICATION_TYPE.SECURITY_AUDIT_INTEGRITY_FAILED
  ) {
    return "/admin/audit-logs";
  }
  if (type === NOTIFICATION_TYPE.SMART_LOCK_PASSCODE_FAILED) {
    return "/admin/settings/integrations";
  }

  if (!resourceType || !resourceId) return null;
  const routes: Record<string, string> = {
    reservation: `/admin/reservations/${resourceId}`,
    inquiry: `/admin/inquiries/${resourceId}`,
    review: `/admin/spaces?tab=reviews`,
    event: `/admin/events/${resourceId}/edit`,
    customer: `/admin/customers/${resourceId}`,
  };
  const href = routes[resourceType];
  return href ? toAppRoute(href) : null;
}
