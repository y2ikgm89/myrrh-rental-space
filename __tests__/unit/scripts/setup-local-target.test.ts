/**
 * `bun run setup` が seed のガードを外してよい相手かどうかの判定。
 *
 * ## なぜこの判定が要るのか
 *
 * `scripts/setup-local.ts` は `.env.local` を自分のプロセス env に載せてから
 * `db:seed` を呼ぶ。そこに `APP_SURFACE`（public / admin のどちらを見るかを決める env）
 * があると、seed の安全ガード（`prisma/seed-safety.ts`）が「デプロイされたプロセス」と
 * 判定して `--dev` を拒否するため、外さないと setup が最終 step で必ず落ちる。
 *
 * **だが無条件に外してはいけない。** その印は
 * **loopback トンネル / プロキシ越しの本番 DB を止める最後の砦**でもある。
 * 下の「一段目が通してしまうこと」のテストがその事実を固定している。
 *
 * だから「loopback だから安全」ではなく、**この setup が起動したコンテナの port と
 * database 名に一致すること**まで見る。
 */

import { describe, expect, test } from "bun:test";

import { looksLikeProductionDatabaseUrl } from "../../../prisma/seed-safety";
import {
  resolveComposeDatabaseTarget,
  runSetup,
  targetsSetupManagedDatabase,
  type ComposeDatabaseTarget,
} from "../../../scripts/setup-local";

const COMPOSE: ComposeDatabaseTarget = {
  port: "5432",
  database: "myrrh_rental",
};

/** compose が起動した DB（docker-compose.yml の db service）。 */
const LOCAL_OK = "postgresql://postgres:postgres@localhost:5432/myrrh_rental";
/** loopback トンネル / プロキシ越しの本番。host も path も無害に見える。 */
const TUNNELED_PROD = "postgresql://user:pass@localhost:55432/neondb";

describe("seed のガードを外してよい相手かの判定", () => {
  test("一段目（seed-safety）は、トンネル越しの本番を通してしまう", () => {
    // ここが false を返すからこそ、setup 側の照合が要る。
    // これが true に変わったなら、この判定の存在理由を見直してよい。
    expect(looksLikeProductionDatabaseUrl(TUNNELED_PROD)).toBe(false);
    expect(looksLikeProductionDatabaseUrl(LOCAL_OK)).toBe(false);

    // 直接続きの本番は一段目が拒否する（照合はその後段）。
    expect(
      looksLikeProductionDatabaseUrl(
        "postgresql://user:pass@ep-x.aws.neon.tech/neondb",
      ),
    ).toBe(true);
  });

  test("トンネル越しの本番は落とす（新しく検出したい形）", () => {
    expect(targetsSetupManagedDatabase(TUNNELED_PROD, COMPOSE)).toBe(false);
  });

  test("port だけ / database だけ一致でも落とす", () => {
    expect(
      targetsSetupManagedDatabase(
        "postgresql://postgres:postgres@localhost:5432/neondb",
        COMPOSE,
      ),
    ).toBe(false);
    expect(
      targetsSetupManagedDatabase(
        "postgresql://postgres:postgres@localhost:55432/myrrh_rental",
        COMPOSE,
      ),
    ).toBe(false);
  });

  test("非 loopback は落とす", () => {
    expect(
      targetsSetupManagedDatabase(
        "postgresql://user:pass@ep-x.aws.neon.tech/myrrh_rental",
        COMPOSE,
      ),
    ).toBe(false);
  });

  test("compose に訊けなかった / URL が無い / 壊れている場合は落とす（fail-closed）", () => {
    expect(targetsSetupManagedDatabase(LOCAL_OK, null)).toBe(false);
    expect(targetsSetupManagedDatabase(undefined, COMPOSE)).toBe(false);
    expect(targetsSetupManagedDatabase("not a url", COMPOSE)).toBe(false);
  });

  test("compose が起動した DB は通す（正当な形）", () => {
    expect(targetsSetupManagedDatabase(LOCAL_OK, COMPOSE)).toBe(true);
    // 127.0.0.1 表記・port 省略（既定 5432）も同じ相手。
    expect(
      targetsSetupManagedDatabase(
        "postgresql://postgres:postgres@127.0.0.1:5432/myrrh_rental?sslmode=disable",
        COMPOSE,
      ),
    ).toBe(true);
    expect(
      targetsSetupManagedDatabase(
        "postgresql://postgres:postgres@localhost/myrrh_rental",
        COMPOSE,
      ),
    ).toBe(true);
  });
});

describe("compose への問い合わせ", () => {
  test("port は `docker compose port` の出力末尾から、database は POSTGRES_DB から取る", () => {
    const calls: string[][] = [];
    const target = resolveComposeDatabaseTarget((command) => {
      calls.push([...command]);
      if (command.includes("port")) return "0.0.0.0:5432";
      return "myrrh_rental";
    });

    expect(target).toEqual({ port: "5432", database: "myrrh_rental" });
    // 値を書き写さず compose に訊いていること（docker-compose.yml が SSoT）。
    expect(calls[0]).toEqual(["docker", "compose", "port", "db", "5432"]);
    expect(calls[1]).toEqual([
      "docker",
      "compose",
      "exec",
      "-T",
      "db",
      "printenv",
      "POSTGRES_DB",
    ]);
  });

  test("どちらか取れなければ null（判定側が fail-closed で落とす）", () => {
    expect(resolveComposeDatabaseTarget(() => null)).toBeNull();
    expect(
      resolveComposeDatabaseTarget((command) =>
        command.includes("port") ? "0.0.0.0:5432" : null,
      ),
    ).toBeNull();
  });
});

/**
 * 判定が正しくても、`runSetup` がそれを通っていなければ何も守らない。
 * fixture と実走査が同じ経路を通ることを、ここで固定する。
 */
describe("runSetup の配線", () => {
  const composeCapture = (command: readonly string[]): string =>
    command.includes("port") ? "0.0.0.0:5432" : "myrrh_rental";

  test("compose の DB でなければ、seed を呼ばずに 1 を返す", () => {
    const commands: string[][] = [];
    const exitCode = runSetup(
      (command) => {
        commands.push([...command]);
        return 0;
      },
      composeCapture,
      () => TUNNELED_PROD,
    );

    expect(exitCode).toBe(1);
    expect(commands.some((command) => command.includes("db:seed"))).toBe(false);
    // 手前の step（compose 起動 / generate / migrate）までは通っていること。
    expect(commands.some((command) => command.includes("migrate"))).toBe(true);
  });

  test("compose の DB なら seed を呼び、その呼び出しだけ APP_SURFACE を外す", () => {
    const calls: {
      command: string[];
      env: Record<string, string> | undefined;
    }[] = [];
    const exitCode = runSetup(
      (command, env) => {
        calls.push({
          command: [...command],
          env: env ? { ...env } : undefined,
        });
        return 0;
      },
      composeCapture,
      () => LOCAL_OK,
    );

    expect(exitCode).toBe(0);
    const seed = calls.find((call) => call.command.includes("db:seed"));
    expect(seed?.env).toEqual({ APP_SURFACE: "" });
    // 他の step には渡さない（印を外す範囲を seed 1 呼び出しに限る）。
    for (const call of calls) {
      if (call.command.includes("db:seed")) continue;
      expect(call.env).toBeUndefined();
    }
  });
});
