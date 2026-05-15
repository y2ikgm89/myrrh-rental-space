/**
 * Resend SDK 境界の Zod schema。
 *
 * `CreateEmailOptions` は `react` / `html` / `text` / `template` の 4 variant の
 * discriminated union のため、Zod object schema で網羅すると SDK 内部実装に
 * 引きずられた fragile な構造になる。`Omit<U, "from">` round-trip が
 * `exactOptionalPropertyTypes: true` 環境で union 型に戻らない仕様上、SDK 境界の
 * cast が必要になるが、Zod 4 公式 `z.custom<T>` パターン (https://zod.dev/api#custom)
 * で「object であること」だけを runtime で確認しつつ出力型を SDK 型に narrow する。
 */

import "server-only";

import type { CreateEmailOptions } from "resend";
import { z } from "zod";

import { isRecord } from "@/shared/lib/serialize";

export const CreateEmailOptionsSchema = z.custom<CreateEmailOptions>(
  isRecord,
  "Expected a Resend CreateEmailOptions object",
);
