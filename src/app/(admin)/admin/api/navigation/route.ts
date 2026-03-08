import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getNavigationItems } from "@/shared/domain/navigation/queries";

const searchSchema = z.object({
  type: z.enum(["HEADER_DESKTOP", "HEADER_MOBILE", "FOOTER"]).optional(),
});

export async function GET(request: Request) {
  const auth = await checkPermission("navigation", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    type: url.searchParams.get("type") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "type が不正です" },
      { status: 400 },
    );
  }

  const items = await getNavigationItems(parsed.data.type);
  return NextResponse.json(items);
}
