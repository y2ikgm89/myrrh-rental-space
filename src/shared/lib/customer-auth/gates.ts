/**
 * Customer auth gate facade — app-layer SSoT for session checks.
 *
 * Low-level Better Auth helpers live in `@/shared/lib/customer-auth`.
 * New pages, layouts, and UI components should import from here instead.
 *
 * ## When to use which
 *
 * | Helper | Redirect? | Use when |
 * | --- | --- | --- |
 * | `requireMypageSession()` | yes → `/login` or `/admin` | Mypage layouts, protected pages, customer mutations |
 * | `resolveOptionalCustomerSession()` | no | Public surfaces that personalize when logged in (forms, status hubs) |
 * | `getCustomerSession()` (`customer-auth.ts`) | no | Server Actions needing the raw Better Auth session (uncached) |
 *
 * `@see` `src/shared/lib/customer-auth.ts` for Better Auth instance and type guards.
 */

import "server-only";

import {
  getCurrentCustomerUser,
  verifyCustomerSession,
  type CustomerSession,
  type CustomerUser,
} from "@/shared/lib/customer-auth";

export type { CustomerSession, CustomerUser };

/** Mypage / member-only routes: fail closed with redirect. */
export async function requireMypageSession(
  requestHeaders?: Headers,
): Promise<{ session: CustomerSession; user: CustomerUser }> {
  return verifyCustomerSession(requestHeaders);
}

/** Public routes: return the logged-in customer or `null` without redirecting. */
export async function resolveOptionalCustomerSession(
  requestHeaders?: Headers,
): Promise<CustomerUser | null> {
  return getCurrentCustomerUser(requestHeaders);
}
