// ---------------------------------------------------------------------------
// Reservation selection reducer
// ---------------------------------------------------------------------------

import type { TimeSlot } from "@/shared/lib/reservation/types";

export const EMPTY_SLOTS: TimeSlot[] = [];

export type SelectionState = {
  locationId: string | null;
  spaceId: string | null;
  date: Date | undefined;
  startTime: string | null;
  duration: number | null;
  guests: number;
  slots: TimeSlot[];
  step: 1 | 2 | 3;
  errorMessage: string | null;
};

export type SelectionAction =
  | { type: "selectLocation"; id: string; autoSpaceId: string | null }
  | { type: "selectSpace"; id: string }
  | { type: "selectDate"; date: Date | undefined }
  | { type: "setSlots"; slots: TimeSlot[] }
  | { type: "selectStartTime"; time: string | null }
  | { type: "selectDuration"; minutes: number | null }
  | { type: "setGuests"; count: number }
  | { type: "goToStep"; step: 1 | 2 | 3 }
  | { type: "setError"; message: string };

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "selectLocation":
      return {
        ...state,
        locationId: action.id,
        spaceId: action.autoSpaceId,
        date: undefined,
        startTime: null,
        duration: null,
        slots: EMPTY_SLOTS,
      };
    case "selectSpace":
      return {
        ...state,
        spaceId: action.id,
        date: undefined,
        startTime: null,
        duration: null,
        slots: EMPTY_SLOTS,
      };
    case "selectDate":
      return {
        ...state,
        date: action.date,
        startTime: null,
        duration: null,
        slots: action.date ? state.slots : EMPTY_SLOTS,
      };
    case "setSlots":
      return { ...state, slots: action.slots };
    case "selectStartTime":
      return { ...state, startTime: action.time, duration: null };
    case "selectDuration":
      return { ...state, duration: action.minutes };
    case "setGuests":
      return { ...state, guests: action.count };
    case "goToStep":
      return { ...state, step: action.step, errorMessage: null };
    case "setError":
      return { ...state, errorMessage: action.message };
  }
}
