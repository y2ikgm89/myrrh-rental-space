/**
 * adapter-pg のプールエラー callback が実際に呼ばれることの確認。
 *
 * ## なぜテストするか
 *
 * `PrismaPg` のコンストラクタは `(poolOrConfig, options?)` の 2 引数で、
 * `onPoolError` / `onConnectionError` は**第 2 引数**にしか効かない。第 1 引数は
 * `pg.PoolConfig` としてそのまま node-postgres へ渡り、実行時には黙って捨てられる。
 *
 * 型が守ってくれるのは半分だけ（実測）: object literal を直接書けば余剰プロパティ
 * 検査が TS2353 で止めるが、**設定を変数に組み立ててから渡すと素通りする**。
 * 「ログを足したのに本番で一行も出ない」は気づきようがないので、配線を固定する。
 *
 * ## DB は要らない
 *
 * `PrismaPg#connect()` は `new pg.Pool(config)` を作って listener を張るだけで、
 * 実接続は最初のクエリまで遅延する（node-postgres の仕様）。よってプールに
 * `error` を emit すれば、DB 無しで listener の中身を通せる。
 */

import { describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";

/** 実接続しないので到達不能でよい。 */
const DUMMY_URL = "postgresql://user:pw@127.0.0.1:1/never_connected";

async function poolFor(
  options?: ConstructorParameters<typeof PrismaPg>[1],
): Promise<{ pool: NodeJS.EventEmitter; dispose: () => Promise<void> }> {
  const adapter = new PrismaPg({ connectionString: DUMMY_URL }, options);
  const connection = await adapter.connect();
  return {
    pool: connection.underlyingDriver(),
    dispose: () => connection.dispose(),
  };
}

describe("adapter-pg のプールエラー配線", () => {
  test("第 2 引数の onPoolError はアイドル接続のエラーで呼ばれる", async () => {
    const seen: Error[] = [];
    const { pool, dispose } = await poolFor({
      onPoolError: (error) => seen.push(error),
    });

    try {
      pool.emit("error", new Error("idle client died"));
      expect(seen.map((e) => e.message)).toEqual(["idle client died"]);
    } finally {
      await dispose();
    }
  });

  test("callback 無しでも listener は張られている（process は落ちない）", async () => {
    // adapter-pg は callback の有無に関わらず listener を張る。これが無いと
    // EventEmitter の 'error' が未処理例外になってプロセスごと落ちる。
    // つまり callback を渡す目的はクラッシュ防止ではなく**可視化**である、
    // という前提をここで固定する。
    const { pool, dispose } = await poolFor();

    try {
      expect(pool.listenerCount("error")).toBeGreaterThan(0);
      expect(() => pool.emit("error", new Error("swallowed"))).not.toThrow();
    } finally {
      await dispose();
    }
  });

  test("第 1 引数に置いた onPoolError は無視される（配置ミスの検出）", async () => {
    const seen: Error[] = [];
    // 変数に組んでから渡す = 余剰プロパティ検査が効かない書き方。型が通ったうえで
    // 実行時に捨てられることの証拠。ここが緑でなくなったら上流仕様が変わったので、
    // prisma.ts のコメントを見直す。
    const misplaced = {
      connectionString: DUMMY_URL,
      onPoolError: (error: Error) => seen.push(error),
    };
    const adapter = new PrismaPg(misplaced);
    const connection = await adapter.connect();

    try {
      connection.underlyingDriver().emit("error", new Error("ignored"));
      expect(seen).toEqual([]);
    } finally {
      await connection.dispose();
    }
  });
});
