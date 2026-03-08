import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";

const searchSchema = z.object({
  slug: z.string().trim().max(100).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await checkPermission("page", "create", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    slug: url.searchParams.get("slug") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "slug が不正です" },
      { status: 400 },
    );
  }

  const slug = parsed.data.slug ?? "";
  if (slug.length === 0) {
    return NextResponse.json({ available: false });
  }

  const slugCheck = await checkSlugAvailability(slug, { currentType: "page" });
  if (!slugCheck.available) {
    return NextResponse.json({
      available: false,
      message: getSlugErrorMessage(slugCheck.reason),
    });
  }

  return NextResponse.json({ available: true });
}
