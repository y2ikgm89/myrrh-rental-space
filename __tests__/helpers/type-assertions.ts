import { expect } from "bun:test";

export type SubmissionLike = {
  readonly status?: "success" | "error";
  readonly initialValue?: unknown;
  readonly error?: Record<string, string[] | null> | null;
};

export type ErrorResult = {
  readonly error: string;
};

export type ReceivedResult = {
  readonly received: boolean;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expectSubmissionLike(
  value: unknown,
): asserts value is SubmissionLike {
  expect(isRecord(value)).toBe(true);
  if (!isRecord(value)) return;
  const status = value["status"];
  expect(
    status === undefined || status === "success" || status === "error",
  ).toBe(true);
  const error = value["error"];
  expect(error === undefined || error === null || isRecord(error)).toBe(true);
}

export function expectErrorResult(
  value: unknown,
): asserts value is ErrorResult {
  expect(isRecord(value)).toBe(true);
  if (!isRecord(value)) return;
  expect(typeof value["error"]).toBe("string");
}

export function expectReceivedResult(
  value: unknown,
): asserts value is ReceivedResult {
  expect(isRecord(value)).toBe(true);
  if (!isRecord(value)) return;
  expect(typeof value["received"]).toBe("boolean");
}

export function expectRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}
