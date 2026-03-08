import { serverEnv } from "@/shared/lib/env/server";

export const ADMIN_GATE_COOKIE_NAME = "admin-gate";

export function getAdminGateCookieOptions() {
  return {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 60 * 60,
    path: "/admin",
  };
}
