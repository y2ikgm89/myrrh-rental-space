import type {
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
  InquiryAdminNotificationDelivery,
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

export const ADMIN_DELIVERY: EventAdminNotificationDelivery = {
  notificationEmails: ["admin@example.com"],
};

export const INQUIRY_ADMIN_DELIVERY: InquiryAdminNotificationDelivery = {
  notificationEmails: ["admin@example.com"],
};
