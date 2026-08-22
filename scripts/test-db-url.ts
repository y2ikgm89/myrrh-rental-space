// 127.0.0.1 固定は意図的: Windows では localhost が ::1 へ解決され、stale 化した
// WSL localhost relay (wslrelay.exe) が ::1 側の docker published port を占有すると
// pg 系クライアント（単一アドレス接続）だけが ECONNRESET になる。docker-compose は
// 0.0.0.0 に bind するため IPv4 loopback 指定は全 OS で等価に届く。
export const DEFAULT_LOCAL_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5433/myrrh_test";

export function resolveTestDatabaseUrl(testDatabaseUrl: string | undefined): {
  readonly url: string;
  readonly source: "env" | "default-local";
} {
  const trimmed = testDatabaseUrl?.trim();
  if (trimmed) {
    return { url: trimmed, source: "env" };
  }

  return {
    url: DEFAULT_LOCAL_TEST_DATABASE_URL,
    source: "default-local",
  };
}
