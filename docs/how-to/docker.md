# Docker設定ガイド

> Next.js + Bun + Prisma 7 WASM の本番 Docker 構成。
> デプロイ手順は [`deploy.md`](./deploy.md) を参照。詳細パターンは Claude Code 用 path-scoped rule `.claude/rules/ops/deployment/dockerfile.md` を参照（Codex 作業では参照しない）。

---

## ファイル構成

```
myrrh-rental-space/
├── Dockerfile          # 本番ビルド用（3-stage multi-stage）
├── docker-compose.yml  # ローカル開発用（PostgreSQL）
├── .dockerignore       # Docker ビルドコンテキスト除外
├── .gcloudignore       # Cloud Build ソースアップロード除外
└── cloudbuild.yaml     # Cloud Build + Cloud Run deploy
```

---

## Dockerfile

### アーキテクチャ

3-stage multi-stage build。共通 `base` ステージで DRY:

```
base (oven/bun:1.3.x-alpine)
├── deps          → 依存インストール + Prisma generate
├── builder-base  → ソース + 依存（ビルド準備）
├── builder       → type-check + lint + build（standalone、Secret で SA 鍵注入）
└── runner        → 同一 Bun 系イメージ、`bun server.js` で standalone 実行
```

### 実際の Dockerfile

正本はリポジトリルートの `Dockerfile`。ビルド・本番実行とも **Bun**。

```dockerfile
# syntax=docker.io/docker/dockerfile:1
FROM oven/bun:1.3.13-alpine AS base
WORKDIR /app
# ... deps, builder-base, builder ...

FROM base AS runner
RUN apk add --no-cache libc6-compat && addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0
# PORT は Cloud Run 注入（Container Runtime Contract）— Dockerfile で hardcode 禁止
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
# Cloud Run Job (prisma-migrate) が `bunx --bun prisma migrate deploy` を実行するため同一 image に CLI + schema/migrations を明示コピー
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
USER nextjs
EXPOSE 8080
CMD ["bun", "server.js"]
```

### 設計のポイント

| 項目                 | 詳細                                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **ビルド・実行**     | Bun + `bun.lock`（[Bun Docker ガイド](https://bun.sh/guides/ecosystem/docker)）。`CMD ["bun", "server.js"]`      |
| **ベース**           | `oven/bun:1.3.13-alpine`（`base` を builder / runner で共有）                                                    |
| **libc6-compat**     | Alpine でのネイティブ互換。deps + runner                                                                         |
| **Prisma generate**  | deps ステージ。出力先: `generated/prisma/`                                                                       |
| **generated コピー** | `.gitignore` で除外 → Cloud Build に含まれない → `COPY --from=deps` 必須                                         |
| **STANDALONE**       | `ENV STANDALONE=true` で `output: 'standalone'` を条件付き有効化                                                 |
| **builder**          | `bun run type-check && bun run lint && bun run build`（`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` は BuildKit secret） |
| **NEXT*PUBLIC*\***   | Docker ARG でビルド時注入（クライアント JS インライン化）                                                        |
| **Prisma WASM**      | `node_modules/@prisma` を runner にコピー（standalone trace に含まれないため）                                   |
| **ポート**           | 8080（`--port` で Cloud Run 注入）。`ENV PORT` は Dockerfile で書かない                                          |
| **プローブ**         | startup + liveness とも HTTP GET `/api/live`（DB 非依存）。`/api/health` は監視・手動確認専用                    |
| **Prisma CLI**       | Cloud Run Job (prisma-migrate) が同一 image で動くため `node_modules/prisma` + `prisma/` を runner に明示コピー  |
| **非 root**          | `adduser nextjs` + `USER nextjs`                                                                                 |

### なぜ STANDALONE 環境変数が必要か

Windows + Turbopack でファイル名の `node:` プロトコルがコロンを含み `EINVAL` エラーになるため、ローカル開発では standalone を無効化。Docker ビルド時のみ `STANDALONE=true` で有効化:

```typescript
// next.config.ts
...(process.env.STANDALONE === 'true' && { output: 'standalone' }),
```

---

## docker-compose.yml

ローカル開発用。PostgreSQL のみ Docker で起動し、アプリケーションはホストで実行:

```bash
# PostgreSQL 起動
docker compose up -d db

# マイグレーション
bunx --bun prisma migrate dev --name <name>

# 開発サーバー（ホスト側）
bun dev

# 停止
docker compose stop db

# データも削除
docker compose down -v
```

---

## .dockerignore

Docker ビルドコンテキストから除外するファイル。`generated` を含む（deps ステージで再生成するため）:

```
node_modules
.next
generated
.git
.env
.env.*
docs/
*.md
__tests__
e2e/
.claude/
.serena/
```

---

## トラブルシューティング

### Prisma クライアントが見つからない

runner ステージで `node_modules/@prisma` のコピーが漏れている。WASM ランタイムエンジンが必要:

```dockerfile
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
```

### generated ディレクトリが空

`.gitignore` で `generated/` が除外されているため Cloud Build ソースに含まれない。builder ステージで deps からコピー:

```dockerfile
COPY --from=deps /app/generated ./generated
```

### NEXT*PUBLIC*\* がクライアントで undefined

ビルド時に Docker ARG で注入が必要。ランタイム env var のみではクライアント JS にインライン化されない:

```yaml
# cloudbuild.yaml
- --build-arg=NEXT_PUBLIC_BASE_URL=https://example.com
```

---

## 参考

- [Next.js Docker Deployment](https://nextjs.org/docs/app/getting-started/deploying#docker)
- [Bun Docker Guide](https://bun.sh/guides/ecosystem/docker)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [`.claude/rules/ops/deployment-patterns.md`](../../.claude/rules/ops/deployment-patterns.md) — Claude Code 用 path-scoped rule（Codex 作業では参照しない）
