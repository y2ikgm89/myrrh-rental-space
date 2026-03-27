import type { FieldErrors } from "react-hook-form";
import { ReservationStatus } from "@/shared/db/enums";

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Constants
// =============================================================================

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

// =============================================================================
// Helpers
// =============================================================================

/**
 * FieldErrorsをCustomerSelector用の形式に変換
 * react-hook-formのFieldErrorsは { field: { message?: string } }
 * CustomerSelectorは { field: string[] | undefined } を期待
 */
export function convertFieldErrors<T extends Record<string, unknown>>(
  fieldErrors: FieldErrors<T> | undefined,
): Record<string, string[] | undefined> | undefined {
  if (!fieldErrors) return undefined;

  const result: Record<string, string[] | undefined> = {};
  for (const [key, error] of Object.entries(fieldErrors)) {
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      error.message
    ) {
      result[key] = [String(error.message)];
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
