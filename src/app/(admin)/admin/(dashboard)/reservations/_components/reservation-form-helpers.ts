import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";

export type SpaceOption = {
  id: string;
  name: string;
  hourlyPrice: number;
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

export const RESERVATION_STATUS_OPTIONS = [
  {
    value: ReservationStatus.CONFIRMED,
    label: "確定",
    description: "予約が確定済み",
  },
  {
    value: ReservationStatus.PENDING,
    label: "保留",
    description: "確認待ち",
  },
];

/** 時間オプション（9:00-21:00、1時間刻み） */
export const TIME_OPTIONS = Array.from({ length: 13 }, (_, i) => {
  const hour = 9 + i;
  return `${hour.toString().padStart(2, "0")}:00`;
});
