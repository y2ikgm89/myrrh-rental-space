import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getAdminTermsVersionById } from "@/shared/domain/terms/admin-queries";

const paramsSchema = z.object({
  id: z.string().uuid({ error: "versionId が不正です" }),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await checkPermission("terms", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "versionId が不正です" },
      { status: 400 },
    );
  }

  const version = await getAdminTermsVersionById(parsed.data.id);
  if (!version) {
    return NextResponse.json({ error: "バージョンが見つかりません" }, { status: 404 });
  }

  return NextResponse.json(version);
}
