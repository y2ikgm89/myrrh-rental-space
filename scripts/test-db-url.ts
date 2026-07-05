export const DEFAULT_LOCAL_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public";

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
