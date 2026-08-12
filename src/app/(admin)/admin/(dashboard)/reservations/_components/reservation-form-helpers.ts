import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import type {
  DiscountType,
  DurationDiscountOverride,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  CREATABLE_RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";

export type SpaceOption = {
  id: string;
  name: string;
  isPublished: boolean;
  hourlyPrice: number;
  discountType: DiscountType;
  discountValue: number | null;
  durationDiscountOverride: DurationDiscountOverride;
};

/**
 * スペース選択肢の表示名。非公開スペースには印を付ける。
 *
 * 管理画面の予約は非公開スペースにも作れる（`getSpacesForReservationQuery` の
 * JSDoc 参照）。印が無いと、公開中のスペースと区別できないまま「公開されている
 * つもりで」予約を入れられる。予約フォーム 3 種と一覧フィルターで同じ表記にする。
 */
export function spaceOptionLabel(space: {
  name: string;
  isPublished: boolean;
}): string {
  return space.isPublished ? space.name : `${space.name}（非公開）`;
}

export type SelectedCustomer = {
  id: string;
  name: string;
  email: string;
};

export type NewCustomerData = {
  lastName: string;
  firstName: string;
  companyName?: string;
  email: string;
  phoneNumber?: string;
};

const RESERVATION_STATUS_DESCRIPTIONS: Partial<
  Record<ReservationStatus, string>
> = {
  [ReservationStatus.CONFIRMED]: "予約が確定済み",
  [ReservationStatus.PENDING]: "確認待ち",
};

export const RESERVATION_STATUS_OPTIONS = CREATABLE_RESERVATION_STATUSES.map(
  (s) => ({
    value: s,
    label: RESERVATION_STATUS_LABELS[s],
    description: RESERVATION_STATUS_DESCRIPTIONS[s] ?? "",
  }),
);

/** 時間オプション（9:00-21:00、1時間刻み） */
export const TIME_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const hour = 9 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});
