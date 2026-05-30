import { describe, test, expect } from "bun:test";
import {
  getTypedFieldList,
  getTypedFieldset,
  asTypedField,
} from "@/shared/lib/conform/typed-input-control";

describe("typed-input-control helper SSoT", () => {
  test("asTypedField は同じ参照を返す (型注釈のみ変換、ランタイム no-op)", () => {
    const field = { name: "test", value: "x" } as unknown as Parameters<
      typeof asTypedField
    >[0];
    expect(asTypedField(field)).toBe(field);
  });

  test("getTypedFieldList は underlying field.getFieldList() を委譲する", () => {
    const expected = [{ id: "1" }];
    const field = {
      getFieldList: () => expected,
    } as unknown as Parameters<typeof getTypedFieldList>[0];
    const result = getTypedFieldList(field);
    expect(Object.is(result, expected)).toBe(true);
  });

  test("getTypedFieldset は underlying field.getFieldset() を委譲する", () => {
    const expected = { a: { id: "1" }, b: { id: "2" } };
    const field = {
      getFieldset: () => expected,
    } as unknown as Parameters<typeof getTypedFieldset>[0];
    const result = getTypedFieldset(field);
    expect(Object.is(result, expected)).toBe(true);
  });
});
