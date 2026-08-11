import { z } from "zod";

export const googleServiceAccountCredentialsSchema = z
  .object({
    type: z.literal("service_account", {
      error: "サービスアカウントJSONを入力してください",
    }),
    // eslint-disable-next-line local/require-trimmed-text -- 鍵ファイル JSON の中身。人が打つ値ではない
    client_email: z
      .string({ error: "client_email が必要です" })
      .min(1, { error: "client_email が必要です" }),
    // eslint-disable-next-line local/require-trimmed-text -- 同上
    private_key: z
      .string({ error: "private_key が必要です" })
      .min(1, { error: "private_key が必要です" }),
  })
  .loose();

export type GoogleServiceAccountCredentials = z.output<
  typeof googleServiceAccountCredentialsSchema
>;

export function parseGoogleServiceAccountCredentials(
  json: string,
): GoogleServiceAccountCredentials | null {
  try {
    const parsed: unknown = JSON.parse(json);
    const result = googleServiceAccountCredentialsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function extractGoogleServiceAccountEmail(json: string): string | null {
  return parseGoogleServiceAccountCredentials(json)?.client_email ?? null;
}
