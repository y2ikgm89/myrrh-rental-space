import type {
  EventAdminNotificationDelivery,
  EventEmailRenderContext,
  EmailSendContext,
  InquiryAdminNotificationDelivery,
  ReservationAdminNotificationDelivery,
  ReservationEmailRenderContext,
} from "@/shared/lib/email/types";

export const EMAIL_SEND_CONTEXT: EmailSendContext = {
  transport: { resendApiKey: "re_test_key" },
  delivery: {
    senderEmail: null,
    senderName: null,
    replyToEmail: null,
  },
  suppressedEmailHashes: new Set(),
};

export const RENDER_CONTEXT: EventEmailRenderContext = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Org", email: "org@example.com" },
  transferAccounts: [],
  transferGuidance: null,
  paymentFeatureEnabled: true,
};

export const RENDER_CONTEXT_WITH_ICAL: EventEmailRenderContext = {
  calendarSettings: {
    icalAttachmentEnabled: true,
    addToCalendarLinksEnabled: false,
  },
  organizer: { name: "Org", email: "org@example.com" },
  transferAccounts: [],
  transferGuidance: null,
  paymentFeatureEnabled: true,
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
  transferAccounts: [],
  transferGuidance: null,
  paymentFeatureEnabled: true,
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

export const SYSTEM_NOTIFICATION_DELIVERY = {
  notificationEmails: ["admin@example.com"],
} as const;

export const REMINDER_RENDER_CONTEXT = {
  calendarSettings: {
    icalAttachmentEnabled: false,
    addToCalendarLinksEnabled: false,
  },
  deadlineSettings: { cancellationDeadlineHours: 24 },
  organizer: { name: "Org", email: "org@example.com" },
} as const;
