import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { getTermsDefaultsForType } from "@/shared/domain/terms/admin-queries";

const paramsSchema = z.object({
  type: z.string().min(1, { error: "type が不正です" }),
});

type RouteContext = {
  params: Promise<{ type: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await checkPermission("terms", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "type が不正です" },
      { status: 400 },
    );
  }

  const defaults = await getTermsDefaultsForType(parsed.data.type);
  return NextResponse.json(defaults);
}
