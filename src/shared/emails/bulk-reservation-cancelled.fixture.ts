import { DEMO_FOOTER } from "./_shared/demo-footer";
import type { BulkReservationCancelledEmail } from "./bulk-reservation-cancelled";

export const bulkReservationCancelledFixture = {
  customerName: "山田 太郎",
  seriesTitle: "ミーティングルームA",
  instanceCount: 3,
  reservationList: [
    { date: "2026年7月15日 (水)", time: "13:00 - 17:00" },
    { date: "2026年7月22日 (水)", time: "13:00 - 17:00" },
    { date: "2026年7月29日 (水)", time: "13:00 - 17:00" },
  ],
  reason: "都合により",
  footer: DEMO_FOOTER,
} satisfies Parameters<typeof BulkReservationCancelledEmail>[0];
