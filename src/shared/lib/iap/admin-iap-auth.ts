import "server-only";

import { verifyIapJwt, type VerifiedIapJwt } from "./admin-iap-jwt";

const IAP_EMAIL_PREFIX = "accounts.google.com:";

export type IapIdentity = {
  email: string;
  subject: string;
};

export type ResolveIapIdentityOptions = {
  verifyJwt?: (jwt: string) => Promise<VerifiedIapJwt>;
};

export function normalizeIapEmail(value: string): string {
  return value.trim().replace(IAP_EMAIL_PREFIX, "").toLowerCase();
}

export async function resolveIapIdentity(
  headers: Headers,
  options: ResolveIapIdentityOptions = {},
): Promise<IapIdentity | null> {
  const assertion = headers.get("x-goog-iap-jwt-assertion");
  if (!assertion) return null;

  const verified = await (options.verifyJwt ?? verifyIapJwt)(assertion);
  const email = normalizeIapEmail(verified.email);
  if (!email) {
    throw new Error("IAP identity email is missing");
  }
  if (!verified.subject) {
    throw new Error("IAP identity subject is missing");
  }

  return {
    email,
    subject: verified.subject,
  };
}
