import { describe, expect, test } from "bun:test";
import {
  isLoopbackHost,
  isLoopbackHostname,
  isLoopbackRequestHost,
} from "@/shared/lib/request-host";

describe("isLoopbackHostname", () => {
  test("accepts localhost / 127.0.0.1 / ::1", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
  });

  test("rejects public hostnames", () => {
    expect(isLoopbackHostname("example.com")).toBe(false);
    expect(isLoopbackHostname("preview.example.com")).toBe(false);
  });
});

describe("isLoopbackHost", () => {
  test("accepts Host values with ports and IPv6 brackets", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("localhost:3000")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHost("[::1]:3000")).toBe(true);
  });

  test("uses the first X-Forwarded-Host entry", () => {
    expect(isLoopbackHost("localhost:3000, evil.example.com")).toBe(true);
    expect(isLoopbackHost("evil.example.com, localhost:3000")).toBe(false);
  });

  test("rejects missing or non-loopback hosts", () => {
    expect(isLoopbackHost(null)).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
    expect(isLoopbackHost("admin.example.com")).toBe(false);
  });
});

describe("isLoopbackRequestHost", () => {
  test("requires Host to be loopback", () => {
    expect(isLoopbackRequestHost(new Headers())).toBe(false);
    expect(
      isLoopbackRequestHost(new Headers({ host: "preview.example.com" })),
    ).toBe(false);
    expect(isLoopbackRequestHost(new Headers({ host: "localhost:3000" }))).toBe(
      true,
    );
  });

  test("rejects when X-Forwarded-Host is non-loopback even if Host is loopback", () => {
    expect(
      isLoopbackRequestHost(
        new Headers({
          host: "localhost:3000",
          "x-forwarded-host": "preview.example.com",
        }),
      ),
    ).toBe(false);
  });

  test("rejects spoofed X-Forwarded-Host=localhost when Host is not loopback", () => {
    expect(
      isLoopbackRequestHost(
        new Headers({
          host: "preview.example.com",
          "x-forwarded-host": "localhost:3000",
        }),
      ),
    ).toBe(false);
  });

  test("rejects when request URL host is not loopback", () => {
    expect(
      isLoopbackRequestHost(
        new Headers({ host: "localhost:3000" }),
        "https://preview.example.com/admin",
      ),
    ).toBe(false);
    expect(
      isLoopbackRequestHost(
        new Headers({ host: "localhost:3000" }),
        "http://127.0.0.1:3000/admin",
      ),
    ).toBe(true);
  });
});
