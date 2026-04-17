import type {
  AnalyticsType,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  CalendarSyncMethod,
  DiscountCombinationMode,
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  LayoutWidth,
  PostPermalinkStructure,
  TaxDisplayMode,
  TaxInputMode,
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
  address: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  businessHours: BusinessHours | null;
  regularHolidays: string[] | null;
  specialHolidays: string[] | null;
  holidayNotice: string | null;
  accessInfo: string | null;
  parkingInfo: string | null;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  emailSubjectPrefix: string | null;
  emailFooterNote: string | null;
  emailSupportContactText: string | null;
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
  defaultTimeSlot: number;
  minReservationDuration: number;
  maxReservationDuration: number;
  cancellationDeadlineHours: number;
  modificationDeadlineHours: number;
  sendReservationConfirmationEmail: boolean;
  sendAdminNotificationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notificationEmailAddresses: string | null;
  taxStandardRate: number;
  taxReducedRate: number;
  taxDisplayModeAdmin: TaxDisplayMode;
  taxDisplayModePublic: TaxDisplayMode;
  taxInputMode: TaxInputMode;
  timezone: string | null;
  language: string | null;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  stripeEnabled: boolean;
  stripeTestMode: boolean;
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
  googleCalendarOAuthEnabled: boolean;
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
  googleCalendarTwoWaySyncEnabled: boolean;
  googleCalendarSyncMethod: CalendarSyncMethod;
  googleCalendarPollingIntervalMin: number;
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
  latitude: number | null;
  longitude: number | null;
  priceRange: string | null;
  googleBusinessPlaceId: string | null;
  googleReviewUrl: string | null;
  businessAttributes: Record<string, boolean> | null;
  paymentAccepted: string | null;
  postPermalinkStructure: PostPermalinkStructure | null;
  postUrlPrefixEnabled: boolean;
  headerScrollBehavior: HeaderScrollBehavior;
  headerBackgroundMode: HeaderBackgroundMode;
  footerTagline: string | null;
  footerNavigationLabel: string;
  footerContactLabel: string;
  footerHoursLabel: string;
  footerShowSocialLinks: boolean;
  eventImportEnabled: boolean;
  themeColor: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DiscountSettingsData = {
  durationDiscountEnabled: boolean;
  durationDiscountRules: DurationDiscountRule[];
  discountCombinationMode: DiscountCombinationMode;
  showOriginalPrice: boolean;
  discountWarningEnabled: boolean;
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
  oauthEnabled: boolean;
};

export type TwoWaySyncSettingsData = {
  enabled: boolean;
  syncMethod: CalendarSyncMethod;
  pollingIntervalMin: number;
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
