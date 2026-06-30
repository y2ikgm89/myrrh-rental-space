import { z } from "zod";

/**
 * 認証用入力スキーマ（クライアント/サーバー共通）
 */
export const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type CredentialsInput = z.input<typeof credentialsSchema>;
export type CredentialsData = z.output<typeof credentialsSchema>;
