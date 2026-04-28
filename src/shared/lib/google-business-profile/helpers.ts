/**
 * Google Business Profile location payload を構築する pure helper 群。
 */

import "server-only";

import { isRecord } from "@/shared/lib/serialize";

import type {
  GbpDayOfWeek,
  GbpLocationPayload,
  GbpRegularHours,
  GbpTimePeriod,
} from "./types";

/** GBP API がサポートする曜日の順序（日曜起点） */
const DAY_ORDER: readonly {
  readonly key: string;
  readonly day: GbpDayOfWeek;
}[] = [
  { key: "sunday", day: "SUNDAY" },
  { key: "monday", day: "MONDAY" },
  { key: "tuesday", day: "TUESDAY" },
  { key: "wednesday", day: "WEDNESDAY" },
  { key: "thursday", day: "THURSDAY" },
  { key: "friday", day: "FRIDAY" },
  { key: "saturday", day: "SATURDAY" },
];

const TIME_PATTERN = /^([0-9]{1,2}):([0-9]{2})$/u;

function parseTime(value: unknown): { hours: number; minutes: number } | null {
  if (typeof value !== "string") return null;
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const hoursStr = match[1];
  const minutesStr = match[2];
  if (hoursStr === undefined || minutesStr === undefined) return null;
  const hours = Number.parseInt(hoursStr, 10);
  const minutes = Number.parseInt(minutesStr, 10);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Settings JSON 形式の businessHours から GBP `regularHours.periods` を構築する。
 * 入力形式: `{ monday: { open: "09:00", close: "18:00" }, sunday: { closed: true } }`
 * 不正な時刻・closed: true・全曜日無効の場合は undefined を返す。
 */
export function buildBusinessHoursPayload(
  json: unknown,
): GbpRegularHours | undefined {
  if (json === null || json === undefined) return undefined;
  if (typeof json !== "object") return undefined;

  const record: Record<string, unknown> = isRecord(json) ? json : {};
  const periods: GbpTimePeriod[] = [];

  for (const { key, day } of DAY_ORDER) {
    const entry = record[key];
    if (!isRecord(entry)) continue;
    if (entry["closed"] === true) continue;
    const openTime = parseTime(entry["open"]);
    const closeTime = parseTime(entry["close"]);
    if (!openTime || !closeTime) continue;
    periods.push({
      openDay: day,
      openTime,
      closeDay: day,
      closeTime,
    });
  }

  if (periods.length === 0) return undefined;
  return { periods };
}

/**
 * Location レコードから GBP `Location` payload を構築する。
 * 住所行は streetAddress / buildingName を順に詰め、latlng は両方の数値が揃っているときのみ含める。
 */
export function buildLocationPayload(input: {
  readonly name: string;
  readonly postalCode: string | null;
  readonly city: string | null;
  readonly streetAddress: string | null;
  readonly buildingName: string | null;
  readonly phoneNumber: string | null;
  readonly businessHours: unknown;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly websiteUri?: string | undefined;
}): GbpLocationPayload {
  const addressLines: string[] = [];
  if (input.streetAddress) addressLines.push(input.streetAddress);
  if (input.buildingName) addressLines.push(input.buildingName);

  const latlng =
    typeof input.latitude === "number" && typeof input.longitude === "number"
      ? { latitude: input.latitude, longitude: input.longitude }
      : undefined;

  return {
    title: input.name,
    storefrontAddress: {
      postalCode: input.postalCode ?? undefined,
      regionCode: "JP",
      locality: input.city ?? undefined,
      addressLines,
    },
    phoneNumbers: { primaryPhone: input.phoneNumber ?? undefined },
    regularHours: buildBusinessHoursPayload(input.businessHours),
    websiteUri: input.websiteUri,
    latlng,
  };
}

/**
 * GBP `locations.patch` で更新するフィールドを表す updateMask を構築する。
 * 基本フィールドは常時含み、latlng は payload に値があるときのみ追加する。
 */
export function buildGbpFieldMask(payload: GbpLocationPayload): string {
  const fields = [
    "title",
    "storefrontAddress",
    "phoneNumbers.primaryPhone",
    "regularHours",
    "websiteUri",
  ];
  if (payload.latlng !== undefined) {
    fields.push("latlng");
  }
  return fields.join(",");
}

const ERROR_MESSAGE_MAX_LENGTH = 200;

/**
 * 例外オブジェクトをユーザー / ログ向けの短いメッセージ文字列に変換する。
 * Error → message（200 文字超は truncate して "..." を付加）、非 Error → "Unknown GBP API error"。
 */
export function formatGbpError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;
    if (message.length > ERROR_MESSAGE_MAX_LENGTH) {
      return `${message.slice(0, ERROR_MESSAGE_MAX_LENGTH)}...`;
    }
    return message;
  }
  return "Unknown GBP API error";
}
