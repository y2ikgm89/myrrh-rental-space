import type {
  AnalyticsType,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  CalendarSyncMethod,
  DiscountCombinationMode,
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  LayoutWidth,
  TaxDisplayMode,
} from "@generated/prisma/enums";
import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
} from "@/shared/lib/json-validators";
import type {
  DurationDiscountRule,
  TaxSettings,
} from "@/shared/lib/pricing/types";

export type { BusinessTimeSlot, BusinessHoursDay, BusinessHours, TaxSettings };

export type SettingsData = {
  id: string;
  siteName: string | null;
  siteDescription: string | null;
  faviconUrl: string | null;
  defaultOgpImageUrl: string | null;
  headerLogoUrl: string | null;
  footerLogoUrl: string | null;
  footerCopyright: string | null;
  useHeaderLogo: boolean;
  useFooterLogo: boolean;
  businessName: string | null;
  businessNameKana: string | null;
  representativeName: string | null;
  businessType: string | null;
  industryType: string | null;
  establishedDate: Date | null;
  registrationNumber: string | null;
  invoiceNumber: string | null;
  businessDescription: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  businessHours: BusinessHours | null;
  regularHolidays: string[] | null;
  holidayNotice: string | null;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  defaultMetaDescription: string | null;
  defaultMetaKeywords: string | null;
  defaultOgpTitle: string | null;
  defaultOgpDescription: string | null;
  analyticsType: AnalyticsType | null;
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  googleSearchConsoleId: string | null;
  bingWebmasterToolsId: string | null;
  gaPropertyId: string | null;
  microsoftClarityId: string | null;
  defaultTimeSlot: number;
  minReservationDuration: number;
  maxReservationDuration: number;
  cancellationDeadlineHours: number;
  modificationDeadlineHours: number;
  sendReservationConfirmationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyEventRegistration: boolean;
  notifyEventCancellation: boolean;
  notificationStaffIds: string[];
  notificationEmailAddresses: string | null;
  taxStandardRate: number;
  taxReducedRate: number;
  taxDisplayModePublic: TaxDisplayMode;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  stripeEnabled: boolean;
  stripePublishableKey: string | null;
  stripeSecretKeyMasked: string | null;
  stripeWebhookSecretMasked: string | null;
  stripeAccountId: string | null;
  stripeCurrency: string;
  stripeLastTestedAt: Date | null;
  stripeConnectionStatus: string | null;
  cookieConsentEnabled: boolean;
  cookieConsentMessage: string | null;
  cookieConsentAcceptText: string | null;
  cookieConsentRejectText: string | null;
  cookieConsentPolicyUrl: string | null;
  announcementBarAnimation: AnnouncementBarAnimation;
  announcementBarDuration: number;
  announcementBarAutoPlay: boolean;
  announcementBarPauseOnHover: boolean;
  announcementBarShowArrows: boolean;
  announcementBarShowIndicator: boolean;
  announcementBarDesignStyle: AnnouncementBarDesignStyle;
  announcementBarBgColor: string | null;
  announcementBarTextColor: string | null;
  announcementBarStripeColor: string | null;
  announcementBarStripeAnimation: boolean;
  announcementBarGradientAnimation: boolean;
  announcementBarGlassAnimation: boolean;
  googleCalendarEnabled: boolean;
  googleCalendarId: string | null;
  googleCalendarServiceAccountEmailMasked: string | null;
  googleCalendarLastTestedAt: Date | null;
  googleCalendarConnectionStatus: string | null;
  googleBusinessProfileEnabled: boolean;
  googleBusinessProfileAuth: unknown;
  googleCalendarMeetEnabled: boolean;
  googleCalendarReminderMinutes: number | null;
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
  googleCalendarTwoWaySyncEnabled: boolean;
  googleCalendarSyncMethod: CalendarSyncMethod;
  googleCalendarLastSyncedAt: Date | null;
  googleCalendarWebhookActive: boolean;
  googleCalendarWebhookExpiration: Date | null;
  containerWidth: LayoutWidth | null;
  containerWidthCustom: number | null;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  sidebarEnabled: boolean;
  sidebarWidgets: unknown;
  sidebarRecentCount: number;
  sidebarPopularCount: number;
  sidebarTocEnabled: boolean;
  headerScrollBehavior: HeaderScrollBehavior;
  headerBackgroundMode: HeaderBackgroundMode;
  footerTagline: string | null;
  footerNavigationLabel: string;
  footerContactLabel: string;
  footerHoursLabel: string;
  footerShowSocialLinks: boolean;
  eventImportEnabled: boolean;
  /**
   * Feature Module ON/OFF map.
   *
   * 形式: `Record<FeatureModule, boolean>` — 9 module（spaces / reservation / events /
   * posts / news / faq / access / contact / reviews）。SSoT: `@/shared/lib/features/registry`。
   * 解決ロジック（依存伝播含む）は `@/shared/lib/features/check.ts`。
   */
  featureModules: Record<string, boolean>;
  themeColor: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DiscountSettingsData = {
  durationDiscountEnabled: boolean;
  durationDiscountRules: DurationDiscountRule[];
  discountCombinationMode: DiscountCombinationMode;
  showOriginalPrice: boolean;
};

export type RobotsTxtData = {
  robotsTxtEnabled: boolean;
  robotsTxtCustom: string | null;
  defaultRobotsTxt: string;
  warnings: string[];
};

export type ICalTokenWithRelations = {
  id: string;
  token: string;
  name: string;
  spaceId: string | null;
  spaceName: string | null;
  createdBy: string;
  createdByName: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export type ICalFeedSettingsData = {
  icalFeedEnabled: boolean;
  icalFeedIncludeCustomerInfo: boolean;
};

export type GoogleCalendarSettingsData = {
  enabled: boolean;
  calendarId: string | null;
  connectionStatus: "connected" | "error" | null;
  lastTestedAt: Date | null;
  meetEnabled: boolean;
  /** null = Google Calendar 既定を使う, 0 = 通知なし, N = N分前にメール通知 */
  reminderMinutes: number | null;
};

export type TwoWaySyncSettingsData = {
  enabled: boolean;
  syncMethod: CalendarSyncMethod;
  lastSyncedAt: Date | null;
  webhookExpiration: Date | null;
};

export type GoogleCalendarWebhookState = {
  calendarId: string | null;
  channelId: string | null;
  resourceId: string | null;
  token: string | null;
  expiration: Date | null;
};
