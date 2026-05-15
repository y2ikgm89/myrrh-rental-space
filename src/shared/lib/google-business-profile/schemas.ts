/**
 * Google Business Profile `mybusinessbusinessinformation.v1` SDK 境界の Zod schema。
 *
 * `payload as unknown as Schema$Location` の double cast を Zod 4 公式 `z.custom<T>`
 * パターン (https://zod.dev/api#custom) で構造的に解消する。`buildLocationPayload`
 * helper が型安全に組み立てた payload を SDK の generated 型に narrow する境界専用で、
 * field レベルの validation は domain helper / Prisma 層が担当する。
 */

import "server-only";

import type { mybusinessbusinessinformation_v1 } from "googleapis";
import { z } from "zod";

import { isRecord } from "@/shared/lib/serialize";

export const LocationSchema =
  z.custom<mybusinessbusinessinformation_v1.Schema$Location>(
    isRecord,
    "Expected a Google Business Profile Schema$Location object",
  );
