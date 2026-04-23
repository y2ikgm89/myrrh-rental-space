import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { listSectionStyles } from "@/shared/domain/section-styles/queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";
import { omitUndefined } from "@/shared/lib/serialize";
import { sectionStyleListFiltersSchema } from "@/shared/lib/validations/section-style";

export async function GET(request: Request) {
  const auth = await checkPermission("sectionStyle", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const url = new URL(request.url);
  const parsed = sectionStyleListFiltersSchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
    applicableType: url.searchParams.get("applicableType") || undefined,
    search: url.searchParams.get("search") || undefined,
  });

  if (!parsed.success) {
    return jsonValidationError(parsed.error, "クエリが不正です");
  }

  const styles = await listSectionStyles(omitUndefined(parsed.data));
  return NextResponse.json(styles);
}
