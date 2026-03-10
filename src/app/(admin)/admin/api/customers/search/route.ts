import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPermission } from "@/admin/lib/action-auth";
import { searchCustomers } from "@/shared/domain/customers/queries";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

const searchSchema = z.object({
  q: z.string().trim().max(255).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await checkPermission("customer", "read", request.headers);
  if (!auth.success) {
    return jsonError(auth.error.error, 403);
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return jsonValidationError(parsed.error, "q が不正です");
  }

  const query = parsed.data.q?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json([]);
  }

  const customers = await searchCustomers(query);
  return NextResponse.json(customers);
}
