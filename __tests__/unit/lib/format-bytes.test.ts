/**
 * `formatBytes` の単位の頭打ちを固定する。
 *
 * `sizes` は B..TB の 5 要素しかないのに添字を `Math.log` からそのまま作っていて、
 * 1 PB 以上で `sizes[i]` が `undefined` になっていた。表示は
 * `1.13 undefined`、しかも数値は PB 換算ではなく **B 換算のまま**という二重の壊れ方。
 *
 * 型の側は `restrict-template-expressions` が「テンプレートに
 * `string | undefined` を埋めている」として検出するが、**数値がどの単位で
 * 出るか**はルールでは表せないので、ここで振る舞いとして固定する。
 */
import { describe, expect, test } from "bun:test";

import { formatBytes } from "@/admin/lib/utils";

const KB = 1024;

describe("formatBytes", () => {
  test("通常の単位", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(KB)).toBe("1 KB");
    expect(formatBytes(KB ** 2)).toBe("1 MB");
    expect(formatBytes(KB ** 3)).toBe("1 GB");
    expect(formatBytes(KB ** 4)).toBe("1 TB");
  });

  test("最大単位を超えたら TB で頭打ちにする（undefined を出さない）", () => {
    // 1 PB = 1024 TB
    expect(formatBytes(KB ** 5)).toBe("1024 TB");
    // 1 EB = 1048576 TB
    expect(formatBytes(KB ** 6)).toBe("1048576 TB");

    for (const bytes of [KB ** 5, KB ** 6, KB ** 7]) {
      expect(formatBytes(bytes)).not.toContain("undefined");
      expect(formatBytes(bytes)).toEndWith(" TB");
    }
  });
});
