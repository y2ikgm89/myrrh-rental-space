/**
 * `bun run db:reset` の seed step。**`APP_SURFACE` を外して** `prisma db seed` を呼ぶ。
 *
 * ## なぜ要るのか（監査 A-19）
 *
 * `.env.local` には surface を選ぶために `APP_SURFACE` を入れるのが普通で
 * （README / CONTRIBUTING / `.env.example` がそう指示している）、Bun runtime が
 * `.env.local` を自動で読むためその値は `bun run` の子プロセスまで届く。
 * seed の安全ガード（`prisma/seed-safety.ts`）はそれを「デプロイされたプロセス」の
 * 印と見て `--dev` を拒否する。
 *
 * 結果、文書が 3 箇所（CLAUDE.md / AGENTS.md / `.claude/rules/prisma-db.md`）で
 * 勧めていた `bun run db:reset` は、**`migrate reset --force` が DB を消し終えた後で**
 * seed が exit 1 する。開発者の手元には空の DB だけが残り、復旧手順は文書のどこにも
 * 書かれていなかった。`bun run setup` は同じ問題を seed step だけ `APP_SURFACE: ""` に
 * することで避けており（`scripts/setup-local.ts`）、db:reset だけが取り残されていた。
 *
 * ## 外して安全な理由
 *
 * `db:reset` は `scripts/assert-destructive-db-target.ts` を**先頭**に置いており
 * （`__tests__/unit/architecture/destructive-db-guard.test.ts` が強制）、
 * その時点で接続先が本番でないことを Prisma CLI と同じ datasource 解決順で確認済み。
 * さらに `migrate reset --force` は既に完了しているので、この段の
 * `APP_SURFACE` ガードが守れるものはもう残っていない。
 *
 * **単独で叩かない。** `bun run db:seed` を直接使うほうは従来どおりガードが効く。
 */

// 呼び出しの形は `scripts/setup-local.ts` の seed step と揃える。
// `bun run db:seed` → `prisma db seed` → `bun prisma/seed.ts` の各段へ env が継承される
// ことは、その setup が実際に通っていることで裏付けされている。
const proc = Bun.spawnSync(["bun", "run", "db:seed"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env, APP_SURFACE: "" },
});

// signal kill は exitCode=null。process.exit(null) は 0 になるので失敗へ倒す。
process.exit(proc.exitCode ?? 1);
