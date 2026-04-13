export function getNotificationResourceHref(
  resourceType: string | null,
  resourceId: string | null,
): string | null {
  if (!resourceType || !resourceId) return null;
  const routes: Record<string, string> = {
    reservation: `/admin/reservations/${resourceId}`,
    inquiry: `/admin/inquiries/${resourceId}`,
    review: `/admin/spaces?tab=reviews`,
    event: `/admin/events/${resourceId}/edit`,
  };
  return routes[resourceType] ?? null;
}
