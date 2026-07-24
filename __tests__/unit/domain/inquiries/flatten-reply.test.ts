import { describe, test, expect, mock } from "bun:test";

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {},
}));

const { flattenReply } = await import("@/shared/domain/inquiries/queries");

describe("flattenReply", () => {
  test("STAFF uses author.name", () => {
    expect(
      flattenReply({
        id: "r1",
        body: "hi",
        authorType: "STAFF",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: { name: "Admin" },
        authorCustomer: null,
      }).authorName,
    ).toBe("Admin");
  });

  test("CUSTOMER uses lastName+firstName", () => {
    expect(
      flattenReply({
        id: "r2",
        body: "thanks",
        authorType: "CUSTOMER",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: null,
        authorCustomer: { lastName: "山田", firstName: "太郎" },
      }).authorName,
    ).toBe("山田 太郎");
  });

  test("CUSTOMER with null authorCustomer falls back to null", () => {
    expect(
      flattenReply({
        id: "r3",
        body: "x",
        authorType: "CUSTOMER",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        author: null,
        authorCustomer: null,
      }).authorName,
    ).toBeNull();
  });
});
