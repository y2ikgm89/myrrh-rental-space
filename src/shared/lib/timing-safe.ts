import { timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison helper.
 *
 * Wraps `node:crypto.timingSafeEqual` with two safety properties:
 *
 * 1. **Length-mismatch short-circuit** — `node:crypto.timingSafeEqual` throws
 *    `RangeError` when buffer lengths differ. We return `false` instead so the
 *    helper is safe to call with arbitrary attacker-controlled input.
 *
 * 2. **UTF-8 encoding** — both inputs are encoded via `Buffer.from(..., "utf8")`
 *    before comparison. Strings with the same character content compare equal
 *    even if one came from a header (string) and the other from a constructed
 *    template literal.
 *
 * ## Runtime notes
 *
 * - `node:crypto` is available in **all Next.js execution contexts** the app
 *   currently uses: Node.js route handlers, server actions, server components,
 *   and the Node.js-runtime `proxy.ts` (Next.js 16 deprecated the edge runtime
 *   for proxy — see
 *   https://nextjs.org/docs/app/guides/upgrading/version-16#middleware-to-proxy).
 * - This helper MUST NOT be imported from edge-runtime code. The application
 *   has no such code today.
 *
 * ## Why a shared helper
 *
 * Hand-rolled XOR loops are easy to write subtly wrong (early return on first
 * mismatch, length oracle via short-circuit `&&`, allocation pattern leaking
 * via GC). Centralising on the platform primitive removes the entire class.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // node:crypto.timingSafeEqual throws on length mismatch. We compare two
    // equal-length zero buffers anyway so the timing profile of the
    // mismatched-length branch is indistinguishable from a content mismatch.
    const zero = Buffer.alloc(bufA.length);
    nodeTimingSafeEqual(bufA, zero);
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}
