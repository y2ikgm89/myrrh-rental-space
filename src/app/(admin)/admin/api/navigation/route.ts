import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getNavigationItems } from "@/shared/domain/navigation/queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const searchSchema = z.object({
  type: z.enum(["HEADER_DESKTOP", "HEADER_MOBILE", "FOOTER"]).optional(),
});

export async function GET(request: Request) {
  const auth = await checkPermission("navigation", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
  });

  if (!parsed.success) {
    return jsonValidationError(parsed.error, "type が不正です");
  }

  const items = await getNavigationItems(parsed.data.type);
  return NextResponse.json(items);
}
