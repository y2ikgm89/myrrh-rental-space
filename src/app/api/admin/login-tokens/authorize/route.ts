import { NextResponse, type NextRequest } from "next/server";
import { consumeAdminLoginToken } from "@/shared/domain/admin-login-tokens/commands";
import {
  isSignedAdminGateToken,
  verifyAdminGateToken,
} from "@/shared/lib/admin-login-gate";
import {
  ADMIN_GATE_COOKIE_NAME,
  getAdminGateCookieOptions,
} from "@/shared/lib/admin-login-gate-cookie";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");

  if (!token || !isSignedAdminGateToken(token)) {
    return new NextResponse(null, { status: 404 });
  }

  if (!(await verifyAdminGateToken(token))) {
    return new NextResponse(null, { status: 404 });
  }

  const isConsumed = await consumeAdminLoginToken(token);
  if (!isConsumed) {
    return new NextResponse(null, { status: 404 });
  }

  const response = NextResponse.redirect(new URL("/admin/login", req.url));
  response.cookies.set(
    ADMIN_GATE_COOKIE_NAME,
    "1",
    getAdminGateCookieOptions(),
  );
  return response;
}
