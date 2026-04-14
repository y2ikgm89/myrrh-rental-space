import type { ReservationStatus } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { RESERVATION_STATUS_TRANSITIONS } from "@/shared/lib/validations/enums/helpers";

export function validateStatusTransition(
  from: ReservationStatus,
  to: ReservationStatus,
): void {
  if (from === to) return;
  const allowed = RESERVATION_STATUS_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new DomainError("このステータスからは変更できません", "VALIDATION");
  }
}
