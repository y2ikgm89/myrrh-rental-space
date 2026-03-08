import { NextResponse } from "next/server";
import { checkPermission } from "@/admin/lib/action-auth";
import { getCancellationPolicies } from "@/shared/domain/settings/admin-queries";

export async function GET(request: Request) {
  const auth = await checkPermission("settings", "read", request.headers);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error.error }, { status: 403 });
  }

  const policies = await getCancellationPolicies();
  return NextResponse.json(policies);
}
