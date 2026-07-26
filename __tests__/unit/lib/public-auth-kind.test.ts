import { describe, expect, test } from "bun:test";
import {
  isPublicAuthKind,
  resolvePublicAuthKind,
} from "@/shared/lib/public-auth-kind";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

describe("resolvePublicAuthKind", () => {
  test("未認証は login", () => {
    expect(resolvePublicAuthKind(null)).toBe("login");
  });

  test("CUSTOMER / USER は mypage", () => {
    expect(resolvePublicAuthKind({ role: Role.CUSTOMER })).toBe("mypage");
    expect(resolvePublicAuthKind({ role: Role.USER })).toBe("mypage");
  });

  test("管理ロールは null（公開 chrome 非表示）", () => {
    expect(resolvePublicAuthKind({ role: Role.ADMIN })).toBe(null);
    expect(resolvePublicAuthKind({ role: Role.SUPER_ADMIN })).toBe(null);
  });
});

describe("isPublicAuthKind", () => {
  test("許可値のみ通す", () => {
    expect(isPublicAuthKind("mypage")).toBe(true);
    expect(isPublicAuthKind("login")).toBe(true);
    expect(isPublicAuthKind(null)).toBe(true);
    expect(isPublicAuthKind("admin")).toBe(false);
    expect(isPublicAuthKind(undefined)).toBe(false);
  });
});
