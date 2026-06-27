/**
 * Icon component map (client-safe SSoT — admin / public / Lexical 全方位)
 *
 * キュレーションリスト 100 個の Tabler icon component を静的 import + Map で保持。
 *
 * 消費者:
 * - admin: IconPickerDialog / IconPickerField (`@/admin/components/icon-picker/*`)
 * - admin: Lexical FeatureIconListNode の編集 UI createDOM（WYSIWYG）
 * - public: SanitizedHtml.hydrateCuratedIcons() / site-header / site-footer
 *
 * `"use client"` は付けない — Lexical Node の exportDOM は SSR で実行されるため。
 * `@tabler/icons-react` 自体は SSR safe で React Server Component から呼び出し可能。
 *
 * キュレーション追加時は `@/shared/lib/icon-curation` の `ICON_CATEGORIES` と
 * 本ファイルの import + Map の 2 箇所を同時に更新すること。
 *
 * 公開ページの `dynamic-tabler-icon.tsx` (`Reflect.get` 経由で全 Tabler icon 解決) は
 * curation 非依存。記事本文等の curation 外 icon name はそちらでハンドリングされる。
 */

import type { Icon as TablerIcon } from "@tabler/icons-react";
import {
  // Time
  IconClock,
  IconCalendar,
  IconCalendarEvent,
  IconCalendarTime,
  IconCalendarMonth,
  IconCalendarWeek,
  IconCalendarPlus,
  IconHourglass,
  IconAlarm,
  IconHistory,
  // Place
  IconMapPin,
  IconMap,
  IconMap2,
  IconLocation,
  IconCompass,
  IconRoute,
  IconNavigation,
  IconWorld,
  IconFlag,
  IconPin,
  // Amenity
  IconWifi,
  IconAirConditioning,
  IconArmchair,
  IconCoffee,
  IconFridge,
  IconBath,
  IconToiletPaper,
  IconParking,
  IconChargingPile,
  IconKey,
  IconLock,
  IconShield,
  IconShieldCheck,
  IconAccessible,
  IconSmokingNo,
  // Transport
  IconCar,
  IconBus,
  IconBike,
  IconTrain,
  IconWalk,
  IconPlane,
  IconScooter,
  IconTruck,
  IconShip,
  IconShoe,
  // Rating
  IconStar,
  IconStarFilled,
  IconHeart,
  IconHeartFilled,
  IconBookmark,
  IconThumbUp,
  IconAward,
  IconTrophy,
  IconCheck,
  IconCircleCheck,
  // Contact
  IconPhone,
  IconMail,
  IconMessage,
  IconMessages,
  IconBrandLine,
  IconHeadset,
  IconAt,
  IconSend,
  IconSpeakerphone,
  IconBell,
  // People
  IconUsers,
  IconUser,
  IconUserCheck,
  IconUsersGroup,
  IconCake,
  IconSparkles,
  IconGift,
  IconConfetti,
  IconMicrophone,
  IconPresentation,
  IconCalendarHeart,
  // Facility
  IconHome,
  IconBuilding,
  IconBuildingStore,
  IconBuildingSkyscraper,
  IconBuildingCommunity,
  IconBuildingWarehouse,
  IconBuildingChurch,
  IconBuildings,
  IconDoor,
  IconStairs,
  // General UI
  IconBulb,
  IconInfoCircle,
  IconHelpCircle,
  IconQuestionMark,
  IconAlertCircle,
  IconAlertTriangle,
  IconLink,
  IconExternalLink,
  IconArrowRight,
  IconChevronRight,
  IconPlus,
  IconMinus,
  IconX,
  IconSearch,
  IconSettings,
  IconCamera,
} from "@tabler/icons-react";

const ICON_COMPONENTS: Readonly<Record<string, TablerIcon>> = {
  // Time
  IconClock,
  IconCalendar,
  IconCalendarEvent,
  IconCalendarTime,
  IconCalendarMonth,
  IconCalendarWeek,
  IconCalendarPlus,
  IconHourglass,
  IconAlarm,
  IconHistory,
  // Place
  IconMapPin,
  IconMap,
  IconMap2,
  IconLocation,
  IconCompass,
  IconRoute,
  IconNavigation,
  IconWorld,
  IconFlag,
  IconPin,
  // Amenity
  IconWifi,
  IconAirConditioning,
  IconArmchair,
  IconCoffee,
  IconFridge,
  IconBath,
  IconToiletPaper,
  IconParking,
  IconChargingPile,
  IconKey,
  IconLock,
  IconShield,
  IconShieldCheck,
  IconAccessible,
  IconSmokingNo,
  // Transport
  IconCar,
  IconBus,
  IconBike,
  IconTrain,
  IconWalk,
  IconPlane,
  IconScooter,
  IconTruck,
  IconShip,
  IconShoe,
  // Rating
  IconStar,
  IconStarFilled,
  IconHeart,
  IconHeartFilled,
  IconBookmark,
  IconThumbUp,
  IconAward,
  IconTrophy,
  IconCheck,
  IconCircleCheck,
  // Contact
  IconPhone,
  IconMail,
  IconMessage,
  IconMessages,
  IconBrandLine,
  IconHeadset,
  IconAt,
  IconSend,
  IconSpeakerphone,
  IconBell,
  // People
  IconUsers,
  IconUser,
  IconUserCheck,
  IconUsersGroup,
  IconCake,
  IconSparkles,
  IconGift,
  IconConfetti,
  IconMicrophone,
  IconPresentation,
  IconCalendarHeart,
  // Facility
  IconHome,
  IconBuilding,
  IconBuildingStore,
  IconBuildingSkyscraper,
  IconBuildingCommunity,
  IconBuildingWarehouse,
  IconBuildingChurch,
  IconBuildings,
  IconDoor,
  IconStairs,
  // General UI
  IconBulb,
  IconInfoCircle,
  IconHelpCircle,
  IconQuestionMark,
  IconAlertCircle,
  IconAlertTriangle,
  IconLink,
  IconExternalLink,
  IconArrowRight,
  IconChevronRight,
  IconPlus,
  IconMinus,
  IconX,
  IconSearch,
  IconSettings,
  IconCamera,
};

/**
 * curation list の name から icon component を取得。
 * curation 外の name は undefined を返す（呼び出し側でフォールバック描画）。
 */
export function getCuratedIconComponent(name: string): TablerIcon | undefined {
  return ICON_COMPONENTS[name];
}
