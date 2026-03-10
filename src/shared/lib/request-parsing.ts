import { type NextResponse } from "next/server";
import { type z, type ZodType } from "zod";
import { jsonError, jsonValidationError } from "@/shared/lib/route-responses";

type ParsedJsonRequestSuccess<TData> = {
  success: true;
  data: TData;
};

type ParsedJsonRequestFailure = {
  success: false;
  response: NextResponse<{ error: string }>;
};

type ParsedJsonRequestResult<TData> =
  | ParsedJsonRequestSuccess<TData>
  | ParsedJsonRequestFailure;

type ParseJsonRequestOptions = {
  invalidJsonMessage?: string;
  invalidBodyMessage?: string;
};

export async function parseJsonRequest<TSchema extends ZodType>(
  request: Request,
  schema: TSchema,
  options: ParseJsonRequestOptions = {},
): Promise<ParsedJsonRequestResult<z.infer<TSchema>>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: jsonError(options.invalidJsonMessage ?? "JSON が不正です", 400),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      response: jsonValidationError(
        parsed.error,
        options.invalidBodyMessage ?? "入力内容に誤りがあります",
      ),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}
