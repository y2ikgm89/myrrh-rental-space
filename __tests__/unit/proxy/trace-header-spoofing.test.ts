/**
 * **クライアントが送ってきた trace header を後段へ通さない。**
 *
 * ## なぜ
 *
 * 監査 A-95: `applyTraceHeaders` は `X-Cloud-Trace-Context` の parse に失敗すると
 * `if (!parsed) return;` で何もせずに戻っていた。ところが転写先の `Headers` は
 * `new Headers(req.headers)` のコピーなので、**クライアントが送った `x-trace-id` が
 * そのまま残る**（`x-nonce` / `x-pathname` は必ず上書きされるのに trace 系だけ違った）。
 *
 * 消費側の `instrumentation.ts` はこれを無検証で採用し、
 * `logger-core.ts` の `projects/${GCP_PROJECT_ID}/traces/${traceId}` に連結して
 * `logging.googleapis.com/trace` 特殊フィールドにしていた。形式検証
 * （`TRACE_ID_PATTERN`）は `parseCloudTraceContext` の中でしか掛かっておらず、
 * flat header 経路には一切効いていなかった。
 *
 * ## 何を見るか
 *
 * 1. parse 失敗時にクライアント由来の 3 ヘッダが**消えている**こと
 * 2. parse 成功時は正規の値で**上書き**されること
 * 3. `parseFlatTraceHeaders` が不正な traceId / spanId を落とすこと
 *
 * ## 直し方
 *
 * `applyTraceHeaders` の先頭の `delete` を消さない。転写元が信頼できない受信ヘッダで
 * ある以上、「正しいときだけ set する」では足りない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { parseFlatTraceHeaders } from "@/shared/lib/errors/logger-core";

const VALID_TRACE_ID = "0123456789abcdef0123456789abcdef";

/**
 * `applyTraceHeaders` は proxy の非 export 関数なので、ソースを読んで形を見る。
 * 粗いが、ここで守りたいのは「剥がしているか」と「早期 return より前か」の 2 点だけ。
 */
function readSource(...segments: string[]): string {
  return readFileSync(join(process.cwd(), ...segments), "utf8");
}

describe("クライアント由来の trace header を通さない（A-95）", () => {
  test("proxy が転写前に 3 ヘッダを delete している", () => {
    const source = readSource("src", "proxy.ts");
    const applyAt = source.indexOf("function applyTraceHeaders(");
    expect(applyAt).toBeGreaterThan(-1);

    const body = source.slice(applyAt, source.indexOf("\n}", applyAt));

    // 「parse 成功時だけ set」に戻すと、この 3 行が消える。
    expect({
      trace: body.includes('headers.delete("x-trace-id")'),
      span: body.includes('headers.delete("x-span-id")'),
      sampled: body.includes('headers.delete("x-trace-sampled")'),
    }).toEqual({ trace: true, span: true, sampled: true });

    // 順序が正しさの一部。早期 return より後ろに置くと元の欠陥に戻る。
    expect(body.indexOf('headers.delete("x-trace-id")')).toBeLessThan(
      body.indexOf("if (!parsed) return;"),
    );
  });

  test("不正な traceId は組ごと捨てる", () => {
    expect(
      parseFlatTraceHeaders({ traceId: "../../evil/traces/deadbeef" }),
    ).toBeNull();
    expect(parseFlatTraceHeaders({ traceId: "zzz" })).toBeNull();
    expect(parseFlatTraceHeaders({ traceId: "" })).toBeNull();
    expect(parseFlatTraceHeaders({ traceId: undefined })).toBeNull();
    // 31 桁 / 33 桁は 32-hex ではない
    expect(parseFlatTraceHeaders({ traceId: "a".repeat(31) })).toBeNull();
    expect(parseFlatTraceHeaders({ traceId: "a".repeat(33) })).toBeNull();
  });

  test("正しい traceId は通し、不正な spanId だけを落とす", () => {
    expect(
      parseFlatTraceHeaders({ traceId: VALID_TRACE_ID, spanId: "not-a-span" }),
    ).toEqual({
      traceId: VALID_TRACE_ID,
      spanId: undefined,
      traceSampled: undefined,
    });

    expect(
      parseFlatTraceHeaders({
        traceId: VALID_TRACE_ID,
        spanId: "1234567890",
        sampled: "1",
      }),
    ).toEqual({
      traceId: VALID_TRACE_ID,
      spanId: "1234567890",
      traceSampled: true,
    });

    expect(
      parseFlatTraceHeaders({ traceId: VALID_TRACE_ID, sampled: "0" })
        ?.traceSampled,
    ).toBe(false);
  });

  test("instrumentation が flat header を検証経由で読む", () => {
    const source = readSource("src", "instrumentation.ts");

    // 素の pickHeader をそのまま traceId に使う形へ戻っていないこと。
    expect(source).toContain("parseFlatTraceHeaders({");
    expect(source).not.toMatch(/const\s+traceId\s*=\s*headerTraceId\s*\?\?/u);
  });
});
