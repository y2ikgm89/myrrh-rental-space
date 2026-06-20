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
  hourlyPrice: number;
  discountType: DiscountType;
  discountValue: number | null;
  durationDiscountOverride: DurationDiscountOverride;
};

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
