import { formatPaths } from "@conform-to/dom";
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

/**
 * Zod の issue path を **conform の field name** へ変換する。
 *
 * conform は input の `name` を `formatPaths` で作り、数値 segment を `[n]` に
 * する（`buttons[0].url`）。ここを `path.join(".")` で組むと `buttons.0.url` に
 * なり、キーが一致しないので配列アイテムのエラーが `field.errors` に入らない。
 * 画面には何も出ず、conform は status !== "success" で submit を止めるため
 * **保存ボタンが無反応になる**（エラーも出ない）。
 *
 * 表記を写さず conform 自身の関数を使う。ここが drift するとエラーが無言で
 * 消えるだけで、型でも lint でも検出できない。
 *
 * 非配列（`title` / `layout.padding`）は dot 表記のままなので挙動は変わらない。
 * 壊れていたのは path に数値 segment を含むケースだけ。
 */
export function formatZodFieldErrors(
  error: z.ZodError,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = formatPaths(
      issue.path.map((segment) =>
        typeof segment === "number" ? segment : String(segment),
      ),
    );
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
