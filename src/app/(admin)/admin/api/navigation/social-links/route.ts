import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getSocialLinks } from "@/shared/domain/navigation/queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const searchSchema = z.object({
  activeOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const auth = await checkPermission("navigation", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    activeOnly: url.searchParams.get("activeOnly") ?? undefined,
  });

  if (!parsed.success) {
    return jsonValidationError(parsed.error, "activeOnly が不正です");
  }

  const items = await getSocialLinks({
    activeOnly: parsed.data.activeOnly === "true",
  });
  return NextResponse.json(items);
}
