import { describe, expect, mock, test } from "bun:test";

const mockLookup = mock((hostname: string) => {
  if (hostname === "ipv4-mapped.example.test") {
    return Promise.resolve([
      { address: "::ffff:127.0.0.1", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
  }
  if (hostname === "public.example.test") {
    return Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
  }
  return Promise.resolve([]);
});

mock.module("server-only", () => ({}));

mock.module("node:dns/promises", () => ({
  lookup: mockLookup,
}));

import { isPrivateOrReservedHost, isUrlSafe } from "@/shared/lib/ssrf-guard";

describe("isPrivateOrReservedHost", () => {
  test("rejects unbracketed IPv4-mapped IPv6 loopback addresses", () => {
    expect(isPrivateOrReservedHost("::ffff:127.0.0.1")).toBe(true);
  });

  test("rejects private IPv6 literals without brackets", () => {
    expect(isPrivateOrReservedHost("fc00::1")).toBe(true);
    expect(isPrivateOrReservedHost("fd12:3456::1")).toBe(true);
    expect(isPrivateOrReservedHost("fe80::1")).toBe(true);
  });
});

describe("isUrlSafe", () => {
  test("rejects a hostname when any resolved A or AAAA address is private", async () => {
    await expect(isUrlSafe("https://ipv4-mapped.example.test")).resolves.toBe(
      false,
    );
  });

  test("allows an http URL when every resolved address is public", async () => {
    await expect(isUrlSafe("https://public.example.test")).resolves.toBe(true);
  });
});
