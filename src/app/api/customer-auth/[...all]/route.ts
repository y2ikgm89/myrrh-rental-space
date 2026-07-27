/**
 * 顧客用 Better Auth API Route Handler
 *
 * maintenance ON 時は sign-out 以外の mutating POST を 503 で拒否 (SYS-2)。
 * allowlist の詳細は `@/shared/domain/settings/maintenance-guard` を参照。
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */

import { customerAuth } from "@/shared/lib/customer-auth";
import {
  isCustomerAuthSignOutPath,
  isPublicSiteInMaintenance,
  PUBLIC_MAINTENANCE_BLOCKED_MESSAGE,
} from "@/shared/domain/settings/maintenance-guard";
import { toNextJsHandler } from "better-auth/next-js";

const handler = toNextJsHandler(customerAuth);

async function withMaintenanceGuard(
  request: Request,
  method: "GET" | "POST",
): Promise<Response> {
  if (method === "POST") {
    const { pathname } = new URL(request.url);
    if (
      !isCustomerAuthSignOutPath(pathname) &&
      (await isPublicSiteInMaintenance())
    ) {
      return Response.json(
        { error: PUBLIC_MAINTENANCE_BLOCKED_MESSAGE },
        { status: 503 },
      );
    }
  }
  return handler[method](request);
}

export async function GET(request: Request): Promise<Response> {
  return withMaintenanceGuard(request, "GET");
}

export async function POST(request: Request): Promise<Response> {
  return withMaintenanceGuard(request, "POST");
}
