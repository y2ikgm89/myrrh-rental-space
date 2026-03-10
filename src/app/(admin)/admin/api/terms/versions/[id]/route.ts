import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getAdminTermsVersionById } from "@/shared/domain/terms/admin-queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const paramsSchema = z.object({
  id: z.string().uuid({ error: "versionId が不正です" }),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await checkPermission("terms", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return jsonValidationError(parsed.error, "versionId が不正です");
  }

  const version = await getAdminTermsVersionById(parsed.data.id);
  if (!version) {
    return jsonError("バージョンが見つかりません", 404);
  }

  return NextResponse.json(version);
}
