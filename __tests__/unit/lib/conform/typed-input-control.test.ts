import { describe, test, expect } from "bun:test";
import type { FieldMetadata } from "@conform-to/react";
import {
  getTypedFieldList,
  getTypedFieldset,
} from "@/shared/lib/conform/typed-input-control";

function createFieldMetadata(
  overrides: Partial<FieldMetadata<unknown>> = {},
): FieldMetadata<unknown> {
  return {
    key: undefined,
    id: "test",
    errorId: "test-error",
    descriptionId: "test-description",
    name: "test",
    defaultValue: undefined,
    defaultOptions: undefined,
    defaultChecked: undefined,
    initialValue: undefined,
    value: undefined,
    errors: undefined,
    allErrors: {},
    valid: true,
    dirty: false,
    formId: "test-form",
    ...overrides,
  };
}

describe("typed-input-control helper SSoT", () => {
  test("getTypedFieldList は underlying field.getFieldList() を委譲する", () => {
    const expected = [createFieldMetadata({ id: "1" })];
    const field: FieldMetadata<unknown> & {
      getFieldList: () => typeof expected;
    } = {
      ...createFieldMetadata(),
      getFieldList: () => expected,
    };
    const result = getTypedFieldList(field);
    expect(Object.is(result, expected)).toBe(true);
  });

  test("getTypedFieldset は underlying field.getFieldset() を委譲する", () => {
    const expected = {
      a: createFieldMetadata({ id: "1" }),
      b: createFieldMetadata({ id: "2" }),
    };
    const field: FieldMetadata<unknown> & {
      getFieldset: () => typeof expected;
    } = {
      ...createFieldMetadata(),
      getFieldset: () => expected,
    };
    const result = getTypedFieldset(field);
    expect(Object.is(result, expected)).toBe(true);
  });
});
