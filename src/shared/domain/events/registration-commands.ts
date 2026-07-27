/**
 * Event registration command facade — preserves the existing public import path.
 *
 * Lifecycle ownership:
 * - {@link ./registration-create-commands} — public create + terms agreement
 * - {@link ./registration-cancel-commands} — customer / admin / token cancel
 * - {@link ./registration-checkin-commands} — day-of check-in toggle
 * - {@link ./registration-onsite-commands} — walk-in + admin proxy create
 * - {@link ./registration-admin-update-commands} — admin post-registration edit
 * - {@link ./registration-reminder-commands} — cron reminder claim / release
 */

export { createEventRegistrationCommand } from "./registration-create-commands";

export {
  cancelEventRegistrationCommand,
  adminCancelEventRegistrationCommand,
  cancelEventRegistrationByToken,
} from "./registration-cancel-commands";

export { setEventRegistrationCheckInCommand } from "./registration-checkin-commands";

export {
  createWalkInRegistrationCommand,
  createAdminProxyRegistrationCommand,
} from "./registration-onsite-commands";

export { updateEventRegistrationCommand } from "./registration-admin-update-commands";

export {
  claimEventRegistrationReminder,
  releaseEventRegistrationReminderClaim,
} from "./registration-reminder-commands";
