import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { consumeAdminLoginToken } from "@/shared/domain/admin-login-tokens/commands";
import {
  isSignedAdminGateToken,
  verifyAdminGateToken,
} from "@/shared/lib/admin-login-gate";
import {
  ADMIN_GATE_COOKIE_NAME,
  getAdminGateCookieOptions,
} from "@/shared/lib/admin-login-gate-cookie";

const authorizeQuerySchema = z.object({
  token: z.string().min(1).max(2048).refine(isSignedAdminGateToken),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = authorizeQuerySchema.safeParse({
    token: req.nextUrl.searchParams.get("token"),
  });
  if (!parsed.success) {
    return new NextResponse(null, { status: 404 });
  }
  const { token } = parsed.data;

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
