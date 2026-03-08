import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getSocialLinks } from "@/shared/domain/navigation/queries";

const searchSchema = z.object({
  activeOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const auth = await checkPermission("navigation", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    activeOnly: url.searchParams.get("activeOnly") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "activeOnly が不正です" },
      { status: 400 },
    );
  }

  const items = await getSocialLinks({
    activeOnly: parsed.data.activeOnly === "true",
  });
  return NextResponse.json(items);
}
