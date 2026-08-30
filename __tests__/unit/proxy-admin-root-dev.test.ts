import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

/**
 * ローカル dev の admin surface では root を `/admin` へ redirect しない。
 *
 * 本番は public / admin が別ホストの Cloud Run service なので、admin service の
 * root は管理トップへ送るのが正しい。一方 **ローカルは 1 プロセスが両 surface を
 * 配る**（`APP_SURFACE` はプロセス単位の env）。そこへ同じ redirect を当てると、
 * 公開トップページだけがローカルで到達不能になる — admin surface が実際に塞ぐのは
 * この 1 経路だけで、`/spaces` `/news` 等の下位ページは admin surface でも 200 で開ける。
 *
 * 本番側の 307 は `proxy-admin-gate.test.ts` が `NODE_ENV: "production"` で固定する。
 * こちらは dev 分岐だけを固定する（E2E は `next start` = NODE_ENV=production で
 * 走るため、この分岐は E2E の検証力に影響しない）。
 */
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    APP_SURFACE: "admin",
    NODE_ENV: "development",
    R2_PUBLIC_URL: undefined,
  },
  // isLocalhostUrl は e2e-runtime.ts が env/server から import する transitive dep。
  // rate-limit.ts → e2e-runtime.ts → env/server の chain で必要になる。
  // このテスト環境では E2E bypass を発動させないため常に false を返す。
  isLocalhostUrl: () => false,
}));

const { proxy } = await import("@/proxy");

describe("proxy admin surface root (development)", () => {
  test("dev の admin surface は root を redirect せず公開トップを配る", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-pathname")).toBe("/");
  });
});
