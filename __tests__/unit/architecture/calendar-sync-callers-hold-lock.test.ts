/**
 * `syncFromCalendar()` を呼ぶファイルは、必ず calendar-sync の排他ロックも取る。
 *
 * ## なぜ
 *
 * 監査 A-03: 呼出は 3 箇所（cron / webhook / 管理画面の手動同期）あるのに、
 * ロックの取得は cron と webhook の 2 箇所にしか書かれていなかった。
 * `syncFromCalendar` は同期トークンを読んで進める
 * （`fetchCalendarChanges(syncToken)` → `saveCalendarSyncToken(newSyncToken)`）ため、
 * 二重実行は webhook route が名指しで警戒しているトークンの lost update になる。
 * さらに `processCalendarChange` の時間変更は SwitchBot パスコードの
 * revoke → 再発行を伴うので、発行済みパスコードの誤失効にもなりうる。
 *
 * 唯一の防御に見える `SYNC_MIN_INTERVAL_SECONDS`（10 秒）は効かない。
 * `recordCalendarSyncCompleted()` は全処理成功後にしか打たれない（GCAL-AUDIT-09）ので、
 * **実行中の run は lastSyncedAt を更新しておらず throttle を素通りさせる**。
 *
 * ## 何を見るか
 *
 * `src/**` の中で `syncFromCalendar(` を**実コード行で**呼ぶファイル集合と、
 * `tryAcquireCalendarSyncLock(` を実コード行で呼ぶファイル集合。前者 ⊆ 後者。
 *
 * 順序（ロックが sync より前か）は見ない。静的な行走査で順序を保証するのは
 * 脆いうえ、`finally` での解放位置まで含めると誤検知が増える。ここが守るのは
 * 「ロックの存在を丸ごと忘れた」形 — 実際に起きた欠陥の形そのもの。
 *
 * 宣言ファイル（`export async function syncFromCalendar`）は呼出ではないので
 * 対象外。コメント中の言及も対象外（この gate 自身の理由説明が引っかかるため）。
 *
 * ## 直し方
 *
 * 新しい呼出を足したら、その関数の中で
 * `tryAcquireCalendarSyncLock()` → `try { ... } finally { releaseCalendarSyncLock() }`
 * を書く。取得できないときは実行せず、呼出元に「他の同期が実行中」を返す。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(process.cwd(), "src");

const SYNC_CALL = "syncFromCalendar(";
const SYNC_DECLARATION = "export async function syncFromCalendar(";
const LOCK_CALL = "tryAcquireCalendarSyncLock(";
const RELEASE_CALL = "releaseCalendarSyncLock(";

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * コメント行を除いた実コード行だけを返す。
 *
 * 単純な `includes` だと「なぜロックが要るか」を説明した JSDoc（この gate が
 * 追加させた説明そのもの）に引っかかる。
 */
function codeLines(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line !== "" &&
        !line.startsWith("*") &&
        !line.startsWith("//") &&
        !line.startsWith("/*"),
    );
}

/** 実コード行で `needle` を含むか。 */
function callsInCode(source: string, needle: string): boolean {
  return codeLines(source).some((line) => line.includes(needle));
}

/** `syncFromCalendar` を「呼んでいる」か（宣言だけの行は除く）。 */
function callsSync(source: string): boolean {
  return codeLines(source).some(
    (line) => line.includes(SYNC_CALL) && !line.includes(SYNC_DECLARATION),
  );
}

const rel = (file: string) =>
  relative(process.cwd(), file).split(sep).join("/");

describe("calendar sync の呼出はロックを伴う", () => {
  const files = collectSourceFiles(SRC_ROOT);
  const callers = files.filter((file) => callsSync(readFileSync(file, "utf8")));

  test("走査が空振りしていない（呼出が実在する）", () => {
    // cron / webhook / 管理画面の手動同期の 3 箇所。減ったら前提が変わっている。
    expect(callers.length).toBeGreaterThan(2);
    expect(files.length).toBeGreaterThan(1000);
  });

  test("syncFromCalendar を呼ぶファイルは全て排他ロックも取る", () => {
    const missing = callers
      .filter((file) => !callsInCode(readFileSync(file, "utf8"), LOCK_CALL))
      .map(rel);

    expect(missing).toEqual([]);
  });

  /**
   * acquire だけ書いて release を書き忘れると、pooled connection が idle 回収
   * （idleTimeout 300s）されるまでロックが残り、以降の cron / webhook が全部
   * skip される。取得と解放は同じファイルに対で現れる。
   */
  test("ロックを取るファイルは解放も書いている", () => {
    const missing = callers
      .filter((file) => !callsInCode(readFileSync(file, "utf8"), RELEASE_CALL))
      .map(rel);

    expect(missing).toEqual([]);
  });

  test("判定はコメントと実コードを区別する（見本）", () => {
    // 落ちるべき形: 呼んでいるのにロックが実コードに無い
    const violating = `import { syncFromCalendar } from "x";
// tryAcquireCalendarSyncLock() を呼ぶこと
export async function run() {
  return syncFromCalendar();
}`;
    expect(callsSync(violating)).toBe(true);
    expect(callsInCode(violating, LOCK_CALL)).toBe(false);

    // 落ちてはいけない形: 実コードでロックを取っている
    const compliant = `import { syncFromCalendar } from "x";
export async function run() {
  const acquired = await tryAcquireCalendarSyncLock();
  if (!acquired) return null;
  try {
    return await syncFromCalendar();
  } finally {
    await releaseCalendarSyncLock();
  }
}`;
    expect(callsSync(compliant)).toBe(true);
    expect(callsInCode(compliant, LOCK_CALL)).toBe(true);

    // 宣言だけのファイル（= 実装本体）は呼出として数えない
    const declaration = `export async function syncFromCalendar(): Promise<void> {
  return undefined;
}`;
    expect(callsSync(declaration)).toBe(false);
  });
});
