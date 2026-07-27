import { z } from "zod";

import {
  createBlockArraySchema,
  createSpanArraySchema,
} from "@/shared/lib/portable-text/schema";
import type {
  PortableTextBlock,
  PortableTextSpan,
} from "@/shared/lib/portable-text";
import { isRecord } from "@/shared/lib/serialize";

import type { DynamicConfigForm, DynamicConfigValue } from "./types";

export function isDynamicConfigValue(
  value: unknown,
): value is DynamicConfigValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isDynamicConfigValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isDynamicConfigValue);
  }
  return false;
}

export function toDynamicConfigForm(
  record: Record<string, unknown>,
): DynamicConfigForm {
  const result: DynamicConfigForm = {};
  for (const [key, value] of Object.entries(record)) {
    if (isDynamicConfigValue(value)) {
      result[key] = value;
    }
  }
  return result;
}

export function formatZodFieldErrors(
  error: z.ZodError,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    const current = errors[key];
    errors[key] =
      current === undefined ? [issue.message] : [...current, issue.message];
  }
  return errors;
}

export function parsePortableTextSpans(value: unknown): PortableTextSpan[] {
  if (Array.isArray(value)) {
    const result = createSpanArraySchema().safeParse(value);
    return result.success ? result.data : [];
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = createSpanArraySchema().safeParse(parsed);
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parsePortableTextBlocks(value: unknown): PortableTextBlock[] {
  if (Array.isArray(value)) {
    const result = createBlockArraySchema().safeParse(value);
    return result.success ? result.data : [];
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      const result = createBlockArraySchema().safeParse(parsed);
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }
  return [];
}
