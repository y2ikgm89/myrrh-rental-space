import type {
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
  InquiryAdminNotificationDelivery,
  ReservationAdminNotificationDelivery,
  ReservationEmailRenderContext,
} from "@/shared/lib/email/types";

export const RENDER_CONTEXT: EventEmailRenderContext = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Org", email: "org@example.com" },
};

export const RENDER_CONTEXT_WITH_ICAL: EventEmailRenderContext = {
  calendarSettings: {
    icalAttachmentEnabled: true,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Org", email: "org@example.com" },
};

export const RESERVATION_RENDER_CONTEXT: ReservationEmailRenderContext = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Org", email: "org@example.com" },
  deadlineSettings: {
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 24,
  },
  cancellationPolicyUrl: undefined,
};

export const RESERVATION_RENDER_CONTEXT_WITH_POLICY: ReservationEmailRenderContext =
  {
    ...RESERVATION_RENDER_CONTEXT,
    cancellationPolicyUrl: "https://example.com/terms/cancellation-policy",
  };

export const ADMIN_DELIVERY: EventAdminNotificationDelivery = {
  notificationEmails: ["admin@example.com"],
};

export const RESERVATION_ADMIN_DELIVERY: ReservationAdminNotificationDelivery =
  {
    notificationEmails: ["admin@example.com"],
  };

export const INQUIRY_ADMIN_DELIVERY: InquiryAdminNotificationDelivery = {
  notificationEmails: ["admin@example.com"],
};
