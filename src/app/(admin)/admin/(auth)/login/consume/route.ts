import { NextResponse, type NextRequest } from "next/server";
import { consumeAdminLoginToken } from "@/shared/domain/admin-login-tokens/commands";
import {
  ADMIN_GATE_COOKIE_NAME,
  getAdminGateCookieOptions,
  isSignedAdminGateToken,
  verifyAdminGateToken,
} from "@/shared/lib/admin-login-gate";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");
  if (!token || !isSignedAdminGateToken(token)) {
    return new NextResponse(null, { status: 404 });
  }

  const verified = await verifyAdminGateToken(token);
  if (!verified) {
    return new NextResponse(null, { status: 404 });
  }

  const consumed = await consumeAdminLoginToken(token);
  if (!consumed) {
    return new NextResponse(null, { status: 404 });
  }

  const response = NextResponse.redirect(new URL("/admin/login", request.url));
  response.cookies.set(
    ADMIN_GATE_COOKIE_NAME,
    "1",
    getAdminGateCookieOptions(),
  );
  return response;
}
