/**
 * サイト設定の型定義
 *
 * @module admin/actions/settings/types
 */

import type {
  LayoutWidth,
  AnalyticsType,
  TaxDisplayMode,
  TaxInputMode,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  CalendarSyncMethod,
  PostPermalinkStructure,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
} from '@/shared/generated/prisma/enums'
import type {
  BusinessTimeSlot,
  BusinessHoursDay,
  BusinessHours,
} from '@/shared/lib/json-validators'

// 営業時間の型定義（json-validators.tsからre-export）
export type { BusinessTimeSlot, BusinessHoursDay, BusinessHours }

export type SettingsData = {
  id: string
  // Site Basic Info
  siteName: string | null
  siteDescription: string | null
  faviconUrl: string | null
  defaultOgpImageUrl: string | null
  headerLogoUrl: string | null
  footerLogoUrl: string | null
  footerCopyright: string | null
  // Logo Display Settings
  useHeaderLogo: boolean
  useFooterLogo: boolean
  // Business Info (事業者情報)
  businessName: string | null
  businessNameKana: string | null
  representativeName: string | null
  businessType: string | null
  industryType: string | null
  establishedDate: Date | null
  registrationNumber: string | null
  invoiceNumber: string | null
  businessDescription: string | null
  // Contact Info
  phoneNumber: string | null
  faxNumber: string | null
  email: string | null
  address: string | null
  postalCode: string | null
  prefecture: string | null
  city: string | null
  streetAddress: string | null
  buildingName: string | null
  // Business Hours (営業時間)
  businessHours: BusinessHours | null
  regularHolidays: string[] | null
  specialHolidays: string[] | null
  holidayNotice: string | null
  // Email Settings
  senderEmail: string | null
  senderName: string | null
  replyToEmail: string | null
  // SEO Settings
  defaultMetaDescription: string | null
  defaultMetaKeywords: string | null
  defaultOgpTitle: string | null
  defaultOgpDescription: string | null
  // Analytics Settings
  analyticsType: AnalyticsType | null
  googleAnalyticsId: string | null
  googleTagManagerId: string | null
  googleSearchConsoleId: string | null
  bingWebmasterToolsId: string | null
  gaPropertyId: string | null
  // Reservation Settings
  defaultTimeSlot: number | null
  minReservationDuration: number | null
  maxReservationDuration: number | null
  cancellationTermsId: string | null
  sendReservationConfirmationEmail: boolean
  sendAdminNotificationEmail: boolean
  // Notification Settings
  notifyNewReservation: boolean
  notifyReservationChange: boolean
  notifyReservationCancel: boolean
  notifyNewInquiry: boolean
  notificationEmailAddresses: string | null
  // Tax Settings (消費税設定)
  taxStandardRate: number
  taxReducedRate: number
  taxDisplayModeAdmin: TaxDisplayMode
  taxDisplayModePublic: TaxDisplayMode
  taxInputMode: TaxInputMode
  // Terms Agreement Settings
  termsAgreementEnabled: boolean
  termsAgreementText: string | null
  requireTermsAgreement: boolean
  requirePrivacyAgreement: boolean
  // Other Settings
  timezone: string | null
  language: string | null
  maintenanceMode: boolean
  maintenanceMessage: string | null
  // Stripe Payment Settings
  stripeEnabled: boolean
  stripeTestMode: boolean
  stripePublishableKey: string | null
  stripeSecretKeyMasked: string | null // マスク済み（復号しない）
  stripeWebhookSecretMasked: string | null // マスク済み
  stripeAccountId: string | null
  stripeCurrency: string
  stripeLastTestedAt: Date | null
  stripeConnectionStatus: string | null
  // Cookie Consent Settings
  cookieConsentEnabled: boolean
  cookieConsentMessage: string | null
  cookieConsentAcceptText: string | null
  cookieConsentRejectText: string | null
  cookieConsentPolicyUrl: string | null
  // Announcement Bar Carousel Settings
  announcementBarAnimation: AnnouncementBarAnimation
  announcementBarDuration: number
  announcementBarAutoPlay: boolean
  announcementBarPauseOnHover: boolean
  announcementBarShowArrows: boolean
  announcementBarShowIndicator: boolean
  announcementBarDesignStyle: AnnouncementBarDesignStyle
  // Announcement Bar Common Color Settings
  announcementBarBgColor: string | null
  announcementBarTextColor: string | null
  // Striped Design Settings
  announcementBarStripeColor: string | null
  announcementBarStripeAnimation: boolean
  // Gradient Design Settings
  announcementBarGradientAnimation: boolean
  // Glass Design Settings
  announcementBarGlassAnimation: boolean
  // Google Calendar Integration
  googleCalendarEnabled: boolean
  googleCalendarId: string | null
  googleCalendarServiceAccountEmailMasked: string | null
  googleCalendarLastTestedAt: Date | null
  googleCalendarConnectionStatus: string | null
  googleCalendarOAuthEnabled: boolean
  icalAttachmentEnabled: boolean
  addToCalendarLinksEnabled: boolean
  // Two-Way Sync Settings
  googleCalendarTwoWaySyncEnabled: boolean
  googleCalendarSyncMethod: CalendarSyncMethod
  googleCalendarPollingIntervalMin: number
  googleCalendarLastSyncedAt: Date | null
  googleCalendarWebhookActive: boolean
  googleCalendarWebhookExpiration: Date | null
  // Layout Width Settings
  containerWidth: LayoutWidth | null
  containerWidthCustom: number | null
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  // Sidebar Settings
  sidebarEnabled: boolean
  sidebarWidgets: unknown // JSON型（SidebarWidgetsとしてパース）
  sidebarRecentCount: number
  sidebarPopularCount: number
  // MEO Settings (ローカル検索最適化)
  latitude: number | null
  longitude: number | null
  priceRange: string | null
  googleBusinessPlaceId: string | null
  googleReviewUrl: string | null
  businessAttributes: Record<string, boolean> | null
  paymentAccepted: string | null
  // Permalink Settings
  postPermalinkStructure: PostPermalinkStructure | null
  postUrlPrefixEnabled: boolean
  // Header Settings
  headerScrollBehavior: HeaderScrollBehavior
  headerBackgroundMode: HeaderBackgroundMode
  createdAt: Date
  updatedAt: Date
}
