/**
 * EventJsonLd — イベント詳細ページの Event 構造化データ（Phase B.1）
 *
 * 開催形態（OFFLINE / ONLINE / HYBRID）に応じて schema.org の
 * eventAttendanceMode 3 値 + polymorphic location（Place | VirtualLocation |
 * [Place, VirtualLocation]）を出力する。分岐の SSoT は Task 2/3 で定義した
 * `EVENT_FORMAT_TO_SCHEMA_ORG` / `isEventVirtualAccessible`。
 *
 * 重要: `EventJsonLdProps` に `meetingUrl` は存在しない。参加 URL は登録完了者
 * 限定のため、公開 JSON-LD には一切出力しない（Meetup / Eventbrite と同様の
 * ポリシー）。Google のリッチリザルトは VirtualLocation の存在で virtual event
 * と判定し、`url` は recommended であり required ではないため省略しても
 * 構造化データとしては有効。
 *
 * @see https://schema.org/Event
 * @see https://developers.google.com/search/docs/appearance/structured-data/event
 */

/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify-encoded, no raw HTML */
import type { ReactElement } from "react";
import { getBaseUrl, SITE_DEFAULTS } from "@/shared/lib/constants";
import { escapeJsonForScriptTag } from "@/shared/lib/json-ld-escape";
import { isEventVirtualAccessible } from "@/shared/domain/events/venue";
import {
  EVENT_FORMAT_TO_SCHEMA_ORG,
  type EventFormatValue,
} from "@/shared/lib/validations/enums/prisma-types";

const VIRTUAL_LOCATION_NAME =
  "オンライン開催 (登録完了時に URL をお送りします)";

type EventStatusType =
  "EventScheduled" | "EventCancelled" | "EventPostponed" | "EventRescheduled";

type OfferAvailability =
  "InStock" | "SoldOut" | "LimitedAvailability" | "PreOrder";

export interface EventJsonLdVenue {
  readonly name: string;
  readonly address?: string;
  readonly url?: string;
}

export interface EventJsonLdOffers {
  readonly price: number;
  readonly priceCurrency?: string;
  readonly availability?: OfferAvailability;
  readonly url?: string;
}

export interface EventJsonLdProps {
  readonly name: string;
  readonly description?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly url: string;
  readonly image?: string;
  readonly eventStatus?: EventStatusType;
  /** eventAttendanceMode + location polymorphism を決める SSoT 分岐キー */
  readonly format: EventFormatValue;
  /** 物理会場（OFFLINE / HYBRID のみ出力に反映される）。未設定なら Place を出力しない */
  readonly venue?: EventJsonLdVenue;
  readonly offers?: EventJsonLdOffers;
  readonly maximumAttendeeCapacity?: number;
}

function buildPlace(venue: EventJsonLdVenue): Record<string, unknown> {
  return {
    "@type": "Place",
    name: venue.name,
    ...(venue.address && {
      address: {
        "@type": "PostalAddress",
        streetAddress: venue.address,
        addressCountry: "JP",
      },
    }),
    ...(venue.url && { url: venue.url }),
  };
}

function buildVirtualLocation(): Record<string, unknown> {
  // 注意: url をあえて含めない。参加 URL は登録完了者限定 (Meetup/Eventbrite 同様)。
  return { "@type": "VirtualLocation", name: VIRTUAL_LOCATION_NAME };
}

function buildLocation(
  format: EventFormatValue,
  venue: EventJsonLdVenue | undefined,
): Record<string, unknown> | Record<string, unknown>[] | null {
  const physical = venue ? buildPlace(venue) : null;
  const virtual = isEventVirtualAccessible({ format })
    ? buildVirtualLocation()
    : null;

  switch (format) {
    case "OFFLINE":
      return physical;
    case "ONLINE":
      return virtual;
    case "HYBRID":
      return [physical, virtual].filter(
        (item): item is Record<string, unknown> => item !== null,
      );
  }
}

/**
 * Event 構造化データの JSON を構築する pure function。
 * `EventJsonLd` component から呼ばれるほか、unit test から直接呼べる。
 */
export function buildEventJsonLdData(
  props: EventJsonLdProps,
): Record<string, unknown> {
  const {
    name,
    description,
    startDate,
    endDate,
    url,
    image,
    eventStatus = "EventScheduled",
    format,
    venue,
    offers,
    maximumAttendeeCapacity,
  } = props;

  const baseUrl = getBaseUrl();
  const location = buildLocation(format, venue);
  const hasLocation = Array.isArray(location)
    ? location.length > 0
    : location !== null;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    ...(description && { description }),
    startDate,
    endDate,
    url,
    ...(image && { image }),
    eventStatus: `https://schema.org/${eventStatus}`,
    eventAttendanceMode: EVENT_FORMAT_TO_SCHEMA_ORG[format],
    ...(hasLocation && { location }),
    ...(offers && {
      offers: {
        "@type": "Offer",
        price: offers.price,
        priceCurrency: offers.priceCurrency || "JPY",
        availability: `https://schema.org/${offers.availability || "InStock"}`,
        ...(offers.url && { url: offers.url }),
        validFrom: startDate,
      },
    }),
    ...(maximumAttendeeCapacity !== undefined && { maximumAttendeeCapacity }),
    organizer: {
      "@type": "Organization",
      name: SITE_DEFAULTS.name,
      url: baseUrl,
    },
  };
}

/**
 * Event構造化データ（イベント詳細ページ向け、Phase B.1: 3 format 対応）
 *
 * Google リッチリザルト対応:
 * - name / startDate / location: 必須
 * - eventStatus / eventAttendanceMode: 推奨（ハイブリッド/中止表示対応）
 * - offers: price + priceCurrency で参加費リッチリザルト
 */
export function EventJsonLd(props: EventJsonLdProps): ReactElement {
  const safeJsonString = escapeJsonForScriptTag(
    JSON.stringify(buildEventJsonLdData(props)),
  );

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonString }}
    />
  );
}
