/**
 * 破壊的な Prisma CLI 操作（`migrate reset` / `db push`）の前段ガード。
 *
 * ## なぜ seed 側のガードでは足りないのか
 *
 * `prisma/seed-safety.ts` は **seed.ts が起動してから**評価される。ところが
 * `bun run db:reset` は `prisma migrate reset --force` を**先に**走らせるので、
 * DB が落ちきった後にしか seed のガードは動かない。`--reset` を廃止したときの
 * 案内文（「破壊的な作り直しは `bun run db:reset` を使ってください」）は、
 * 守られていない経路を推奨していたことになる。
 *
 * ## なぜ DATABASE_URL だけ見ては足りないのか
 *
 * Prisma CLI の datasource は `prisma.config.ts` が決めており、**`DIRECT_URL` を
 * 優先**して未設定時のみ `DATABASE_URL` へ落ちる（Neon 公式の推奨形）。つまり
 * `DATABASE_URL` がローカルでも、`.env.local` に本番の `DIRECT_URL` が残っていれば
 * `migrate reset` は**本番を消す**。ガードは CLI が実際に使う方を見る必要がある。
 *
 * 判定そのものは `prisma/seed-safety.ts` の
 * `looksLikeProductionDatabaseUrl`（Cloud SQL / Neon / 非 localhost / prod marker）
 * を再利用する。SSoT を割らないことが目的。
 */

import { looksLikeProductionDatabaseUrl } from "../prisma/seed-safety";

/**
 * `prisma.config.ts` の `resolvePrismaCliDatasourceUrl` と**同じ順序**で解決する。
 * ここがずれると「ガードが見た URL」と「CLI が消す DB」が別物になる。
 */
export function resolvePrismaCliDatasourceUrl(env: {
  readonly DIRECT_URL?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
}): { readonly url: string | undefined; readonly source: string } {
  const direct = env.DIRECT_URL?.trim();
  if (direct) return { url: direct, source: "DIRECT_URL" };
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) return { url: databaseUrl, source: "DATABASE_URL" };
  return { url: undefined, source: "(未設定)" };
}

/** ホスト名だけを取り出す（接続文字列そのものは出さない = 秘密値を漏らさない）。 */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "(解析不能な接続文字列)";
  }
}

export function evaluateDestructiveDbTarget(env: {
  readonly DIRECT_URL?: string | undefined;
  readonly DATABASE_URL?: string | undefined;
}):
  | { readonly ok: true; readonly target: string }
  | { readonly ok: false; readonly error: string } {
  const { url, source } = resolvePrismaCliDatasourceUrl(env);

  if (!url) {
    return {
      ok: false,
      error:
        "破壊的操作を中止: Prisma CLI の datasource が未設定です（DIRECT_URL / DATABASE_URL のどちらも空）。",
    };
  }

  if (looksLikeProductionDatabaseUrl(url)) {
    return {
      ok: false,
      error: [
        `破壊的操作を中止: Prisma CLI が使う ${source} が本番に見えます（${describeTarget(url)}）。`,
        "Cloud SQL / Neon / 非 localhost / prod marker のいずれかに該当します。",
        "",
        `**${source} を見ている点に注意**してください。Prisma CLI の datasource は`,
        "`prisma.config.ts` が DIRECT_URL を優先して解決するため、DATABASE_URL が",
        "ローカルでも DIRECT_URL が本番なら本番が消えます。",
      ].join("\n"),
    };
  }

  return { ok: true, target: `${source}=${describeTarget(url)}` };
}

// CLI として起動されたときだけ評価する。
//
// このブロックを module scope に裸で置くと、**import しただけで `process.exit(1)`
// が走る**。`__tests__/unit/architecture/destructive-db-guard.test.ts` は上の
// 純関数を静的 import するので、開発者の `.env.local` に本物の `DIRECT_URL` が
// 入っている環境ではテストが 1 件も走らないまま落ちる（`__tests__/setup.ts` が
// 固定するのは `DATABASE_URL` だけで、`DIRECT_URL` は素通りする）。
// しかもそれは**このガードが対象にしている状況そのもの**なので、
// 「守りたい環境でだけテストが死ぬ」という最悪の形になる。
if (import.meta.main) {
  // `noPropertyAccessFromIndexSignature` のためブラケット記法で取り出す。
  const result = evaluateDestructiveDbTarget({
    DIRECT_URL: process.env["DIRECT_URL"],
    DATABASE_URL: process.env["DATABASE_URL"],
  });

  if (!result.ok) {
    console.error(`❌ ${result.error}`);
    process.exit(1);
  }

  console.log(`✅ 破壊的操作の対象は安全なローカル DB です: ${result.target}`);
}
