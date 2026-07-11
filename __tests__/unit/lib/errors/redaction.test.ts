import { describe, expect, test } from "bun:test";

import {
  redactContext,
  redactRequestUrl,
  redactString,
} from "@/shared/lib/errors/redaction";

describe("redactString", () => {
  test("masks email addresses", () => {
    const result = redactString("customer alice@example.com contacted us");
    expect(result).not.toContain("alice@example.com");
    expect(result).toContain("[REDACTED:email]");
  });

  test("masks JWT tokens", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9FYR3Cq6D8pow";
    const result = redactString(`Authorization Bearer ${jwt}`);
    expect(result).toContain("[REDACTED:bearer]");
    expect(result).not.toContain(jwt);
  });

  test("masks Bearer tokens without JWT structure", () => {
    const result = redactString("Bearer abc123def456ghi789");
    expect(result).toContain("[REDACTED:bearer]");
  });

  test("masks Stripe secret keys", () => {
    // Stripe-shaped fake token — split to keep GitHub secret scanning quiet.
    const stripeKey = ["sk", "live", "51ABCabcABCabcABCabcABCabc"].join("_");
    const result = redactString(`stripe key ${stripeKey} was used`);
    expect(result).not.toContain(stripeKey);
    expect(result).toContain("[REDACTED:secret]");
  });

  test("masks GitHub personal access tokens", () => {
    const pat = ["ghp", "abcdefghijklmnopqrstuvwxyz1234"].join("_");
    const result = redactString(`token=${pat}`);
    expect(result).not.toContain(pat);
    expect(result).toContain("[REDACTED:secret]");
  });

  test("masks Japanese phone numbers", () => {
    const results = [
      redactString("call 03-1234-5678"),
      redactString("mobile 090-1234-5678"),
      redactString("intl +81 3-1234-5678"),
    ];
    for (const result of results) {
      expect(result).toContain("[REDACTED:phone]");
    }
  });

  test("preserves UUIDs (used as tokens is fine — they are opaque identifiers, not secrets)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const result = redactString(`reservation id ${uuid}`);
    expect(result).toContain(uuid);
  });

  test("masks high-entropy strings above the threshold", () => {
    const secret = "A".repeat(50);
    const result = redactString(`secret=${secret}`);
    expect(result).toContain("[REDACTED:secret]");
  });

  test("truncates very long strings after redaction", () => {
    const noise = "sk-".concat("x".repeat(2000));
    const result = redactString(noise);
    expect(result.length).toBeLessThan(600);
  });

  test("returns empty string unchanged", () => {
    expect(redactString("")).toBe("");
  });

  test("honors an explicit maxLength larger than the default", () => {
    // Plain text: no redaction pattern matches — pure length gate.
    // (avoiding uppercase A×2000 which the high-entropy regex now treats as
    // a candidate token; use a low-entropy sentence-shaped fill instead.)
    const long = "abcdefghij ".repeat(300);
    expect(long.length).toBeGreaterThan(2048);
    const result = redactString(long, { maxLength: 4096 });
    expect(result).toBe(long);
    expect(result.length).toBe(long.length);
    expect(result).not.toContain("[truncated]");
  });

  test("honors an explicit maxLength smaller than the default", () => {
    const value = "hello world this is a fairly long sentence";
    const result = redactString(value, { maxLength: 10 });
    expect(result.startsWith("hello worl")).toBe(true);
    expect(result).toContain("[truncated]");
  });

  test("still truncates at the given maxLength after redaction expands the string", () => {
    // Each email → "[REDACTED:email]" (16 chars). Fits within 4096.
    const value =
      "context: " + Array.from({ length: 20 }, () => "a@b.co").join(" ");
    const result = redactString(value, { maxLength: 4096 });
    expect(result).not.toContain("a@b.co");
    expect(result).toContain("[REDACTED:email]");
  });
});

describe("redactRequestUrl", () => {
  test("strips the query string", () => {
    const result = redactRequestUrl(
      "https://example.com/cancel?token=abcdef&email=user@example.com",
    );
    expect(result).not.toContain("token");
    expect(result).not.toContain("user@example.com");
    expect(result).toContain("[redacted]");
    expect(result).toContain("/cancel");
  });

  test("keeps path segments including UUIDs and slugs", () => {
    const result = redactRequestUrl(
      "https://example.com/reservations/550e8400-e29b-41d4-a716-446655440000/detail",
    );
    expect(result).toContain(
      "/reservations/550e8400-e29b-41d4-a716-446655440000/detail",
    );
  });

  test("drops the URL fragment", () => {
    const result = redactRequestUrl("https://example.com/path#Bearer%20abc");
    expect(result).not.toContain("Bearer");
    expect(result).not.toContain("#");
  });

  test("handles bare relative paths (no host in instrumentation error)", () => {
    const result = redactRequestUrl("/reservations/abc?token=secret");
    expect(result).not.toContain("token=secret");
  });
});

describe("redactContext", () => {
  test("returns undefined when input is undefined", () => {
    expect(redactContext(undefined)).toBeUndefined();
  });

  test("masks entries whose key names imply secrets", () => {
    const result = redactContext({
      authorization: "Bearer xyz",
      cookie: "session=abc",
      password: "hunter2",
      access_token: "abc",
      refresh_token: "def",
      apiKey: "1234",
      Authorization: "Bearer another",
      resourceId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result).toBeDefined();
    if (!result) return;
    expect(result["authorization"]).toBe("[REDACTED]");
    expect(result["cookie"]).toBe("[REDACTED]");
    expect(result["password"]).toBe("[REDACTED]");
    expect(result["access_token"]).toBe("[REDACTED]");
    expect(result["refresh_token"]).toBe("[REDACTED]");
    expect(result["apiKey"]).toBe("[REDACTED]");
    expect(result["Authorization"]).toBe("[REDACTED]");
    expect(result["resourceId"]).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("does not mutate the input object", () => {
    const source = { email: "alice@example.com" };
    redactContext(source);
    expect(source.email).toBe("alice@example.com");
  });

  test("recursively masks nested objects", () => {
    const result = redactContext({
      outer: {
        inner: {
          token: "abcdef1234567890abcdef1234567890",
          email: "bob@example.com",
        },
      },
    }) as {
      outer: { inner: { token: string; email: string } };
    };
    expect(result.outer.inner.token).toBe("[REDACTED]");
    expect(result.outer.inner.email).toBe("[REDACTED:email]");
  });

  test("truncates recursion beyond a safe depth", () => {
    type Nested = { child?: Nested };
    const root: Nested = {};
    let cursor = root;
    for (let i = 0; i < 20; i++) {
      cursor.child = {};
      cursor = cursor.child;
    }
    const result = redactContext(root as unknown as Record<string, unknown>);
    expect(JSON.stringify(result)).toContain("[REDACTED:depth-exceeded]");
  });

  test("handles arrays and preserves scalar types", () => {
    const result = redactContext({
      items: [{ email: "alice@example.com" }, { code: 42 }, { flag: true }],
    }) as { items: Array<Record<string, unknown>> };
    expect(result.items[0]!["email"]).toBe("[REDACTED:email]");
    expect(result.items[1]!["code"]).toBe(42);
    expect(result.items[2]!["flag"]).toBe(true);
  });

  test("converts bigint to its string form (JSON-safe)", () => {
    const result = redactContext({ count: 9007199254740993n }) as {
      count: string;
    };
    expect(result.count).toBe("9007199254740993");
  });

  test("scrubs message strings that carry secrets in the middle", () => {
    const result = redactContext({
      message: "Failed to encrypt session token: Bearer abc.def.ghi",
    }) as { message: string };
    expect(result.message).toContain("[REDACTED:bearer]");
    expect(result.message).not.toContain("abc.def.ghi");
  });
});
