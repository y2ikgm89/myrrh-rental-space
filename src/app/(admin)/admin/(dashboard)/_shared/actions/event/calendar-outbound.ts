import "server-only";

import { getEventSlotsForCalendarSync } from "@/shared/domain/events/calendar-sync";
import {
  syncEventToCalendar,
  updateEventCalendarSync,
  deleteEventCalendarSync,
} from "@/shared/lib/calendar-sync/event-outbound";

/** create / duplicate / update / publish 共通 GCal 同期 */
export async function syncEventOutbound(eventId: string): Promise<void> {
  const contexts = await getEventSlotsForCalendarSync(eventId);
  await Promise.all(
    contexts.map((context) =>
      context.googleCalendarEventId
        ? updateEventCalendarSync(context, context.googleCalendarEventId)
        : syncEventToCalendar(context),
    ),
  );
}

/** cancel / delete / unpublish / archive 用: 既存 GCal ID がある場合のみ削除 */
export async function deleteEventOutbound(
  eventId: string,
  gcalEventIds: readonly string[],
): Promise<void> {
  await Promise.all(
    gcalEventIds.map((gcalEventId) =>
      deleteEventCalendarSync(eventId, gcalEventId),
    ),
  );
}
