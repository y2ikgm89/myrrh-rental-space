import { describe, expect, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import {
  clonePrismaInputJson,
  isPrismaInputJsonValue,
  parsePrismaInputJson,
} from "@/shared/db/json";

describe("shared/db/json", () => {
  test("Prisma InputJsonValue として有効な値を判定する", () => {
    expect(
      isPrismaInputJsonValue({
        root: {
          children: ["text", 1, true],
        },
      }),
    ).toBe(true);
  });

  test("Prisma InputJsonValue として無効な値を拒否する", () => {
    expect(isPrismaInputJsonValue(undefined)).toBe(false);
    expect(
      isPrismaInputJsonValue({
        invalid: undefined,
      }),
    ).toBe(false);
  });

  test("有効な JSON を Prisma.InputJsonValue として返す", () => {
    expect(
      parsePrismaInputJson('{"root":{"children":[]}}', "invalid json"),
    ).toEqual({
      root: {
        children: [],
      },
    });
  });

  test("不正な JSON は DomainError を投げる", () => {
    expect(() => parsePrismaInputJson("{invalid", "invalid json")).toThrow(
      new DomainError("invalid json", "VALIDATION"),
    );
  });

  test("clone 可能な値を Prisma.InputJsonValue として返す", () => {
    expect(
      clonePrismaInputJson(
        {
          root: {
            children: ["text", 1, true],
          },
        },
        "invalid json",
      ),
    ).toEqual({
      root: {
        children: ["text", 1, true],
      },
    });
  });
});
