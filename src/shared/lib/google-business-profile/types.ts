/**
 * Google Business Profile API 連携で使用する型定義。
 */

import "server-only";

export type GbpAuthState = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId: string;
  readonly accountName: string;
};

export type GbpSyncInput = {
  readonly locationId: string;
};

export type GbpSyncResult = {
  readonly locationId: string;
  readonly syncedAt: Date;
};

export type GbpDayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export type GbpTimePeriod = {
  readonly openDay: GbpDayOfWeek;
  readonly openTime: { readonly hours: number; readonly minutes: number };
  readonly closeDay: GbpDayOfWeek;
  readonly closeTime: { readonly hours: number; readonly minutes: number };
};

export type GbpRegularHours = {
  readonly periods: readonly GbpTimePeriod[];
};

export type GbpLocationPayload = {
  readonly title: string;
  readonly storefrontAddress: {
    readonly postalCode: string | undefined;
    readonly regionCode: "JP";
    readonly locality: string | undefined;
    readonly addressLines: readonly string[];
  };
  readonly phoneNumbers: { readonly primaryPhone: string | undefined };
  readonly regularHours: GbpRegularHours | undefined;
  readonly websiteUri: string | undefined;
  readonly latlng:
    | { readonly latitude: number; readonly longitude: number }
    | undefined;
};
