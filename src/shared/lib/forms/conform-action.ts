/**
 * Conform 1.19 + Zod 4 + Next.js 16 Server Action 統合 helper SSoT。
 *
 * React 19 `useActionState(action, undefined)` の signature
 * `(prev: SubmissionResult | undefined, formData: FormData) => Promise<SubmissionResult>`
 * に整合する canonical pattern。
 *
 * Flow:
 * 1. `parseWithZod(formData, { schema })` で Zod 4 schema validation
 * 2. 失敗時は `submission.reply()` を返す（field-level errors + value preservation）
 * 3. 成功時は `handler(submission.value)` を呼ぶ
 * 4. handler 失敗時は `submission.reply({ formErrors: [error] })` で top-level error を返す
 * 5. handler 成功時は `submission.reply({ resetForm: true })` で UI を初期化
 *
 * 認証・権限・監査ログを伴う管理画面 mutation は `executeAdminMutationResult` を handler 内で
 * 呼び出し、`MutationResult<T>` を `{ ok: true } | { ok: false; error }` に変換して返す。
 *
 * Zod 4 専用 import (`@conform-to/zod/v4`) を採用 — Zod 4 の internal schema 構造を直接
 * 解釈する公式推奨経路 (Zod v3 用の `@conform-to/zod` は本プロジェクトの Zod 4 と非互換)。
 *
 * @see https://conform.guide/integration/nextjs
 * @see https://conform.guide/api/zod/parseWithZod
 */

import "server-only";

import type { SubmissionResult } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import type { z } from "zod";

/**
 * Conform Server Action handler の戻り値契約。
 * 認証 / 権限 / domain error / DB エラー全てを `{ ok, error }` に統一する。
 */
export type ConformHandlerResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/**
 * Conform Server Action handler 関数のシグネチャ。
 */
export type ConformHandler<TInput> = (
  input: TInput,
) => Promise<ConformHandlerResult>;

/**
 * `useActionState(action, undefined)` 互換の Conform Server Action 実装 helper。
 *
 * @example
 * ```ts
 * "use server";
 * import { executeConformMutation } from "@/shared/lib/forms/conform-action";
 * import { siteInfoFormSchema } from "@/shared/lib/validations/settings";
 * import { updateSiteInfoCommand } from "@/shared/domain/settings/commands";
 *
 * export async function updateSiteInfoAction(
 *   _prev: SubmissionResult | undefined,
 *   formData: FormData,
 * ): Promise<SubmissionResult> {
 *   return executeConformMutation(formData, siteInfoFormSchema, async (input) => {
 *     const result = await updateSiteInfoCommand(input);
 *     return result.ok ? { ok: true } : { ok: false, error: result.error };
 *   });
 * }
 * ```
 */
export async function executeConformMutation<TSchema extends z.ZodTypeAny>(
  formData: FormData,
  schema: TSchema,
  handler: ConformHandler<z.output<TSchema>>,
): Promise<SubmissionResult> {
  const submission = parseWithZod(formData, { schema });

  if (submission.status !== "success") {
    return submission.reply();
  }

  const result = await handler(submission.value);

  if (!result.ok) {
    return submission.reply({ formErrors: [result.error] });
  }

  return submission.reply({ resetForm: true });
}
